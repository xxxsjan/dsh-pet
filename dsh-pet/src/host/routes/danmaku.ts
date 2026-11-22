/**
 * 抖音弹幕监听：start / stop / status / options / check-cookie。
 *
 * 控制面板挂在「桌宠控制台」的头像区入口（抖音弹窗，见 standalone/console-page），
 * 旧设置页 `/standalone-ai/` 已不再保留该分区；这里只留 JSON 接口。契约见 HTTP_API.md。
 * @module dsh-pet/src/host/routes/danmaku
 */
import type { RouteResult } from '../http.ts';
import type { SectionName } from '../state.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from './result.ts';
import {
  checkDyCookieShape,
  checkDyCookie,
  fetchDyLiveInfo,
  normalizeLiveUrl,
  type DyCookieCheckReason,
} from '../danmaku/douyin/live-info.ts';

/** Cookie 校验结果：前端按 reason 渲染文案。 */
type DyCheckResult =
  | { ok: true; loginUid: string; title: string; anchor: string; message: string }
  | { ok: false; reason: 'no-session' | 'no-server-uid' | 'guest-placeholder' | 'liveness-unknown' | 'network' | 'bad-url' | 'unknown'; message: string; loginUid?: string };

/** 弹幕领域：未命中返回 undefined，命中返回应答。 */

/** 直播平台互斥：启动某平台前停止其余所有平台监听，并回写各自状态段。 */
function stopExcept(deps: PetRouteDeps, except: 'douyin' | 'xiaohongshu' | 'kuaishou' | 'bilibili'): void {
  const targets: Array<{ monitor: { stop(): unknown }; section: SectionName }> = [];
  if (except !== 'douyin') targets.push({ monitor: deps.douyinDanmaku, section: 'danmaku' });
  if (except !== 'xiaohongshu') targets.push({ monitor: deps.xiaohongshuDanmaku, section: 'xhs-danmaku' });
  if (except !== 'kuaishou') targets.push({ monitor: deps.kuaishouDanmaku, section: 'ks-danmaku' });
  if (except !== 'bilibili') targets.push({ monitor: deps.bilibiliDanmaku, section: 'bili-danmaku' });
  for (const { monitor, section } of targets) {
    try {
      const status = monitor.stop();
      deps.state.writeSection(section, status);
    } catch { /* 其余平台停不掉不阻塞当前启动 */ }
  }
}

export async function handleDanmakuRoutes(deps: PetRouteDeps, input: RouteInput): Promise<RouteResult | undefined> {
  const { body, method, rest } = input;

  if (rest === 'danmaku/douyin/status') {
    if (method !== 'GET') return methodNotAllowed();
    return okResult({ ok: true, ...deps.douyinDanmaku.status() });
  }

  if (rest === 'danmaku/douyin/check-cookie') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const cookie = String((parsed as { cookie?: unknown }).cookie ?? '');
    const url = String((parsed as { url?: unknown }).url ?? '').trim();

    // Step 1: 本地结构预检——没 session 键直接拦，省一个请求。
    const shape = checkDyCookieShape(cookie);
    if (!shape.ok) {
      return okResult({
        ok: false,
        reason: 'no-session' as const,
        message: 'Cookie 里缺少登录会话键（sessionid / sessionid_ss / sid_tt 任一即可），请确认完整复制',
      } satisfies DyCheckResult);
    }

    // 额外本地检查：Cookie 长度 + 关键辅助键（ttwid、odin_tt）
    const hasKey = (k: string) => new RegExp('(?:^|[;&;])' + k + '=').test(cookie);
    const hasTtwid = hasKey('ttwid');
    const hasOdin = hasKey('odin_tt');
    const lenOk = cookie.length >= 200;
    const localVerdicts: string[] = [];
    if (hasTtwid) localVerdicts.push('ttwid');
    if (hasOdin) localVerdicts.push('odin_tt');
    const localSummary = localVerdicts.length
      ? '（含 ' + localVerdicts.join(' + ') + '）'
      : lenOk
        ? '（完整 Cookie）'
        : '（可能截断，建议重新复制）';

    // Step 2: 没 URL 就只停在结构预检——不必强行跑进房接口（会被抖音风控）。
    if (!url) {
      return okResult({
        ok: true,
        loginUid: '',
        title: '',
        anchor: '',
        message: 'Cookie 结构有效' + localSummary + '，填上直播间链接可做完整校验',
      } satisfies DyCheckResult);
    }

    let normalizedUrl: string;
    try {
      normalizedUrl = normalizeLiveUrl(url);
    } catch (e) {
      return okResult({
        ok: false,
        reason: 'bad-url' as const,
        message: e instanceof Error ? e.message : '直播间链接格式不对',
      } satisfies DyCheckResult);
    }

    try {
      const info = await fetchDyLiveInfo(normalizedUrl, cookie);
      const verdict = checkDyCookie(cookie, info.loginUid);
      if (verdict.ok) {
        return okResult({
          ok: true,
          loginUid: info.loginUid,
          title: info.title,
          anchor: info.anchor,
          message: `Cookie 有效（UID: ${info.loginUid}），主播「${info.anchor || '未知'}」正在${info.title ? `《${info.title}》` : '直播'}`,
        } satisfies DyCheckResult);
      }
      const reasonMap: Record<DyCookieCheckReason, string> = {
        'no-session': 'Cookie 里缺少登录会话键',
        'no-server-uid': '进房接口没回显用户 ID，可能 Cookie 过期或被风控',
        'guest-placeholder': 'Cookie 已失效（登录态被打回游客），请重新从浏览器复制最新 Cookie',
      };
      return okResult({
        ok: false,
        reason: verdict.reason,
        message: reasonMap[verdict.reason],
        loginUid: info.loginUid || undefined,
      } satisfies DyCheckResult);
    } catch (e) {
      const name = (e as Error)?.name || '';
      const msg = (e as Error)?.message || String(e);
      // DyLivenessUnknownError：进房接口/页面都拿不到直播状态，但 Cookie 结构已过。
      // 这大概率是抖音接口风控（缺签名头），不是 Cookie 真无效。
      if (name === 'DyLivenessUnknownError') {
        return okResult({
          ok: true,
          loginUid: '',
          title: '',
          anchor: '',
          message:
            'Cookie 结构有效' +
            localSummary +
            '（进房接口暂时被风控/页面结构变化，不影响 Cookie 有效性判定）',
        } satisfies DyCheckResult);
      }
      if (name === 'DyRoomOfflineError') {
        const loginUid = (e as { loginUid?: string }).loginUid;
        const cookieOk = loginUid && loginUid !== '3677211856479552';
        if (cookieOk) {
          return okResult({
            ok: true,
            loginUid: loginUid!,
            title: '',
            anchor: '',
            message: `Cookie 有效（UID: ${loginUid}），但该直播间当前未开播 / 已下播`,
          } satisfies DyCheckResult);
        }
        return okResult({
          ok: false,
          reason: 'guest-placeholder' as const,
          message: 'Cookie 已失效（进房接口回显游客账号），请重新复制最新 Cookie',
          loginUid: loginUid || undefined,
        } satisfies DyCheckResult);
      }
      // 其他网络/签名错误：也不报 Cookie 无效，只报"结构 OK 但进房接口请求失败"
      return okResult({
        ok: true,
        loginUid: '',
        title: '',
        anchor: '',
        message:
          'Cookie 结构有效' + localSummary + '，但请求进房接口失败：' + msg + '（不影响 Cookie 结构判定）',
      } satisfies DyCheckResult);
    }
  }

  if (rest === 'danmaku/douyin/options') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    const status = deps.douyinDanmaku.setOptions({
      replyChat: typeof replyChat === 'boolean' ? replyChat : undefined,
      thankGift: typeof thankGift === 'boolean' ? thankGift : undefined,
    });
    // 状态变化写入 state，供右键菜单读取
    deps.state.writeSection('danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/douyin/start') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const url = String((parsed as { url?: unknown }).url ?? '').trim();
    const cookie = String((parsed as { cookie?: unknown }).cookie ?? '');
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (!url) return failResult('bad-request', '缺少 url（直播间链接或房间号）');
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    try {
      stopExcept(deps, 'douyin');
      const status = await deps.douyinDanmaku.start({
        url,
        cookie,
        replyChat: replyChat === true,
        thankGift: thankGift === true,
      });
      // 状态变化写入 state，供右键菜单读取
      console.log('[blue-fish][danmaku] start success, writing status to state:', status);
      deps.state.writeSection('danmaku', status);
      return okResult({ ok: true, ...status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps.log.warn?.(`[blue-fish][douyin] start failed: ${message}`);
      return failResult('internal-error', message);
    }
  }

  if (rest === 'danmaku/douyin/stop') {
    if (method !== 'POST') return methodNotAllowed();
    const status = deps.douyinDanmaku.stop();
    // 状态变化写入 state，供右键菜单读取
    deps.state.writeSection('danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/xiaohongshu/status') {
    if (method !== 'GET') return methodNotAllowed();
    return okResult({ ok: true, ...deps.xiaohongshuDanmaku.status() });
  }

  if (rest === 'danmaku/xiaohongshu/options') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    const status = deps.xiaohongshuDanmaku.setOptions({
      replyChat: typeof replyChat === 'boolean' ? replyChat : undefined,
      thankGift: typeof thankGift === 'boolean' ? thankGift : undefined,
    });
    deps.state.writeSection('xhs-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/xiaohongshu/start') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const cookie = String((parsed as { cookie?: unknown }).cookie ?? '');
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    try {
      stopExcept(deps, 'xiaohongshu');
      const status = await deps.xiaohongshuDanmaku.start({
        cookie,
        replyChat: replyChat === true,
        thankGift: thankGift === true,
      });
      deps.state.writeSection('xhs-danmaku', status);
      return okResult({ ok: true, ...status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps.log.warn?.(`[blue-fish][xiaohongshu] start failed: ${message}`);
      return failResult('internal-error', message);
    }
  }

  if (rest === 'danmaku/xiaohongshu/stop') {
    if (method !== 'POST') return methodNotAllowed();
    const status = deps.xiaohongshuDanmaku.stop();
    deps.state.writeSection('xhs-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/xiaohongshu/show-center') {
    if (method !== 'POST') return methodNotAllowed();
    const status = deps.xiaohongshuDanmaku.showCenter();
    deps.state.writeSection('xhs-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/kuaishou/status') {
    if (method !== 'GET') return methodNotAllowed();
    return okResult({ ok: true, ...deps.kuaishouDanmaku.status() });
  }

  if (rest === 'danmaku/kuaishou/options') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    const status = deps.kuaishouDanmaku.setOptions({
      replyChat: typeof replyChat === 'boolean' ? replyChat : undefined,
      thankGift: typeof thankGift === 'boolean' ? thankGift : undefined,
    });
    deps.state.writeSection('ks-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/kuaishou/start') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const url = String((parsed as { url?: unknown }).url ?? '').trim();
    const cookie = String((parsed as { cookie?: unknown }).cookie ?? '');
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (!url) return failResult('bad-request', '缺少 url（直播间链接或主播短链）');
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    try {
      stopExcept(deps, 'kuaishou');
      const status = await deps.kuaishouDanmaku.start({
        url,
        cookie,
        replyChat: replyChat === true,
        thankGift: thankGift === true,
      });
      deps.state.writeSection('ks-danmaku', status);
      return okResult({ ok: true, ...status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps.log.warn?.(`[blue-fish][kuaishou] start failed: ${message}`);
      return failResult('internal-error', message);
    }
  }

  if (rest === 'danmaku/kuaishou/stop') {
    if (method !== 'POST') return methodNotAllowed();
    const status = deps.kuaishouDanmaku.stop();
    deps.state.writeSection('ks-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/bilibili/status') {
    if (method !== 'GET') return methodNotAllowed();
    return okResult({ ok: true, ...deps.bilibiliDanmaku.status() });
  }

  if (rest === 'danmaku/bilibili/options') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    const status = deps.bilibiliDanmaku.setOptions({
      replyChat: typeof replyChat === 'boolean' ? replyChat : undefined,
      thankGift: typeof thankGift === 'boolean' ? thankGift : undefined,
    });
    deps.state.writeSection('bili-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  if (rest === 'danmaku/bilibili/start') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    if (!parsed || typeof parsed !== 'object') {
      return failResult('bad-request', '请求体须为 JSON 对象');
    }
    const url = String((parsed as { url?: unknown }).url ?? '').trim();
    const cookie = String((parsed as { cookie?: unknown }).cookie ?? '');
    const replyChat = (parsed as { replyChat?: unknown }).replyChat;
    const thankGift = (parsed as { thankGift?: unknown }).thankGift;
    if (!url) return failResult('bad-request', '缺少 url（直播间链接或房间号）');
    if (replyChat !== undefined && typeof replyChat !== 'boolean') {
      return failResult('bad-request', 'replyChat 须为 boolean');
    }
    if (thankGift !== undefined && typeof thankGift !== 'boolean') {
      return failResult('bad-request', 'thankGift 须为 boolean');
    }
    try {
      stopExcept(deps, 'bilibili');
      const status = await deps.bilibiliDanmaku.start({
        url,
        cookie,
        replyChat: replyChat === true,
        thankGift: thankGift === true,
      });
      deps.state.writeSection('bili-danmaku', status);
      return okResult({ ok: true, ...status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      deps.log.warn?.(`[blue-fish][bilibili] start failed: ${message}`);
      return failResult('internal-error', message);
    }
  }

  if (rest === 'danmaku/bilibili/stop') {
    if (method !== 'POST') return methodNotAllowed();
    const status = deps.bilibiliDanmaku.stop();
    deps.state.writeSection('bili-danmaku', status);
    return okResult({ ok: true, ...status });
  }

  return undefined;
}
