/**
 * 直播礼物图标表：礼物名 → 平台官方礼物图，配一条同源代理路由。
 *
 * 小窗与控制台的礼物行只拿得到礼物名（各平台 feed 的 `text` 就是礼物名）：
 * 抖音礼物帧的图标字段经常缺失、快手 WS 只带 giftId，所以「按名字出图」是唯一稳定的路子。
 *
 * 页面 CSP 是 `img-src 'self'`，不放开外部 CDN，因此图片由
 * `/standalone-console/gift-icon` 在本机取回后再回给页面；取不到时页面继续用金色礼物托，
 * 表里没有的礼物不会被猜图。
 * @module dsh-pet/src/standalone/live-gift-icon
 */

import { fetchViaOutboundProxy } from '../host/net/proxy-fetch.ts';

/** 已收录图标的平台。 */
export type GiftIconPlatform = 'douyin' | 'kuaishou' | 'bilibili';

/** 代理取图时的 Referer：外链 CDN 有防盗链，缺它会回 403 或占位图。 */
const REFERERS: Record<GiftIconPlatform, string> = {
  douyin: 'https://live.douyin.com/',
  kuaishou: 'https://live.kuaishou.com/',
  bilibili: 'https://live.bilibili.com/',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 抖音官方礼物 CDN 根：`<root>/<hash>.png~tplv-obj.png`（个别资源路径不带 `.png` 段，见入团卡）。 */
const DY_ROOT = 'https://p3-webcast.douyinpic.com/img/webcast';

/** 抖音：礼物名 → 官方礼物图（hash 与 CDN 文件名一致，可单独核对）。 */
const DOUYIN_ICONS: Record<string, string> = {
  小心心: `${DY_ROOT}/154c9946db73cba98529ab66792e5385.png~tplv-obj.png`,
  玫瑰: `${DY_ROOT}/a29d6cdc0abb7286fdd403915196eaa7.png~tplv-obj.png`,
  大啤酒: `${DY_ROOT}/a24b3cc863742fd4bc3de0f53dac4487.png~tplv-obj.png`,
  棒棒糖: `${DY_ROOT}/cadd229a47b7fad58ba021c7d4638516.png~tplv-obj.png`,
  鲜花: `${DY_ROOT}/898bc8988a737b909e952854747c8f7e.png~tplv-obj.png`,
  爱你哟: `${DY_ROOT}/de5bb6a3c636109408c038d6209bcd9a.png~tplv-obj.png`,
  爱的纸鹤: `${DY_ROOT}/655f1cbf07809a9257ac89c1d5847597.png~tplv-obj.png`,
  抖音: `${DY_ROOT}/802a21ae29f9fae5abe3693de9f874bd.png~tplv-obj.png`,
  热气球: `${DY_ROOT}/53b3b0e512c62bd1eb4ea9df9bf38cf7.png~tplv-obj.png`,
  保时捷: `${DY_ROOT}/bd4ad62dfcc021fda39080166bcbd698.png~tplv-obj.png`,
  私人飞机: `${DY_ROOT}/8d41e8692ec3a6513af229e535358793.png~tplv-obj.png`,
  嘉年华: `${DY_ROOT}/a7d3b86b11df780f084d06723ad70b30.png~tplv-obj.png`,
  抖音1号: `${DY_ROOT}/e1972046aa7cc5ae870041a655ddf016.png~tplv-obj.png`,
  人气票: `${DY_ROOT}/e9b7db267d0501b8963d8000c091e123.png~tplv-obj.png`,
  粉丝团灯牌: `${DY_ROOT}/722e56b42551d6490e5ebd9521287c67.png~tplv-obj.png`,
  // 入团卡：CDN 路径没有 `.png` 段，直接写全 URL
  入团卡: `${DY_ROOT}/698373dfdac86a90b54facdc38698cbc~tplv-obj.png`,
};

/** 快手：礼物名 → 礼物图（取自公开 `allgifts` 目录的 `giftUrl`，统一升到 https）。 */
const KUAISHOU_ICONS: Record<string, string> = {
  粉丝团灯牌: 'https://p66-live.wskwai.com/uhead/AB/2023/08/21/20/BMjAyMzA4MjEyMDUzMDNfMF9nMTAwNDJfbHY=.jpg',
  荧光棒: 'https://p66-live.wskwai.com/uhead/AB/2020/01/13/10/BMjAyMDAxMTMxMDE5MTZfMF9nMV9sdg==.jpg',
  啤酒: 'https://p66-live.wskwai.com/uhead/AB/2019/01/03/15/BMjAxOTAxMDMxNTU4NTdfMF9nOV9sdg==.jpg',
  么么哒: 'https://p66-live.wskwai.com/uhead/AB/2020/07/31/15/BMjAyMDA3MzExNTM1MjlfMF9nN19sdg==.jpg',
  棒棒糖: 'https://p66-live.wskwai.com/uhead/AB/2022/07/06/11/BMjAyMjA3MDYxMTU5NDNfMF9nMTk3X2x2.jpg',
  火箭: 'https://p66-live.wskwai.com/uhead/AB/2024/08/06/16/BMjAyNDA4MDYxNjAyMDFfMF9nMTEzX2x2.jpg',
  跑车: 'https://p66-live.wskwai.com/uhead/AB/2024/08/06/16/BMjAyNDA4MDYxNjA1MjhfMF9nNDFfbHY=.jpg',
  钻戒: 'https://p66-live.wskwai.com/uhead/AB/2020/01/15/15/BMjAyMDAxMTUxNTU5MTdfMF9nMTRfbHY=.jpg',
};

/** B站：礼物名 → `img_basic`（取自 `giftPanel/giftConfig`，只收常用便宜礼物）。 */
const BILIBILI_ICONS: Record<string, string> = {
  小心心: 'https://s1.hdslb.com/bfs/live/d4a0827cbb6b00e48f4d3e6c0f4fdd6e24c93a8f.png',
  辣条: 'https://s1.hdslb.com/bfs/live/d57afb7c5596359970eb430655c6aef501a268ab.png',
  牛哇: 'https://s1.hdslb.com/bfs/live/91ac8e35dd93a7196325f1e2052356e71d135afb.png',
  小花花: 'https://s1.hdslb.com/bfs/live/5126973892625f3a43a8290be6b625b5e54261a5.png',
  打call: 'https://s1.hdslb.com/bfs/live/461be640f60788c1d159ec8d6c5d5cf1ef3d1830.png',
  亿圆: 'https://s1.hdslb.com/bfs/live/592e81002d20699c7e4dae4480ada79ab3253eae.png',
  干杯: 'https://s1.hdslb.com/bfs/live/96ec38f351a4e190c4a525bc5e11ff09d2874064.png',
  摩天轮: 'https://s1.hdslb.com/bfs/live/1d7037457bcfa8fd033ff26d6c452d1667ac6c17.png',
  小电视飞船: 'https://s1.hdslb.com/bfs/live/ac43b069bec53d303a9a1e0c4e90ccd1213d1b6b.png',
};

const PLATFORM_ICONS: Record<GiftIconPlatform, Record<string, string>> = {
  douyin: DOUYIN_ICONS,
  kuaishou: KUAISHOU_ICONS,
  bilibili: BILIBILI_ICONS,
};

/** 站内同义写法 → 表内标准名（先按原字查表，不中再走别名）。 */
const NAME_ALIASES: Record<string, string> = {
  小星星: '小心心',
  点亮粉丝团: '粉丝团灯牌',
  灯牌: '粉丝团灯牌',
  入团: '入团卡',
  玫瑰花: '玫瑰',
  啤酒: '大啤酒',
  抖音一号: '抖音1号',
  飞机: '私人飞机',
  纸鹤: '爱的纸鹤',
};

/** 礼物名归一：去空白，并去掉「礼物#<id>」这类没有名字的兜底名。 */
function normalizeGiftName(name: unknown): string {
  const text = String(name ?? '')
    .replace(/\s+/g, '')
    .trim();
  if (!text || text === '礼物' || /^礼物#/.test(text)) return '';
  return text;
}

function isPlatform(value: string): value is GiftIconPlatform {
  return value === 'douyin' || value === 'kuaishou' || value === 'bilibili';
}

/**
 * 查礼物图 CDN 地址。
 *
 * @param platform - 平台标识（douyin / kuaishou / bilibili）。
 * @param name - 礼物名，可带站内同义写法（小星星 / 灯牌 / 入团 …）。
 * @returns 命中返回外链图地址，未收录返回空串。
 */
export function resolveGiftIconUrl(platform: string, name: unknown): string {
  const key = String(platform ?? '').trim();
  if (!isPlatform(key)) return '';
  const normalized = normalizeGiftName(name);
  if (!normalized) return '';
  const table = PLATFORM_ICONS[key];
  const direct = table[normalized];
  if (direct) return direct;
  const canonical = NAME_ALIASES[normalized];
  return canonical ? table[canonical] || '' : '';
}

/**
 * 页面用的同源取图地址；未收录返回空串。
 *
 * @param platform - 平台标识。
 * @param name - 礼物名。
 * @returns `/standalone-console/gift-icon?p=…&n=…` 形式的路径。
 */
export function giftIconProxyPath(platform: string, name: unknown): string {
  if (!resolveGiftIconUrl(platform, name)) return '';
  const key = String(platform ?? '').trim();
  const text = String(name ?? '').trim();
  return `/standalone-console/gift-icon?p=${encodeURIComponent(key)}&n=${encodeURIComponent(text)}`;
}

/**
 * 页面脚本里用的「平台|礼物名 → 同源取图地址」映射（别名写法一并列进去，
 * 页面不用再自己归一）。
 *
 * @returns 可直接嵌进脚本的 JSON 字符串。
 */
export function giftIconUrlMapJson(): string {
  const map: Record<string, string> = {};
  for (const platform of Object.keys(PLATFORM_ICONS) as GiftIconPlatform[]) {
    for (const name of Object.keys(PLATFORM_ICONS[platform])) {
      map[`${platform}|${name}`] = giftIconProxyPath(platform, name);
    }
  }
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    for (const platform of Object.keys(PLATFORM_ICONS) as GiftIconPlatform[]) {
      if (!PLATFORM_ICONS[platform][canonical]) continue;
      const path = giftIconProxyPath(platform, canonical);
      if (path) map[`${platform}|${alias}`] = path;
    }
  }
  return JSON.stringify(map);
}

/** 代理取回的图片。 */
export type GiftIconAsset = {
  /** 图片二进制。 */
  body: Buffer;
  /** 响应用的 content-type。 */
  contentType: string;
};

/** 进程内缓存：CDN 路径带 hash、内容不变，命中直接复用。 */
const iconCache = new Map<string, GiftIconAsset>();
const CACHE_LIMIT = 120;

/**
 * 本机取图（带进程内缓存）：给 `/standalone-console/gift-icon` 用。
 *
 * @param platform - 平台标识。
 * @param name - 礼物名。
 * @returns 命中且取图成功返回图片，未收录或上游失败返回 null。
 */
export async function loadGiftIcon(platform: string, name: unknown): Promise<GiftIconAsset | null> {
  const key = String(platform ?? '').trim();
  if (!isPlatform(key)) return null;
  const url = resolveGiftIconUrl(key, name);
  if (!url) return null;
  const cached = iconCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetchViaOutboundProxy(url, {
      method: 'GET',
      headers: { referer: REFERERS[key], 'user-agent': UA, accept: 'image/*' },
    });
    if (!res.ok) return null;
    const contentType = String(res.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (!body.length) return null;
    if (iconCache.size >= CACHE_LIMIT) iconCache.clear();
    const asset: GiftIconAsset = { body, contentType };
    iconCache.set(url, asset);
    return asset;
  } catch {
    return null;
  }
}

/** 清空图标缓存（平台切换重开监听时用；测试也用它避免串味）。 */
export function clearGiftIconCache(): void {
  iconCache.clear();
}
