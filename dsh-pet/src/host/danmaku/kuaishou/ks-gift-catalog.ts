/**
 * 快手礼物名称目录：WS 帧只带 giftId，名称来自公开 `allgifts` 目录（对齐 danmuapp `ksDanmaku.js` 90-172）。
 *
 * 本轮只解析名称；单价 / 图标需 `gift-list`（带 liveStreamId + 登录态），留样本不接。
 * 目录拉取失败不阻断进房，礼物名按 `礼物#<giftId>` 兜底。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-gift-catalog
 */
import { fetchViaOutboundProxy, type ProxyFetchInit } from '../../net/proxy-fetch.ts';

/** 礼物目录实例（进程内单例语义由 monitor 持有）。 */
export type KsGiftCatalog = {
  /** 灌入 allgifts 字典或 gift-list 列表的目录 JSON。 */
  ingestAllGifts(json: unknown): void;
  /** 取礼物名；目录未命中兜底 `礼物#<giftId>`。 */
  nameFor(giftId: string): string;
  clear(): void;
};

const CATALOG_URL = 'https://live.kuaishou.com/live_api/emoji/allgifts';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = 'https://live.kuaishou.com/';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickName(item: unknown): string {
  const rec = asRecord(item);
  if (!rec) return '';
  return String(rec.giftName || rec.name || '').trim();
}

function pickId(item: unknown): string {
  const rec = asRecord(item);
  if (!rec) return '';
  return String(rec.giftId ?? rec.id ?? rec.gift_id ?? '').trim();
}

/** 创建礼物名称目录缓存。 */
export function createKsGiftCatalog(): KsGiftCatalog {
  const byId = new Map<string, string>();

  function ingestAllGifts(json: unknown): void {
    const data = asRecord(json)?.data ?? json;
    const record = asRecord(data);
    if (!record) return;

    const list = Array.isArray(record.gifts) ? record.gifts : null;
    if (list) {
      for (const item of list) {
        const id = pickId(item);
        const name = pickName(item);
        if (id && name) byId.set(id, name);
      }
      return;
    }
    for (const [id, item] of Object.entries(record)) {
      const name = pickName(item);
      if (id && name) byId.set(id, name);
    }
  }

  function nameFor(giftId: string): string {
    const id = String(giftId || '').trim();
    const cached = id ? byId.get(id) : '';
    if (cached) return cached;
    return id ? `礼物#${id}` : '礼物';
  }

  function clear(): void {
    byId.clear();
  }

  return { ingestAllGifts, nameFor, clear };
}

/**
 * 预拉一次公开礼物目录；失败静默（礼物名兜底）。
 * `fetchFn` 可注入便于测试，默认走出站代理封装。
 */
export async function preloadKsGiftCatalog(
  catalog: KsGiftCatalog,
  fetchFn: (url: string, init: ProxyFetchInit) => Promise<Response> = fetchViaOutboundProxy,
): Promise<void> {
  try {
    const res = await fetchFn(CATALOG_URL, {
      method: 'GET',
      headers: { 'user-agent': UA, referer: REFERER, accept: 'application/json' },
    });
    if (!res.ok) return;
    const json: unknown = await res.json();
    catalog.ingestAllGifts(json);
  } catch {
    /* 目录不可用不影响弹幕 / 礼物入库 */
  }
}
