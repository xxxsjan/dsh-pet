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
  const domReady: Array<() => void> = [];
  const closeHandlers: Array<(event: { preventDefault: () => void }) => void> = [];
  const sendCommands: string[] = [];
  const scripts: string[] = [];
  let hideCalls = 0;
  let reloads = 0;
  let body: { body: string; base64Encoded: boolean } | null = null;
  let pageState = '';
  const contents = {
    debugger: {
      on: (ev: string, fn: (e: unknown, method: string, params: Record<string, unknown>) => void) => {
        if (ev === 'message') handlers.push(fn);
      },
      attach: noop,
      detach: noop,
      isAttached: () => true,
      sendCommand: async (method: string) => {
        sendCommands.push(method);
        if (method === 'Network.getResponseBody') return body;
        return {};
      },
    },
    // SSR 状态读不到（对齐实测壳页）：页面提取回空
    executeJavaScript: async (script: string) => {
      scripts.push(String(script));
      if (String(script).includes('已退出直播间，无法评论')) return pageState;
      return { title: '', anchor: '' };
    },
    reload: () => {
      reloads += 1;
    },
    on: (ev: string, fn: () => void) => {
      if (ev === 'dom-ready') domReady.push(fn);
    },
  };
  const win = {
    webContents: contents,
    isDestroyed: () => false,
    destroy: noop,
    show: noop,
    hide: () => {
      hideCalls += 1;
    },
    focus: noop,
    on: (ev: string, fn: (event: { preventDefault: () => void }) => void) => {
      if (ev === 'close') closeHandlers.push(fn);
    },
    loadURL: async () => undefined,
  };
  return {
    win,
    emit: (method: string, params: Record<string, unknown>) => {
      for (const fn of handlers) fn(null, method, params);
    },
    fireDomReady: () => {
      for (const fn of domReady) fn();
    },
    fireClose: () => {
      let prevented = false;
      const event = {
        preventDefault: () => {
          prevented = true;
        },
      };
      for (const fn of closeHandlers) fn(event);
      return prevented;
    },
    sendCommands,
    scripts,
    hideCalls: () => hideCalls,
    reloads: () => reloads,
    setBody: (b: { body: string; base64Encoded: boolean }) => {
      body = b;
    },
    setPageState: (value: string) => {
      pageState = value;
    },
  };
}

function makeBridge(
  fake: ReturnType<typeof makeFakeWin>,
  cookieNames: string[] = [],
  opts: { pushReconnect?: boolean } = {},
) {
  class FakeBrowserWindow {
    constructor() {
      return fake.win as unknown as FakeBrowserWindow;
    }
  }
  const electronSession = {
    fromPartition: () => ({
      cookies: {
        get: async () => cookieNames.map((name) => ({ name, value: 'v' })),
        set: async () => undefined,
      },
    }),
  };
  return startDouyinCdpBridge({
    BrowserWindow: FakeBrowserWindow,
    electronSession,
    log: { info: noop, warn: noop, debug: noop },
    // 测试用很短的宽限期，避免等 6 秒。
    pushReconnectDelayMs: 5,
    ...opts,
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
      body: JSON.stringify({
        status_code: 0,
        data: { room: { id_str: '77', title: '真实房间标题', owner: { nickname: 'K.B' } } },
      }),
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
    const json = JSON.stringify({
      data: { data: [{ room: { id_str: '8', title: 'T2', owner: { nick_name: 'A2' } } }] },
    });
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
describe('douyin CDP 桥：开发调试可见模式', () => {
  const KILL_MARK = 'removeAttribute("src")';

  test('debugVisible：窗口保持可见，视频照样拦流 + 周期暂停，弹幕页面保持可用', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake, ['sessionid']);
    await bridge.start({ url: 'https://live.douyin.com/123456789', debugVisible: true });
    fake.fireDomReady();
    await tick();

    assert.ok(fake.sendCommands.includes('Network.setBlockedURLs'), '调试模式也要拦视频流');
    assert.ok(!fake.scripts.some((s) => s.includes(KILL_MARK)), '不得删播放器 / 改媒体 src');
    assert.ok(
      fake.scripts.some((s) => s.includes('el.pause()')),
      '应周期暂停视频',
    );
    assert.ok(
      fake.scripts.some((s) => s.includes('el.readyState<2')),
      '暂停要等首帧，避免黑屏',
    );
    assert.equal(fake.hideCalls(), 0, '已登录也不得隐藏窗口');
    assert.equal(bridge.status().visible, true, '状态应保持可见');
    bridge.stop();
  });

  test('默认省流模式：拦直播流、保留播放器并隐藏窗口', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake, ['sessionid']);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    fake.fireDomReady();
    await tick();

    assert.ok(fake.sendCommands.includes('Network.setBlockedURLs'), '默认模式应拦直播流');
    assert.ok(!fake.scripts.some((s) => s.includes(KILL_MARK)), '默认模式也不得删播放器，便于随时开窗查看');
    assert.ok(
      fake.scripts.some((s) => s.includes('el.pause()')),
      '默认模式也应周期暂停',
    );
    assert.equal(fake.hideCalls(), 1, '登录态下应隐藏窗口');
    bridge.stop();
  });

  test('用户关窗只转隐藏，不销毁、不上报旁听中断（普通模式也一样）', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake, ['sessionid']);
    let closedEvents = 0;
    bridge.onClosed(() => {
      closedEvents += 1;
    });
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    // 普通启动是隐藏态，先显示再模拟用户点 X
    bridge.setVisible(true);
    assert.equal(bridge.status().visible, true);

    const prevented = fake.fireClose();
    assert.equal(prevented, true, '关窗应被拦下');
    assert.equal(bridge.status().visible, false, '关窗后按隐藏处理');
    assert.equal(bridge.status().running, true, '页面与旁听保持');
    assert.equal(closedEvents, 0, '不应上报窗口关闭中断');
    bridge.stop();
  });

  test('setVisible 只切窗口显隐，不注入省流脚本', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake, ['sessionid']);
    await bridge.start({ url: 'https://live.douyin.com/123456789', debugVisible: true });
    await tick();
    const scriptsBefore = fake.scripts.length;

    bridge.setVisible(false);
    assert.equal(fake.hideCalls(), 1);
    assert.equal(bridge.status().visible, false);
    bridge.setVisible(true);
    assert.equal(bridge.status().visible, true);
    assert.equal(fake.scripts.length, scriptsBefore, '显隐窗口不得执行任何注入脚本');
    bridge.stop();
  });
});

describe('douyin CDP 桥：页面状态探测', () => {
  test('页面显示「账号已在其他地方进入直播间」时上报 pageState=kicked 并广播', async () => {
    const fake = makeFakeWin();
    fake.setPageState('kicked');
    const bridge = makeBridge(fake);
    const states: string[] = [];
    bridge.onPageState((state) => states.push(state));
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    await tick();

    assert.equal(bridge.status().pageState, 'kicked');
    assert.deepEqual(states, ['kicked'], '状态变化应广播给宿主');
    bridge.stop();
    assert.equal(bridge.status().pageState, '', 'stop 后清空页面状态');
  });

  test('普通页面保持空状态，不影响监听', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    await tick();

    assert.equal(bridge.status().pageState, '');
    assert.equal(bridge.status().running, true);
    bridge.stop();
  });
});

describe('douyin CDP 桥：弹幕 WS 关闭上报', () => {
  test('只上报 /webcast/im/push/ 的关闭，其它 WS 与重复关闭都忽略', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    const closed: string[] = [];
    bridge.onWsClosed((url: string) => closed.push(url));
    await bridge.start({ url: 'https://live.douyin.com/123456789' });

    fake.emit('Network.webSocketCreated', {
      requestId: 'w1',
      url: 'wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/?room_id=1',
    });
    fake.emit('Network.webSocketCreated', { requestId: 'w2', url: 'wss://mon.zijieapi.com/ws/v2' });
    fake.emit('Network.webSocketClosed', { requestId: 'w2' });
    assert.deepEqual(closed, [], '非弹幕 WS 关闭不上报');

    fake.emit('Network.webSocketClosed', { requestId: 'w1' });
    assert.equal(closed.length, 1);
    assert.match(closed[0] ?? '', /webcast\/im\/push/);

    // 同一 rid 的重复关闭不再上报（映射已删除），避免重复触发恢复窗口。
    fake.emit('Network.webSocketClosed', { requestId: 'w1' });
    assert.equal(closed.length, 1);
    bridge.stop();
  });

  test('推送 WS 断开且页面没重建 → 宽限期后自动重载直播页', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    fake.emit('Network.webSocketCreated', {
      requestId: 'w1',
      url: 'wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/?room_id=1',
    });
    fake.emit('Network.webSocketClosed', { requestId: 'w1' });
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(fake.reloads() >= 1, '没有新推送连接应重载页面');
    bridge.stop();
  });

  test('断开后页面自己重建推送连接 → 撤销自动重载', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    fake.emit('Network.webSocketCreated', { requestId: 'w1', url: 'wss://x/webcast/im/push/v2/' });
    fake.emit('Network.webSocketClosed', { requestId: 'w1' });
    fake.emit('Network.webSocketCreated', { requestId: 'w2', url: 'wss://y/webcast/im/push/v2/' });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fake.reloads(), 0, '页面自己重建后不应重载');
    bridge.stop();
  });

  test('关闭 pushReconnect 后断线不自动重载页面', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake, [], { pushReconnect: false });
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    fake.emit('Network.webSocketCreated', {
      requestId: 'w1',
      url: 'wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/?room_id=1',
    });
    fake.emit('Network.webSocketClosed', { requestId: 'w1' });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(fake.reloads(), 0, '关闭后不得自动重载');
    assert.equal(bridge.status().running, true, '监听本身保持运行，等用户手动重连');
    bridge.stop();
  });

  test('连续断开最多自动重载 3 次，避免被挤时无限刷新', async () => {
    const fake = makeFakeWin();
    const bridge = makeBridge(fake);
    await bridge.start({ url: 'https://live.douyin.com/123456789' });
    for (let i = 0; i < 4; i += 1) {
      fake.emit('Network.webSocketCreated', { requestId: `w${i}`, url: 'wss://x/webcast/im/push/v2/' });
      fake.emit('Network.webSocketClosed', { requestId: `w${i}` });
      await new Promise((r) => setTimeout(r, 30));
    }
    assert.equal(fake.reloads(), 3);
    bridge.stop();
  });
});
