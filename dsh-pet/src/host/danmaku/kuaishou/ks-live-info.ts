/**
 * 快手直连进房：URL / Cookie 解析 + 页面内嵌票提取 + websocketinfo 换票。
 *
 * 对齐 danmuapp `src-tauri/src/lib.rs` 的 `get_ks_ws_info` 流程；HTTP 走出站代理封装，
 * Cookie jar 在 Node 侧自维护（name→value 合并 + Set-Cookie 收集）。
 *
 * 说明：passToken → STS 二次换票、graphql 未开播探测、风控验证码判定沿用参照口径的最小子集；
 * 会话刷新与风控细节需桌面真机连直播间验证。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-live-info
 */
import { fetchViaOutboundProxy, type ProxyFetchInit } from '../../net/proxy-fetch.ts';

/** 解析出的进房信息。 */
export type KsWsInfo = {
  liveStreamId: string;
  token: string;
  websocketUrl: string;
  cookie: string;
  title: string;
  /** 直播间页自带的 `[表情名] → 图片地址` 表（前端渲染快手 emoji 用）；抓不到时为空。 */
  emoji?: Record<string, string>;
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const ORIGIN = 'https://live.kuaishou.com';
const REFERER = 'https://live.kuaishou.com/';

/** 清洗用户粘贴的 Cookie：去前缀 `Cookie:`、去换行。 */
export function sanitizeKsCookie(raw: string): string {
  let s = String(raw || '').trim();
  if (s.toLowerCase().startsWith('cookie:')) s = s.slice(7).trim();
  return s.replace(/[\r\n]+/g, '');
}

/** 判定 Cookie 是否像已登录态：userId +（passToken 或任一 web_st/api_st）。 */
export function cookieHasKsLogin(cookie: string): boolean {
  const lower = String(cookie || '').toLowerCase();
  const hasUid = lower.includes('userid=');
  const hasPass = lower.includes('passtoken=');
  const hasSt =
    lower.includes('kuaishou.server.web_st=') ||
    lower.includes('kuaishou.server.webday7_st=') ||
    lower.includes('kuaishou.live.web_st=') ||
    lower.includes('kuaishou.api_st=') ||
    lower.includes('kuaishou.l.api_st=') ||
    lower.includes('kuaishou.web.cp.api_st=') ||
    lower.includes('kuaishou.at=') ||
    lower.includes('kuaishou.server.web.at=') ||
    /kuaishou\.server\.[a-z0-9._-]*_st=/.test(lower);
  return (hasUid && (hasPass || hasSt)) || (hasPass && hasSt);
}

/** 归一化直播间地址：裸 id 当主播短链，补全 https。 */
export function normalizeKsRoomUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) throw new Error('请输入快手直播间地址');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(live|www)\.kuaishou\.com\//i.test(trimmed)) return `https://${trimmed}`;
  if (!trimmed.includes('/') && !trimmed.includes('.')) {
    return `https://live.kuaishou.com/u/${trimmed}`;
  }
  return `https://${trimmed}`;
}

/** 自维护 Cookie jar：name→value 合并；响应 Set-Cookie 覆盖旧值。 */
export type KsCookieJar = {
  /** 合并一段 `k=v; k2=v2` 形式的 Cookie（重复键覆盖）。 */
  merge: (cookieStr: string) => void;
  /** 从 Set-Cookie 响应头数组或逗号分隔字符串收集。 */
  applySetCookie: (setCookie: string | readonly string[] | null) => void;
  /** 组装 Cookie 请求头。 */
  header: () => string;
};

export function createKsCookieJar(cookieStr: string): KsCookieJar {
  const map = new Map<string, string>();

  const merge = (cookieStr: string): void => {
    for (const part of String(cookieStr || '').split(';')) {
      const p = part.trim();
      if (!p) continue;
      const eq = p.indexOf('=');
      if (eq <= 0) continue;
      const k = p.slice(0, eq).trim();
      const v = p.slice(eq + 1).trim();
      if (k) map.set(k, v);
    }
  };

  const applySetCookie = (setCookie: string | readonly string[] | null): void => {
    if (!setCookie) return;
    const list: string[] = Array.isArray(setCookie) ? setCookie : String(setCookie).split(',');
    for (const entry of list) {
      const first = String(entry || '')
        .split(';')[0]
        ?.trim();
      if (!first) continue;
      const eq = first.indexOf('=');
      if (eq <= 0) continue;
      const k = first.slice(0, eq).trim();
      const v = first.slice(eq + 1).trim();
      if (k) map.set(k, v);
    }
  };

  const header = (): string => [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  merge(cookieStr);
  return { merge, applySetCookie, header };
}

/** 从主播短链 URL 提取 principalId（用于未开播探测）。 */
export function extractKsPrincipalId(url: string): string {
  const m = /live\.kuaishou\.com\/u\/([A-Za-z0-9._-]+)/i.exec(url);
  return m?.[1]?.replace(/\/+$/, '') ?? '';
}

/** 提取直播间标题。 */
export function extractKsTitle(body: string): string {
  const caption = /"caption"\s*:\s*"([^"]{1,120})"/.exec(body);
  if (caption?.[1]) return caption[1];
  const title = /<title>([^<]{1,120})<\/title>/i.exec(body);
  return title?.[1]?.trim() ?? '';
}

/**
 * 页面里的限流提示：`playList[].errorType.title`，如「请求过快，请稍后重试」。
 *
 * 限流时 websocketUrls 与 token 都是空的，继续走换票只会把「限流」误报成「需要 Cookie」。
 * @returns 命中的提示文案；没命中返回空串。
 */
export function extractKsRateLimit(body: string): string {
  const re = /"errorType"\s*:\s*\{[^{}]*"title"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const title = m[1] ?? '';
    if (/请求过快|操作频繁|访问频繁|稍后重试/.test(title)) return title;
  }
  return '';
}

/** 表情图地址归一：页面里是 `//ali2.a.yximgs.com/...` 这类协议相对地址。 */
function normalizeEmojiUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const s = value.trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('http://')) return `https://${s.slice(7)}`;
  if (s.startsWith('https://')) return s;
  return '';
}

/** 从字符串里定位 `{` 对应的配对 `}`（跳过字符串内的花括号与转义）。 */
function matchBrace(text: string, open: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 从直播间页臃出的 `pcLive.webConfig.emojiPanel` 里取 `[表情名] → 图片地址` 表。
 *
 * 快手弹幕正文里的表情就是以 `[666]` / `[捂脸]` 这类 token 出现的，服务端不下发图片；
 * 图片地址表只在页面 HTML 的这份 webConfig 里，所以进房时顺手抠出来带给前端。
 */
export function extractKsEmojiPanel(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const key = '"pcLive.webConfig.emojiPanel"';
  let from = 0;
  for (;;) {
    const at = body.indexOf(key, from);
    if (at < 0) break;
    from = at + key.length;
    const open = body.indexOf('{', from);
    if (open < 0) break;
    const end = matchBrace(body, open);
    if (end < 0) continue;
    try {
      const raw = JSON.parse(body.slice(open, end + 1)) as Record<string, unknown>;
      for (const [token, value] of Object.entries(raw)) {
        const url = normalizeEmojiUrl(value);
        if (token.startsWith('[') && token.endsWith(']') && url) out[token] = url;
      }
    } catch {
      /* 段落不是合法 JSON 就继续找下一处 */
    }
    if (Object.keys(out).length) break;
  }
  return out;
}

/** 从页面 HTML / 注入 JSON 提取 liveStreamId。 */
export function extractKsLiveStreamId(body: string): string {
  const patterns = [
    /"liveStreamId"\s*:\s*"([A-Za-z0-9_-]+)"/,
    /"liveStream"\s*:\s*\{[^{}]{0,800}?"id"\s*:\s*"([A-Za-z0-9_-]+)"/,
    /liveStreamId=([A-Za-z0-9_-]+)/,
    /"id"\s*:\s*"([A-Za-z0-9_-]{6,})"\s*,\s*"liveStreamId"/,
  ];
  for (const re of patterns) {
    const cap = re.exec(body)?.[1]?.trim();
    if (cap && cap !== 'null') return cap;
  }
  return '';
}

/** 从页面内嵌 `wsFeedInfo` 抠出 (liveStreamId, token, websocketUrl)；失败返回 null。 */
export function extractKsWsBundle(body: string): KsWsInfo | null {
  const feed = /"wsFeedInfo"\s*:\s*(\{[^}]{20,2000}\})/.exec(body)?.[1];
  if (feed) {
    try {
      const v = JSON.parse(feed) as Record<string, unknown>;
      const id = String(v.liveStreamId || v.streamId || '');
      const token = String(v.token || '');
      const ws = firstStringArray(v.websocketUrls || v.webSocketUrls);
      if (id && token && ws) return { liveStreamId: id, token, websocketUrl: ws, cookie: '', title: '' };
    } catch {
      /* fall through */
    }
  }
  const token = /"token"\s*:\s*"([^"]{20,})"/.exec(body)?.[1];
  const ws = /"web[Ss]ocketUrls"\s*:\s*\[\s*"([^"]+)"/.exec(body)?.[1];
  const id = extractKsLiveStreamId(body);
  if (id && token && ws) return { liveStreamId: id, token, websocketUrl: ws, cookie: '', title: '' };
  return null;
}

/** 解析 websocketinfo JSON：`data.token` + `data.websocketUrls[0]`。 */
export function parseKsWebsocketInfo(json: unknown): { token: string; websocketUrl: string } | null {
  if (!json || typeof json !== 'object') return null;
  const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data) return null;
  const token = String(data.token || '').trim();
  const ws = firstStringArray(data.websocketUrls || data.webSocketUrls);
  if (!token || !ws) return null;
  return { token, websocketUrl: ws };
}

function firstStringArray(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const first = value[0];
  return typeof first === 'string' ? first : '';
}

function pageHeaders(cookie: string, accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: accept,
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: REFERER,
    Origin: ORIGIN,
  };
  if (cookie.trim()) headers.Cookie = cookie.trim();
  return headers;
}

async function getJson(url: string, jar: KsCookieJar, fetchFn: typeof fetchViaOutboundProxy): Promise<unknown> {
  const init: ProxyFetchInit = {
    method: 'GET',
    headers: pageHeaders(jar.header(), 'application/json, text/plain, */*'),
  };
  const resp = await fetchFn(url, init);
  jar.applySetCookie(resp.headers.getSetCookie?.() ?? resp.headers.get('set-cookie'));
  return resp.json() as Promise<unknown>;
}

/**
 * 解析直播间地址并换到 WSS 进房票。
 *
 * @throws Error 未登录 / 未开播 / 被风控 / 拿不到完整进房信息时给出可读提示。
 */
export async function resolveKsWsInfo(
  url: string,
  cookie: string,
  fetchFn: typeof fetchViaOutboundProxy = fetchViaOutboundProxy,
): Promise<KsWsInfo> {
  const roomUrl = normalizeKsRoomUrl(url);
  const cleaned = sanitizeKsCookie(cookie);
  const jar = createKsCookieJar(cleaned);

  // 预热站点首页，收集回落 cookie（参照 get_ks_ws_info 先 GET live.kuaishou.com/）。
  try {
    const home = await fetchFn(ORIGIN + '/', { method: 'GET', headers: pageHeaders(jar.header(), 'text/html,*/*') });
    jar.applySetCookie(home.headers.getSetCookie?.() ?? home.headers.get('set-cookie'));
  } catch {
    /* 预热失败不阻断，继续拉直播间页 */
  }

  const pageResp = await fetchFn(roomUrl, {
    method: 'GET',
    headers: pageHeaders(jar.header(), 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'),
  });
  jar.applySetCookie(pageResp.headers.getSetCookie?.() ?? pageResp.headers.get('set-cookie'));
  const body = await pageResp.text();

  if (!pageResp.ok) throw new Error(`打开直播间失败 HTTP ${pageResp.status}`);
  if (body.includes('captcha') && body.length < 30_000) {
    throw new Error('快手要求验证：请用浏览器打开直播间完成验证后，复制 Cookie 粘贴到面板再试');
  }
  const rateLimit = extractKsRateLimit(body);
  if (rateLimit) {
    throw new Error(`快手限流：${rateLimit}（稍等几分钟再点开始监听，别连续重试）`);
  }

  const title = extractKsTitle(body);
  const emoji = extractKsEmojiPanel(body);
  const bundle = extractKsWsBundle(body);
  if (bundle) {
    return { ...bundle, cookie: jar.header(), title: bundle.title || title, emoji };
  }

  const liveStreamId = extractKsLiveStreamId(body);
  if (!liveStreamId) {
    if (!cleaned) throw new Error('未解析到 liveStreamId（可能未开播或需要登录 Cookie）');
    if (!cookieHasKsLogin(cleaned)) {
      throw new Error('未解析到 liveStreamId：Cookie 缺少登录会话（需 userId + passToken/web_st/webday7_st）');
    }
    throw new Error('未解析到 liveStreamId（可能未开播或 Cookie 失效）');
  }

  const infoUrl = `https://live.kuaishou.com/live_api/liveroom/websocketinfo?liveStreamId=${encodeURIComponent(liveStreamId)}`;
  const infoJson = await getJson(infoUrl, jar, fetchFn);
  const parsed = parseKsWebsocketInfo(infoJson);
  if (!parsed) {
    if (!cleaned) throw new Error('未拿到进房 token：直连需粘贴登录 Cookie（含 userId + passToken/webday7_st）');
    if (!cookieHasKsLogin(cleaned)) {
      throw new Error('未拿到进房 token：Cookie 不像已登录态（需 userId + passToken/web_st/webday7_st）');
    }
    throw new Error('未拿到进房 token：直播会话票已失效或被风控，请在浏览器打开该直播间后再复制 Cookie');
  }

  return {
    liveStreamId,
    token: parsed.token,
    websocketUrl: parsed.websocketUrl,
    cookie: jar.header(),
    title,
    emoji,
  };
}
