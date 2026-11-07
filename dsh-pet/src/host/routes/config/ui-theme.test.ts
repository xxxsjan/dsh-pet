/**
 * /ui-theme（设置页主题偏好）的契约测试。
 *
 * 关键契约：
 *   1. 缺文件、坏 JSON、未知取值都回落 light，主题坏了不能让设置页不可用；
 *   2. POST 合法值落盘后可被 GET 读回，且写入不触发配置重启（切主题不该让桌宠闪）；
 *   3. 非法取值 / 非支持方法走业务或协议失败，不写盘。
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleUiTheme } from './ui-theme.ts';
import type { PetRouteDeps, RouteInput } from '../types.ts';
import type { RouteResult } from '../../http.ts';

let root = '';

function makeDeps(): { deps: PetRouteDeps; restarts: { n: number } } {
  const restarts = { n: 0 };
  const deps = {
    userRoot: root,
    state: { writeSection: () => {} },
    requestRestart: async () => {
      restarts.n += 1;
    },
  } as unknown as PetRouteDeps;
  return { deps, restarts };
}

const input = (body: unknown, method = 'POST'): RouteInput => ({
  url: new URL('http://localhost/blue-fish/ui-theme'),
  rest: 'ui-theme',
  method,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

function jsonOf(res: RouteResult): { status: number; obj: Record<string, unknown> } {
  if (res.kind !== 'json') throw new Error('期望 JSON 应答，实际是 ' + res.kind);
  return { status: res.status, obj: res.obj as Record<string, unknown> };
}

before(() => {
  root = mkdtempSync(join(tmpdir(), 'blue-fish-ui-theme-'));
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('/ui-theme', () => {
  test('缺文件时 GET 回落 light，并标记 saved=false', async () => {
    const { deps } = makeDeps();
    const { status, obj } = jsonOf(await handleUiTheme(deps, input(undefined, 'GET')));
    assert.equal(status, 200);
    assert.equal(obj.theme, 'light');
    assert.equal(obj.saved, false, '没存过，让设置页迁移浏览器里的旧选择');
  });

  test('POST dark 落盘、GET 读回，且不重启 Helper', async () => {
    const { deps, restarts } = makeDeps();
    const { status } = jsonOf(await handleUiTheme(deps, input({ theme: 'dark' })));
    assert.equal(status, 200);
    assert.equal(restarts.n, 0, '切主题不重启桌宠');
    const saved = JSON.parse(readFileSync(join(root, 'ui-theme.json'), 'utf8')) as { theme?: string };
    assert.equal(saved.theme, 'dark');
    const readBack = jsonOf(await handleUiTheme(deps, input(undefined, 'GET')));
    assert.equal(readBack.obj.theme, 'dark');
    assert.equal(readBack.obj.saved, true);
  });

  test('坏 JSON 回落 light 而不是报错', async () => {
    const { deps } = makeDeps();
    writeFileSync(join(root, 'ui-theme.json'), '{', 'utf8');
    const { status, obj } = jsonOf(await handleUiTheme(deps, input(undefined, 'GET')));
    assert.equal(status, 200);
    assert.equal(obj.theme, 'light');
    assert.equal(obj.saved, false);
  });

  test('非法取值 → bad-request 且不写盘', async () => {
    const { deps, restarts } = makeDeps();
    const file = join(root, 'ui-theme.json');
    const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
    const { status, obj } = jsonOf(await handleUiTheme(deps, input({ theme: 'blue' })));
    assert.equal(status, 200);
    assert.equal(obj.ok, false);
    assert.equal(obj.reason, 'bad-request');
    assert.equal(restarts.n, 0);
    const after = existsSync(file) ? readFileSync(file, 'utf8') : '';
    assert.equal(after, before, '非法值不落盘');
  });

  test('非 GET/POST → method-not-allowed', async () => {
    const { deps } = makeDeps();
    const { status, obj } = jsonOf(await handleUiTheme(deps, input(undefined, 'PUT')));
    assert.equal(status, 405);
    assert.equal(obj.reason, 'method-not-allowed');
  });

  test('坏请求体 → invalid-json', async () => {
    const { deps } = makeDeps();
    const { status, obj } = jsonOf(await handleUiTheme(deps, input('{')));
    assert.equal(status, 400);
    assert.equal(obj.reason, 'invalid-json');
  });
});
