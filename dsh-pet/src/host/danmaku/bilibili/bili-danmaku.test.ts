/**
 * B 站直连帧编解码 + 弹幕/礼物解析测试：包头字段、认证/心跳包、zlib 嵌套递归、
 * cmd 分发、去重与归一展示字段。
 * @module dsh-pet/src/host/danmaku/bilibili/bili-danmaku.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { deflate } from 'pako';

import {
  BILI_AUTH_PROTOVER,
  BILI_HEADER_LEN,
  BILI_OP,
  decodeBiliPackets,
  encodeBiliAuthPacket,
  encodeBiliHeartbeatPacket,
  encodeBiliPacket,
  parseBiliDanmaku,
  parseBiliGift,
  parseBiliOnlineCount,
  parseBiliWsFrame,
  biliDanmakuDedupKey,
} from './bili-danmaku.ts';

const enc = new TextEncoder();

function packetBody(buf: Uint8Array): Uint8Array {
  return buf.subarray(BILI_HEADER_LEN);
}

describe('B 站包头编解码', () => {
  test('encodeBiliPacket 写入大端长度/头长/ver/op/seq', () => {
    const body = enc.encode('hello');
    const buf = encodeBiliPacket(BILI_OP.MESSAGE, body, 1, 1);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    assert.equal(view.getUint32(0, false), BILI_HEADER_LEN + body.length);
    assert.equal(view.getUint16(4, false), BILI_HEADER_LEN);
    assert.equal(view.getUint16(6, false), 1);
    assert.equal(view.getUint32(8, false), BILI_OP.MESSAGE);
    assert.equal(view.getUint32(12, false), 1);
    assert.deepEqual(packetBody(buf), body);
  });

  test('认证包 JSON 含 uid/roomid/protover/platform/type/key', () => {
    const buf = encodeBiliAuthPacket({ roomId: 123456, token: 'tok-abc', uid: 99 });
    const body = JSON.parse(new TextDecoder().decode(packetBody(buf))) as Record<string, unknown>;
    assert.equal(body.uid, 99);
    assert.equal(body.roomid, 123456);
    assert.equal(body.protover, BILI_AUTH_PROTOVER);
    assert.equal(body.platform, 'web');
    assert.equal(body.type, 2);
    assert.equal(body.key, 'tok-abc');
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    assert.equal(view.getUint32(8, false), BILI_OP.AUTH);
  });

  test('认证包访客 uid 缺省为 0', () => {
    const buf = encodeBiliAuthPacket({ roomId: 1, token: 't' });
    const body = JSON.parse(new TextDecoder().decode(packetBody(buf))) as Record<string, unknown>;
    assert.equal(body.uid, 0);
  });

  test('心跳包 op=2 且 body 为空', () => {
    const buf = encodeBiliHeartbeatPacket();
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    assert.equal(view.getUint32(8, false), BILI_OP.HEARTBEAT);
    assert.equal(packetBody(buf).length, 0);
  });
});

function msgPacket(cmd: string, raw: Record<string, unknown>, ver = 1): Uint8Array {
  return encodeBiliPacket(BILI_OP.MESSAGE, enc.encode(JSON.stringify({ cmd, ...raw })), ver, 1);
}

describe('B 站解码分发', () => {
  test('AUTH_REPLY 解出 auth_ok', () => {
    const buf = encodeBiliPacket(BILI_OP.AUTH_REPLY, enc.encode(''), 1, 1);
    const out = decodeBiliPackets(buf);
    assert.deepEqual(out, [{ kind: 'auth_ok' }]);
  });

  test('HEARTBEAT_REPLY 解出 popularity', () => {
    const body = new Uint8Array(4);
    new DataView(body.buffer).setUint32(0, 12345, false);
    const buf = encodeBiliPacket(BILI_OP.HEARTBEAT_REPLY, body, 1, 1);
    const out = decodeBiliPackets(buf);
    assert.deepEqual(out, [{ kind: 'popularity', value: 12345 }]);
  });

  test('MESSAGE 解出 cmd 与原始 JSON', () => {
    const out = decodeBiliPackets(msgPacket('DANMU_MSG', { info: [] }));
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { kind: 'cmd', cmd: 'DANMU_MSG', raw: { cmd: 'DANMU_MSG', info: [] } });
  });

  test('ver=2 zlib 嵌套包递归解压', () => {
    const inner = msgPacket('SEND_GIFT', { data: {} });
    const outer = encodeBiliPacket(BILI_OP.MESSAGE, deflate(inner), 2, 1);
    const out = decodeBiliPackets(outer);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'cmd');
    assert.equal((out[0] as { cmd: string }).cmd, 'SEND_GIFT');
  });

  test('cmd 去掉冒号后缀', () => {
    const out = decodeBiliPackets(msgPacket('DANMU_MSG:V2', { info: [] }));
    assert.equal((out[0] as { cmd: string }).cmd, 'DANMU_MSG');
  });
});

describe('B 站弹幕解析', () => {
  test('parseBiliDanmaku 取 content / uid / nickname', () => {
    const item = parseBiliDanmaku({
      info: [
        [0, 1700000000000, 7],
        '欢迎来到直播间',
        [12345, '昵称一', '', '', '', ''],
      ],
    });
    assert.ok(item);
    assert.equal(item?.kind, 'chat');
    assert.equal(item?.text, '欢迎来到直播间');
    assert.equal(item?.principalId, '12345');
    assert.equal(item?.nick, '昵称一');
    assert.equal(item?.count, 0);
  });

  test('空内容返回 null', () => {
    assert.equal(parseBiliDanmaku({ info: [[], '   ', []] }), null);
    assert.equal(parseBiliDanmaku({ info: null }), null);
  });

  test('昵称缺省兜底匿名', () => {
    const item = parseBiliDanmaku({ info: [[], '你好', [42, '']] });
    assert.equal(item?.nick, '匿名');
    assert.equal(item?.principalId, '42');
  });
});

describe('B 站礼物解析', () => {
  test('SEND_GIFT 取 uname/giftName/num/giftId/uid', () => {
    const item = parseBiliGift({
      data: { uname: '送礼观众', giftName: '辣条', num: 2, giftId: 341, uid: 88 },
    });
    assert.ok(item);
    assert.equal(item?.kind, 'gift');
    assert.equal(item?.nick, '送礼观众');
    assert.equal(item?.giftName, '辣条');
    assert.equal(item?.text, '辣条');
    assert.equal(item?.count, 2);
    assert.equal(item?.giftId, '341');
    assert.equal(item?.principalId, '88');
  });

  test('GUARD_BUY 兼容 username/gift_name/gift_id 字段', () => {
    const item = parseBiliGift({
      data: { username: '舰长', gift_name: '舰长', num: 1, gift_id: 100, uid: 7 },
    });
    assert.equal(item?.nick, '舰长');
    assert.equal(item?.giftName, '舰长');
    assert.equal(item?.giftId, '100');
    assert.equal(item?.principalId, '7');
  });

  test('件数缺省兜底 1', () => {
    const item = parseBiliGift({ data: { uname: 'x', giftName: '小电视' } });
    assert.equal(item?.count, 1);
  });

  test('金瓜子折算电池：优先 total_coin，缺失按 price×num', () => {
    const byTotal = parseBiliGift({
      data: { uname: 'x', giftName: '辣条', num: 3, coin_type: 'gold', total_coin: 300 },
    });
    assert.equal(byTotal?.value, 3, '300 金瓜子 = 3 电池');

    const byPrice = parseBiliGift({
      data: { uname: 'x', giftName: '辣条', num: 3, coin_type: 'gold', price: 100 },
    });
    assert.equal(byPrice?.value, 3, '单价 100 金瓜子 × 3 = 3 电池');
  });

  test('银瓜子免费礼物与缺字段不产生价值', () => {
    const silver = parseBiliGift({ data: { uname: 'x', giftName: '免费礼物', num: 1, coin_type: 'silver' } });
    assert.equal(silver?.value, 0);
    const none = parseBiliGift({ data: { uname: 'x', giftName: '小电视' } });
    assert.equal(none?.value, 0);
  });
});

describe('B 站帧归一与去重', () => {
  test('parseBiliWsFrame 只收弹幕与礼物，其余 cmd 忽略', () => {
    const frame = Uint8Array.from([
      ...msgPacket('DANMU_MSG', { info: [[], '第一条弹幕', [1, '观众甲']] }),
      ...msgPacket('INTERACT_WORD', { data: { uname: '进场用户' } }),
      ...msgPacket('SEND_GIFT', { data: { uname: '观众乙', giftName: '辣条', num: 1, uid: 2 } }),
      ...msgPacket('GUARD_BUY', { data: { username: '舰长', gift_name: '舰长', num: 1, uid: 3 } }),
    ]);
    const items = parseBiliWsFrame(frame, new Set());
    assert.equal(items.length, 3);
    assert.deepEqual(items.map((i) => i.kind), ['chat', 'gift', 'gift']);
  });

  test('同一条弹幕靠 msg_id 跨帧去重', () => {
    const seen = new Set<string>();
    const first = msgPacket('DANMU_MSG', {
      msg_id: 'abc-1',
      info: [[], '重复弹幕', [5, '观众']],
    });
    const second = msgPacket('DANMU_MSG', {
      msg_id: 'abc-1',
      info: [[], '重复弹幕', [5, '观众']],
    });
    assert.equal(parseBiliWsFrame(first, seen).length, 1);
    assert.equal(parseBiliWsFrame(second, seen).length, 0);
  });

  test('dedupKey 优先 msg_id，否则 uid+内容+时间+随机数', () => {
    assert.equal(
      biliDanmakuDedupKey({ msg_id: 'm-9' }),
      'm:m-9',
    );
    const key = biliDanmakuDedupKey({
      info: [[0, 1700000000000, 7], '你好', [42, '观众']],
    });
    assert.ok(key.startsWith('f:42|你好|'));
    assert.equal(biliDanmakuDedupKey({ info: null }), '');
  });
});

describe('B 站在线人数', () => {
  test('ONLINE_RANK_COUNT 归一为 online 条目', () => {
    const items = parseBiliWsFrame(
      msgPacket('ONLINE_RANK_COUNT', { data: { online_count: 4321 } }),
      new Set(),
    );
    assert.equal(items.length, 1);
    assert.equal(items[0]?.kind, 'online');
    assert.equal(items[0]?.count, 4321);
  });

  test('online_count 为字符串时也转成数字', () => {
    assert.equal(parseBiliOnlineCount({ data: { online_count: '88' } }), 88);
  });

  test('缺字段 / 负数返回 -1', () => {
    assert.equal(parseBiliOnlineCount({ data: {} }), -1);
    assert.equal(parseBiliOnlineCount({}), -1);
    assert.equal(parseBiliOnlineCount({ data: { online_count: -3 } }), -1);
  });

  test('同帧里弹幕与在线人数一起返回，顺序按 cmd 出现', () => {
    const frame = Uint8Array.from([
      ...msgPacket('ONLINE_RANK_COUNT', { data: { online_count: 10 } }),
      ...msgPacket('DANMU_MSG', { info: [[], '来了', [7, '观众']] }),
    ]);
    const items = parseBiliWsFrame(frame, new Set());
    assert.deepEqual(items.map((i) => i.kind), ['online', 'chat']);
  });
});
