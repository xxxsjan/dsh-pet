/**
 * POST /obs-capture（OBS 窗口捕获开关）的契约测试。
 *
 * 三条契约：
 *   1. 合法布尔写进用户主配置，并触发 requestRestart；
 *   2. 非法体 / 非 POST 走业务或协议失败，不写盘、不重启；
 *   3. 只动 obsCaptureEnabled，不抹掉同文件其它顶层字段。
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { setObsCapture } from './obs-capture.ts';
import type { PetRouteDeps, RouteInput } from '../types.ts';
import type { RouteResult } from '../../http.ts';

const DEFAULT_FILE = fileURLToPath(new URL('../../../../assets/config.jsonc', import.meta.url));

const pet = {
  id: 'main',
  name: 'main',
  size: 300,
  balanceEnabled: false,
  whisperEnabled: false,
  workStatusEnabled: false,
  fixedEnabled: false,
  display: 'desktop',
  position: { corner: 'top-right', marginX: 10, marginY: 10 },
};

let root = '';
let savedHome: string | undefined;

function makeHarness(): { deps: PetRouteDeps; userFile: string; restarts: { n: number } } {
  const userFile = join(root, 'main-config.jsonc');
  const restarts = { n: 0 };
  const deps = {
    configPaths: { defaultFile: DEFAULT_FILE, userFile, petDir: join(root, 'pet') },
    userConfigPath: userFile,
    userRoot: root,
    petConfigDir: join(root, 'pet'),
    state: { writeSection: () => {} },
    requestRestart: async () => {
      restarts.n += 1;
    },
  } as unknown as PetRouteDeps;
  return { deps, userFile, restarts };
}

const input = (body: unknown, method = 'POST'): RouteInput => ({
  url: new URL('http://localhost/pet-233/obs-capture'),
  rest: 'obs-capture',
  method,
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

function jsonOf(res: RouteResult): { status: number; obj: Record<string, unknown> } {
  if (res.kind !== 'json') throw new Error('期望 JSON 应答，实际是 ' + res.kind);
  return { status: res.status, obj: res.obj as Record<string, unknown> };
}

before(() => {
  savedHome = process.env.DSH_HOME;
  root = mkdtempSync(join(tmpdir(), 'dsh-pet-obs-capture-'));
  process.env.DSH_HOME = root;
});

after(() => {
  if (savedHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = savedHome;
  rmSync(root, { recursive: true, force: true });
});

describe('POST /obs-capture', () => {
  test('合法布尔写盘并重启', async () => {
    const { deps, userFile, restarts } = makeHarness();
    writeFileSync(userFile, JSON.stringify({ pets: [pet], trayEnabled: true, whisperPrompt: 'keep me' }), 'utf8');
    const { status, obj } = jsonOf(await setObsCapture(deps, input({ enabled: true })));
    assert.equal(status, 200);
    assert.equal(obj.ok, undefined); // 成功实体是成品聚合，没有 ok:false
    assert.equal(restarts.n, 1);
    const saved = JSON.parse(readFileSync(userFile, 'utf8')) as Record<string, unknown>;
    assert.equal(saved.obsCaptureEnabled, true);
    assert.equal(saved.whisperPrompt, 'keep me', '透传保留其它顶层字段');
    assert.equal(saved.trayEnabled, true);
  });

  test('enabled 非布尔 → 200 + bad-request，不写盘', async () => {
    const { deps, userFile, restarts } = makeHarness();
    writeFileSync(userFile, JSON.stringify({ pets: [pet] }), 'utf8');
    const before = readFileSync(userFile, 'utf8');
    const { status, obj } = jsonOf(await setObsCapture(deps, input({ enabled: 'yes' })));
    assert.equal(status, 200);
    assert.equal(obj.ok, false);
    assert.equal(obj.reason, 'bad-request');
    assert.equal(restarts.n, 0);
    assert.equal(readFileSync(userFile, 'utf8'), before);
  });

  test('非 POST → method-not-allowed', async () => {
    const { deps, restarts } = makeHarness();
    const { status, obj } = jsonOf(await setObsCapture(deps, input({ enabled: true }, 'GET')));
    assert.equal(status, 405);
    assert.equal(obj.reason, 'method-not-allowed');
    assert.equal(restarts.n, 0);
  });

  test('坏 JSON → invalid-json', async () => {
    const { deps, restarts } = makeHarness();
    const { status, obj } = jsonOf(await setObsCapture(deps, input('{', 'POST')));
    assert.equal(status, 400);
    assert.equal(obj.reason, 'invalid-json');
    assert.equal(restarts.n, 0);
  });
});
