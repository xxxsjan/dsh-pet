/**
 * 小红书中控台 monitor 链路 + JSON 解码测试：桥收到 cookie、帧分发到弹幕/礼物、去重、stop 清理。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/monitor.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createXhsMonitor } from './monitor.ts';
import type { XhsCdpBridge } from './cdp-bridge.ts';
import { classifyXhsItem, parseXhsCountText, parseXhsOnlineCount, parseXhsWsPayload } from './xhs-danmaku.ts';

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
    visible: boolean;
    showCalls: number;
    endedHit: boolean;
    probeCalls: number;
    /** 开播态探测返回值；默认 live，测试可改成 ended / unknown 模拟未开播。 */
    liveState: 'live' | 'ended' | 'unknown';
    liveStateCalls: number;
    subs: typeof subs;
  } = {
    starts: [],
    stopped: false,
    loggedIn: false,
    visible: false,
    showCalls: 0,
    endedHit: false,
    probeCalls: 0,
    liveState: 'live',
    liveStateCalls: 0,
    subs,
    async start(input: { cookie?: string }) {
      this.starts.push({ cookie: input.cookie });
    },
    stop() {
      this.stopped = true;
    },
    show() {
      this.showCalls += 1;
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    status() {
      return { running: true, visible: this.visible, loggedIn: this.loggedIn, lastError: '' };
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
    async probeEnded() {
      this.probeCalls += 1;
      return this.endedHit;
    },
    async probeLiveState() {
      this.liveStateCalls += 1;
      return this.liveState;
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

/** 轮询等待条件成立，避免硬等固定毫秒。 */
async function waitUntil(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('waitUntil 超时');
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

  test('已登录但明确未开播时拒绝开始监听，并回收内嵌窗', async () => {
    const bridge = makeBridge();
    bridge.loggedIn = true;
    bridge.liveState = 'ended';
    const mon = createXhsMonitor(makeDeps(bridge));
    await assert.rejects(() => mon.start({}), /未开播/);
    assert.equal(mon.status().listening, false, '未开播不应进入监听状态');
    assert.equal(bridge.stopped, true, '拒绝后应关掉内嵌窗，不留假监听');
  });

  test('已登录但确认不了在播时拒绝开始监听', async () => {
    const bridge = makeBridge();
    bridge.loggedIn = true;
    bridge.liveState = 'unknown';
    const mon = createXhsMonitor(makeDeps(bridge));
    await assert.rejects(() => mon.start({}), /未能确认正在直播/);
    assert.equal(mon.status().listening, false);
    assert.equal(bridge.stopped, true);
  });

  test('未登录时先让窗口留着扫码，不做开播判定', async () => {
    const bridge = makeBridge();
    bridge.loggedIn = false;
    bridge.liveState = 'ended';
    const mon = createXhsMonitor(makeDeps(bridge));
    const status = await mon.start({});
    assert.equal(status.listening, true, '扫码登录流程不能被开播判定打断');
    assert.equal(bridge.liveStateCalls, 0, '未登录时不该判定开播');
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

  test('showCenter 唤起内嵌中控台窗口并同步可见态', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    await mon.start({});
    assert.equal(bridge.visible, false);
    const status = mon.showCenter();
    assert.equal(bridge.showCalls, 1);
    assert.equal(bridge.visible, true);
    assert.equal(status.cdpVisible, true);
  });

  test('未启动时 showCenter 不触窗也不抛错', () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    const status = mon.showCenter();
    assert.equal(bridge.showCalls, 0);
    assert.equal(status.listening, false);
  });

  test('文本帧分发为弹幕，礼物帧分发为礼物', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    await mon.start({});

    bridge.subs.frame?.(
      frameOf({
        body: { customData: { type: 'text', desc: '你好呀', profile: { nickname: '小明' }, commentId: 'c1' } },
      }),
    );
    bridge.subs.frame?.(
      frameOf({
        body: {
          customData: {
            type: 'gift_comment',
            send_user_info: { nick_name: '小红' },
            base_gift_info: { name: '小心心', coins: 10 },
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
    assert.equal(status.giftValue, 30, '礼物价值 = 薯币单价 × 件数');
    assert.equal(status.giftValueUnit, '薯币');
  });

  test('桥未就绪时 start 报错', async () => {
    const mon = createXhsMonitor(makeDeps(undefined));
    await assert.rejects(() => mon.start({}), /CDP 旁听桥未就绪/);
  });

  test('探测到页面「直播已结束」：自动停听、ended=true、onEnded 回调一次', async () => {
    const bridge = makeBridge();
    const endedEvents: number[] = [];
    const mon = createXhsMonitor({
      ...makeDeps(bridge),
      endedProbeTickMs: 30,
      onEnded: () => endedEvents.push(1),
    });
    await mon.start({});
    assert.equal(mon.status().ended, false, '刚启动不是下播态');

    // 页面进入结束态：探测命中后自动停听。
    bridge.endedHit = true;
    await waitUntil(() => mon.status().ended);
    const ended = mon.status();
    assert.equal(ended.listening, false, '下播后自动停听');
    assert.equal(ended.mode, 'idle');
    assert.match(ended.lastError, /下播/, 'lastError 写明下播原因');
    assert.equal(bridge.stopped, true, '下播后停掉 CDP 桥，不再让页面空转');
    assert.equal(endedEvents.length, 1, 'onEnded 只回调一次');

    // 重新开始 = 新一场，ended 清零。
    bridge.endedHit = false;
    const restarted = await mon.start({});
    assert.equal(restarted.ended, false);
    assert.equal(restarted.listening, true);
    mon.stop();
  });
});

describe('xiaohongshu 在线统计', () => {
  test('在线统计类 customData 更新 viewerCount', async () => {
    const bridge = makeBridge();
    const mon = createXhsMonitor(makeDeps(bridge));
    await mon.start({});
    bridge.subs.frame?.(
      frameOf({ body: { customData: { type: 'online_statistics', online_count: 88, msgId: 's1' } } }),
    );
    assert.equal(mon.status().viewerCount, 88);
    assert.equal(mon.status().chatCount, 0, '在线统计不计入弹幕数');
    assert.equal(mon.status().giftCount, 0, '在线统计不计入礼物数');

    bridge.subs.frame?.(frameOf({ body: { customData: { type: 'room_online', onlineCount: '1.2万', msgId: 's2' } } }));
    assert.equal(mon.status().viewerCount, 12000);
    mon.stop();
  });

  test('type 语义命中但取不到数值时仍留样本，不改 viewerCount', () => {
    assert.equal(parseXhsOnlineCount({ type: 'audience_join', profile: { nickname: 'D' } }), -1);
    assert.deepEqual(classifyXhsItem({ type: 'audience_join', profile: { nickname: 'D' } }), null);
  });

  test('展示串换算：数字 / 万 / 亿 / 文案兜底', () => {
    assert.equal(parseXhsCountText('1234'), 1234);
    assert.equal(parseXhsCountText('1.2万'), 12000);
    assert.equal(parseXhsCountText('3.4亿'), 340000000);
    assert.equal(parseXhsCountText(56), 56);
    assert.equal(parseXhsCountText(''), -1);
    assert.equal(parseXhsCountText('abc'), -1);
    assert.equal(parseXhsOnlineCount({ type: 'online_statistics', desc: '1.2万人在线' }), 12000);
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
    const inner = {
      customData: {
        type: 'gift_comment',
        send_user_info: { nick_name: 'B' },
        base_gift_info: { name: '玫瑰' },
        gift_action_info: { count: 5 },
      },
      msgId: 'b1',
    };
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

describe('xiaohongshu 协议兼容（对齐实测字段）', () => {
  test('text_message / content 与昵称别名都能入库', () => {
    const item = classifyXhsItem({
      type: 'text_message',
      content: '换行折叠',
      profile: { nickname: '阿红' },
      comment_id: 'c42',
    });
    assert.equal(item?.kind, 'chat');
    assert.equal(item?.nick, '阿红');
    assert.equal(item?.text, '换行折叠');
  });

  test('gift 别名、num 数量与 nickname 昵称兜底', () => {
    const item = classifyXhsItem({
      type: 'gift',
      send_user_info: { nickname: '大哥' },
      base_gift_info: { name: '玫瑰' },
      gift_action_info: { num: 3 },
      msg_id: 'g9',
    });
    assert.equal(item?.kind, 'gift');
    assert.equal(item?.nick, '大哥');
    assert.equal(item?.giftName, '玫瑰');
    assert.equal(item?.count, 3);
  });

  test('refresh 帧按 member_count 取当前在线，不拿累计 viewer_count 冒充', () => {
    assert.equal(parseXhsOnlineCount({ type: 'refresh', member_count: '1.2万', viewer_count: 999999 }), 12000);
    assert.equal(parseXhsOnlineCount({ type: 'refresh', data: { member_count: 88 } }), 88);
    assert.equal(parseXhsOnlineCount({ type: 'letter_refresh', display_watching_count: '3千' }), 3000);
  });

  test('展示串支持 千 与 正在观看', () => {
    assert.equal(parseXhsCountText('3千'), 3000);
    assert.equal(parseXhsCountText('1.2万人正在观看'), 12000);
  });

  test('command != 1 的控制帧不产生消息', () => {
    const inner = {
      command: 3,
      customData: { type: 'text', desc: '不该入库', profile: { nickname: 'X' }, commentId: 'ctl1' },
    };
    const wrapped = Buffer.from(JSON.stringify(inner), 'utf8').toString('base64');
    const seen = new Set<string>();
    assert.equal(parseXhsWsPayload(frameOf({ b: { d: { b: [{ d: wrapped }] } } }), seen).length, 0);
  });

  test('snake_case 的 comment_id 也能参与去重', () => {
    const seen = new Set<string>();
    const msg = { type: 'text', desc: 'dup', profile: { nickname: 'A' }, comment_id: 'c9' };
    assert.equal(parseXhsWsPayload(frameOf({ body: { customData: msg } }), seen).length, 1);
    assert.equal(parseXhsWsPayload(frameOf({ body: { customData: msg } }), seen).length, 0);
  });
});
