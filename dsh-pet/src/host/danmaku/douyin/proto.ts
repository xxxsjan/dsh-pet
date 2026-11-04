/**
 * 抖音弹幕最小 protobuf：PushFrame / Response / Message / ChatMessage / User。
 *
 * 字段号对齐 danmu-ji 的 `src/proto/dy.js`，只覆盖「聊天日志」链路。
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
