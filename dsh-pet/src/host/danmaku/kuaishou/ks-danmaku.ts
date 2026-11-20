/**
 * 快手直连 longlink 弹幕解码（对齐 danmuapp `src/composables/live/useKuaishouLive.js`）。
 *
 * 入站二进制先解 `SocketMessage` 外壳：compressionType=2 时 gzip 解压（inflate 失败回退
 * inflateRaw）；`SC_FEED_PUSH(310)` 内 `displayWatchingCount` / `displayLikeCount` /
 * `commentFeeds` / `giftFeeds` 入库，进场 / 在线榜 / 分享 / 系统通知本轮留样本不入库。
 * 礼物名无目录兜底为 `礼物#<giftId>`。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-danmaku
 */
import { inflate, inflateRaw } from 'pako';

import {
  decodeCommentFeed,
  decodeFeedPush,
  decodeSocketMessage,
  KS_COMPRESSION,
  KS_PAYLOAD,
  KS_SC_COMMENT_ZONE_RICH_TEXT,
  KS_SC_WEB_COMMENT_FEED,
  KS_SC_WEB_COMMENT_RICH_TEXT_MESSAGE,
  type KsCommentFeed,
  type KsGiftFeed,
} from './proto.ts';
import {
  isKsEnterContent,
  parseCommentRichTextMessage,
  parseCommentZoneRichText,
  type KsRichItem,
} from './ks-rich-text.ts';

/** 归一到展示口径的一条消息。 */
export type KsParsedItem = {
  kind: 'chat' | 'gift' | 'online' | 'like';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0；online 为在线观看数；like 为本场累计点赞数。 */
  count: number;
  giftName: string;
  /** 礼物原始 id；聊天为空。 */
  giftId: string;
  principalId: string;
};

/** 解压载荷：非 gzip 原样返回；gzip 先 inflate，失败回退 inflateRaw，再失败抛错。 */
export function decompressKsPayload(compressionType: number, payload: Uint8Array): Uint8Array {
  if (compressionType !== KS_COMPRESSION.GZIP || !payload || payload.length === 0) {
    return payload;
  }
  try {
    return inflate(payload);
  } catch {
    return inflateRaw(payload);
  }
}

/**
 * 在线观看数展示串 → 整数：「1234」→1234、「1.2万」→12000、「3.4亿」→340000000。
 * 解析不出（空串 / 「-」/ 纯文案）返回 -1。
 */
export function parseKsWatchCount(text: unknown): number {
  const s = String(text == null ? '' : text)
    .replace(/[,，\s]/g, '')
    .trim();
  if (!s) return -1;
  const m = /^(\d+(?:\.\d+)?)(亿|万|w|W)?(?:人|在线|观看|观众)*$/.exec(s);
  if (!m) return -1;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base < 0) return -1;
  const unit = m[2];
  const scale = unit === '亿' ? 1e8 : unit === '万' || unit === 'w' || unit === 'W' ? 1e4 : 1;
  return Math.max(0, Math.floor(base * scale));
}

function principalIdOf(user: KsCommentFeed['user'] | KsGiftFeed['user']): string {
  return String(user?.principalId || '').trim();
}

function nickOf(user: KsCommentFeed['user'] | KsGiftFeed['user']): string {
  return String(user?.userName || '').trim() || '匿名';
}

function commentItem(c: KsCommentFeed, seen: Set<string>): KsParsedItem | null {
  const id = String(c.id || '').trim();
  if (id) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  const content = String(c.content || '').trim();
  if (!content) return null;
  return {
    kind: 'chat',
    nick: nickOf(c.user),
    text: content,
    count: 0,
    giftName: '',
    giftId: '',
    principalId: principalIdOf(c.user),
  };
}

/** 富文本 item → 归一 parsed；进场项与空内容跳过（留样本），id 去重。 */
function richItemToParsed(rich: KsRichItem, seen: Set<string>): KsParsedItem | null {
  if (rich.isEnter) return null;
  const content = String(rich.content || '').trim();
  if (!content || isKsEnterContent(content)) return null;
  const id = String(rich.id || '').trim();
  if (id) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  return {
    kind: 'chat',
    nick: rich.nickname || '匿名',
    text: content,
    count: 0,
    giftName: '',
    giftId: '',
    principalId: rich.principalId,
  };
}

function giftItem(g: KsGiftFeed, seen: Set<string>): KsParsedItem | null {
  const id = String(g.id || '').trim();
  if (id) {
    if (seen.has(id)) return null;
    seen.add(id);
  }
  const giftId = g.giftId != null ? String(g.giftId) : '';
  if (!giftId || giftId === '0') return null;
  const count = Number(g.batchSize ?? g.comboCount ?? 1) || 1;
  return {
    kind: 'gift',
    nick: nickOf(g.user),
    text: `礼物#${giftId}`,
    count: Math.max(1, count),
    giftName: `礼物#${giftId}`,
    giftId,
    principalId: principalIdOf(g.user),
  };
}

/**
 * 解码一帧入站 WS 二进制，返回本轮入库的弹幕 / 礼物 / 在线观看数列表。
 *
 * 非 FeedPush、未知载荷、解压 / 解码失败的帧一律返回空数组（日志样本由调用方记录）。
 */
export function parseKsWsFrame(raw: Uint8Array, seen: Set<string>): KsParsedItem[] {
  const out: KsParsedItem[] = [];
  if (!raw || raw.length === 0) return out;

  let socket;
  try {
    socket = decodeSocketMessage(raw);
  } catch {
    return out;
  }

  let payload = socket.payload;
  try {
    payload = decompressKsPayload(socket.compressionType, payload);
  } catch {
    return out;
  }
  if (!payload || payload.length === 0) return out;

  if (socket.payloadType !== KS_PAYLOAD.SC_FEED_PUSH) {
    // 111：独立 WebCommentFeed 单条弹幕（与 FeedPush 内 commentFeeds 同构），其余类型本轮不入库。
    if (socket.payloadType === KS_SC_WEB_COMMENT_FEED) {
      let feed: KsCommentFeed;
      try {
        feed = decodeCommentFeed(payload);
      } catch {
        return out;
      }
      const item = commentItem(feed, seen);
      if (item) out.push(item);
      return out;
    }
    // 112：独立富文本消息（单条）。
    if (socket.payloadType === KS_SC_WEB_COMMENT_RICH_TEXT_MESSAGE) {
      for (const rich of parseCommentRichTextMessage(payload)) {
        const item = richItemToParsed(rich, seen);
        if (item) out.push(item);
      }
      return out;
    }
    // 829：进场 / 富文本区（repeated 富文本消息）。
    if (socket.payloadType === KS_SC_COMMENT_ZONE_RICH_TEXT) {
      for (const rich of parseCommentZoneRichText(payload)) {
        const item = richItemToParsed(rich, seen);
        if (item) out.push(item);
      }
      return out;
    }
    // SC_ERROR / SC_AUTHOR_PAUSE / 在线榜等：本轮不入库。
    return out;
  }

  let push;
  try {
    push = decodeFeedPush(payload);
  } catch {
    return out;
  }

  for (const c of push.commentFeeds ?? []) {
    const item = commentItem(c, seen);
    if (item) out.push(item);
  }
  for (const g of push.giftFeeds ?? []) {
    const item = giftItem(g, seen);
    if (item) out.push(item);
  }
  // 在线观看数：同一帧可能不带（空串），解析不出就跳过，不覆盖已有值。
  const watching = parseKsWatchCount(push.displayWatchingCount);
  if (watching >= 0) {
    out.push({
      kind: 'online',
      nick: '',
      text: '',
      count: watching,
      giftName: '',
      giftId: '',
      principalId: '',
    });
  }
  // 本场累计点赞：与在线人数同帧的展示串（"1234" / "1.2万"），口径同 parseKsWatchCount。
  const likes = parseKsWatchCount(push.displayLikeCount);
  if (likes >= 0) {
    out.push({
      kind: 'like',
      nick: '',
      text: '',
      count: likes,
      giftName: '',
      giftId: '',
      principalId: '',
    });
  }
  return out;
}
