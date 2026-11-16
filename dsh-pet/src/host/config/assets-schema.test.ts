/**
 * 包内默认配置（assets/config.jsonc）必须是「设置页可写字段」的超集。
 *
 * 读取侧 {@link mergeEntry} 按 base 的键逐字段合并用户层——键不在 base 就会被**静默丢弃**：
 * 用户改了 voiceRate、填了 breezeApiKey、加了自定义 Breeze 音色，读回来全是默认值，
 * 下一次任何保存还会顺手把它从磁盘抹掉。这里直接拿真实的 assets/config.jsonc 卡住这条不变量，
 * 不再依赖测试里手写的 BASE 副本（那只覆盖到它自己写了的键，正是这类漏加字段的盲区）。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { GLOBAL_DEFAULT_KEYS } from './constants.ts';
import { readJsonc } from './jsonc.ts';
import { readAllConfig } from './read.ts';
import { redactConfigSecrets } from './public.ts';
import { saveUserConfig } from './save.ts';
import type { ConfigPaths } from './constants.ts';

/** 真实的包内默认配置（不是测试里手写的副本）。 */
const DEFAULT_FILE = fileURLToPath(new URL('../../../assets/config.jsonc', import.meta.url));

function realBase(): Record<string, unknown> {
  const base = readJsonc(DEFAULT_FILE);
  assert.ok(base, 'assets/config.jsonc 必须能解析');
  return base as Record<string, unknown>;
}

/** 一套临时路径：内置默认用真实文件，用户层由调用方给。 */
function pathsWithUser(overlay: Record<string, unknown>): ConfigPaths {
  const dir = mkdtempSync(join(tmpdir(), 'blue-fish-assets-schema-'));
  const userFile = join(dir, 'main-config.jsonc');
  writeFileSync(userFile, JSON.stringify(overlay));
  return { defaultFile: DEFAULT_FILE, userFile, petDir: join(dir, 'pet') };
}

test('包内默认配置包含全部全局白名单字段（否则用户层改的值读不回来）', () => {
  const base = realBase();
  for (const key of GLOBAL_DEFAULT_KEYS) {
    assert.ok(key in base, `assets/config.jsonc 缺少 ${key}：读取侧按 base 的键合并，缺键会被静默丢弃`);
  }
});

test('包内默认配置包含各引擎的密钥与模型字段', () => {
  const base = realBase();
  // 密钥不在 GLOBAL_DEFAULT_KEYS（不往种类层下发），但必须留在 main 层的 schema 里。
  for (const key of ['fishApiKey', 'breezeApiKey', 'fishTtsModel']) {
    assert.ok(key in base, `assets/config.jsonc 缺少 ${key}：GET /config 会因此永远看不到这个字段`);
  }
});

test('用户层写了 Breeze 字段与语速，读回来必须原样带出', () => {
  const paths = pathsWithUser({
    voiceProvider: 'breeze',
    voiceName: 'voc_u3nxkd5578wc',
    voiceRate: 1.6,
    breezeApiKey: 'brz_test_key',
    breezeVoices: [{ id: 'voc_mine123', label: '我的鱼' }],
  });
  const main = readAllConfig(paths).main;
  assert.equal(main.voiceProvider, 'breeze');
  assert.equal(main.voiceRate, 1.6, '语速读不回来 = 设置页调了也不生效');
  assert.equal(main.breezeApiKey, 'brz_test_key');
  assert.deepEqual(main.breezeVoices, [{ id: 'voc_mine123', label: '我的鱼' }]);
});

test('GET /config 视图：有 Key 时 hasBreezeApiKey 为 true，且不回传明文', () => {
  const paths = pathsWithUser({ breezeApiKey: 'brz_test_key' });
  const red = redactConfigSecrets(readAllConfig(paths));
  assert.equal(red.main.hasBreezeApiKey, true, '试听前的「请先保存 Breeze API Key」就是按这个布尔拦的');
  assert.equal(JSON.stringify(red).includes('brz_test_key'), false, '明文不得进响应');
});

test('只保存宠物时，Breeze Key 与语速走透传保留（不会被一次保存抹掉）', () => {
  const paths = pathsWithUser({
    voiceProvider: 'breeze',
    voiceRate: 1.6,
    breezeApiKey: 'brz_test_key',
    breezeVoices: [{ id: 'voc_mine123', label: '我的鱼' }],
  });
  const merged = readAllConfig(paths);
  const main = merged.main;
  const pets = main.pets as Record<string, unknown>[];
  // saveUserConfig 的 existing 是「条目对象」（main 那一层），不是整个聚合。
  const saved = saveUserConfig({ pets }, main) as Record<string, unknown> | null;
  assert.ok(saved);
  assert.equal(saved.breezeApiKey, 'brz_test_key');
  assert.equal(saved.voiceRate, 1.6);
  assert.deepEqual(saved.breezeVoices, [{ id: 'voc_mine123', label: '我的鱼' }]);
});

test('保存语速：合法值落盘，越界值直接拒绝', () => {
  const merged = readAllConfig(pathsWithUser({}));
  const main = merged.main;
  const pets = main.pets as Record<string, unknown>[];
  const ok = saveUserConfig({ pets, voiceRate: 1.4 }, main) as Record<string, unknown> | null;
  assert.equal(ok?.voiceRate, 1.4);
  for (const bad of [0.3, 2.5, 'fast', null]) {
    assert.equal(saveUserConfig({ pets, voiceRate: bad }, main), null, `非法语速必须拒绝：${String(bad)}`);
  }
});
