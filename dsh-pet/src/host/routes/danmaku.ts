/**
 * 抖音弹幕监听：start / stop / status / options。
 *
 * 控制面板挂在「桌宠控制台」的头像区入口（抖音弹窗，见 standalone/console-page），
 * 旧设置页 `/standalone-ai/` 已不再保留该分区；这里只留 JSON 接口。契约见 HTTP_API.md；
 * 签名依赖桌面 Helper 的本机签名桥。
 * @module dsh-pet/src/host/routes/danmaku
 */
import type { RouteResult } from '../http.ts';
import type { SectionName } from '../state.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from './result.ts';

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
