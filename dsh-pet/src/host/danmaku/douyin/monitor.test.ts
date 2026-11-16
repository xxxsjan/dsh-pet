/**
 * 抖音监听器链路接线：CDP 旁听优先、无桥回退直连、stop 清理桥订阅。
 * 帧的 protobuf 解码链由 proto.ts 自身覆盖，这里只验证链路选择与状态。
 * @module dsh-pet/src/host/danmaku/douyin/monitor.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDouyinMonitor } from './monitor.ts';
import type { DouyinCdpBridge } from './cdp-bridge.ts';

const noop = () => undefined;

function makeBridge() {
  const subs: {
    frame: null | ((frame: Uint8Array) => void);
    login: null | (() => void);
    closed: null | (() => void);
  } = { frame: null, login: null, closed: null };
  const bridge: DouyinCdpBridge & {
    starts: Array<{ url: string; cookie?: string }>;
    stopped: boolean;
    loggedIn: boolean;
    subs: typeof subs;
  } = {
    starts: [],
    stopped: false,
    loggedIn: false,
    subs,
    async start(input: { url: string; cookie?: string }) {
      this.starts.push({ url: input.url, cookie: input.cookie });
    },
    stop() {
      this.stopped = true;
    },
    show() {},
    hide() {},
    status() {
      return {
        running: true,
        visible: false,
        url: this.starts[0]?.url ?? '',
        loggedIn: this.loggedIn,
        lastError: '',
      };
    },
    onFrame(fn: (frame: Uint8Array) => void) {
      subs.frame = fn;
      return () => {
        subs.frame = null;
      };
    },
    onLogin(fn: () => void) {
      subs.login = fn;
      return () => {
        subs.login = null;
      };
    },
    onClosed(fn: () => void) {
      subs.closed = fn;
      return () => {
        subs.closed = null;
      };
    },
  };
  const origLogin = bridge.onLogin.bind(bridge);
  bridge.onLogin = (fn: () => void) =>
    origLogin(() => {
      bridge.loggedIn = true;
      fn();
    });
  return bridge;
}

function makeDeps(bridge: DouyinCdpBridge | undefined) {
  return {
    log: { info: noop, warn: noop, debug: noop },
    getSignBaseUrl: () => undefined,
    getCdpBridge: () => bridge,
    resolvePetId: () => 'main',
    chatWithPet: async () => ({ ok: true }),
  };
}

describe('douyin monitor CDP 链路', () => {
  test('有 CDP 桥时走 cdp 路径，桥收到 url 与 cookie', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    const status = await mon.start({
      url: 'https://live.douyin.com/123456789',
      cookie: 'sessionid=abc',
    });
    assert.equal(status.mode, 'cdp');
    assert.equal(status.listening, true);
    assert.equal(bridge.starts[0]?.url, 'https://live.douyin.com/123456789');
    assert.equal(bridge.starts[0]?.cookie, 'sessionid=abc');
  });

  test('stop 时停止 CDP 桥，状态回到 idle', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    mon.stop();
    assert.equal(bridge.stopped, true);
    const status = mon.status();
    assert.equal(status.mode, 'idle');
    assert.equal(status.listening, false);
  });

  test('桥 onLogin 回调把登录态置真', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    bridge.subs.login?.();
    assert.equal(mon.status().cdpLoggedIn, true);
  });

  test('无 CDP 桥时回退直连，签名桥未就绪即报错', async () => {
    const mon = createDouyinMonitor(makeDeps(undefined));
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789' }),
      /签名桥未就绪/,
    );
  });
});
