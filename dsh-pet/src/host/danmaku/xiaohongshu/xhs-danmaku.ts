/**
 * 小红书中控台 longlink 弹幕解码（对齐 danmuapp `src/platforms/xhsDanmaku.js`）。
 *
 * 中控台 WS 帧是 JSON：`body.customData`，或 `b.d.b[]` 里 base64 包裹的消息体；
 * 无 protobuf、无压缩。本轮只取「文本弹幕」与「礼物」，进场 / 关注 / 在线人数 / 人气先留样本不入库。
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
  kind: 'chat' | 'gift';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0。 */
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

function pickNick(cd: XhsCustomData): string {
  const send = cd.send_user_info;
  return String(send?.nick_name || cd.profile?.nickname || '匿名').trim() || '匿名';
}

/** 把单条 customData 归一为展示项；非弹幕 / 礼物返回 null。 */
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
    default:
      // audience_join / follow_emcee / gift_dock_and_effect / gift_settle / 在线统计：本轮留样本不入库。
      return null;
  }
}
