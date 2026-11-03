/**
 * 代理隧道 HTTP 解析（尤其 chunked 解码）。
 * 跑法：node --experimental-strip-types --test src/host/net/proxy-fetch.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeChunkedBody } from './proxy-fetch.ts';

test('decodeChunkedBody：去掉分块头，拼回连续字节', () => {
  // 3 字节 "ABC" + 2 字节 "de" + 结束块
  const raw = Buffer.from('3\r\nABC\r\n2\r\nde\r\n0\r\n\r\n', 'latin1');
  assert.equal(decodeChunkedBody(raw).toString('latin1'), 'ABCde');
});

test('decodeChunkedBody：容忍 chunk extension', () => {
  const raw = Buffer.from('4;ext=1\r\nmp3!\r\n0\r\n\r\n', 'latin1');
  assert.equal(decodeChunkedBody(raw).toString('latin1'), 'mp3!');
});
