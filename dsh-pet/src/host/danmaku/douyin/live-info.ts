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
  /** enter 接口回显的当前用户 uid（登录态校验用）；游客态或回落页面解析时为空串。 */
  loginUid: string;
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

/** 登录会话键：任一非空才算带了会话凭证。 */
const DY_SESSION_KEYS = ['sessionid', 'sessionid_ss', 'sid_tt'];

/**
 * enter 接口回显这个 uid 说明 Cookie 里的 session 已经过期 / 被打回游客态。
 * 是抖音硬编码的游客占位账号，不是真实用户。
 */
const DY_GUEST_PLACEHOLDER_UID = '3677211856479552';

/** Cookie 校验失败的原因码；文案由调用方（monitor）映射，纯函数不拼用户文案。 */
export type DyCookieCheckReason = 'no-session' | 'no-server-uid' | 'guest-placeholder';

/** 本地结构预检的原因码：只涉及 Cookie 本身，不发请求。 */
export type DyCookieShapeReason = 'no-session';

/** Cookie 里有没有登录会话。 */
function cookieHasSession(cookieHeader: string): boolean {
  const jar = parseCookieMap(normalizeDyCookieHeader(cookieHeader));
  return DY_SESSION_KEYS.some((k) => String(jar.get(k) ?? '').trim());
}

/**
 * 只检查 Cookie 结构（有没有会话键），不发网络请求。
 *
 * 启动时先跑这一步：贴错 / 贴漏的 Cookie 不必等进房结果就能当场拦下，
 * 下播场景至少也能给出「这不是登录态 Cookie」的结论。
 *
 * 注意：不再要求 Cookie 里必须有 uid 字段——抖音现代版本只在 Cookie 里放
 * `uid_tt` / `uid_tt_ss` 这种加密 hash，根本没法和服务端回显的明文 uid 比对。
 */
export function checkDyCookieShape(
  cookieHeader: string,
): { ok: true } | { ok: false; reason: DyCookieShapeReason } {
  if (!cookieHasSession(cookieHeader)) return { ok: false, reason: 'no-session' };
  return { ok: true };
}

/**
 * 校验手填登录 Cookie 是否真有效。
 *
 * 以前靠「Cookie 里的 uid_tt 和 enter 回显的 user.id_str 比对」——但抖音现在
 * 已经不在 Cookie 里放明文 uid 了，uid_tt 只是加密 hash，永远和服务端对不上。
 *
 * 新逻辑：只看服务端回显的 user.id_str。
 * - 空：进房接口异常，没法确认
 * - 游客占位 UID：session 被打回游客，Cookie 过期
 * - 其他值：真实用户，Cookie 有效
 *
 * @param cookieHeader - 用户填入的原始 Cookie。
 * @param serverUid - 本次进房 enter 接口回显的 `data.user.id_str`。
 */
export function checkDyCookie(
  cookieHeader: string,
  serverUid: string,
): { ok: true } | { ok: false; reason: DyCookieCheckReason } {
  const shape = checkDyCookieShape(cookieHeader);
  if (!shape.ok) return shape;
  if (!serverUid) return { ok: false, reason: 'no-server-uid' };
  if (serverUid === DY_GUEST_PLACEHOLDER_UID)
    return { ok: false, reason: 'guest-placeholder' };
  return { ok: true };
}

/** 下播判定的原始依据；只进 debug 日志，不给用户看。 */
export type DyRoomOfflineDetail = {
  /** 判定路径：进房没拿到 room / 进房说未开播 / 回落页面解析后说未开播。 */
  reason: 'no-room' | 'not-living' | 'page-fallback';
  roomId: string;
  status?: number;
  finishTime?: number;
  reflow: boolean;
  enterRoomStatus?: number | null;
};

/**
 * 房间已下播（或拿不到房间）时抛出。
 *
 * 仍带上 enter 接口回显的当前用户 uid：下播场景服务端照样会回显 user，
 * 调用方据此可以先给 Cookie 定性，再决定报「Cookie 失效」还是「主播已下播」。
 */
export class DyRoomOfflineError extends Error {
  /** enter API 回显的当前用户 uid；拿不到时为空串。 */
  declare readonly loginUid: string;
  /** 判定依据快照；用于排查「真下播」与瞬时 reflow 的误判。 */
  declare readonly detail?: DyRoomOfflineDetail;

  constructor(message: string, loginUid = '', detail?: DyRoomOfflineDetail) {
    super(message);
    this.name = 'DyRoomOfflineError';
    this.loginUid = loginUid;
    this.detail = detail;
  }
}

/**
 * 进房接口没给出可用结果（空 body / 非 JSON / 风控），页面也确认不了在播状态。
 *
 * 它不代表下播：调用方必须把它当「状态未知」处理，绝不能提示「主播已下播」。
 */
export class DyLivenessUnknownError extends Error {
  constructor(message = '抖音进房接口暂时不可用，无法确认直播间状态') {
    super(message);
    this.name = 'DyLivenessUnknownError';
  }
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

/** 房间对象里是否有能判定在播的字段（status / live_status / finish_time）。 */
function hasLivingSignal(room: Record<string, unknown>): boolean {
  return (
    fieldI64(room, ['status', 'live_status']) !== undefined ||
    fieldI64(room, ['finish_time', 'finishTime']) !== undefined
  );
}

/** 下播判定的字段快照：只用于 debug 日志，便于区分真下播与瞬时 reflow。 */function offlineDetail(
  room: Record<string, unknown>,
  enterRoomStatus: number | null,
  reason: DyRoomOfflineDetail['reason'],
): DyRoomOfflineDetail {
  return {
    reason,
    roomId: jsonValueToString(room.id_str) || jsonValueToString(room.id),
    status: fieldI64(room, ['status', 'live_status']),
    finishTime: fieldI64(room, ['finish_time', 'finishTime']),
    reflow: roomLooksReflow(room),
    enterRoomStatus,
  };
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

function isCaptchaPage(body: string): boolean {
  return (body.includes('captcha/index.js') || body.includes('sec_sdk_build')) && body.length < 20_000;
}

/** 页面解析结果：livingKnown=false 表示只拿到了房间号、拿不到在播状态。 */
type DyPageRoom = {
  roomInfo: string;
  uniqueId: string;
  livingKnown: boolean;
};

/**
 * 从直播间页面解析房间；只认 RENDER_DATA 里的完整 room 对象。
 *
 * 不能用「页面里随便抓个 id_str」兜底：页面里混着用户/评论等大量 id，
 * 抓到的假房间没有 status，会被误判成「未开播」。判不了就返回 undefined，
 * 让调用方报「状态未知」而不是下播。
 */
function parsePageRoom(body: string): DyPageRoom | undefined {
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
          return { roomInfo: JSON.stringify(cur), uniqueId, livingKnown: true };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return undefined;
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
  let loginUid = '';

  const enterUrl =
    `https://live.douyin.com/webcast/room/web/enter/?aid=6383&app_name=douyin_web&live_id=1` +
    `&device_platform=web&language=zh-CN&enter_from=link_share&cookie_enabled=true` +
    `&screen_width=1920&screen_height=1080&browser_language=zh-CN&browser_platform=Win32` +
    `&browser_name=Mozilla&browser_version=5.0&web_rid=${webRid}&enter_source=&is_need_double_stream=false`;

  try {
    const enterRes = await fetchViaOutboundProxy(enterUrl, { headers: pageHeaders(cookieMapToHeader(jar)) });
    mergeSetCookie(jar, enterRes);
    const enterJson: unknown = await enterRes.json();
    // 先取服务端回显的当前用户 uid：它是 Cookie 校验的唯一依据，
    // 且下播时 enter 依然会回显（room 数据为空也照样有 user），不能等判完在播再读。
    const enterUid = uniqueIdFromEnter(enterJson);
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
    // 下播也带着 uid 抛出：调用方要先用它校验 Cookie，再决定提示哪条错误。
    if (!room) {
      throw new DyRoomOfflineError(
        'enter API 响应中无 room 对象，可能未开播',
        enterUid,
        offlineDetail({}, enterRoomStatus, 'no-room'),
      );
    }
    if (!isDyRoomLiving(room, enterRoomStatus)) {
      throw new DyRoomOfflineError(
        '主播未开播',
        enterUid,
        offlineDetail(room, enterRoomStatus, 'not-living'),
      );
    }
    roomInfo = JSON.stringify(room);
    uniqueId = enterUid;
    loginUid = enterUid;
    livingVerified = true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('未开播')) throw e;
    // 回落页面解析
  }

  let livingKnown = livingVerified;
  if (!roomInfo) {
    const parsed = parsePageRoom(body);
    if (!parsed) throw new DyLivenessUnknownError();
    roomInfo = parsed.roomInfo;
    uniqueId = parsed.uniqueId;
    livingKnown = parsed.livingKnown;
  }

  const room = JSON.parse(roomInfo) as Record<string, unknown>;
  // 页面解析拿不到在播字段时，只能算「状态未知」：不能拿它当「未开播」。
  if (!livingVerified && (!livingKnown || !hasLivingSignal(room))) throw new DyLivenessUnknownError();
  if (!livingVerified && !isDyRoomLiving(room, null)) {
    throw new DyRoomOfflineError('主播未开播', loginUid, offlineDetail(room, null, 'page-fallback'));
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
    loginUid,
  };
}
