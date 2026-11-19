/**
 * 抖音弹幕最小 protobuf：PushFrame / Response / Message / ChatMessage / User /
 * GiftMessage / LightGiftMessage / RoomUserSeqMessage / LikeMessage。
 *
 * 字段号对齐 danmu-ji 的 `src/proto/dy.js`（礼物部分对照 douyin 公开 proto，
 * 在线人数对照 biliup `douyin_util`，点赞对照公开 `WebcastLikeMessage`），
 * 覆盖「聊天日志 + 在线观众人数 + 本场累计点赞」链路。
 * @module dsh-pet/src/host/danmaku/douyin/proto
 */
import protobuf from 'protobufjs';

const root = protobuf.Root.fromJSON({
  nested: {
    douyin: {
      nested: {
        Response: {
          fields: {
            messagesList: { rule: 'repeated', type: 'Message', id: 1 },
            cursor: { type: 'string', id: 2 },
            fetchInterval: { type: 'uint64', id: 3 },
            now: { type: 'uint64', id: 4 },
            internalExt: { type: 'string', id: 5 },
            fetchType: { type: 'uint32', id: 6 },
            heartbeatDuration: { type: 'uint64', id: 8 },
            needAck: { type: 'bool', id: 9 },
            pushServer: { type: 'string', id: 10 },
            liveCursor: { type: 'string', id: 11 },
            historyNoMore: { type: 'bool', id: 12 },
          },
        },
        Message: {
          fields: {
            method: { type: 'string', id: 1 },
            payload: { type: 'bytes', id: 2 },
            msgId: { type: 'int64', id: 3 },
          },
        },
        ChatMessage: {
          fields: {
            user: { type: 'User', id: 2 },
            content: { type: 'string', id: 3 },
          },
        },
        GiftMessage: {
          fields: {
            giftId: { type: 'uint64', id: 2 },
            repeatCount: { type: 'uint64', id: 5 },
            comboCount: { type: 'uint64', id: 6 },
            user: { type: 'User', id: 7 },
            repeatEnd: { type: 'uint32', id: 9 },
            groupId: { type: 'uint64', id: 11 },
            gift: { type: 'GiftStruct', id: 15 },
          },
        },
        GiftStruct: {
          fields: {
            describe: { type: 'string', id: 2 },
            id: { type: 'uint64', id: 5 },
            forFansclub: { type: 'bool', id: 9 },
            combo: { type: 'bool', id: 10 },
            type: { type: 'uint32', id: 11 },
            diamondCount: { type: 'uint32', id: 12 },
            name: { type: 'string', id: 16 },
          },
        },
        User: {
          fields: {
            id: { type: 'uint64', id: 1 },
            nickName: { type: 'string', id: 3 },
          },
        },
        // 在线人数统计帧（对齐 biliup douyin_util）：total=3 当前在线，totalUser=7 本场累计观看。
        RoomUserSeqMessage: {
          fields: {
            total: { type: 'int64', id: 3 },
            popStr: { type: 'string', id: 4 },
            totalUser: { type: 'int64', id: 7 },
            totalUserStr: { type: 'string', id: 8 },
            totalStr: { type: 'string', id: 9 },
          },
        },
        /**
         * 轻礼物消息（`WebcastLightGiftMessage`）：免费动画 / 点赞类礼物的一次性通知。
         * 与 GiftMessage 字段号完全不同（2=groupCount、5=toUserId、7=giftInfo、13=giftStruct），
         * 共用一套 schema 会把 toUserId 解成件数，必须单独解。
         */
        LightGiftMessage: {
          fields: {
            groupCount: { type: 'uint64', id: 2 },
            repeatCount: { type: 'uint64', id: 3 },
            comboCount: { type: 'uint64', id: 4 },
            toUserId: { type: 'uint64', id: 5 },
            giftInfo: { type: 'LightGiftInfo', id: 7 },
            sendType: { type: 'uint64', id: 9 },
            count: { type: 'uint64', id: 10 },
            giftStruct: { type: 'GiftStruct', id: 13 },
          },
        },
        /** 轻礼物里的礼物本体（字段号也与 GiftStruct 无关）。 */
        LightGiftInfo: {
          fields: {
            giftId: { type: 'uint64', id: 1 },
            diamondCount: { type: 'uint64', id: 3 },
          },
        },
        /**
         * 点赞消息（`WebcastLikeMessage`）：total=3 本场累计总赞（只增不减），
         * count=2 本帧新增点赞量。common（field 1）不解码，protobufjs 会自动跳过。
         */
        LikeMessage: {
          fields: {
            count: { type: 'uint32', id: 2 },
            total: { type: 'uint64', id: 3 },
          },
        },
        /**
         * 控制帧（`WebcastControlMessage`）：status=2 是状态码，3 = 直播结束（主播下播）。
         * common（field 1）不解码，protobufjs 会自动跳过。
         */
        ControlMessage: {
          fields: {
            status: { type: 'uint32', id: 2 },
          },
        },
        PushFrame: {
          fields: {
            seqId: { type: 'uint64', id: 1 },
            logId: { type: 'uint64', id: 2 },
            payloadEncoding: { type: 'string', id: 6 },
            payloadType: { type: 'string', id: 7 },
            payload: { type: 'bytes', id: 8 },
          },
        },
      },
    },
  },
});

/** PushFrame 类型。 */
export const PushFrame = root.lookupType('douyin.PushFrame');
/** Response 类型。 */
export const DyResponse = root.lookupType('douyin.Response');
/** ChatMessage 类型。 */
export const ChatMessage = root.lookupType('douyin.ChatMessage');
/** GiftMessage 类型。 */
export const GiftMessage = root.lookupType('douyin.GiftMessage');
/** RoomUserSeqMessage 类型（在线人数统计）。 */
export const RoomUserSeqMessage = root.lookupType('douyin.RoomUserSeqMessage');
/** 轻礼物消息类型（`WebcastLightGiftMessage`）。 */
export const LightGiftMessage = root.lookupType('douyin.LightGiftMessage');
/** 点赞消息类型（`WebcastLikeMessage`）：total=本场累计总赞，count=本帧增量。 */
export const LikeMessage = root.lookupType('douyin.LikeMessage');
/** 控制消息类型（`WebcastControlMessage`）：status=3 表示直播结束（主播下播）。 */
export const ControlMessage = root.lookupType('douyin.ControlMessage');

/** 编码心跳帧。 */
export function encodeHeartbeat(): Uint8Array {
  return PushFrame.encode(PushFrame.create({ payloadType: 'hb' })).finish();
}

/** 编码 ACK 帧（服务端 needAck 时必须回）。 */
export function encodeAck(logId: unknown, internalExt: string): Uint8Array {
  const payload = new TextEncoder().encode(internalExt || '');
  return PushFrame.encode(
    PushFrame.create({
      payloadType: 'ack',
      logId,
      payload,
    }),
  ).finish();
}
