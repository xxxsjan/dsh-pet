/**
 * 系统代理解析单元测试。
 * 跑法：node --experimental-strip-types --test src/host/net/system-proxy.test.ts
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { normalizeProxyUrl, resolveOutboundProxyUrl } from './system-proxy.ts';

describe('normalizeProxyUrl', () => {
  test('补 http scheme', () => {
    assert.equal(normalizeProxyUrl('127.0.0.1:7897'), 'http://127.0.0.1:7897');
  });

  test('解析 WinINET 多协议串，优先 https=', () => {
    assert.equal(normalizeProxyUrl('http=127.0.0.1:7890;https=127.0.0.1:7897'), 'http://127.0.0.1:7897');
  });

  test('socks 暂不支持', () => {
    assert.equal(normalizeProxyUrl('socks=127.0.0.1:1080'), undefined);
  });
});

describe('resolveOutboundProxyUrl', () => {
  test('HTTPS_PROXY 优先于系统代理开关', () => {
    const saved = {
      HTTPS_PROXY: process.env.HTTPS_PROXY,
      disable: process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY,
    };
    process.env.HTTPS_PROXY = 'http://127.0.0.1:18080';
    process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY = '1';
    try {
      assert.equal(resolveOutboundProxyUrl(), 'http://127.0.0.1:18080');
    } finally {
      if (saved.HTTPS_PROXY === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = saved.HTTPS_PROXY;
      if (saved.disable === undefined) delete process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY;
      else process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY = saved.disable;
    }
  });
});
