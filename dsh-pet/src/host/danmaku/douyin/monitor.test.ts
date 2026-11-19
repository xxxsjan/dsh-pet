/**
 * 抖音监听器链路接线：CDP 旁听优先、无桥回退直连、stop 清理桥订阅。
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
  } = { frame: null, login: null, closed: null, meta: null };
  const bridge: DouyinCdpBridge & {
    starts: Array<{ url: string; cookie?: string }>;
    stopped: boolean;
    loggedIn: boolean;
    meta: { title: string; anchor: string };
    subs: typeof subs;
  } = {
    starts: [],
    stopped: false,
    loggedIn: false,
    meta: { title: '', anchor: '' },
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
        title: this.meta.title,
        anchor: this.meta.anchor,
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
    getSignBaseUrl: () => undefined,
    getCdpBridge: () => bridge,
    resolvePetId: () => 'main',
    chatWithPet: async () => ({ ok: true }),
    // 默认假进房：空元数据，避免测试打真实网络
    fetchLiveInfo:
      fetchLiveInfo ??
      (async () => ({ roomInfo: '', ttwid: '', uniqueId: '', cookie: '', roomId: '', title: '', anchor: '' })),
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
    await assert.rejects(() => mon.start({ url: 'https://live.douyin.com/123456789' }), /签名桥未就绪/);
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

    // 重启监听 = 新的一场，必须清零；断线重连才保留。
    mon.stop();
    const restarted = await mon.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(restarted.likeCount, 0, '重启监听后清零');
    mon.stop();
  });

  /** 取最后一条（测试 tsconfig 的 lib 还没到 ES2022，不能用 Array.prototype.at）。 */
  const lastItem = <T>(list: T[]): T | undefined => list[list.length - 1];

  /** 组一帧 WebcastGiftMessage 推送（外层 PushFrame + Response 与线上同形）。 */
  function giftFrame(over: Record<string, unknown>, msgId = 1): Uint8Array {
    const payload = GiftMessage.encode(GiftMessage.create(over)).finish();
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
      gift: { name: '大啤酒', combo: true, type: 1 },
    };
    const tick = () => new Promise((r) => setTimeout(r, 0));

    // 连击中间帧（repeatEnd=0）也必须计数：线上定稿帧并不保证会到。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 1, comboCount: 1, repeatEnd: 0 }, 1));
    await tick();
    let status = mon.status();
    assert.equal(status.giftCount, 1, '中间帧也要落地，不能等 repeatEnd=1');
    assert.equal(lastItem(status.recent)?.kind, 'gift');
    assert.equal(lastItem(status.recent)?.count, 1);

    // 同组后续帧：只把同一条的件数抬高，不重复计数、不重复答谢。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 5, comboCount: 5, repeatEnd: 0 }, 2));
    await tick();
    status = mon.status();
    assert.equal(status.giftCount, 1, '同一连击组只算一条');
    assert.equal(status.recent.filter((item) => item.kind === 'gift').length, 1, '只保留一条礼物行');
    assert.equal(lastItem(status.recent)?.count, 5, '件数原地抬高');

    // 定稿帧到达：件数不再变化，也不重复答谢。
    bridge.subs.frame?.(giftFrame({ ...combo, repeatCount: 5, comboCount: 5, repeatEnd: 1 }, 3));
    await tick();
    assert.equal(mon.status().giftCount, 1);
    assert.equal(thanks.length, 1, '答谢只发一次');
    assert.equal(thanks[0]?.kind, 'gift');
    mon.stop();
  });

  test('非连击礼物一条消息一行；轻礼物也进 feed', async () => {
    const bridge = makeBridge();
    const mon = createDouyinMonitor(makeDeps(bridge));
    await mon.start({ url: 'https://live.douyin.com/123456789' });
    const tick = () => new Promise((r) => setTimeout(r, 0));

    bridge.subs.frame?.(
      giftFrame({ giftId: 1, repeatCount: 2, repeatEnd: 1, user: { nickName: '观众' }, gift: { name: '玫瑰' } }, 11),
    );
    await tick();
    assert.equal(mon.status().giftCount, 1);
    assert.equal(lastItem(mon.status().recent)?.text, '玫瑰');
    assert.equal(lastItem(mon.status().recent)?.count, 2);

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
      () => mon.start({ url: 'https://live.douyin.com/123456789', cookie: 'ttwid=abc' }),
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
