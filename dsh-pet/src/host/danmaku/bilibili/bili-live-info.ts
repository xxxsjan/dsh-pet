/**
 * B 站直连进房：房间号解析 + WBI 签名 + getInfoByRoom / getDanmuInfo 换票。
 *
 * 对齐 danmuapp `src-tauri/src/lib.rs` 的 `get_bili_ws_info` 流程；HTTP 走出站代理封装。
 * 未登录走访客 cookie（仅 buvid3）；登录 SESSDATA 失效被风控时回落访客再试一次。
 * WBI 密钥拉取、会话刷新与风控细节需桌面真机连直播间验证。
 * @module dsh-pet/src/host/danmaku/bilibili/bili-live-info
 */
import { createHash } from 'node:crypto';

import { fetchViaOutboundProxy, type ProxyFetchInit } from '../../net/proxy-fetch.ts';

/** 解析出的进房信息。 */
export type BiliWsInfo = {
  roomId: string;
  token: string;
  websocketUrl: string;
  cookie: string;
  title: string;
  anchor: string;
  uid: string;
  liveStatus: number;
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ORIGIN = 'https://live.bilibili.com';
const REFERER = 'https://live.bilibili.com/';

/** WBI mixin 重排表（64 位，与参照一致）。 */
const BILI_WBI_MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

function cookieValue(cookie: string, name: string): string | null {
  for (const part of String(cookie || '').split(';')) {
    const p = part.trim();
    if (!p) continue;
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const k = p.slice(0, eq).trim();
    const v = p.slice(eq + 1).trim();
    if (k.toLowerCase() === name.toLowerCase()) return v;
  }
  return null;
}

/** 是否带登录态 SESSDATA。 */
export function biliHasSessdata(cookie: string): boolean {
  return Boolean(cookieValue(cookie, 'SESSDATA'));
}

/** 登录态才带 DedeUserID；否则 uid=0（访客）。 */
export function biliAuthUid(cookie: string): string {
  if (!biliHasSessdata(cookie)) return '0';
  const uid = cookieValue(cookie, 'DedeUserID');
  return uid && /^\d+$/.test(uid) ? uid : '0';
}

/** 生成访客 buvid3（32 位十六进制 + 4 段连字符 + infoc，近似参照算法）。 */
function genBuvid3(): string {
  let n = BigInt(Date.now() * 1_000_000);
  const chars: string[] = [];
  for (let i = 0; i < 32; i += 1) {
    if (i === 8 || i === 12 || i === 16 || i === 20) chars.push('-');
    const shift = BigInt((i % 8) * 8);
    const v = Number(((n >> shift) & 0xffn) ^ BigInt(i * 17)) % 16;
    chars.push(v.toString(16).toUpperCase());
    n = (n * 6364136223846793005n + 1n) & 0xffffffffffffffffffffffffffffffffn;
  }
  return `${chars.join('')}infoc`;
}

/** 补全 buvid3：缺省时生成一段访客标识。 */
export function ensureBuvid3(cookie: string): string {
  if (cookieValue(cookie, 'buvid3')) return cookie.trim();
  const buvid = genBuvid3();
  const trimmed = cookie.trim();
  return trimmed ? `${trimmed}; buvid3=${buvid}` : `buvid3=${buvid}`;
}

/** 仅保留游客可用字段，去掉可能过期的登录 Cookie。 */
function biliGuestCookie(cookie: string): string {
  const parts: string[] = [];
  for (const name of ['buvid3', 'buvid4', 'b_nut', '_uuid']) {
    const v = cookieValue(cookie, name);
    if (v) parts.push(`${name}=${v}`);
  }
  if (parts.some((p) => p.startsWith('buvid3='))) return parts.join('; ');
  return ensureBuvid3('');
}

/** 从直播间 URL / 裸号提取短房间号。 */
export function extractBiliRoomId(url: string): string | null {
  const trimmed = String(url || '').trim();
  if (/^\d+$/.test(trimmed) && Number(trimmed) > 0) return trimmed;
  const m = /live\.bilibili\.com\/(?:blanc\/)?(\d+)/i.exec(trimmed);
  const id = m?.[1];
  return id && Number(id) > 0 ? id : null;
}

function filenameFromUrl(url: string): string {
  const last = url.split('/').pop() ?? '';
  return last.split('.')[0] ?? '';
}

function mixinKey(imgKey: string, subKey: string): string {
  const raw = `${imgKey}${subKey}`;
  const chars = [...raw];
  const out: string[] = [];
  for (const i of BILI_WBI_MIXIN_TAB) {
    if (chars[i] != null) out.push(chars[i]);
    if (out.length >= 32) break;
  }
  return out.slice(0, 32).join('');
}

/** encodeURIComponent 风格：百分号十六进制大写；仅保留 A-Z a-z 0-9 - _ . ~。 */
function wbiEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (const b of bytes) {
    const ch = String.fromCharCode(b);
    if (/[A-Za-z0-9\-_.~]/.test(ch)) out += ch;
    else out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

/** WBI 签名：返回 (wts, w_rid)。 */
function wbiSign(
  params: Array<[string, string]>,
  mixin: string,
): { wts: string; wRid: string } {
  const wts = String(Math.floor(Date.now() / 1000));
  const pairs = [...params, ['wts', wts] as [string, string]];
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const query = pairs.map(([k, v]) => `${wbiEncode(k)}=${wbiEncode(v)}`).join('&');
  const wRid = createHash('md5').update(`${query}${mixin}`, 'utf8').digest('hex');
  return { wts, wRid };
}

function commonHeaders(cookie: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Referer: REFERER,
    Origin: ORIGIN,
    Accept: 'application/json, text/plain, */*',
  };
  if (cookie.trim()) headers.Cookie = cookie.trim();
  return headers;
}

async function fetchJson(
  fetchFn: typeof fetchViaOutboundProxy,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const init: ProxyFetchInit = { method: 'GET', headers };
  const resp = await fetchFn(url, init);
  const json = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const code = Number(json.code ?? -1);
  if (code !== 0) {
    const message = String(json.message || '未知错误');
    throw new Error(`B站接口 code=${code}: ${message}`);
  }
  return json;
}

async function fetchWbiMixin(
  fetchFn: typeof fetchViaOutboundProxy,
  headers: Record<string, string>,
): Promise<string> {
  const json = (await fetchJson(fetchFn, 'https://api.bilibili.com/x/web-interface/nav', headers)) as Record<string, unknown>;
  const wbi = asRecord(json.data)?.wbi_img;
  const wbiRec = asRecord(wbi);
  const img = String(wbiRec?.img_url || '');
  const sub = String(wbiRec?.sub_url || '');
  if (!img || !sub) throw new Error('未拿到 wbi_img（可能被风控）');
  return mixinKey(filenameFromUrl(img), filenameFromUrl(sub));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function looksLikeRiskOrAuthErr(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes('code=-352') ||
    e.includes('code=-101') ||
    e.includes('code=-3') ||
    e.includes('-352') ||
    e.includes('风控') ||
    e.includes('登录') ||
    e.includes('token') ||
    e.includes('unauthorized') ||
    e.includes('forbid')
  );
}

async function signedGetJson(
  fetchFn: typeof fetchViaOutboundProxy,
  headers: Record<string, string>,
  base: string,
  params: Array<[string, string]>,
  mixin: string,
): Promise<unknown> {
  const { wts, wRid } = wbiSign(params, mixin);
  const pairs = [...params, ['wts', wts], ['w_rid', wRid]];
  const qs = pairs.map(([k, v]) => `${wbiEncode(k)}=${wbiEncode(v)}`).join('&');
  return fetchJson(fetchFn, `${base}?${qs}`, headers);
}

/**
 * 解析直播间地址并换到 WSS 进房票。
 *
 * @throws Error 无法解析房间号 / 未开播 / 被风控 / 拿不到 token 时给出可读提示。
 */
export async function resolveBiliWsInfo(
  url: string,
  cookie: string,
  fetchFn: typeof fetchViaOutboundProxy = fetchViaOutboundProxy,
): Promise<BiliWsInfo> {
  const shortId = extractBiliRoomId(url);
  if (!shortId) throw new Error('无法解析 B 站房间号（示例：https://live.bilibili.com/123456）');

  const rawCookie = String(cookie || '').trim();
  let attemptCookie = ensureBuvid3(rawCookie);
  let lastErr = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = commonHeaders(attemptCookie);
    let mixin: string;
    try {
      mixin = await fetchWbiMixin(fetchFn, headers);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && biliHasSessdata(attemptCookie)) {
        attemptCookie = biliGuestCookie(attemptCookie);
        continue;
      }
      break;
    }

    let roomJson: Record<string, unknown>;
    try {
      const room = (await signedGetJson(
        fetchFn,
        headers,
        'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom',
        [
          ['room_id', shortId],
          ['web_location', '444.8'],
        ],
        mixin,
      )) as Record<string, unknown>;
      roomJson = room;
    } catch (e) {
      lastErr = `getInfoByRoom: ${e instanceof Error ? e.message : String(e)}`;
      if (attempt === 0 && biliHasSessdata(attemptCookie) && looksLikeRiskOrAuthErr(lastErr)) {
        attemptCookie = biliGuestCookie(attemptCookie);
        continue;
      }
      break;
    }

    const roomInfo = asRecord(roomJson.data)?.room_info;
    const roomInfoRec = asRecord(roomInfo);
    const roomId = roomInfoRec?.room_id != null ? String(roomInfoRec.room_id) : '';
    if (!roomId || roomId === '0') {
      lastErr = '未拿到真实 room_id';
      break;
    }
    const title = String(roomInfoRec?.title || '').trim();
    const anchorInfo = asRecord(asRecord(roomJson.data)?.anchor_info);
    const baseInfo = asRecord(anchorInfo?.base_info);
    const anchor = String(baseInfo?.uname || '').trim();
    const liveStatus = Number(roomInfoRec?.live_status ?? 0);
    if (liveStatus === 0) throw new Error('主播未开播');

    let danmuJson: Record<string, unknown>;
    try {
      const danmu = (await signedGetJson(
        fetchFn,
        headers,
        'https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo',
        [
          ['id', roomId],
          ['type', '0'],
          ['web_location', '444.8'],
        ],
        mixin,
      )) as Record<string, unknown>;
      danmuJson = danmu;
    } catch (e) {
      lastErr = `getDanmuInfo: ${e instanceof Error ? e.message : String(e)}`;
      if (attempt === 0 && biliHasSessdata(attemptCookie) && looksLikeRiskOrAuthErr(lastErr)) {
        attemptCookie = biliGuestCookie(attemptCookie);
        continue;
      }
      break;
    }

    const data = asRecord(danmuJson.data);
    const token = String(data?.token || '').trim();
    if (!token) {
      lastErr = 'getDanmuInfo 未返回 token（可能被风控；可清空 Cookie 用游客重试，或换新 SESSDATA）';
      if (attempt === 0 && biliHasSessdata(attemptCookie)) {
        attemptCookie = biliGuestCookie(attemptCookie);
        continue;
      }
      break;
    }

    const hostList = Array.isArray(data?.host_list) ? data.host_list : [];
    let websocketUrl = 'wss://broadcastlv.chat.bilibili.com:443/sub';
    for (const h of hostList) {
      const hostRec = asRecord(h);
      const host = String(hostRec?.host || '');
      if (!host) continue;
      const port = Number(hostRec?.wss_port || 443) || 443;
      websocketUrl = `wss://${host}:${port}/sub`;
      break;
    }

    return {
      roomId,
      token,
      websocketUrl,
      cookie: attemptCookie,
      title,
      anchor,
      uid: biliAuthUid(attemptCookie),
      liveStatus,
    };
  }

  throw new Error(lastErr || '获取弹幕连接失败');
}
