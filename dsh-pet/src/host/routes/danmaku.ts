/**
 * 抖音弹幕监听：start / stop / status / options。
 *
 * 控制面板已并进独立模式设置页的「抖音弹幕」分区（见 standalone/settings-page），
 * 这里只留 JSON 接口。契约见 openapi.yaml；签名依赖桌面 Helper 的本机签名桥。
 * @module dsh-pet/src/host/routes/danmaku
 */
import type { RouteResult } from '../http.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from './result.ts';

/** 弹幕领域：未命中返回 undefined，命中返回应答。 */
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
      const status = await deps.douyinDanmaku.start({
        url,
        cookie,
        replyChat: replyChat === true,
        thankGift: thankGift === true,
      });
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
    return okResult({ ok: true, ...status });
  }

  return undefined;
}
