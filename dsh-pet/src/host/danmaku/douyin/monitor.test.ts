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
import type { DouyinMonitorDeps } from './monitor.ts';
import type { DouyinCdpBridge } from './cdp-bridge.ts';

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
    await assert.rejects(
      () => mon.start({ url: 'https://live.douyin.com/123456789' }),
      /签名桥未就绪/,
    );
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
        roomInfo: '', ttwid: '', uniqueId: '', cookie: '', roomId: '999', title: 'enter 标题', anchor: 'enter 主播',
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

  test('Helper 内嵌页读元数据：RENDER_DATA 提取 + onMeta 出口 + stop 重置', () => {
    const helperPath = fileURLToPath(
      new URL('../../../../runtime/electron-helper/main/douyin-cdp.js', import.meta.url),
    );
    const src = readFileSync(helperPath, 'utf8');
    assert.match(src, /getElementById\('RENDER_DATA'\)/, '应从内嵌页 RENDER_DATA 读房间信息');
    assert.match(src, /window\.SSR_RENDER_DATA/, '新版页面状态 window.SSR_RENDER_DATA 也要试');
    assert.match(src, /owner\.nickname \|\| owner\.nick_name \|\| owner\.nickName/, '主播昵称字段口径与宿主 roomMeta 一致');
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
            ? { textContent: encodeURIComponent(JSON.stringify({ roomStore: { roomInfo: { room: { id_str: '2', title: 'T2', owner: { nick_name: 'A2' } } } } })) }
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
