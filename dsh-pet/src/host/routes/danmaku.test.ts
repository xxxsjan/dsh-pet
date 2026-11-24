/**
 * 弹幕路由的平台互斥契约测试。
 *
 * 口径：同一时刻只允许一个直播间在采集。启动某平台前，路由先停止其余三个平台
 * 监听并回写各自状态段；当前平台自身不被 stop。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { handleDanmakuRoutes } from './danmaku.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';
import type { RouteResult } from '../http.ts';

type Monitor = {
  calls: { stop: number; start: number; setOptions: number; showCenter: number; setWindowVisible: number };
  lastStart: Array<Record<string, unknown> | undefined>;
  lastWindow: boolean[];
  status: () => Record<string, unknown>;
  stop: () => Record<string, unknown>;
  start: (input?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  setOptions: () => Record<string, unknown>;
  setWindowVisible: (visible: boolean) => Record<string, unknown>;
  showCenter: () => Record<string, unknown>;
};

function makeMonitor(source: string): Monitor {
  const calls = { stop: 0, start: 0, setOptions: 0, showCenter: 0, setWindowVisible: 0 };
  const lastStart: Array<Record<string, unknown> | undefined> = [];
  const lastWindow: boolean[] = [];
  return {
    calls,
    lastStart,
    lastWindow,
    status: () => ({ listening: false, source }),
    stop: () => {
      calls.stop += 1;
      return { listening: false, source };
    },
    start: async (input) => {
      calls.start += 1;
      lastStart.push(input);
      return { listening: true, source };
    },
    setOptions: () => {
      calls.setOptions += 1;
      return { listening: false, source };
    },
    setWindowVisible: (visible: boolean) => {
      calls.setWindowVisible += 1;
      lastWindow.push(visible);
      return { listening: true, source };
    },
    showCenter: () => {
      calls.showCenter += 1;
      return { listening: true, source };
    },
  };
}

function makeHarness(): {
  deps: PetRouteDeps;
  monitors: Record<'douyin' | 'xiaohongshu' | 'kuaishou' | 'bilibili', Monitor>;
  sections: Array<[string, unknown]>;
} {
  const monitors = {
    douyin: makeMonitor('douyin'),
    xiaohongshu: makeMonitor('xiaohongshu'),
    kuaishou: makeMonitor('kuaishou'),
    bilibili: makeMonitor('bilibili'),
  };
  const sections: Array<[string, unknown]> = [];
  const deps = {
    state: { writeSection: (name: string, data: unknown) => sections.push([name, data]) },
    log: { warn: () => {} },
    douyinDanmaku: monitors.douyin,
    xiaohongshuDanmaku: monitors.xiaohongshu,
    kuaishouDanmaku: monitors.kuaishou,
    bilibiliDanmaku: monitors.bilibili,
  } as unknown as PetRouteDeps;
  return { deps, monitors, sections };
}

function input(rest: string, body: unknown, method = 'POST'): RouteInput {
  return {
    url: new URL(`http://localhost/blue-fish/${rest}`),
    rest,
    method,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function jsonOf(res: RouteResult | undefined): { status: number; obj: Record<string, unknown> } {
  assert.ok(res, '路由应命中弹幕分支');
  assert.equal(res.kind, 'json', `期望 JSON 应答，实际是 ${res.kind}`);
  return { status: res.status, obj: res.obj as Record<string, unknown> };
}

test('启动抖音：停止小红书 / 快手 / B 站，抖音自身不被 stop', async () => {
  const { deps, monitors } = makeHarness();
  const { status, obj } = jsonOf(
    await handleDanmakuRoutes(deps, input('danmaku/douyin/start', { url: '123' })),
  );
  assert.equal(status, 200);
  assert.equal(obj.listening, true);

  assert.equal(monitors.douyin.calls.stop, 0, '当前平台不应被自己停止');
  assert.equal(monitors.douyin.calls.start, 1, '当前平台应被启动');
  assert.equal(monitors.xiaohongshu.calls.stop, 1, '其余平台应先被停止');
  assert.equal(monitors.kuaishou.calls.stop, 1, '其余平台应先被停止');
  assert.equal(monitors.bilibili.calls.stop, 1, '其余平台应先被停止');
});

test('抖音调试可见开关：布尔值透传，非布尔按 bad-request 拒绝', async () => {
  const { deps, monitors } = makeHarness();
  const okRes = jsonOf(
    await handleDanmakuRoutes(deps, input('danmaku/douyin/start', { url: '123', debugVisible: true })),
  );
  assert.equal(okRes.status, 200);
  assert.equal(monitors.douyin.lastStart.at(-1)?.debugVisible, true, '布尔值应透传给监听器');

  const badRes = jsonOf(
    await handleDanmakuRoutes(deps, input('danmaku/douyin/start', { url: '123', debugVisible: 'yes' })),
  );
  assert.equal(badRes.obj.ok, false);
  assert.equal(badRes.obj.reason, 'bad-request');
  assert.equal(monitors.douyin.calls.start, 1, '非法参数不应再次启动');
});

test('抖音窗口显隐：布尔值透传，非布尔按 bad-request 拒绝', async () => {
  const { deps, monitors, sections } = makeHarness();
  const okRes = jsonOf(await handleDanmakuRoutes(deps, input('danmaku/douyin/window', { visible: false })));
  assert.equal(okRes.status, 200);
  assert.deepEqual(monitors.douyin.lastWindow, [false], '布尔值应透传给监听器');
  assert.ok(sections.some(([name]) => name === 'danmaku'), '应回写弹幕状态段');

  const badRes = jsonOf(await handleDanmakuRoutes(deps, input('danmaku/douyin/window', { visible: 'yes' })));
  assert.equal(badRes.obj.ok, false);
  assert.equal(badRes.obj.reason, 'bad-request');
  assert.equal(monitors.douyin.calls.setWindowVisible, 1, '非法参数不应再触窗');
});

test('启动 B 站：停止抖音 / 小红书 / 快手，B 站自身不被 stop', async () => {
  const { deps, monitors } = makeHarness();
  const { status, obj } = jsonOf(
    await handleDanmakuRoutes(deps, input('danmaku/bilibili/start', { url: '456' })),
  );
  assert.equal(status, 200);
  assert.equal(obj.listening, true);

  assert.equal(monitors.bilibili.calls.stop, 0, '当前平台不应被自己停止');
  assert.equal(monitors.bilibili.calls.start, 1, '当前平台应被启动');
  assert.equal(monitors.douyin.calls.stop, 1, '其余平台应先被停止');
  assert.equal(monitors.xiaohongshu.calls.stop, 1, '其余平台应先被停止');
  assert.equal(monitors.kuaishou.calls.stop, 1, '其余平台应先被停止');
});

test('互斥停止会回写其余三个状态段，当前段由 start 结果回写', async () => {
  const { deps, sections } = makeHarness();
  await handleDanmakuRoutes(deps, input('danmaku/kuaishou/start', { url: '789' }));
  const written = sections.map(([name]) => name);
  // 先停其余三段，再写当前快手段
  assert.deepEqual(
    written.sort(),
    ['bili-danmaku', 'danmaku', 'ks-danmaku', 'xhs-danmaku'].sort(),
  );
});

test('小红书 show-center：唤起内嵌中控台窗口并回写状态段', async () => {
  const { deps, monitors, sections } = makeHarness();
  const { status, obj } = jsonOf(await handleDanmakuRoutes(deps, input('danmaku/xiaohongshu/show-center', {})));
  assert.equal(status, 200);
  assert.equal(obj.source, 'xiaohongshu');
  assert.equal(monitors.xiaohongshu.calls.showCenter, 1);
  assert.deepEqual(
    sections.map(([name]) => name),
    ['xhs-danmaku'],
  );
});
