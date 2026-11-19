/**
 * 小红书弹幕表情：`[微笑R]` 这类 token → 表情图，与抖音共用一条同源代理路由。
 *
 * 小红书正文里的自定义表情不是 Unicode emoji，而是 `[名字R]` / `[名字H]` 形式的 token，
 * R/H 是站内后缀，算 token 的一部分；归一后要能对上表情源的资源名。
 *
 * 图源分三层，按「小图优先」取：
 * 1. `sticker.sokoko.org` 的 rednote 合集：官方码主表，166 张 webp（单张 5～8 KB），
 *    弹幕里绝大多数表情都命中这一层；
 * 2. 主表缺图的那几个码（笑哭了、亲一个、扶额…）回落到 jsDelivr 上的 PNG 合集，
 *    这些是未压缩原图（单张可达十几 MB），只在第一层缺图时才会取；
 * 3. 合集里没有的（小红花），用内置 SVG 兜底。
 *
 * 页面 CSP 是 `img-src 'self'`，外部 CDN 不能直连，所以图由
 * `/standalone-console/emoji?p=xhs&n=微笑R` 在本机取回后再给页面；未收录的表情，
 * 页面继续显示原文 token，不会出现裂图。
 * @module dsh-pet/src/standalone/xhs-emoji
 */

import { fetchViaOutboundProxy } from '../host/net/proxy-fetch.ts';

/** 主表情源：官方码一一对应，`.webp`，体积小。 */
const PRIMARY_CDN = 'https://sticker.sokoko.org/assets/rednote';

/** 回落表情源：PNG 原图合集（文件名不带 R/H 后缀）。 */
const SECONDARY_CDN = 'https://cdn.jsdelivr.net/gh/Augenstern-O/Stickers/RedNote';

/**
 * 回落源的图是未压缩原图（单张 1～9 MB），直接给页面要等好几秒，
 * 所以先过一层缩图代理压到 96×96（~15 KB）再取；代理失败才直连原图。
 */
const RESIZE_PROXY = 'https://wsrv.nl';

/** 取图 Referer：合集按来源防盗链，带上站内地址更稳。 */
const REFERER = 'https://www.xiaohongshu.com/';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 主表资源名：站内 token 去掉方括号后就是它，R/H 后缀一并保留
 * （合集文件名带后缀，`扯脸H`、`蹲后续H` 的 H 不是罗马字 R 的别名）。
 */
const PRIMARY_IDS: readonly string[] = [
  '爱心R',
  '暗中观察R',
  '八R',
  '拔草R',
  '吧唧R',
  '抱拳R',
  '爆炸R',
  '背包R',
  '鄙视R',
  '鞭炮R',
  '彩虹R',
  '草莓R',
  '扯脸H',
  '吃瓜R',
  '冲浪板R',
  '打卡R',
  '大便R',
  '大笑R',
  '刀R',
  '得意R',
  '登山鞋R',
  '点赞R',
  '电影R',
  '凋谢R',
  '蹲后续H',
  '蹲R',
  '二R',
  '发R',
  '放大镜R',
  '飞机R',
  '飞盘R',
  '飞吻R',
  '氛围感R',
  '风镜R',
  '扶墙R',
  '福R',
  '公路车R',
  '勾引R',
  '购物车R',
  '鼓掌R',
  '海豚R',
  '害羞R',
  '汗颜R',
  '喝奶茶R',
  '合十R',
  '黑薯问号R',
  '红包R',
  '红色心形R',
  '红书R',
  '红薯R',
  '黄瓜R',
  '黄金薯R',
  '黄色心形R',
  '火R',
  '集美R',
  '加一R',
  '加油R',
  '禁R',
  '惊恐R',
  '九R',
  '举手R',
  '咖啡R',
  '卡式炉R',
  '开箱R',
  '看R',
  '可怜R',
  '可R',
  '抠鼻R',
  '哭惹R',
  '辣椒R',
  '蓝色心形R',
  '老虎R',
  '礼物R',
  '栗子R',
  '两颗心R',
  '零R',
  '流汗R',
  '六R',
  '陆冲板R',
  '露营灯R',
  '露营R',
  '绿色心形R',
  '马甲R',
  '买爆R',
  '满月R',
  '满R',
  '玫瑰R',
  '萌萌哒R',
  '拍立得R',
  '派对R',
  '啤酒R',
  '葡萄R',
  '七R',
  '骑行服R',
  '气球R',
  '钱袋R',
  '浅肤色R',
  '清单R',
  '请文明R',
  '请友好R',
  '庆祝R',
  '拳头R',
  '弱R',
  '三R',
  '色色R',
  '生气R',
  '生日蛋糕R',
  '失望R',
  '石化R',
  '手套R',
  '薯券R',
  '双翘滑板R',
  '睡觉R',
  '私信R',
  '四R',
  '太阳R',
  '叹气R',
  '探店R',
  '桃子R',
  '天幕R',
  '同款R',
  '偷笑R',
  '头盔R',
  '吐舌头H',
  '哇R',
  '晚安R',
  '微笑R',
  '握手R',
  '五R',
  '捂脸R',
  '仙女R',
  '向右R',
  '笑哭R',
  '斜眼R',
  '新月R',
  '星R',
  '学生党R',
  '烟花R',
  '耶R',
  '一R',
  '樱花R',
  '营地车R',
  '拥抱R',
  '优惠券R',
  '有R',
  '渔夫帽R',
  '郁金香R',
  '再见R',
  '赞R',
  '炸弹R',
  '长板R',
  '折叠车R',
  '折叠椅R',
  '中等肤色R',
  '中浅肤色R',
  '中深肤色R',
  '种草R',
  '皱眉R',
  '猪头R',
  '抓狂R',
  '紫色心形R',
  '自拍R',
  'doge',
  'kissR',
  'okR',
  'ootdR',
];

/**
 * 主表缺图、只能回落到 PNG 合集的名字（不带后缀）。
 * 这些码在主表里有条目但没资源，命中的是第二层。
 */
const SECONDARY_NAMES: readonly string[] = [
  '笑哭了',
  '棒',
  '亲一个',
  '完啦',
  '心心眼',
  '扶额',
  '抽泣',
  '呃',
  '嘻嘻',
  '捂嘴笑',
  '超喜欢',
  '泪崩',
  '尬住',
  '坏笑',
  // 主表没有、合集里有的几个旧表情，顺手收进来，命中时同样可用。
  '冰淇淋',
  '变猪猪',
  '吃粽子',
  '棒棒糖',
];

/** 站内写法 → 资源名：弹幕里的名字与资源名不一致时按这里换。 */
const NAME_ALIASES: Record<string, string> = {
  点赞: '点赞R',
  红花: '小红花',
};

/** 合集里没有这张图，用内置 SVG 兜底；key 是归一后的资源名。 */
const LOCAL_EMOJI_SVG: Record<string, string> = {
  小红花:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="32" r="7" fill="#FFB020"/><ellipse cx="32" cy="18" rx="10" ry="12" fill="#FF4D6A"/><ellipse cx="32" cy="46" rx="10" ry="12" fill="#FF4D6A"/><ellipse cx="18" cy="32" rx="12" ry="10" fill="#FF3B5C"/><ellipse cx="46" cy="32" rx="12" ry="10" fill="#FF3B5C"/><ellipse cx="21" cy="21" rx="10" ry="11" transform="rotate(-40 21 21)" fill="#FF6B81"/><ellipse cx="43" cy="21" rx="10" ry="11" transform="rotate(40 43 21)" fill="#FF6B81"/><ellipse cx="21" cy="43" rx="10" ry="11" transform="rotate(40 21 43)" fill="#FF6B81"/><ellipse cx="43" cy="43" rx="10" ry="11" transform="rotate(-40 43 43)" fill="#FF6B81"/><circle cx="32" cy="32" r="5.5" fill="#FFC94D"/><circle cx="30.5" cy="30.5" r="1.2" fill="#FFE9A8"/></svg>',
};

const PRIMARY_SET = new Set(PRIMARY_IDS);
const SECONDARY_SET = new Set(SECONDARY_NAMES);

/** 弹幕文本里的表情 token：`[名字]`，名字不含方括号与空白。页面脚本用的是同一条规则。 */
export const XHS_EMOJI_TOKEN_RE = /\[[^[\]\s]{1,20}\]/g;

/** 去掉方括号与首尾空白；不是 token 也按纯名字处理。 */
function unwrapToken(token: unknown): string {
  let name = String(token ?? '').trim();
  if (name.startsWith('[') && name.endsWith(']')) name = name.slice(1, -1).trim();
  return name;
}

/** 去掉站内 R/H 后缀；本来就是裸名字的返回原样。 */
function stripSuffix(name: string): string {
  return name.length > 1 && /[RH]$/i.test(name) ? name.slice(0, -1) : name;
}

/** 按「原样 → 补 R/H → 去 R/H」的顺序找一个能出图的名字。 */
function pickKnown(name: string): string {
  if (!name) return '';
  if (PRIMARY_SET.has(name) || SECONDARY_SET.has(name) || LOCAL_EMOJI_SVG[name]) return name;
  const alias = NAME_ALIASES[name];
  if (alias) return alias;
  for (const suffix of ['R', 'H']) {
    const withSuffix = name + suffix;
    if (PRIMARY_SET.has(withSuffix) || SECONDARY_SET.has(withSuffix)) return withSuffix;
  }
  const base = stripSuffix(name);
  if (base !== name) {
    if (PRIMARY_SET.has(base) || SECONDARY_SET.has(base) || LOCAL_EMOJI_SVG[base]) return base;
    const baseAlias = NAME_ALIASES[base];
    if (baseAlias) return baseAlias;
    for (const suffix of ['R', 'H']) {
      const baseWithSuffix = base + suffix;
      if (PRIMARY_SET.has(baseWithSuffix) || SECONDARY_SET.has(baseWithSuffix)) return baseWithSuffix;
    }
  }
  return '';
}

/**
 * token → 资源名：去方括号、认别名，再补/去站内 R/H 后缀重试。
 *
 * @param token - 表情 token，`[微笑R]`、`[微笑]` 或 `微笑` 都行。
 * @returns 命中返回资源名（主表带后缀，如 `微笑R`），未收录返回空串。
 */
export function normalizeXhsEmojiName(token: unknown): string {
  return pickKnown(unwrapToken(token));
}

/** 回落源的原始 PNG 地址。 */
function secondaryRawUrl(name: string): string {
  return `${SECONDARY_CDN}/${encodeURIComponent(name)}.png`;
}

/** 回落源的缩图地址：96×96 的 PNG，体积从 MB 级降到十几 KB。
 *  中文名只在这里编码一次——先编码再塞进 `url=` 会变成双重编码，代理那边就找不着图。 */
function secondarySmallUrl(name: string): string {
  return `${RESIZE_PROXY}/?url=${encodeURIComponent(`${SECONDARY_CDN}/${name}.png`)}&w=96&h=96&fit=contain&output=png`;
}

/**
 * 查表情图外链。
 *
 * @param name - 表情 token 或资源名。
 * @returns 命中返回外链图地址；只有内置图时返回空串。
 */
export function resolveXhsEmojiUrl(name: unknown): string {
  const key = normalizeXhsEmojiName(name);
  if (!key || LOCAL_EMOJI_SVG[key]) return '';
  if (PRIMARY_SET.has(key)) return `${PRIMARY_CDN}/${encodeURIComponent(key)}.webp`;
  return secondarySmallUrl(key);
}

/**
 * 页面用的同源取图地址；按归一后的资源名拼，`[微笑R]` 与 `[微笑]` 共用一条缓存。
 *
 * @param name - 表情 token。
 * @returns `/standalone-console/emoji?p=xhs&n=…` 形式的路径，未收录返回空串。
 */
export function xhsEmojiProxyPath(name: unknown): string {
  const key = normalizeXhsEmojiName(name);
  if (!key) return '';
  return `/standalone-console/emoji?p=xhs&n=${encodeURIComponent(key)}`;
}

/**
 * 页面脚本里用的「表情名 → 同源取图地址」映射：主表带后缀名、裸名字、别名写法都列进去，
 * 页面先按 token 原名查，查不到再去 R/H 后缀查，不用自己认别名。
 *
 * @returns 可直接嵌进脚本的 JSON 对象字符串。
 */
export function xhsEmojiUrlMapJson(): string {
  const map: Record<string, string> = {};
  const add = (name: string): void => {
    const path = xhsEmojiProxyPath(name);
    if (path) map[name] = path;
  };
  for (const id of PRIMARY_IDS) add(id);
  for (const name of SECONDARY_NAMES) add(name);
  for (const name of Object.keys(LOCAL_EMOJI_SVG)) add(name);
  // 裸名字（去掉 R/H）与补后缀写法都补一条，`[微笑]` 少个后缀也能出图。
  for (const id of PRIMARY_IDS) {
    const base = stripSuffix(id);
    if (base !== id) add(base);
  }
  for (const name of SECONDARY_NAMES) {
    add(`${name}R`);
    add(`${name}H`);
  }
  for (const alias of Object.keys(NAME_ALIASES)) add(alias);
  return JSON.stringify(map);
}

/** 代理取回的图片。 */
export type XhsEmojiAsset = {
  /** 图片二进制。 */
  body: Buffer;
  /** 响应用的 content-type（webp/png，内置兜底是 image/svg+xml）。 */
  contentType: string;
};

/** 进程内缓存：同一张表情整场直播反复用到。主表是 5～8 KB 小图，按张数限容。 */
const emojiCache = new Map<string, XhsEmojiAsset>();
const CACHE_BUDGET_BYTES = 32 * 1024 * 1024;
let cacheBytes = 0;

/** 插入前按插入序淘汰最旧的，直到腾得下；单张就超预算的不进缓存，只回给本次请求。 */
function rememberEmoji(key: string, asset: XhsEmojiAsset): XhsEmojiAsset {
  if (asset.body.length > CACHE_BUDGET_BYTES) return asset;
  for (const [oldKey, old] of emojiCache) {
    if (cacheBytes + asset.body.length <= CACHE_BUDGET_BYTES) break;
    emojiCache.delete(oldKey);
    cacheBytes -= old.body.length;
  }
  emojiCache.set(key, asset);
  cacheBytes += asset.body.length;
  return asset;
}

/** 取一张外链图并校验成图片；失败返回 null。 */
async function fetchImage(url: string): Promise<XhsEmojiAsset | null> {
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
    return { body, contentType };
  } catch {
    return null;
  }
}

/**
 * 本机取图（带进程内缓存）：给 `/standalone-console/emoji?p=xhs` 用。
 *
 * @param name - 表情 token。
 * @returns 命中且取图成功返回图片，未收录或上游全失败返回 null。
 */
export async function loadXhsEmoji(name: unknown): Promise<XhsEmojiAsset | null> {
  const key = normalizeXhsEmojiName(name);
  if (!key) return null;
  const cached = emojiCache.get(key);
  if (cached) return cached;

  const local = LOCAL_EMOJI_SVG[key];
  if (local) return rememberEmoji(key, { body: Buffer.from(local, 'utf8'), contentType: 'image/svg+xml' });

  // 主表小图优先；主表没这张图（或临时挂了）就回落到缩图，缩图代理也不通才直连原图。
  const candidates: string[] = [];
  if (PRIMARY_SET.has(key)) candidates.push(`${PRIMARY_CDN}/${encodeURIComponent(key)}.webp`);
  const secondaryKey = SECONDARY_SET.has(key) ? key : stripSuffix(key);
  if (SECONDARY_SET.has(secondaryKey)) {
    candidates.push(secondarySmallUrl(secondaryKey), secondaryRawUrl(secondaryKey));
  }

  for (const url of candidates) {
    const asset = await fetchImage(url);
    if (asset) return rememberEmoji(key, asset);
  }
  return null;
}

/** 清空表情缓存（测试用；正常退出进程即释放）。 */
export function clearXhsEmojiCache(): void {
  emojiCache.clear();
  cacheBytes = 0;
}
