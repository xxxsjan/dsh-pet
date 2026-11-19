/**
 * 抖音弹幕表情：`[微笑]` 这类 token → 签名 CDN 图，配一条同源代理路由。
 *
 * 抖音弹幕文本里的自定义表情不是 Unicode emoji，而是 `[名字]` 形式的 token，
 * 名字要换成本项目 dy-emoji-table.ts 里固化的 `[hash, x-signature]` 才能拼出图地址。
 *
 * 页面 CSP 是 `img-src 'self'`，外部 CDN 不能直连，所以图由
 * `/standalone-console/emoji?n=[微笑]` 在本机取回后再给页面；表里没有的表情，
 * 页面继续显示 `[名字]` 原文，不会出现裂图。
 * @module dsh-pet/src/standalone/dy-emoji
 */

import { fetchViaOutboundProxy } from '../host/net/proxy-fetch.ts';
import { DY_EMOJI_TABLE } from './dy-emoji-table.ts';

/** 表情图 CDN 根：`<root>/<hash>?<固定的 lk3s/expires/from>&x-signature=<签名>`。 */
const EMOJI_CDN = 'https://p3-pc-sign.douyinpic.com/obj/tos-cn-i-tsj2vxp0zn';

/** CDN 查询串：与签名一起下发的固定参数，缺任一都会被拒。 */
const EMOJI_QS = 'lk3s=343af0a2&x-expires=2086988400&from=876277922';

/** 取图 Referer：抖音 CDN 有防盗链，带上直播页来源更稳。 */
const REFERER = 'https://live.douyin.com/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 弹幕文本里的表情 token：`[名字]`，名字不含方括号与空白。页面脚本用的是同一条规则。 */
export const DY_EMOJI_TOKEN_RE = /\[[^[\]\s]{1,20}\]/g;

/** 归一成表里的键：允许传 `微笑` 或 `[微笑]`。 */
function normalizeToken(name: unknown): string {
  const text = String(name ?? '').trim();
  if (!text) return '';
  return text.startsWith('[') && text.endsWith(']') ? text : `[${text}]`;
}

/**
 * 查表情图地址。
 *
 * @param name - 表情 token，带不带方括号都行。
 * @returns 命中返回外链图地址（含签名），未收录返回空串。
 */
export function resolveDyEmojiUrl(name: unknown): string {
  const token = normalizeToken(name);
  if (!token) return '';
  const entry = DY_EMOJI_TABLE[token];
  if (!entry) return '';
  const [hash, signature] = entry;
  if (!hash || !signature) return '';
  return `${EMOJI_CDN}/${hash}?${EMOJI_QS}&x-signature=${encodeURIComponent(signature)}`;
}

/**
 * 页面用的同源取图地址；未收录返回空串。
 *
 * @param name - 表情 token。
 * @returns `/standalone-console/emoji?n=…` 形式的路径。
 */
export function dyEmojiProxyPath(name: unknown): string {
  if (!resolveDyEmojiUrl(name)) return '';
  return `/standalone-console/emoji?n=${encodeURIComponent(normalizeToken(name))}`;
}

/**
 * 页面脚本里用的「已知表情」集合：只在表内 token 上挂图，避免未收录的 `[xxx]`
 * 先发一次必然 404 的请求再退回文字。
 *
 * @returns 可直接嵌进脚本的 JSON 对象字符串（值是 1，键是 `[名字]`）。
 */
export function dyEmojiNameMapJson(): string {
  const map: Record<string, 1> = {};
  for (const token of Object.keys(DY_EMOJI_TABLE)) map[token] = 1;
  return JSON.stringify(map);
}

/** 代理取回的图片。 */
export type DyEmojiAsset = {
  /** 图片二进制。 */
  body: Buffer;
  /** 响应用的 content-type（CDN 目前回 image/webp）。 */
  contentType: string;
};

/** 进程内缓存：同一张表情图在整场直播里会被反复用到，按图地址缓存。 */
const emojiCache = new Map<string, DyEmojiAsset>();
const CACHE_LIMIT = 400;

/**
 * 本机取图（带进程内缓存）：给 `/standalone-console/emoji` 用。
 *
 * @param name - 表情 token。
 * @returns 命中且取图成功返回图片，未收录或上游失败返回 null。
 */
export async function loadDyEmoji(name: unknown): Promise<DyEmojiAsset | null> {
  const url = resolveDyEmojiUrl(name);
  if (!url) return null;
  const cached = emojiCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetchViaOutboundProxy(url, {
      method: 'GET',
      headers: { referer: REFERER, 'user-agent': UA, accept: 'image/*' },
    });
    if (!res.ok) return null;
    const contentType = String(res.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (!body.length) return null;
    if (emojiCache.size >= CACHE_LIMIT) emojiCache.clear();
    const asset: DyEmojiAsset = { body, contentType };
    emojiCache.set(url, asset);
    return asset;
  } catch {
    return null;
  }
}

/** 清空表情缓存（测试用；正常退出进程即释放）。 */
export function clearDyEmojiCache(): void {
  emojiCache.clear();
}
