/**
 * 小红书中控台 longlink 弹幕解码（对齐 danmuapp `src/platforms/xhsDanmaku.js`）。
 *
 * 中控台 WS 帧是 JSON：`body.customData`，或 `b.d.b[]` 里 base64 包裹的消息体；
 * 无 protobuf、无压缩。入库「文本弹幕」「礼物」与「在线统计」，
 * 进场 / 关注 / 礼物托/结算先留样本不入库。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/xhs-danmaku
 */

/** 一条中控台互动事件（customData 原样结构，仅收敛本轮用到的字段）。 */
export type XhsCustomData = {
  type?: string;
  desc?: string;
  commentId?: string;
  msgId?: string;
  current_time?: string;
  profile?: { nickname?: string; avatar?: string; user_id?: string };
  send_user_info?: { nick_name?: string; avatar?: string };
  base_gift_info?: { name?: string; icon?: string; coins?: number; count?: number };
  gift_info?: { name?: string; icon?: string; coins?: number; count?: number };
  gift_action_info?: {
    comb_count?: number;
    count?: number;
    gift_extra_info?: { gift_name?: string };
  };
  [key: string]: unknown;
};

/** 解码后归一到展示口径的一条消息。 */
export type XhsParsedItem = {
  kind: 'chat' | 'gift' | 'online';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0；online 为在线观看人数。 */
  count: number;
  giftName: string;
};

function base64DecodeUtf8(input: string): string {
  try {
    return Buffer.from(input, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function parseCustomDataRaw(raw: unknown): XhsCustomData | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed != null ? (parsed as XhsCustomData) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as XhsCustomData;
  return null;
}

function itemId(cd: XhsCustomData): string {
  return (
    cd.commentId ||
    cd.msgId ||
    `${cd.profile?.user_id || ''}:${cd.type || ''}:${cd.desc || ''}:${cd.current_time || ''}`
  );
}

function pushUnique(out: XhsCustomData[], seen: Set<string>, cd: XhsCustomData | null): void {
  if (!cd || !cd.type) return;
  const id = itemId(cd);
  if (id && seen.has(id)) return;
  if (id) seen.add(id);
  out.push(cd);
}

/** 把入站 WS 帧（Buffer / Uint8Array / string）解码为 customData 列表。 */
export function parseXhsWsPayload(raw: unknown, seen: Set<string>): XhsCustomData[] {
  const out: XhsCustomData[] = [];
  if (raw == null) return out;

  let text = '';
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Uint8Array) {
    try {
      text = new TextDecoder('utf-8').decode(raw);
    } catch {
      return out;
    }
  } else if (raw instanceof Buffer) {
    text = raw.toString('utf8');
  } else {
    text = String(raw);
  }

  text = text.trim();
  if (!text) return out;

  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const idx = text.indexOf('{"');
    if (idx < 0) return out;
    try {
      outer = JSON.parse(text.slice(idx)) as Record<string, unknown>;
    } catch {
      return out;
    }
  }

  const body = outer.body as Record<string, unknown> | undefined;
  if (body?.customData) {
    pushUnique(out, seen, parseCustomDataRaw(body.customData));
    return out;
  }

  const nested = outer.b as Record<string, unknown> | undefined;
  const items = nested?.d as Record<string, unknown> | undefined;
  const batch = items?.b as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(batch)) {
    for (const item of batch) {
      const d = item?.d;
      if (typeof d !== 'string') continue;
      try {
        const decoded = JSON.parse(base64DecodeUtf8(d)) as Record<string, unknown>;
        const cd = parseCustomDataRaw(decoded?.customData);
        if (cd) {
          if (!cd.msgId && decoded?.msgId) cd.msgId = String(decoded.msgId);
          pushUnique(out, seen, cd);
        } else if (decoded && typeof decoded === 'object') {
          pushUnique(out, seen, decoded as XhsCustomData);
        }
      } catch {
        /* skip */
      }
    }
  }

  return out;
}

/** 在线统计类 customData 的候选数值字段：中控台各版本键名不统一，按序取第一个可用值。 */
const XHS_ONLINE_KEYS = [
  'online_user_num',
  'online_user_count',
  'online_count',
  'online_num',
  'onlineUserNum',
  'onlineUserCount',
  'onlineCount',
  'onlineNum',
  'viewer_count',
  'viewerCount',
  'watch_count',
  'watchCount',
  'audience_count',
  'audienceCount',
  'user_count',
  'userCount',
  'count',
  'num',
  'value',
  'total',
];

/** 类型名兜底：含在线 / 观看 / 统计语义才按在线统计处理，其余类型继续留样本。 */
const XHS_ONLINE_TYPE_RE = /online|viewer|watching|audience|statistic|stats|room_stat/i;

/**
 * 「1234」/「1.2万」/「1.2w」/「3.4亿」→ 整数；解析不出返回 -1。
 * 纯数字之外只放行 人 / 位 / 观众 / 在线 / 观看 这类尾缀。
 */
export function parseXhsCountText(value: unknown): number {
  if (value == null) return -1;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : -1;
  }
  const s = String(value)
    .replace(/[,，\s]/g, '')
    .trim();
  if (!s) return -1;
  const m = /^(\d+(?:\.\d+)?)(亿|万|w|W)?(?:人|位|观众|在线|观看)*$/.exec(s);
  if (!m) return -1;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base < 0) return -1;
  const unit = m[2];
  const scale = unit === '亿' ? 1e8 : unit === '万' || unit === 'w' || unit === 'W' ? 1e4 : 1;
  return Math.max(0, Math.floor(base * scale));
}

/**
 * 在线统计类 customData → 在线人数；非在线类 / 取不到数值返回 -1。
 *
 * 中控台不同版本的 type 名与字段名都不稳定，这里按语义白名单 + 候选键兜底，
 * 取不到就继续按「留样本」处理，绝不拿弹幕/礼物条数冒充。
 */
export function parseXhsOnlineCount(cd: XhsCustomData): number {
  const type = String(cd.type || '').trim();
  if (!type || !XHS_ONLINE_TYPE_RE.test(type)) return -1;
  for (const key of XHS_ONLINE_KEYS) {
    const n = parseXhsCountText((cd as Record<string, unknown>)[key]);
    if (n >= 0) return n;
  }
  // 少数版本把数字塞进展示文案（如「1.2万人正在观看」）。
  const hint = /在线|在看|观看|观众|人数/.test(String(cd.desc || ''));
  if (!hint) return -1;
  const m = /(\d+(?:\.\d+)?)(亿|万|w|W)?/.exec(String(cd.desc || '').replace(/[,，\s]/g, ''));
  if (!m) return -1;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base < 0) return -1;
  const unit = m[2];
  const scale = unit === '亿' ? 1e8 : unit === '万' || unit === 'w' || unit === 'W' ? 1e4 : 1;
  return Math.max(0, Math.floor(base * scale));
}

function pickNick(cd: XhsCustomData): string {
  const send = cd.send_user_info;
  return String(send?.nick_name || cd.profile?.nickname || '匿名').trim() || '匿名';
}

/** 把单条 customData 归一为展示项；非弹幕 / 礼物 / 在线统计返回 null。 */
export function classifyXhsItem(cd: XhsCustomData): XhsParsedItem | null {
  switch (cd.type) {
    case 'text': {
      const content = String(cd.desc || '').trim();
      if (!content) return null;
      const nick = pickNick(cd);
      return { kind: 'chat', nick, text: content, count: 0, giftName: '' };
    }
    case 'gift_comment': {
      const gift = cd.base_gift_info || cd.gift_info || {};
      const action = cd.gift_action_info || {};
      const nick = pickNick(cd);
      const giftName =
        String(gift.name || action.gift_extra_info?.gift_name || '礼物').trim() || '礼物';
      const count = Number(action.comb_count ?? action.count ?? gift.count ?? 1) || 1;
      return { kind: 'gift', nick, text: giftName, count: Math.max(1, count), giftName };
    }
    default: {
      // 在线统计：type 语义命中且取到数值才入库；进场 / 关注 / 礼物托与结算继续留样本。
      const online = parseXhsOnlineCount(cd);
      if (online >= 0) return { kind: 'online', nick: '', text: '', count: online, giftName: '' };
      return null;
    }
  }
}
