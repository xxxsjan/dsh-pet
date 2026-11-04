/**
 * 抖音进房：对齐 danmu-ji 的 `get_live_info`——拿 room_id / ttwid / unique_id / cookie。
 *
 * 优先走 webcast enter API（关播判定更准），失败再回落页面解析。
 * @module dsh-pet/src/host/danmaku/douyin/live-info
 */

import { fetchViaOutboundProxy } from '../../net/proxy-fetch.ts';

/** 浏览器 UA：与 danmu-ji / 签名脚本口径一致。 */
export const DY_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 进房结果。 */
export type DyLiveInfo = {
  roomInfo: string;
  ttwid: string;
  uniqueId: string;
  cookie: string;
  roomId: string;
  title: string;
  anchor: string;
};

/** 规范化 Cookie 头：去掉换行、合并分号。 */
export function normalizeDyCookieHeader(cookie: string): string {
  return String(cookie || '')
    .split(/[;\n\r]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .join('; ');
}

/** 从 live.douyin.com URL 或纯数字抽出 web_rid。 */
export function extractWebRid(url: string): string | undefined {
  const raw = String(url || '').trim();
  if (/^\d{5,}$/.test(raw)) return raw;
  const m = raw.match(/live\.douyin\.com\/(\d{5,})/i);
  return m?.[1];
}

/** 把用户输入收成可请求的直播间 URL。 */
export function normalizeLiveUrl(url: string): string {
  const rid = extractWebRid(url);
  if (!rid) throw new Error('请提供 live.douyin.com/数字 形式的直播间链接或房间号');
  return `https://live.douyin.com/${rid}`;
}

function parseCookieMap(cookieStr: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(cookieStr || '').split(/[;\n\r]+/)) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf('=');
    if (i <= 0) continue;
    map.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return map;
}

function cookieMapToHeader(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeSetCookie(map: Map<string, string>, res: Response): void {
  // undici / Node fetch：getSetCookie 优先；否则退回单头
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  const list =
    typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : String(res.headers.get('set-cookie') || '')
          .split(/,(?=[^;]+?=)/)
          .map((s) => s.trim())
          .filter(Boolean);
  for (const line of list) {
    const first = line.split(';')[0]?.trim();
    if (!first) continue;
    const i = first.indexOf('=');
    if (i <= 0) continue;
    map.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
  }
}

function jsonValueToString(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return '';
}

function roomHasIdStr(room: Record<string, unknown> | null | undefined): boolean {
  if (!room) return false;
  const id = room.id_str;
  if (typeof id === 'string' && id.trim()) return true;
  if (typeof id === 'number' && Number.isFinite(id)) return true;
  return false;
}

function pickRoomFromEnter(json: unknown): Record<string, unknown> | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const root = json as Record<string, unknown>;
  const data = root.data;
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  if (roomHasIdStr(d.room as Record<string, unknown>)) return d.room as Record<string, unknown>;
  const list = d.data;
  if (Array.isArray(list)) {
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      if (roomHasIdStr(obj)) return obj;
      if (roomHasIdStr(obj.room as Record<string, unknown>)) return obj.room as Record<string, unknown>;
    }
  } else if (roomHasIdStr(list as Record<string, unknown>)) {
    return list as Record<string, unknown>;
  }
  return undefined;
}

function uniqueIdFromEnter(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const data = (json as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return '';
  const d = data as Record<string, unknown>;
  const user = d.user;
  if (user && typeof user === 'object') {
    const u = user as Record<string, unknown>;
    return jsonValueToString(u.id_str) || jsonValueToString(u.id);
  }
  return jsonValueToString(d.user_id_str) || jsonValueToString(d.user_id);
}

function fieldI64(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function roomLooksReflow(room: Record<string, unknown>): boolean {
  try {
    const s = JSON.stringify(room);
    return s.includes('rtm_expr_tag=reflow_room_info') || s.includes('reflow_room_info');
  } catch {
    return false;
  }
}

/** 是否在播（对齐 danmu-ji）。 */
export function isDyRoomLiving(
  room: Record<string, unknown>,
  enterRoomStatus?: number | null,
): boolean {
  if (enterRoomStatus != null && enterRoomStatus !== 0) return false;
  const finish = fieldI64(room, ['finish_time', 'finishTime']) ?? 0;
  if (finish > 0) return false;
  if (roomLooksReflow(room)) return false;
  const status = fieldI64(room, ['status', 'live_status']);
  if (status === 2) return true;
  if (status != null) return false;
  return enterRoomStatus === 0;
}

function extractUniqueIdFromBody(body: string): string {
  const patterns = [
    /user_unique_id\\":\\"(\d+)\\"/,
    /"user_unique_id"\s*:\s*"(\d+)"/,
    /user_unique_id=(\d+)/,
    /"odin"\s*:\s*"(\d+)"/,
  ];
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function extractIdStrFromBody(body: string): string {
  const patterns = [/"id_str"\s*:\s*"(\d+)"/, /id_str\\":\\"(\d+)\\"/, /roomId\\":\\"(\d+)\\"/];
  for (const re of patterns) {
    const m = body.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function isCaptchaPage(body: string): boolean {
  return (body.includes('captcha/index.js') || body.includes('sec_sdk_build')) && body.length < 20_000;
}

function parsePageRoom(body: string): { roomInfo: string; uniqueId: string } | undefined {
  const render = body.match(/<script id="RENDER_DATA"[^>]*>([\s\S]*?)<\/script>/i);
  if (render?.[1]) {
    try {
      const decoded = decodeURIComponent(render[1]);
      const v = JSON.parse(decoded) as Record<string, unknown>;
      const paths = [
        ['app', 'initialState', 'roomStore', 'roomInfo', 'room'],
        ['roomStore', 'roomInfo', 'room'],
        ['initialState', 'roomStore', 'roomInfo', 'room'],
      ];
      for (const path of paths) {
        let cur: unknown = v;
        for (const key of path) {
          if (!cur || typeof cur !== 'object') {
            cur = undefined;
            break;
          }
          cur = (cur as Record<string, unknown>)[key];
        }
        if (roomHasIdStr(cur as Record<string, unknown>)) {
          const uniqueId =
            extractUniqueIdFromBody(body) ||
            (() => {
              try {
                const odin = (v as { app?: { initialState?: { userStore?: { odin?: { user_unique_id?: string } } } } })
                  .app?.initialState?.userStore?.odin?.user_unique_id;
                return odin ? String(odin) : '';
              } catch {
                return '';
              }
            })();
          return { roomInfo: JSON.stringify(cur), uniqueId };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const idStr = extractIdStrFromBody(body);
  if (!idStr) return undefined;
  const titleM = body.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
  const title = titleM?.[1]?.replace(/\\"/g, '"') || '';
  return {
    roomInfo: JSON.stringify({ id_str: idStr, title }),
    uniqueId: extractUniqueIdFromBody(body),
  };
}

function roomMeta(room: Record<string, unknown>): { roomId: string; title: string; anchor: string } {
  const roomId = jsonValueToString(room.id_str) || jsonValueToString(room.id);
  const title = String(room.title || room.room_title || '').trim();
  const owner = (room.owner || room.anchor || {}) as Record<string, unknown>;
  const anchor = String(owner.nickname || owner.nick_name || owner.nickName || '').trim();
  return { roomId, title, anchor };
}

function pageHeaders(cookie: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'zh-CN,zh;q=0.9',
    referer: 'https://live.douyin.com/',
    'user-agent': DY_UA,
    'upgrade-insecure-requests': '1',
  };
  if (cookie.trim()) headers.cookie = cookie;
  return headers;
}

/**
 * 进房：返回连 WSS 所需字段。
 * @param liveUrlOrRid - 直播间链接或数字房间号。
 * @param userCookie - 可选登录 Cookie（礼物等依赖；纯聊天可不传）。
 */
export async function fetchDyLiveInfo(liveUrlOrRid: string, userCookie = ''): Promise<DyLiveInfo> {
  const url = normalizeLiveUrl(liveUrlOrRid);
  const webRid = extractWebRid(url)!;
  const userCookieNorm = normalizeDyCookieHeader(userCookie);
  const jar = parseCookieMap(userCookieNorm);
  const nonce = Date.now().toString(16).padStart(21, '0').slice(0, 21);
  jar.set('__ac_nonce', nonce);

  const warmHeaders = pageHeaders(cookieMapToHeader(jar));
  const warm = await fetchViaOutboundProxy('https://live.douyin.com/', { headers: warmHeaders });
  mergeSetCookie(jar, warm);
  await warm.text().catch(() => '');

  const pageHeadersWithCookie = pageHeaders(cookieMapToHeader(jar));
  const pageRes = await fetchViaOutboundProxy(url, { headers: pageHeadersWithCookie });
  mergeSetCookie(jar, pageRes);
  const body = await pageRes.text();
  if (isCaptchaPage(body)) {
    throw new Error('抖音要求人机验证：请用浏览器打开该直播间完成验证，再把 Cookie 贴进请求');
  }

  let roomInfo = '';
  let uniqueId = '';
  let livingVerified = false;

  const enterUrl =
    `https://live.douyin.com/webcast/room/web/enter/?aid=6383&app_name=douyin_web&live_id=1` +
    `&device_platform=web&language=zh-CN&enter_from=link_share&cookie_enabled=true` +
    `&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32` +
    `&browser_name=Mozilla&browser_version=5.0&web_rid=${webRid}&enter_source=&is_need_double_stream=false`;

  try {
    const enterRes = await fetchViaOutboundProxy(enterUrl, { headers: pageHeaders(cookieMapToHeader(jar)) });
    mergeSetCookie(jar, enterRes);
    const enterJson: unknown = await enterRes.json();
    const status =
      enterJson && typeof enterJson === 'object'
        ? Number((enterJson as Record<string, unknown>).status_code ?? -1)
        : -1;
    if (status !== 0) {
      const msg =
        enterJson && typeof enterJson === 'object'
          ? jsonValueToString(
              (enterJson as { data?: { message?: unknown; prompts?: unknown } }).data?.message ??
                (enterJson as { data?: { prompts?: unknown } }).data?.prompts,
            ) || `status_code=${status}`
          : `status_code=${status}`;
      throw new Error(`enter API 失败: ${msg}`);
    }
    const enterRoomStatus = (() => {
      const data = (enterJson as { data?: { room_status?: unknown } }).data;
      const raw = data?.room_status;
      if (raw == null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })();
    const room = pickRoomFromEnter(enterJson);
    if (!room) throw new Error('enter API 响应中无 room 对象，可能未开播');
    if (!isDyRoomLiving(room, enterRoomStatus)) throw new Error('主播未开播');
    roomInfo = JSON.stringify(room);
    uniqueId = uniqueIdFromEnter(enterJson);
    livingVerified = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('未开播')) throw e;
    // 回落页面解析
  }

  if (!roomInfo) {
    const parsed = parsePageRoom(body);
    if (!parsed) {
      throw new Error(
        'roomInfo 未找到：页面结构可能已变化，或直播间未开播；请确认链接为 live.douyin.com/数字',
      );
    }
    roomInfo = parsed.roomInfo;
    uniqueId = parsed.uniqueId;
  }

  const room = JSON.parse(roomInfo) as Record<string, unknown>;
  if (!livingVerified && !isDyRoomLiving(room, null)) {
    throw new Error('主播未开播');
  }

  if (!uniqueId) uniqueId = extractUniqueIdFromBody(body);
  if (!uniqueId) uniqueId = jar.get('odin') || '';
  if (!uniqueId) uniqueId = String(Date.now());

  let ttwid = jar.get('ttwid') || '';
  if (userCookieNorm) {
    for (const [k, v] of parseCookieMap(userCookieNorm)) jar.set(k, v);
  }
  if (!ttwid) ttwid = jar.get('ttwid') || '';
  if (!ttwid) throw new Error('未拿到 ttwid，抖音可能要求验证');

  const { roomId, title, anchor } = roomMeta(room);
  if (!roomId) throw new Error('未拿到 room_id，可能直播已结束');

  return {
    roomInfo,
    ttwid,
    uniqueId,
    cookie: cookieMapToHeader(jar),
    roomId,
    title,
    anchor,
  };
}
