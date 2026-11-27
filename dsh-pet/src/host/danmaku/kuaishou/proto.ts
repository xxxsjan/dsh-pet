/**
 * 快手直连最小 protobuf：SocketMessage 外壳 + 进房/心跳 + FeedPush 弹幕/礼物/在线观看数。
 *
 * 字段号对齐 danmuapp `src/proto/ks.js` 与公开 KuaiShouPack，覆盖
 * 「弹幕 + 礼物 + 在线观看数 + 本场累计点赞」链路（进场走 829/112 富文本，见 ks-rich-text）；
 * 在线榜 / 分享 / 系统通知等字段在解码时被 protobufjs 自动跳过。
 * @module dsh-pet/src/host/danmaku/kuaishou/proto
 */
import protobuf from 'protobufjs';

/** 出站帧类型（对齐参照 PayloadType 枚举）。 */
export const KS_PAYLOAD = {
  CS_HEARTBEAT: 1,
  CS_ERROR: 3,
  CS_ENTER_ROOM: 200,
  SC_ERROR: 103,
  SC_AUTHOR_PAUSE: 301,
  SC_FEED_PUSH: 310,
  SC_LIVE_WATCHING_LIST: 340,
} as const;

/** 压缩类型：1 = 无压缩，2 = gzip（参照 CompressionType 枚举）。 */
export const KS_COMPRESSION = { NONE: 1, GZIP: 2 } as const;

/** PC 网页端独立弹幕 / 富文本 / 进场富文本区（非 proto 枚举，参照 ksDanmaku.js 常量）。 */
export const KS_SC_WEB_COMMENT_FEED = 111;
export const KS_SC_WEB_COMMENT_RICH_TEXT_MESSAGE = 112;
export const KS_SC_COMMENT_ZONE_RICH_TEXT = 829;

const root = protobuf.Root.fromJSON({
  nested: {
    ks: {
      nested: {
        SimpleUserInfo: {
        fields: {
          principalId: { type: 'string', id: 1 },
          userName: { type: 'string', id: 2 },
          headUrl: { type: 'string', id: 3 },
        },
      },
      WebCommentFeed: {
        fields: {
          id: { type: 'string', id: 1 },
          user: { type: 'SimpleUserInfo', id: 2 },
          content: { type: 'string', id: 3 },
        },
      },
      WebGiftFeed: {
        fields: {
          id: { type: 'string', id: 1 },
          user: { type: 'SimpleUserInfo', id: 2 },
          time: { type: 'uint64', id: 3 },
          giftId: { type: 'uint32', id: 4 },
          batchSize: { type: 'uint32', id: 7 },
          comboCount: { type: 'uint32', id: 8 },
        },
      },
      SCWebFeedPush: {
        fields: {
          displayWatchingCount: { type: 'string', id: 1 },
          displayLikeCount: { type: 'string', id: 2 },
          commentFeeds: { rule: 'repeated', type: 'WebCommentFeed', id: 5 },
          giftFeeds: { rule: 'repeated', type: 'WebGiftFeed', id: 9 },
        },
      },
      CSWebEnterRoom: {
        fields: {
          token: { type: 'string', id: 1 },
          liveStreamId: { type: 'string', id: 2 },
          reconnectCount: { type: 'uint32', id: 3 },
          lastErrorCode: { type: 'uint32', id: 4 },
          expTag: { type: 'string', id: 5 },
          attach: { type: 'string', id: 6 },
          pageId: { type: 'string', id: 7 },
        },
      },
      CSWebHeartbeat: {
        fields: {
          timestamp: { type: 'uint32', id: 1 },
        },
      },
      SocketMessage: {
        fields: {
          payloadType: { type: 'int32', id: 1 },
          compressionType: { type: 'int32', id: 2 },
          payload: { type: 'bytes', id: 3 },
        },
      },
      },
    },
  },
});

export type KsUser = {
  principalId?: string;
  userName?: string;
  headUrl?: string;
};

export type KsCommentFeed = {
  id?: string;
  user?: KsUser;
  content?: string;
};

export type KsGiftFeed = {
  id?: string;
  user?: KsUser;
  giftId?: number;
  batchSize?: number;
  comboCount?: number;
};

export type KsFeedPush = {
  /** 在线观看数展示串（"1234" / "1.2万"），解析见 parseKsWatchCount。 */
  displayWatchingCount?: string;
  displayLikeCount?: string;
  commentFeeds?: KsCommentFeed[];
  giftFeeds?: KsGiftFeed[];
};

export type KsSocketMessage = {
  payloadType: number;
  compressionType: number;
  payload: Uint8Array;
};

const SocketMessage = root.lookupType('ks.SocketMessage');
const CSWebEnterRoom = root.lookupType('ks.CSWebEnterRoom');
const CSWebHeartbeat = root.lookupType('ks.CSWebHeartbeat');
const SCWebFeedPush = root.lookupType('ks.SCWebFeedPush');
const WebCommentFeed = root.lookupType('ks.WebCommentFeed');

/** 解码外壳帧。 */
export function decodeSocketMessage(buffer: Uint8Array): KsSocketMessage {
  return SocketMessage.decode(buffer) as unknown as KsSocketMessage;
}

/** 解码 FeedPush（弹幕 / 礼物列表）。 */
export function decodeFeedPush(payload: Uint8Array): KsFeedPush {
  return SCWebFeedPush.decode(payload) as unknown as KsFeedPush;
}

/** 解码独立 WebCommentFeed（111 通道，单条弹幕；与 FeedPush 内 commentFeeds 同构）。 */
export function decodeCommentFeed(payload: Uint8Array): KsCommentFeed {
  return WebCommentFeed.decode(payload) as unknown as KsCommentFeed;
}

/** 编码独立 WebCommentFeed 载荷（不含外壳；测试往返复用）。 */
export function encodeCommentFeed(feed: KsCommentFeed): Uint8Array {
  return WebCommentFeed.encode(WebCommentFeed.create(feed)).finish();
}

/** 编码 FeedPush 载荷（不含外壳；测试与后续礼物目录复用）。 */
export function encodeFeedPush(push: KsFeedPush): Uint8Array {
  return SCWebFeedPush.encode(SCWebFeedPush.create(push)).finish();
}

/** 生成 16 位随机 pageId 后缀时间戳（对齐参照 makeKsPageId）。 */
const PAGE_ID_CHARSET = '-_zyxwvutsrqponmlkjihgfedcba9876543210ZYXWVUTSRQPONMLKJIHGFEDCBA';
export function makeKsPageId(): string {
  let id = '';
  for (let i = 0; i < 16; i += 1) {
    id += PAGE_ID_CHARSET[Math.floor(Math.random() * PAGE_ID_CHARSET.length)];
  }
  return `${id}_${Date.now()}`;
}

/** 编码进房帧载荷（不含外壳）。 */
export function encodeEnterRoom(token: string, liveStreamId: string, pageId: string): Uint8Array {
  return CSWebEnterRoom.encode(
    CSWebEnterRoom.create({ token, liveStreamId, pageId }),
  ).finish();
}

/** 编码心跳帧载荷（不含外壳）。 */
export function encodeHeartbeat(timestamp: number): Uint8Array {
  return CSWebHeartbeat.encode(CSWebHeartbeat.create({ timestamp: timestamp >>> 0 })).finish();
}

/** 编码外壳帧：payloadType + 压缩类型 + 载荷。 */
export function encodeSocketMessage(
  payloadType: number,
  payload: Uint8Array,
  compressionType: number = KS_COMPRESSION.NONE,
): Uint8Array {
  return SocketMessage.encode(
    SocketMessage.create({ payloadType, compressionType, payload }),
  ).finish();
}
