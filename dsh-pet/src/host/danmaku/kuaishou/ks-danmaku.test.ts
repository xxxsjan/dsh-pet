/**
 * 快手直连解码 + proto 往返测试：弹幕/礼物分发、去重、gzip 解压兜底、外壳编解码。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-danmaku.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deflate, deflateRaw } from 'pako';

import {
  decodeSocketMessage,
  encodeCommentFeed,
  encodeEnterRoom,
  encodeFeedPush,
  encodeHeartbeat,
  encodeSocketMessage,
  KS_COMPRESSION,
  KS_PAYLOAD,
  KS_SC_COMMENT_ZONE_RICH_TEXT,
  KS_SC_WEB_COMMENT_FEED,
  KS_SC_WEB_COMMENT_RICH_TEXT_MESSAGE,
} from './proto.ts';
import { decompressKsPayload, parseKsWatchCount, parseKsWsFrame } from './ks-danmaku.ts';

const enc = new TextEncoder();

function strField(field: number, s: string): Uint8Array {
  const b = enc.encode(s);
  return Uint8Array.from([(field << 3) | 2, b.length, ...b]);
}

function bytesField(field: number, a: Uint8Array): Uint8Array {
  return Uint8Array.from([(field << 3) | 2, a.length, ...a]);
}

function varint(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v >= 128) {
    out.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  out.push(v);
  return out;
}

function richMsg(id: string, userId: string, texts: string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  if (id) parts.push(strField(1, id));
  if (userId) parts.push(Uint8Array.from([0x10, ...varint(Number(userId))]));
  for (const t of texts) parts.push(bytesField(7, bytesField(1, strField(1, t))));
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

function zonePayload(msgs: Uint8Array[]): Uint8Array {
  return Uint8Array.from(msgs.flatMap((m) => [...bytesField(1, m)]));
}

function frame(
  push: Parameters<typeof encodeFeedPush>[0],
  opts: { compress?: boolean } = {},
): Uint8Array {
  let payload = encodeFeedPush(push);
  let compression: number = KS_COMPRESSION.NONE;
  if (opts.compress) {
    payload = deflate(payload);
    compression = KS_COMPRESSION.GZIP;
  }
  return encodeSocketMessage(KS_PAYLOAD.SC_FEED_PUSH, payload, compression);
}

const samplePush = {
  commentFeeds: [
    { id: 'c1', user: { principalId: 'u1', userName: '阿喵', headUrl: '' }, content: '你好呀' },
  ],
  giftFeeds: [
    { id: 'g1', user: { principalId: 'u2', userName: '阿财' }, giftId: 456, batchSize: 3 },
  ],
};

describe('快手 proto 往返', () => {
  test('进房帧编码非空且外壳 payloadType 正确', () => {
    const body = encodeEnterRoom('tok-123', 'stream-9', 'page-xyz');
    assert.ok(body.length > 0);
    const msg = decodeSocketMessage(encodeSocketMessage(KS_PAYLOAD.CS_ENTER_ROOM, body));
    assert.equal(msg.payloadType, KS_PAYLOAD.CS_ENTER_ROOM);
    assert.deepEqual(msg.payload, body);
  });

  test('心跳帧编码为外壳且保留心跳类型', () => {
    const body = encodeHeartbeat(1700000000);
    assert.ok(body.length > 0);
    const msg = decodeSocketMessage(encodeSocketMessage(KS_PAYLOAD.CS_HEARTBEAT, body));
    assert.equal(msg.payloadType, KS_PAYLOAD.CS_HEARTBEAT);
  });
});

describe('快手帧分发', () => {
  test('弹幕与礼物分别入库，字段归一', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(frame(samplePush), seen);
    assert.equal(items.length, 2);

    const chat = items.find((i) => i.kind === 'chat');
    assert.ok(chat);
    assert.equal(chat?.nick, '阿喵');
    assert.equal(chat?.text, '你好呀');
    assert.equal(chat?.principalId, 'u1');
    assert.equal(chat?.count, 0);

    const gift = items.find((i) => i.kind === 'gift');
    assert.ok(gift);
    assert.equal(gift?.nick, '阿财');
    assert.equal(gift?.giftName, '礼物#456');
    assert.equal(gift?.count, 3);
  });

  test('同 id 消息去重，第二帧不重复入库', () => {
    const seen = new Set<string>();
    parseKsWsFrame(frame(samplePush), seen);
    const again = parseKsWsFrame(frame(samplePush), seen);
    assert.equal(again.length, 0);
  });

  test('displayWatchingCount 归一为 online 条目', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(frame({ displayWatchingCount: '1234' }), seen);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'online');
    assert.equal(items[0]?.count, 1234);
  });

  test('displayLikeCount 归一为 like 条目（展示串同在线数口径）', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(frame({ displayLikeCount: '1.2万' }), seen);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'like');
    assert.equal(items[0]?.count, 12000);
  });

  test('同一帧里在线观看数与累计点赞一起返回', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(
      frame({ displayWatchingCount: '88', displayLikeCount: '1,234' }),
      seen,
    );
    assert.deepEqual(items.map((i) => i.kind), ['online', 'like']);
    assert.equal(items[1]?.count, 1234);
  });

  test('点赞展示串缺失或解析不出：不产出 like 条目', () => {
    const seen = new Set<string>();
    assert.deepEqual(
      parseKsWsFrame(frame({ displayWatchingCount: '1' }), seen).map((i) => i.kind),
      ['online'],
    );
    assert.deepEqual(
      parseKsWsFrame(frame({ displayWatchingCount: '2', displayLikeCount: '-' }), seen).map((i) => i.kind),
      ['online'],
    );
  });

  test('在线观看数展示串换算：万/亿/千分位/空值', () => {
    assert.equal(parseKsWatchCount('1.2万'), 12000);
    assert.equal(parseKsWatchCount('3.4亿'), 340000000);
    assert.equal(parseKsWatchCount('1,234'), 1234);
    assert.equal(parseKsWatchCount('1234人'), 1234);
    assert.equal(parseKsWatchCount(''), -1);
    assert.equal(parseKsWatchCount('-'), -1);
    assert.equal(parseKsWatchCount('abc'), -1);
  });

  test('同一帧里弹幕 + 礼物 + 在线观看数一起返回', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(frame({ ...samplePush, displayWatchingCount: '1.2万' }), seen);
    assert.deepEqual(items.map((i) => i.kind), ['chat', 'gift', 'online']);
    assert.equal(items[2]?.count, 12000);
  });

  test('111 独立 WebCommentFeed 单条弹幕入库并去重', () => {
    const feed = { id: 'c9', user: { principalId: 'u9', userName: '独行侠' }, content: '111 通道弹幕' };
    const msg = encodeSocketMessage(KS_SC_WEB_COMMENT_FEED, encodeCommentFeed(feed));
    const seen = new Set<string>();
    const items = parseKsWsFrame(msg, seen);
    assert.equal(items.length, 1);
    assert.equal(items[0]?.nick, '独行侠');
    assert.equal(items[0]?.text, '111 通道弹幕');
    assert.deepEqual(parseKsWsFrame(msg, seen), []);
  });

  test('112 独立富文本消息普通弹幕入库', () => {
    const msg = encodeSocketMessage(
      KS_SC_WEB_COMMENT_RICH_TEXT_MESSAGE,
      richMsg('r1', '1', ['阿财', '你好']),
    );
    const items = parseKsWsFrame(msg, new Set());
    assert.equal(items.length, 1);
    assert.equal(items[0]?.nick, '阿财');
    assert.equal(items[0]?.text, '你好');
  });

  test('829 进场区：普通弹幕入 chat，进场项入 enter 并按 id 去重', () => {
    const payload = zonePayload([
      richMsg('z1', '1', ['阿喵', '开播啦']),
      richMsg('z2', '2', ['阿财', '加入']),
    ]);
    const msg = encodeSocketMessage(KS_SC_COMMENT_ZONE_RICH_TEXT, payload);
    const seen = new Set<string>();
    const items = parseKsWsFrame(msg, seen);
    assert.equal(items.length, 2);
    const chat = items.find((i) => i.kind === 'chat');
    assert.equal(chat?.text, '开播啦');
    const enter = items.find((i) => i.kind === 'enter');
    assert.equal(enter?.nick, '阿财');
    assert.equal(enter?.text, '加入');
    assert.equal(enter?.principalId, '2');
    assert.equal(enter?.count, 0);
    assert.deepEqual(parseKsWsFrame(msg, seen), []);
  });

  test('非 FeedPush 帧（错误/暂停/在线榜）不入库', () => {
    const body = new TextEncoder().encode('live ended');
    const msg = encodeSocketMessage(KS_PAYLOAD.SC_ERROR, body);
    const items = parseKsWsFrame(msg, new Set());
    assert.equal(items.length, 0);
  });

  test('zlib 压缩帧先解压再分发', () => {
    const seen = new Set<string>();
    const items = parseKsWsFrame(frame(samplePush, { compress: true }), seen);
    assert.equal(items.length, 2);
  });

  test('空帧 / 坏帧返回空数组不抛错', () => {
    assert.deepEqual(parseKsWsFrame(new Uint8Array(0), new Set()), []);
    assert.deepEqual(parseKsWsFrame(new Uint8Array([1, 2, 3, 4]), new Set()), []);
  });
});

describe('快手解压兜底', () => {
  test('无压缩原样返回', () => {
    const data = new Uint8Array([9, 8, 7]);
    assert.deepEqual(decompressKsPayload(KS_COMPRESSION.NONE, data), data);
  });

  test('gzip 先 inflate，失败回退 inflateRaw', () => {
    const raw = new TextEncoder().encode('hello');
    const zippedRaw = deflateRaw(raw);
    const back = decompressKsPayload(KS_COMPRESSION.GZIP, zippedRaw);
    assert.deepEqual(back, raw);
  });
});
