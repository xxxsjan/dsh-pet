/**
 * 小红书 CDP 桥帧解码：opcode=1 是 UTF-8 文本，不能按 base64 解。
 *
 * 背景：CDP `Network.webSocketFrameReceived` 的 `payloadData` 只有二进制帧才是
 * base64；统一按 base64 解会把中控台 longlink 的 JSON 文本解坏，导致一条弹幕都收不到。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/cdp-helper.test
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeFramePayload } = require('../../../../runtime/electron-helper/main/xhs-cdp.js') as {
  decodeFramePayload: (payload: string, opcode?: number) => Buffer | null;
};

/** 真实 outer 帧的最小形状：`{v,t,b:{d:{b:[{d:base64}]}}}`。 */
const FRAME = JSON.stringify({ v: 1, t: 4, m: '0ac', b: { d: { b: [{ d: 'e30=', e: {}, m: '1' }] } } });

describe('xiaohongshu CDP 帧解码', () => {
  test('opcode=1 的文本帧按 UTF-8 原样透传', () => {
    const buf = decodeFramePayload(FRAME, 1);
    assert.ok(buf);
    assert.equal(buf.toString('utf8'), FRAME);
  });

  test('opcode=2 的二进制帧按 base64 解', () => {
    const payload = Buffer.from(FRAME, 'utf8').toString('base64');
    const buf = decodeFramePayload(payload, 2);
    assert.ok(buf);
    assert.equal(buf.toString('utf8'), FRAME);
  });

  test('文本帧里再包一层 base64 时兜底解开', () => {
    const payload = Buffer.from(FRAME, 'utf8').toString('base64');
    const buf = decodeFramePayload(payload, 1);
    assert.ok(buf);
    assert.equal(buf.toString('utf8'), FRAME);
  });

  test('空帧返回 null', () => {
    assert.equal(decodeFramePayload('', 1), null);
  });
});
