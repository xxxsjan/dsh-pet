/**
 * 抖音监听器链路接线：仅使用 CDP 旁听、无桥时明确失败、stop 清理桥订阅。
 * 帧的 protobuf 解码链由 proto.ts 自身覆盖，这里只验证链路选择与状态。
 * @module dsh-pet/src/host/danmaku/douyin/monitor.test
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

import { createDouyinMonitor } from './monitor.ts';
import type { DouyinMonitorDeps, DouyinMonitorStatus } from './monitor.ts';
import type { DouyinCdpBridge } from './cdp-bridge.ts';
import { DyLivenessUnknownError, DyRoomOfflineError } from './live-info.ts';
import {
  ControlMessage,
  DyResponse,
  GiftMessage,
  LightGiftMessage,
  LikeMessage,
  PushFrame,
  RoomUserSeqMessage,
} from './proto.ts';
import { LIGHT_GIFT_NICK } from './gift-parse.ts';

const noop = () => undefined;

function makeBridge() {
  const subs: {
    frame: null | ((frame: Uint8Array) => void);
    login: null | (() => void);
    closed: null | (() => void);
    meta: null | ((meta: { title: string; anchor: string }) => void);
    wsClosed: null | ((url: string) => void);
    pageState: null | ((state: '' | 'kicked') => void);
  } = { frame: null, login: null, closed: null, meta: null, wsClosed: null, pageState: null };
  const bridge: DouyinCdpBridge & {
    starts: Array<{ url: string; cookie?: string; debugVisible?: boolean }>;
    visibleCalls: boolean[];
    visible: boolean;
    stopped: boolean;
    loggedIn: boolean;
    meta: { title: string; anchor: string };
    subs: typeof subs;
  } = {
    starts: [],
    visibleCalls: [],
    visible: false,
    stopped: false,
    loggedIn: false,
    meta: { title: '', anchor: '' },
    subs,
    async start(input: { url: string; cookie?: string; debugVisible?: boolean }) {
      this.starts.push({ url: input.url, cookie: input.cookie, debugVisible: input.debugVisible });
    },
    stop() {
      this.stopped = true;
    },
    show() {
      this.visible = true;
    },
    hide() {
      this.visible = false;
    },
    setVisible(visible: boolean) {
      this.visibleCalls.push(visible);
      this.visible = visible;
    },
    status() {
      return {
        running: true,
        visible: this.visible,
        url: this.starts[0]?.url ?? '',
        loggedIn: this.loggedIn,
        lastError: '',
        title: this.meta.title,
        anchor: this.meta.anchor,
        pageState: '',
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
    onMeta(fn: (meta: { title: string; anchor: string }) => void) {
      subs.meta = fn;
      return () => {
        subs.meta = null;
      };
    },
    onWsClosed(fn: (url: string) => void) {
      subs.wsClosed = fn;
      return () => {
        subs.wsClosed = null;
      };
    },
    onPageState(fn: (state: '' | 'kicked') => void) {
      subs.pageState = fn;
      return () => {
        subs.pageState = null;
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

function makeDeps(bridge: DouyinCdpBridge | undefined, fetchLiveInfo?: DouyinMonitorDeps['fetchLiveInfo']) {
  return {
    log: { info: noop, warn: noop, debug: noop },
    getCdpBridge: () => bridge,
    resolvePetId: () => 'main',
    chatWithPet: async () => ({ ok: true }),
    // 默认假进房：空元数据，避免测试打真实网络
    fetchLiveInfo:
      fetchLiveInfo ??
      (async () => ({
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '',
        title: '',
        anchor: '',
        loginUid: '',
      })),
  };
}

describe('douyin monitor CDP 链路', () => {
  test('有 CDP 桥时走 cdp 路径，桥收到 url 与 cookie', async () => {
    const bridge = makeBridge();
    // 有效登录 Cookie：进房回显 uid 与 Cookie 自带 uid 一致，校验通过后才启动桥。
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => ({
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '',
        title: '',
        anchor: '',
        loginUid: '998877',
      })),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/123456789',
      cookie: 'sessionid=abc; uid_tt=998877',
    });
    assert.equal(status.mode, 'cdp');
    assert.equal(status.listening, true);
    assert.equal(bridge.starts[0]?.url, 'https://live.douyin.com/123456789');
    assert.equal(bridge.starts[0]?.cookie, 'sessionid=abc; uid_tt=998877');
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

  test('调试可见模式透传给 CDP 桥', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789', debugVisible: true });
    assert.equal(bridge.starts[0]?.debugVisible, true);
    mon.stop();
  });

  test('调试显隐：只切内嵌窗可见性并同步 cdpVisible', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    const hidden = mon.setWindowVisible(false);
    assert.deepEqual(bridge.visibleCalls, [false]);
    assert.equal(hidden.cdpVisible, false);
    const shown = mon.setWindowVisible(true);
    assert.deepEqual(bridge.visibleCalls, [false, true]);
    assert.equal(shown.cdpVisible, true);
    // 用户自己关窗（桥里转隐藏）后，状态轮询应按桥的实时可见性回落。
    bridge.hide();
    assert.equal(mon.status().cdpVisible, false);
    mon.stop();
  });

  test('桥 onLogin 回调把登录态置真', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    bridge.subs.login?.();
    assert.equal(mon.status().cdpLoggedIn, true);
  });

  test('无 CDP 桥时明确拒绝启动，不回退后端直连', async () => {
    const mon = createDouyinMonitor(makeDeps(undefined));
    await assert.rejects(() => mon.start({ url: 'https://live.douyin.com/123456789' }), /需要桌面 Helper 的 CDP 桥/);
    assert.equal(mon.status().listening, false);
  });

  test('CDP 桥启动失败时清理监听状态和桥订阅', async () => {
    const bridge = makeBridge();
    bridge.start = async () => {
      throw new Error('CDP start failed');
    };
    const mon = createDouyinMonitor(makeDeps(bridge));
    await assert.rejects(() => mon.start({ url: 'https://live.douyin.com/123456789' }), /CDP start failed/);
    assert.equal(mon.status().listening, false);
    assert.equal(mon.status().mode, 'idle');
    assert.equal(bridge.stopped, true);
    assert.equal(bridge.subs.frame, null);
  });

  test('在线人数统计帧更新 viewerCount，累计观看不覆盖在线数', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    const started = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(started.viewerCount, -1, '启动时还没有统计帧，应为 -1');

    const seqFrame = (total: number, totalUser: number) => {
      const seqPayload = RoomUserSeqMessage.encode(RoomUserSeqMessage.create({ total, totalUser })).finish();
      const resp = DyResponse.encode(
        DyResponse.create({
          messagesList: [{ method: 'WebcastRoomUserSeqMessage', payload: seqPayload }],
        }),
      ).finish();
      return PushFrame.encode(PushFrame.create({ payload: resp })).finish();
    };

    bridge.subs.frame?.(seqFrame(4321, 98765));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().viewerCount, 4321, 'total(3) 是在线人数');

    // 只看累计观看、total=0 的降级帧不应把在线人数抹成 0。
    bridge.subs.frame?.(seqFrame(0, 98765));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().viewerCount, 4321);
    assert.equal(mon.status().chatCount, 0, '统计帧不计入弹幕数');
    mon.stop();
  });

  test('点赞帧累计总数：只取 total 且单调不回退', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    const started = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(started.likeCount, 0, '启动时本场还没收到点赞帧');

    const likeFrame = (total: number, count: number) => {
      const payload = LikeMessage.encode(LikeMessage.create({ total, count })).finish();
      const resp = DyResponse.encode(
        DyResponse.create({
          messagesList: [{ method: 'WebcastLikeMessage', payload }],
        }),
      ).finish();
      return PushFrame.encode(PushFrame.create({ payload: resp })).finish();
    };

    bridge.subs.frame?.(likeFrame(8000, 300));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().likeCount, 8000, 'total(3) 是本场累计总赞');

    bridge.subs.frame?.(likeFrame(8200, 200));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().likeCount, 8200);

    // 乱序旧帧不许把已攒的总数往回抹。
    bridge.subs.frame?.(likeFrame(8100, 100));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().likeCount, 8200, '旧帧不回退');
    assert.equal(mon.status().chatCount, 0, '点赞帧不计入弹幕数');
    assert.equal(mon.status().giftCount, 0, '点赞帧不计入礼物数');

    // 重启监听 = 新的一场，必须清零。
    mon.stop();
    const restarted = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(restarted.likeCount, 0, '重启监听后清零');
    mon.stop();
  });

  /** 取最后一条（测试 tsconfig 的 lib 还没到 ES2022，不能用 Array.prototype.at）。 */
  const lastItem = <T>(list: T[]): T | undefined => list[list.length - 1];

  /** 组一帧 WebcastGiftMessage 推送（外层 PushFrame + Response 与线上同形）。 */
  function giftFrame(over: Record<string, unknown>, msgId = 1, appendZeroGroupId = false): Uint8Array {
    const encoded = GiftMessage.encode(GiftMessage.create(over)).finish();
    const payload = appendZeroGroupId ? new Uint8Array([...encoded, 0x58, 0x00]) : encoded;
    const resp = DyResponse.encode(
      DyResponse.create({ messagesList: [{ method: 'WebcastGiftMessage', payload, msgId }] }),
    ).finish();
    return PushFrame.encode(PushFrame.create({ payload: resp })).finish();
  }

  test('礼物首帧就落地：不等 repeat_end=1，同组只一条、答谢一次', async () => {
    const bridge = makeBridge();
    const thanks: Array<{ text: string; kind: string }> = [];
    const mon = createDouyinMonitor({
      ...makeDeps(bridge),
      chatWithPet: async (_petId, text, kind) => {
        thanks.push({ text, kind });
        return { ok: true };
      },
    });
    await mon.start({ url: 'https://live.douyin.com/123456789', thankGift: true });

    const combo = {
      giftId: 762,
      groupId: 88,
      user: { nickName: '阿财' },
      gift: { name: '大啤酒', combo: true, type: 1, diamondCount: 10 },
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // 连击中间帧（repeatEnd=0）也必须计数：线上定稿帧并不保证会到。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 1, comboCount: 1, repeatEnd: 0 }, 1));
    await tick();
    let status = mon.status();
    assert.equal(status.giftCount, 1, '中间帧也要落地，不能等 repeatEnd=1');
    assert.equal(lastItem(status.recent)?.kind, 'gift');
    assert.equal(lastItem(status.recent)?.count, 1);
    assert.equal(status.giftValue, 10, '首帧按单价×件数计价值');
    assert.equal(status.giftValueUnit, '钻石');

    // 同组后续帧：只把同一条的件数抬高，不重复计数、不重复答谢。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 5, comboCount: 5, repeatEnd: 0 }, 2));
    await tick();
    status = mon.status();
    assert.equal(status.giftCount, 1, '同一连击组只算一条');
    assert.equal(status.recent.filter((item) => item.kind === 'gift').length, 1, '只保留一条礼物行');
    assert.equal(lastItem(status.recent)?.count, 5, '件数原地抬高');
    assert.equal(status.giftValue, 50, '连击升高只补差价，不重复累加');

    // 定稿帧到达：件数不再变化，也不重复答谢。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 5, comboCount: 5, repeatEnd: 1 }, 3));
    await tick();
    assert.equal(mon.status().giftCount, 1);
    assert.equal(mon.status().giftValue, 50, '定稿帧不重复计价值');
    assert.equal(thanks.length, 1, '答谢只发一次');
    assert.equal(thanks[0]?.kind, 'gift');
    mon.stop();
  });

  test('无效 msgId 不再猜测合并普通礼物，即使是同礼物重复发送', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });

    bridge.subs.frame?.(
      giftFrame({ giftId: 1, repeatCount: 1, user: { nickName: '观众A' }, gift: { name: '玫瑰' } }, 0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.subs.frame?.(
      giftFrame({ giftId: 2, repeatCount: 1, user: { nickName: '观众A' }, gift: { name: '荧光棒' } }, 0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.subs.frame?.(
      giftFrame({ giftId: 1, repeatCount: 1, user: { nickName: '观众A' }, gift: { name: '玫瑰' } }, 0),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.equal(mon.status().giftCount, 3, '无效 msgId 时不猜测合并，重复礼物也应保留');
    assert.deepEqual(
      mon
        .status()
        .recent.filter((item) => item.kind === 'gift')
        .map((item) => item.text),
      ['玫瑰', '荧光棒', '玫瑰'],
    );
    mon.stop();
  });

  test('非连击礼物一条消息一行；轻礼物也进 feed', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    bridge.subs.frame?.(
      giftFrame(
        {
          giftId: 1,
          repeatCount: 2,
          repeatEnd: 1,
          user: { nickName: '观众' },
          gift: {
            name: '玫瑰',
            image: { urlListList: ['https://p3-webcast.douyinpic.com/img/webcast/rose.png'] },
          },
        },
        11,
      ),
    );
    await tick();
    assert.equal(mon.status().giftCount, 1);
    assert.equal(lastItem(mon.status().recent)?.text, '玫瑰');
    assert.equal(lastItem(mon.status().recent)?.count, 2);
    assert.equal(lastItem(mon.status().recent)?.giftImageUrl, 'https://p3-webcast.douyinpic.com/img/webcast/rose.png');

    const lightPayload = LightGiftMessage.encode(
      LightGiftMessage.create({ count: 1, giftInfo: { giftId: 2001 }, giftStruct: { name: '小心心' } }),
    ).finish();
    const resp = DyResponse.encode(
      DyResponse.create({
        messagesList: [{ method: 'WebcastLightGiftMessage', payload: lightPayload, msgId: 12 }],
      }),
    ).finish();
    bridge.subs.frame?.(PushFrame.encode(PushFrame.create({ payload: resp })).finish());
    await tick();
    assert.equal(mon.status().giftCount, 2);
    assert.equal(lastItem(mon.status().recent)?.nick, LIGHT_GIFT_NICK);
    assert.equal(lastItem(mon.status().recent)?.text, '小心心');
    mon.stop();
  });

  test('不同普通礼物的 group_id 显式为 0 时不合并', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    bridge.subs.frame?.(
      giftFrame({ giftId: 1, repeatCount: 1, user: { nickName: '观众' }, gift: { name: '玫瑰' } }, 21, true),
    );
    bridge.subs.frame?.(
      giftFrame({ giftId: 2, repeatCount: 1, user: { nickName: '观众' }, gift: { name: '大啤酒' } }, 22, true),
    );
    await tick();

    const gifts = mon.status().recent.filter((item) => item.kind === 'gift');
    assert.deepEqual(
      gifts.map((item) => item.text),
      ['玫瑰', '大啤酒'],
    );
    mon.stop();
  });

  test('CDP 旁听标题/主播：快照初值 + onMeta 更新，stop 清空', async () => {
    const bridge = makeBridge();
    bridge.meta = { title: '老唐操作间', anchor: '老唐' };
    const mon = createDouyinMonitor(makeDeps(bridge));
    const started = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(started.title, '老唐操作间', '启动快照里的标题应进状态');
    assert.equal(started.anchor, '老唐', '启动快照里的主播应进状态');
    bridge.subs.meta?.({ title: '改标题了', anchor: '老唐' });
    assert.equal(mon.status().title, '改标题了', 'onMeta 应刷新标题');
    assert.equal(mon.status().anchor, '老唐');
    bridge.subs.meta?.({ title: '', anchor: '' });
    assert.equal(mon.status().title, '改标题了', '空元数据不应覆盖已读到的标题');
    mon.stop();
    assert.equal(mon.status().title, '', 'stop 后标题应清空');
    assert.equal(mon.status().anchor, '', 'stop 后主播应清空');
  });

  test('CDP 页读不到元数据时 enter 兜底补；enter 空结果不覆盖页面值', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const emptyPage = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(emptyPage, async () => ({
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '999',
        title: 'enter 标题',
        anchor: 'enter 主播',
        loginUid: '',
      })),
    );
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    await tick();
    assert.equal(mon.status().title, 'enter 标题', '页面读不到时 enter 结果应补进状态');
    assert.equal(mon.status().anchor, 'enter 主播');
    mon.stop();

    const fullPage = makeBridge();
    fullPage.meta = { title: '页面标题', anchor: '页面主播' };
    const mon2 = createDouyinMonitor(makeDeps(fullPage));
    await mon2.start({ url: 'https://live.douyin.com/123456789' });
    await tick();
    assert.equal(mon2.status().title, '页面标题', 'enter 空结果不应覆盖页面读到的标题');
    assert.equal(mon2.status().anchor, '页面主播');
    mon2.stop();
  });

  test('enter 兜底失败静默：不影响旁听状态', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new Error('enter API 失败: 风控');
      }),
    );
    const status = await mon.start({ url: 'https://live.douyin.com/123456789' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(status.listening, true);
    assert.equal(mon.status().listening, true, 'enter 抛错不应中断旁听');
    assert.equal(mon.status().lastError, '', 'enter 失败不应写进监听错误');
    mon.stop();
  });

  test('控制帧 status=3 判定下播：自动停听、ended=true、onEnded 只回调一次', async () => {
    const bridge = makeBridge();
    const endedEvents: DouyinMonitorStatus[] = [];
    const mon = createDouyinMonitor({
      ...makeDeps(bridge),
      onEnded: (status) => endedEvents.push(status),
    });
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(mon.status().ended, false, '刚启动不是下播态');

    const controlFrame = (status: number) => {
      const payload = ControlMessage.encode(ControlMessage.create({ status })).finish();
      const resp = DyResponse.encode(
        DyResponse.create({ messagesList: [{ method: 'WebcastControlMessage', payload }] }),
      ).finish();
      return PushFrame.encode(PushFrame.create({ payload: resp })).finish();
    };

    // status=2 是普通状态帧（直播中），不许误判下播
    bridge.subs.frame?.(controlFrame(2));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(mon.status().ended, false, '直播中控制帧不判下播');
    assert.equal(mon.status().listening, true);

    bridge.subs.frame?.(controlFrame(3));
    await new Promise((r) => setTimeout(r, 0));
    const ended = mon.status();
    assert.equal(ended.ended, true, 'status=3 应判定下播');
    assert.equal(ended.listening, false, '下播后应自动停听');
    assert.equal(ended.mode, 'idle');
    assert.match(ended.lastError, /下播/, 'lastError 应写明下播原因');
    assert.equal(bridge.stopped, true, '下播后应停掉 CDP 桥，不再让页面空转重连');
    assert.equal(endedEvents.length, 1, 'onEnded 只回调一次');

    // 再来的帧（含重复的下播帧）不许重复触发
    bridge.subs.frame?.(controlFrame(3));
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(endedEvents.length, 1);

    // 重新开始监听 = 新一场，ended 必须清零
    const restarted = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(restarted.ended, false, '重启监听应清零下播态');
    assert.equal(restarted.listening, true);
    mon.stop();
  });

  test('开播前探活：房间已下播时直接给下播结论，不起内嵌浏览器', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new Error('主播未开播');
      }),
    );
    await assert.rejects(
      // 不带 Cookie 走宽松探活；带 Cookie 的严格校验由下面的 Cookie 用例覆盖。
      () => mon.start({ url: 'https://live.douyin.com/123456789' }),
      /主播已下播（直播结束），等开播后再点开始监听/,
      '应直接报下播，而不是让前端干等超时',
    );
    assert.equal(bridge.starts.length, 0, '已下播不该启动内嵌浏览器');
    const status = mon.status();
    assert.equal(status.ended, true, '状态应落到下播态');
    assert.equal(status.listening, false);
    assert.equal(status.url, 'https://live.douyin.com/123456789', '下播态要带上用户填的房间');
    assert.match(status.lastError, /下播/);

    // 探活超时 / 风控等「状态未知」不该拦住启动：这里用风控错误复跑一次
    const bridge2 = makeBridge();
    const mon2 = createDouyinMonitor(
      makeDeps(bridge2, async () => {
        throw new Error('抖音要求人机验证：请用浏览器打开该直播间完成验证');
      }),
    );
    const started = await mon2.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(started.listening, true, '未知错误应放行，按原链路继续启动');
    mon2.stop();
  });

  test('带 Cookie 启动：服务端回显游客占位 uid（登录态失效）时拦下，不起桥', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => ({
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '',
        title: '',
        anchor: '',
        loginUid: '3677211856479552', // 抖音硬编码的游客占位账号
      })),
    );
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'sessionid=s; uid_tt=123' }),
      /Cookie 登录态已失效/,
    );
    assert.equal(bridge.starts.length, 0, '校验失败不许启动内嵌浏览器');
    assert.equal(mon.status().listening, false);
  });

  test('带 Cookie 启动：Cookie 里没有登录会话键时拦下，提示复制完整 Cookie', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => ({
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '',
        title: '',
        anchor: '',
        loginUid: '3677211856479552',
      })),
    );
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'ttwid=abc' }),
      /Cookie 缺少登录凭证/,
    );
    assert.equal(bridge.starts.length, 0);
  });

  test('带 Cookie 启动：校验请求网络异常（有 CDP 桥）降级放行，不静默丢登录态', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new Error('网络中断');
      }),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/123456789',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.equal(status.listening, true, 'CDP 可用时网络异常不拦启动');
    assert.equal(bridge.starts.length, 1, 'Cookie 仍要注入内嵌窗');
    mon.stop();
  });

  test('带 Cookie 启动：校验请求网络异常（CDP 可用）降级继续监听', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new Error('网络中断');
      }),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/123456789',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.equal(status.listening, true, 'CDP 可用时网络异常不拦启动');
    assert.equal(bridge.starts.length, 1);
    mon.stop();
  });

  test('带 Cookie 启动：房间已下播也先校验 Cookie，失效时报 Cookie 而不是下播', async () => {
    const bridge = makeBridge();
    let calls = 0;
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        calls += 1;
        // 下播时 enter 仍会回显当前用户 uid：这里模拟“被服务端打回游客”。
        throw new DyRoomOfflineError('主播未开播', '3677211856479552');
      }),
    );
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'sessionid=s; uid_tt=123' }),
      /Cookie 登录态已失效/,
      'Cookie 无效应优先于下播提示',
    );
    assert.equal(calls, 2, '首次判下播要再进房确认一次，第二次仍下播才报 Cookie 失效');
    assert.equal(bridge.starts.length, 0, 'Cookie 失败不许启动内嵌浏览器');
    const status = mon.status();
    assert.equal(status.ended, false, 'Cookie 报错时不应同时落成下播态');
    assert.equal(status.listening, false);
    assert.match(status.lastError, /Cookie.*失效/, '状态行要保留 Cookie 失效原因，不能被刷新抹掉');
  });

  test('下播判定二次确认：首次误报未开播、重试在播则继续启动并记录判定字段', async () => {
    const bridge = makeBridge();
    const logs: string[] = [];
    let calls = 0;
    const deps = makeDeps(bridge, async () => {
      calls += 1;
      if (calls === 1) {
        // 切流 / reflow 时抖音会短暂回「未开播」，字段快照要能看出这是瞬时态。
        throw new DyRoomOfflineError('主播未开播', '123', {
          reason: 'not-living',
          roomId: '7710046867756829466',
          status: 4,
          finishTime: 0,
          reflow: true,
          enterRoomStatus: 0,
        });
      }
      return {
        roomInfo: '',
        ttwid: '',
        uniqueId: '',
        cookie: '',
        roomId: '7710046867756829466',
        title: 't',
        anchor: 'a',
        loginUid: '123',
      };
    });
    deps.log = {
      info: noop,
      warn: noop,
      debug: (message = '') => {
        logs.push(message);
        return undefined;
      },
    };
    const mon = createDouyinMonitor(deps);
    const status = await mon.start({
      url: 'https://live.douyin.com/167773402498',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.ok(calls >= 2, '首次未开播应再进房确认一次（CDP 元数据补拉可能再进一次）');
    assert.equal(status.listening, true, '重试在播时应继续启动');
    assert.equal(bridge.starts.length, 1);
    assert.ok(
      logs.some(
        (line) => line.includes('liveness offline #1') && line.includes('status=4') && line.includes('reflow=true'),
      ),
      '首次误报要把判定字段写进 debug 日志',
    );
    mon.stop();
  });

  test('进房接口偶发空响应：状态未知不能当成下播（无 Cookie 放行启动）', async () => {
    const bridge = makeBridge();
    let calls = 0;
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        calls += 1;
        throw new DyLivenessUnknownError();
      }),
    );
    const status = await mon.start({ url: 'https://live.douyin.com/167773402498' });
    assert.ok(calls >= 2, '状态未知也要再试一次');
    assert.equal(status.ended, false, '进房不可用不等于下播');
    assert.equal(status.listening, true, '状态未知按原「探活放行」处理');
    assert.doesNotMatch(status.lastError, /下播/);
    mon.stop();
  });

  test('进房接口偶发空响应（带 Cookie，有 CDP 桥）：降级放行，登录态交给内嵌页', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new DyLivenessUnknownError();
      }),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/167773402498',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.equal(status.listening, true, 'CDP 可用时不因进房风控拦死启动');
    assert.equal(bridge.starts.length, 1);
    assert.equal(status.ended, false, '不能因为进房不可用就落成下播态');
    assert.doesNotMatch(status.lastError, /下播/);
    mon.stop();
  });

  test('进房接口偶发空响应（带 Cookie，CDP 可用）：降级继续监听', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        throw new DyLivenessUnknownError();
      }),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/167773402498',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.equal(status.listening, true, 'CDP 可用时进房接口不可用不拦监听');
    assert.equal(status.ended, false, '不能因为进房不可用就落成下播态');
    assert.equal(bridge.starts.length, 1);
    mon.stop();
  });

  test('带 Cookie 启动：首次进房不可用、重试成功则继续启动', async () => {
    const bridge = makeBridge();
    let calls = 0;
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        calls += 1;
        if (calls === 1) throw new DyLivenessUnknownError();
        return {
          roomInfo: '',
          ttwid: '',
          uniqueId: '',
          cookie: '',
          roomId: '7710046867756829466',
          title: 't',
          anchor: 'a',
          loginUid: '123',
        };
      }),
    );
    const status = await mon.start({
      url: 'https://live.douyin.com/167773402498',
      cookie: 'sessionid=s; uid_tt=123',
    });
    assert.ok(calls >= 2, '空响应应重试一次');
    assert.equal(status.listening, true);
    assert.equal(bridge.starts.length, 1);
    mon.stop();
  });

  test('带 Cookie 启动：房间已下播但 Cookie 有效，确认有效后再报下播', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        // 回显 uid 与 Cookie 自带 uid 一致 = 登录态被服务端认可。
        throw new DyRoomOfflineError('主播未开播', '123');
      }),
    );
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'sessionid=s; uid_tt=123' }),
      /主播已下播（直播结束），等开播后再点开始监听/,
    );
    assert.equal(bridge.starts.length, 0);
    const status = mon.status();
    assert.equal(status.ended, true, 'Cookie 有效时仍应落到下播态');
    assert.equal(status.listening, false);
  });

  test('带 Cookie 启动：结构不全的 Cookie 本地直接拦下，不发进房请求', async () => {
    const bridge = makeBridge();
    let calls = 0;
    const mon = createDouyinMonitor(
      makeDeps(bridge, async () => {
        calls += 1;
        throw new Error('不该被调用');
      }),
    );
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'ttwid=t' }),
      /Cookie 缺少登录凭证/,
    );
    assert.equal(calls, 0, '本地预检失败不该浪费一次进房请求');
    assert.equal(bridge.starts.length, 0);
  });

  test('Helper 内嵌页读元数据：RENDER_DATA 提取 + onMeta 出口 + stop 重置', () => {
    const helperPath = fileURLToPath(
      new URL('../../../../runtime/electron-helper/main/douyin-cdp.js', import.meta.url),
    );
    const src = readFileSync(helperPath, 'utf8');
    assert.match(src, /getElementById\('RENDER_DATA'\)/, '应从内嵌页 RENDER_DATA 读房间信息');
    assert.match(src, /window\.SSR_RENDER_DATA/, '新版页面状态 window.SSR_RENDER_DATA 也要试');
    assert.match(
      src,
      /owner\.nickname \|\| owner\.nick_name \|\| owner\.nickName/,
      '主播昵称字段口径与宿主 roomMeta 一致',
    );
    assert.match(src, /onMeta\(fn\) \{/, '桥应暴露 onMeta 订阅');
    assert.match(src, /state\.title = '';/, 'stop 应重置标题');
    assert.match(src, /state\.anchor = '';/, 'stop 应重置主播');

    // 页面提取脚本本身：假 window/document 直接跑，覆盖新旧状态源与全空回落
    const scriptSrc = src.match(/const DY_META_SCRIPT = `([\s\S]*?)`;/);
    assert.ok(scriptSrc, '应能取到 DY_META_SCRIPT');
    const run = new Function('window', 'document', `return ${scriptSrc![1]}`) as (
      w: unknown,
      d: unknown,
    ) => { title: string; anchor: string };
    const room = { id_str: '1', title: 'T', owner: { nickname: 'A' } };
    const objState = run(
      { SSR_RENDER_DATA: { app: { initialState: { roomStore: { roomInfo: { room } } } } } },
      { getElementById: () => null, querySelector: () => null },
    );
    assert.deepEqual(objState, { title: 'T', anchor: 'A' }, '对象态 SSR_RENDER_DATA 应能提取');
    const strState = run(
      {},
      {
        getElementById: (id: string) =>
          id === 'RENDER_DATA'
            ? {
                textContent: encodeURIComponent(
                  JSON.stringify({
                    roomStore: { roomInfo: { room: { id_str: '2', title: 'T2', owner: { nick_name: 'A2' } } } },
                  }),
                ),
              }
            : null,
        querySelector: () => null,
      },
    );
    assert.deepEqual(strState, { title: 'T2', anchor: 'A2' }, '旧 RENDER_DATA 标签（URL 编码串）应能提取');
    const emptyState = run({}, { getElementById: () => null, querySelector: () => ({ textContent: '  ' }) });
    assert.deepEqual(emptyState, { title: '', anchor: '' }, '全空时应回空串而不是 URL/杂串');
    const titleTagState = run(
      {},
      { getElementById: () => null, querySelector: () => ({ textContent: 'K.B的抖音直播间 - 抖音直播' }) },
    );
    assert.deepEqual(titleTagState, { title: '', anchor: 'K.B' }, '页面标题兜底只取主播，不把整串当房间标题');
  });
});

describe('douyin monitor 被挤下线（页面检测）', () => {
  test('页面显示账号已在其他地方进入直播间 → interrupted=true；恢复后清空', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });

    bridge.subs.pageState?.('kicked');
    const status = mon.status();
    assert.equal(status.interrupted, true, '页面提示被挤即判定被挤下线');
    assert.match(status.lastError, /该账号已在其他设备进入直播间/);

    bridge.subs.pageState?.('');
    assert.equal(mon.status().interrupted, false, '页面恢复正常后撤销');
    assert.equal(mon.status().lastError, '');
    mon.stop();
  });

  test('暂不重连：stop 清 interrupted，但保留原因给状态行', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });

    bridge.subs.pageState?.('kicked');
    assert.equal(mon.status().interrupted, true);

    mon.stop();
    assert.equal(mon.status().interrupted, false);
    assert.match(mon.status().lastError, /该账号已在其他设备进入直播间/);
  });

  test('推送 WS 断开本身不再触发弹框，只认页面检测', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });

    bridge.subs.wsClosed?.('wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/');
    await new Promise((r) => setTimeout(r, 30));

    assert.equal(mon.status().interrupted, false, '没有页面提示就不判被挤下线');
    mon.stop();
  });
});
