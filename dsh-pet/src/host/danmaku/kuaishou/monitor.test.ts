/**
 * 快手直连监听器下播自动停听测试：用本地真实 WebSocket server 代替真实进房，
 * 验证「断线 → 重连前探活 → 未开播即自动停听」与「未知错误不误杀」。
 * @module dsh-pet/src/host/danmaku/kuaishou/monitor.test
 */
import assert from 'node:assert/strict';
import { WebSocketServer, type WebSocket } from 'ws';
import { describe, test } from 'node:test';

import { createKsMonitor } from './monitor.ts';
import type { KsWsInfo } from './ks-live-info.ts';

const noop = () => undefined;
const log = { info: noop, warn: noop, debug: noop };

function wsInfoOf(wsUrl: string): KsWsInfo {
  return {
    liveStreamId: 'ks-stream-1',
    token: 'ks-token',
    websocketUrl: wsUrl,
    cookie: '',
    title: '快手测试房',
    emoji: {},
  };
}

async function startServer(): Promise<{
  server: WebSocketServer;
  url: string;
  clients: Set<WebSocket>;
}> {
  const server = new WebSocketServer({ port: 0 });
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const addr = server.address();
  if (addr === null || typeof addr === 'string') throw new Error('取本地端口失败');
  const clients = new Set<WebSocket>();
  server.on('connection', (c) => {
    clients.add(c);
    c.on('close', () => clients.delete(c));
  });
  return { server, url: `ws://127.0.0.1:${addr.port}`, clients };
}

/** 轮询等待条件成立，避免硬等固定毫秒。 */
async function waitUntil(predicate: () => boolean, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error('waitUntil 超时');
}

describe('kuaishou monitor 下播自动停听', () => {
  test('无登录 Cookie 时启动应立即给出明确提示，不发起换票', async () => {
    let fetchCount = 0;
    const mon = createKsMonitor({
      log,
      resolvePetId: () => 'main',
      chatWithPet: async () => ({ ok: true }),
      fetchWsInfo: async () => {
        fetchCount += 1;
        return wsInfoOf('wss://ks.example/feed');
      },
    });
    await assert.rejects(
      () => mon.start({ url: 'https://live.kuaishou.com/abc' }),
      /快手直连监听需要登录 Cookie/,
    );
    assert.equal(fetchCount, 0);
  });

  test('start 直连本地 WSS：监听中、ended=false', async () => {
    const { server, url } = await startServer();
    try {
      const mon = createKsMonitor({
        log,
        resolvePetId: () => 'main',
        chatWithPet: async () => ({ ok: true }),
        fetchWsInfo: async () => wsInfoOf(url),
      });
      const status = await mon.start({ url: 'https://live.kuaishou.com/abc', cookie: 'userId=123; passToken=test' });
      assert.equal(status.listening, true);
      assert.equal(status.ended, false);
      assert.equal(status.mode, 'ws');
      mon.stop();
    } finally {
      server.close();
    }
  });

  test('断线后探活拿到「未开播」：自动停听、ended=true、onEnded 回调一次', async () => {
    const { server, url, clients } = await startServer();
    try {
      // start 后把换票行为切到「下播」，重连前探活即命中未开播。
      let living = true;
      const endedEvents: number[] = [];
      const mon = createKsMonitor({
        log,
        resolvePetId: () => 'main',
        chatWithPet: async () => ({ ok: true }),
        fetchWsInfo: async () => {
          if (!living) throw new Error('未解析到 liveStreamId（可能未开播或需要登录 Cookie）');
          return wsInfoOf(url);
        },
        onEnded: () => endedEvents.push(1),
      });
      await mon.start({ url: 'https://live.kuaishou.com/abc', cookie: 'userId=123; passToken=test' });
      assert.equal(mon.status().ended, false);

      // 主播下播：服务端断开当前连接。
      living = false;
      for (const c of clients) c.close();

      await waitUntil(() => mon.status().ended);
      const ended = mon.status();
      assert.equal(ended.listening, false, '下播后自动停听');
      assert.equal(ended.mode, 'idle');
      assert.match(ended.lastError, /下播/, 'lastError 写明下播原因');
      assert.equal(endedEvents.length, 1, 'onEnded 只回调一次');

      // 重新开始 = 新一场，ended 清零。
      living = true;
      const restarted = await mon.start({ url: 'https://live.kuaishou.com/abc', cookie: 'userId=123; passToken=test' });
      assert.equal(restarted.ended, false);
      assert.equal(restarted.listening, true);
      mon.stop();
    } finally {
      server.close();
    }
  });

  test('探活遇到非下播错误（票据失效/网络）不误杀，恢复后继续监听', async () => {
    const { server, url, clients } = await startServer();
    try {
      let mode: 'ok' | 'bad' = 'ok';
      const mon = createKsMonitor({
        log,
        resolvePetId: () => 'main',
        chatWithPet: async () => ({ ok: true }),
        fetchWsInfo: async () => {
          if (mode === 'bad') throw new Error('进房 token 已失效，请重新登录');
          return wsInfoOf(url);
        },
      });
      await mon.start({ url: 'https://live.kuaishou.com/abc', cookie: 'userId=123; passToken=test' });

      // 第一次断线：探活是票据失效（未知），应继续重连而不是 markEnded。
      mode = 'bad';
      for (const c of clients) c.close();
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(mon.status().ended, false, '票据失效不判下播');

      // 恢复在播：重连成功，listening 回到 true。
      mode = 'ok';
      await waitUntil(() => mon.status().listening);
      assert.equal(mon.status().ended, false);
      mon.stop();
    } finally {
      server.close();
    }
  });
});
