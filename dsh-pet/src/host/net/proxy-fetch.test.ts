/**
 * 代理隧道 HTTP 解析（尤其 chunked 解码）。
 * 跑法：node --experimental-strip-types --test src/host/net/proxy-fetch.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createChunkedStreamDecoder, decodeChunkedBody } from './proxy-fetch.ts';

test('decodeChunkedBody：去掉分块头，拼回连续字节', () => {
  // 3 字节 "ABC" + 2 字节 "de" + 结束块
  const raw = Buffer.from('3\r\nABC\r\n2\r\nde\r\n0\r\n\r\n', 'latin1');
  assert.equal(decodeChunkedBody(raw).toString('latin1'), 'ABCde');
});

test('decodeChunkedBody：容忍 chunk extension', () => {
  const raw = Buffer.from('4;ext=1\r\nmp3!\r\n0\r\n\r\n', 'latin1');
  assert.equal(decodeChunkedBody(raw).toString('latin1'), 'mp3!');
});

test('createChunkedStreamDecoder：任意切分边界都能还原正文', () => {
  const raw = Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n', 'latin1');
  const out: Buffer[] = [];
  const decoder = createChunkedStreamDecoder((chunk) => out.push(Buffer.from(chunk)));
  // 逐字节喂入：分块头、数据与 CRLF 全都跨 push 边界
  for (const byte of raw) decoder.push(Buffer.from([byte]));
  decoder.finish();
  assert.equal(Buffer.concat(out).toString('latin1'), 'hello world');
});

test('createChunkedStreamDecoder：分块长度非法直接报错', () => {
  const decoder = createChunkedStreamDecoder(() => undefined);
  assert.throws(() => decoder.push(Buffer.from('zz\r\n', 'latin1')), /bad size/);
});

test('createChunkedStreamDecoder：数据块后缺 CRLF 报错', () => {
  const decoder = createChunkedStreamDecoder(() => undefined);
  assert.throws(() => decoder.push(Buffer.from('3\r\nabcXX', 'latin1')), /missing CRLF/);
});
