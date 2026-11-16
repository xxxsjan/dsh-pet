/**
 * 快手 829 / 112 富文本解码测试：普通弹幕拆昵称 / 正文，进场项标记 isEnter。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-rich-text.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isKsEnterContent,
  parseCommentRichTextMessage,
  parseCommentZoneRichText,
} from './ks-rich-text.ts';

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

function textSeg(text: string): Uint8Array {
  return strField(1, text);
}

function richSeg(text: string): Uint8Array {
  return bytesField(1, textSeg(text));
}

function richMsg(id: string, userId: string, texts: string[]): Uint8Array {
  const parts: Uint8Array[] = [];
  if (id) parts.push(strField(1, id));
  if (userId) parts.push(Uint8Array.from([0x10, ...varint(Number(userId))]));
  for (const t of texts) parts.push(bytesField(7, richSeg(t)));
  return Uint8Array.from(parts.flatMap((p) => [...p]));
}

function zonePayload(msgs: Uint8Array[]): Uint8Array {
  return Uint8Array.from(msgs.flatMap((m) => [...bytesField(1, m)]));
}

describe('快手富文本 112 独立消息', () => {
  test('双段拆出昵称与正文，普通弹幕', () => {
    const items = parseCommentRichTextMessage(richMsg('m1', '123', ['阿财', '好呀']));
    assert.equal(items.length, 1);
    assert.equal(items[0]?.nickname, '阿财');
    assert.equal(items[0]?.content, '好呀');
    assert.equal(items[0]?.principalId, '123');
    assert.equal(items[0]?.isEnter, false);
  });

  test('单段正文落匿名', () => {
    const items = parseCommentRichTextMessage(richMsg('m2', '456', ['好呀']));
    assert.equal(items[0]?.nickname, '匿名');
    assert.equal(items[0]?.content, '好呀');
    assert.equal(items[0]?.isEnter, false);
  });

  test('进场正文标记 isEnter', () => {
    const items = parseCommentRichTextMessage(richMsg('m3', '789', ['阿财', '加入，来自 搜索']));
    assert.equal(items[0]?.isEnter, true);
    assert.equal(items[0]?.nickname, '阿财');
  });

  test('空载荷返回空数组', () => {
    assert.deepEqual(parseCommentRichTextMessage(new Uint8Array(0)), []);
  });
});

describe('快手富文本 829 进场区', () => {
  test('多条混合：普通弹幕与进场分列', () => {
    const payload = zonePayload([
      richMsg('z1', '1', ['阿喵', '开播啦']),
      richMsg('z2', '2', ['阿财', '加入']),
    ]);
    const items = parseCommentZoneRichText(payload);
    assert.equal(items.length, 2);
    const chat = items.find((i) => !i.isEnter);
    const enter = items.find((i) => i.isEnter);
    assert.equal(chat?.content, '开播啦');
    assert.equal(enter?.nickname, '阿财');
  });
});

describe('进场判定', () => {
  test('进场词命中', () => {
    assert.equal(isKsEnterContent('加入'), true);
    assert.equal(isKsEnterContent('来了，来自 关注'), true);
  });
  test('普通弹幕不命中', () => {
    assert.equal(isKsEnterContent('主播好'), false);
  });
  test('管理词不命中', () => {
    assert.equal(isKsEnterContent('禁言用户'), false);
  });
});
