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

describe('xiaohongshu 开关与回复队列', () => {
  const chatFrame = (id: string, text: string) =>
    frameOf({ body: { customData: { type: 'text', desc: text, profile: { nickname: '观众' }, commentId: id } } });
  const giftFrame = (id: string) =>
    frameOf({
      body: {
        customData: {
          type: 'gift_comment',
          send_user_info: { nick_name: '大哥' },
          base_gift_info: { name: '小心心' },
          gift_action_info: { count: 1 },
          commentId: id,
        },
      },
    });
  const tick = () => new Promise((r) => setTimeout(r, 0));

  /** 第一条卡住不放（模拟正在生成/朗读），其余立即完成；记录每次调用的 kind。 */
  function makeGatedChat() {
    const calls: Array<{ kind: string }> = [];
    let release: (() => void) | null = null;
    const fn = async (_petId: string, _text: string, kind: 'chat' | 'gift') => {
      calls.push({ kind });
      if (calls.length === 1) await new Promise<void>((resolve) => (release = resolve));
      return { ok: true };
    };
    return { calls, fn, releaseFirst: () => release?.() };
  }

  test('关回复弹幕：清掉排队弹幕、保留礼物感谢，并掐断在途弹幕语音', async () => {
    const bridge = makeBridge();
    const chat = makeGatedChat();
    const cancelled: string[] = [];
    const mon = createXhsMonitor({
      log: { info: noop, warn: noop, debug: noop },
      getCdpBridge: () => bridge,
      resolvePetId: () => 'main',
      chatWithPet: chat.fn,
      cancelVoice: (kind) => cancelled.push(kind),
    });
    await mon.start({ replyChat: true, thankGift: true });
    bridge.subs.frame?.(chatFrame('c1', '第一条')); // 进入在途并卡住
    bridge.subs.frame?.(chatFrame('c2', '第二条')); // 排队
    bridge.subs.frame?.(chatFrame('c3', '第三条')); // 排队
    bridge.subs.frame?.(giftFrame('g1')); // 排队
    mon.setOptions({ replyChat: false });
    assert.deepEqual(cancelled, ['chat'], '在途那条是弹幕：应通知宿主掐断 chat 语音');
    chat.releaseFirst();
    await tick();
    await tick();
    assert.deepEqual(
      chat.calls.map((c) => c.kind),
      ['chat', 'gift'],
      '排队的 c2/c3 应被清掉，礼物感谢不受影响',
    );
    mon.stop();
  });

  test('关感谢礼物：清掉排队礼物、保留弹幕回复，并掐断在途礼物语音', async () => {
    const bridge = makeBridge();
    const chat = makeGatedChat();
    const cancelled: string[] = [];
    const mon = createXhsMonitor({
      log: { info: noop, warn: noop, debug: noop },
      getCdpBridge: () => bridge,
      resolvePetId: () => 'main',
      chatWithPet: chat.fn,
      cancelVoice: (kind) => cancelled.push(kind),
    });
    await mon.start({ replyChat: true, thankGift: true });
    bridge.subs.frame?.(giftFrame('g1')); // 在途卡住
    bridge.subs.frame?.(giftFrame('g2')); // 排队
    bridge.subs.frame?.(chatFrame('c1', '一条弹幕')); // 排队
    mon.setOptions({ thankGift: false });
    assert.deepEqual(cancelled, ['gift'], '在途那条是礼物：应通知宿主掐断 gift 语音');
    chat.releaseFirst();
    await tick();
    await tick();
    assert.deepEqual(
      chat.calls.map((c) => c.kind),
      ['gift', 'chat'],
      '排队的 g2 应被清掉，弹幕回复不受影响',
    );
    mon.stop();
  });

  test('没有在途任务时关开关：不触发掐断，只清队列', async () => {
    const bridge = makeBridge();
    const cancelled: string[] = [];
    const mon = createXhsMonitor({
      log: { info: noop, warn: noop, debug: noop },
      getCdpBridge: () => bridge,
      resolvePetId: () => 'main',
      chatWithPet: async () => ({ ok: true }),
      cancelVoice: (kind) => cancelled.push(kind),
    });
    await mon.start({ replyChat: true, thankGift: true });
    mon.setOptions({ replyChat: false, thankGift: false });
    assert.deepEqual(cancelled, [], '空闲时关开关不应触发语音掐断');
    mon.stop();
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
