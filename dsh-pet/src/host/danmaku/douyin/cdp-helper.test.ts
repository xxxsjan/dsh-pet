/**
 * 抖音 CDP 桥元数据链路行为测试：页面自己 enter 请求的响应体是标题/主播最稳来源。
 *
 * 背景：抖音页面改版后 SSR 状态里 roomInfo 为空（实测壳页），旧 RENDER_DATA 标签也不存在；
 * 内嵌窗带 Cookie 自己发的 enter 请求必然成功，且已经过我们 attach 的 Network 域——
 * 截 responseReceived/loadingFinished 取 body 即可，不再额外发请求、不暴露风控。
 * 用假 BrowserWindow/debugger 从桥公共接口（start/status/onMeta/stop）验证整条链。
 * @module dsh-pet/src/host/danmaku/douyin/cdp-helper.test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { startDouyinCdpBridge } = require('../../../../runtime/electron-helper/main/douyin-cdp.js');

const noop = () => undefined;
const tick = () => new Promise((r) => setTimeout(r, 0));

type Meta = { title: string; anchor: string };

/** 假内嵌窗：debugger message 可手动触发，getResponseBody 返回预置 body。 */
function makeFakeWin() {
  const handlers: Array<(e: unknown, method: string, params: Record<string, unknown>) => void> = [];
  let body: { body: string; base64Encoded: boolean } | null = null;
  const contents = {
    debugger: {
      on: (ev: string, fn: (e: unknown, method: string, params: Record<string, unknown>) => void) => {
        if (ev === 'message') handlers.push(fn);
      },
      attach: noop,
      detach: noop,
      isAttached: () => true,
      sendCommand: async (method: string) => {
        if (method === 'Network.getResponseBody') return body;
        return {};
      },
    },
    // SSR 状态读不到（对齐实测壳页）：页面提取回空
    executeJavaScript: async () => ({ title: '', anchor: '' }),
    on: noop,
  };
  const win = {
    webContents: contents,
    isDestroyed: () => false,
    destroy: noop,
    show: noop,
    hide: noop,
    focus: noop,
    on: noop,
    loadURL: async () => undefined,
  };
  return {
    win,
    emit: (method: string, params: Record<string, unknown>) => {
      for (const fn of handlers) fn(null, method, params);
    },
    setBody: (b: { body: string; base64Encoded: boolean }) => {
      body = b;
    },
  };
}

function makeBridge(fake: ReturnType<typeof makeFakeWin>) {
  class FakeBrowserWindow {
    constructor() {
      return fake.win as unknown as FakeBrowserWindow;
    }
  }
  const electronSession = {
    fromPartition: () => ({ cookies: { get: async () => [], set: async () => undefined } }),
  };
  return startDouyinCdpBridge({
    BrowserWindow: FakeBrowserWindow,
    electronSession,
    log: { info: noop, warn: noop, debug: noop },
  });
}

const ENTER_URL = 'https://live.douyin.com/webcast/room/web/enter/?aid=6383&web_rid=123456789';

describe('douyin CDP 桥：enter 响应截取的元数据链路', () => {
  test('页面 enter 响应（data.room）补标题/主播并广播 onMeta', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    const metas: Meta[] = [];
    bridge.onMeta((m: Meta) => metas.push(m));
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    assert.equal(bridge.status().title, '', 'SSR 读不到时初始应为空');
    fake.setBody({
      body: JSON.stringify({ status_code: 0, data: { room: { id_str: '77', title: '真实房间标题', owner: { nickname: 'K.B' } } } }),
      base64Encoded: false,
    });
    fake.emit('Network.responseReceived', { requestId: 'r1', response: { url: ENTER_URL } });
    fake.emit('Network.loadingFinished', { requestId: 'r1' });
    await tick();
    assert.equal(bridge.status().title, '真实房间标题');
    assert.equal(bridge.status().anchor, 'K.B');
    assert.ok(metas.length >= 1, '应广播 onMeta');
    bridge.stop();
    assert.equal(bridge.status().title, '', 'stop 应清空');
  });

  test('base64 body 与 data.data 列表形状同样能取；空标题不覆盖已有值', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    const json = JSON.stringify({ data: { data: [{ room: { id_str: '8', title: 'T2', owner: { nick_name: 'A2' } } }] } });
    fake.setBody({ body: Buffer.from(json, 'utf8').toString('base64'), base64Encoded: true });
    fake.emit('Network.responseReceived', { requestId: 'r2', response: { url: ENTER_URL } });
    fake.emit('Network.loadingFinished', { requestId: 'r2' });
    await tick();
    assert.equal(bridge.status().title, 'T2');
    assert.equal(bridge.status().anchor, 'A2');
    // 第二次 enter：标题空、主播新 → 标题保留、主播更新
    fake.setBody({
      body: JSON.stringify({ data: { room: { id_str: '9', title: '', owner: { nickname: '新主播' } } } }),
      base64Encoded: false,
    });
    fake.emit('Network.responseReceived', { requestId: 'r3', response: { url: ENTER_URL } });
    fake.emit('Network.loadingFinished', { requestId: 'r3' });
    await tick();
    assert.equal(bridge.status().title, 'T2', '空标题不应覆盖');
    assert.equal(bridge.status().anchor, '新主播');
    bridge.stop();
  });

  test('非 enter 请求与坏 body 静默跳过，不影响旁听 running', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    fake.setBody({ body: 'not-json', base64Encoded: false });
    fake.emit('Network.responseReceived', { requestId: 'x1', response: { url: ENTER_URL } });
    fake.emit('Network.loadingFinished', { requestId: 'x1' });
    fake.emit('Network.responseReceived', { requestId: 'x2', response: { url: 'https://live.douyin.com/other/api' } });
    fake.emit('Network.loadingFinished', { requestId: 'x2' });
    await tick();
    assert.equal(bridge.status().title, '');
    assert.equal(bridge.status().anchor, '');
    assert.equal(bridge.status().running, true);
    bridge.stop();
  });
});