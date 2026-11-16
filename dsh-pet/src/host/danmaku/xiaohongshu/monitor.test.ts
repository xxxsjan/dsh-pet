/**
 * 小红书中控台 monitor 链路 + JSON 解码测试：桥收到 cookie、帧分发到弹幕/礼物、去重、stop 清理。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/monitor.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createXhsMonitor } from './monitor.ts';
import type { XhsCdpBridge } from './cdp-bridge.ts';
import { classifyXhsItem, parseXhsWsPayload } from './xhs-danmaku.ts';

const noop = () => undefined;

function makeBridge() {
  const subs: {
    frame: null | ((frame: Uint8Array) => void);
    login: null | (() => void);
    closed: null | (() => void);
  } = { frame: null, login: null, closed: null };
  const bridge: XhsCdpBridge & {
    starts: Array<{ cookie?: string }>;
    stopped: boolean;
    loggedIn: boolean;
    subs: typeof subs;
  } = {
    starts: [],
    stopped: false,
    loggedIn: false,
    subs,
    async start(input: { cookie?: string }) {
      this.starts.push({ cookie: input.cookie });
    },
    stop() {
      this.stopped = true;
    },
    show() {},
    hide() {},
    status() {
      return { running: true, visible: false, loggedIn: this.loggedIn, lastError: '' };
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

function makeDeps(bridge: XhsCdpBridge | undefined) {
  return {
    log: { info: noop, warn: noop, debug: noop },
    getCdpBridge: () => bridge,
    resolvePetId: () => 'main',
    chatWithPet: async () => ({ ok: true }),
  };
}

function frameOf(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe('xiaohongshu monitor CDP 链路', () => {
  test('有 CDP 桥时走 cdp 路径，桥收到 cookie', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    const status = await mon.start({ cookie: 'web_session=abc' });
    assert.equal(status.mode, 'cdp');
    assert.equal(status.listening, true);
    assert.equal(bridge.starts[0]?.cookie, 'web_session=abc');
  });

  test('stop 时停止 CDP 桥，状态回到 idle', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    await mon.start({});
    mon.stop();
    assert.equal(bridge.stopped, true);
    const status = mon.status();
    assert.equal(status.mode, 'idle');
    assert.equal(status.listening, false);
  });

  test('文本帧分发为弹幕，礼物帧分发为礼物', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    await mon.start({});

    bridge.subs.frame?.(
      frameOf({ body: { customData: { type: 'text', desc: '你好呀', profile: { nickname: '小明' }, commentId: 'c1' } } }),
    );
    bridge.subs.frame?.(
      frameOf({
        body: {
          customData: {
            type: 'gift_comment',
            send_user_info: { nick_name: '小红' },
            base_gift_info: { name: '小心心' },
            gift_action_info: { comb_count: 3 },
            commentId: 'g1',
          },
        },
      }),
    );

    const status = mon.status();
    assert.equal(status.chatCount, 1);
    assert.equal(status.giftCount, 1);
    assert.deepEqual(status.recent[0], {
      id: 1,
      at: status.recent[0]!.at,
      kind: 'chat',
      nick: '小明',
      text: '你好呀',
      count: 0,
    });
    assert.equal(status.recent[1]?.kind, 'gift');
    assert.equal(status.recent[1]?.text, '小心心');
    assert.equal(status.recent[1]?.count, 3);
  });

  test('桥未就绪时 start 报错', async () => {
    const mon = createXhsMonitor(makeDeps(undefined));
    await assert.rejects(() => mon.start({}), /CDP 旁听桥未就绪/);
  });
});

describe('xiaohongshu 帧解码', () => {
  test('body.customData 形态解析弹幕与礼物', () => {
    const seen = new Set<string>();
    const items = parseXhsWsPayload(
      frameOf({ body: { customData: { type: 'text', desc: 'hi', profile: { nickname: 'A' }, commentId: 'x1' } } }),
      seen,
    );
    assert.equal(items.length, 1);
    const parsed = classifyXhsItem(items[0]!);
    assert.equal(parsed?.kind, 'chat');
    assert.equal(parsed?.text, 'hi');
  });

  test('b.d.b[] base64 包裹形态可解出消息', () => {
    const inner = { customData: { type: 'gift_comment', send_user_info: { nick_name: 'B' }, base_gift_info: { name: '玫瑰' }, gift_action_info: { count: 5 } }, msgId: 'b1' };
    const wrapped = Buffer.from(JSON.stringify(inner), 'utf8').toString('base64');
    const seen = new Set<string>();
    const items = parseXhsWsPayload(frameOf({ b: { d: { b: [{ d: wrapped }] } } }), seen);
    assert.equal(items.length, 1);
    const parsed = classifyXhsItem(items[0]!);
    assert.equal(parsed?.kind, 'gift');
    assert.equal(parsed?.count, 5);
  });

  test('同一条消息按 msgId 去重，进场事件不入库', () => {
    const seen = new Set<string>();
    const msg = { type: 'text', desc: 'dup', profile: { nickname: 'C' }, commentId: 'd1' };
    assert.equal(parseXhsWsPayload(frameOf({ body: { customData: msg } }), seen).length, 1);
    assert.equal(parseXhsWsPayload(frameOf({ body: { customData: msg } }), seen).length, 0);
    assert.equal(classifyXhsItem({ type: 'audience_join', profile: { nickname: 'D' } }), null);
  });
});
