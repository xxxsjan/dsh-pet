/**
 * 设置页静态资源热读（src/standalone/settings-assets.ts）的契约测试。
 * @module dsh-pet/src/standalone/settings-assets.test
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { loadSettingsAssets, type SettingsAssetsCache } from './settings-assets.ts';
import { settingsPage, settingsScript, settingsStyle } from './settings-page.ts';

const fallback = {
  page: settingsPage,
  script: settingsScript,
  style: settingsStyle,
};

describe('loadSettingsAssets —— 按 mtime 热读', () => {
  test('文件不存在时退回 fallback', async () => {
    const assets = await loadSettingsAssets(join(tmpdir(), 'dsh-pet-no-shell.js'), fallback, {});
    assert.equal(assets.page, settingsPage);
    assert.equal(assets.script, settingsScript);
    assert.equal(assets.style, settingsStyle);
  });

  test('mtime 变化后再次读取拿到新内容', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-settings-shell-'));
    const shell = join(dir, 'settings-shell.js');
    const cache: SettingsAssetsCache = {};
    try {
      writeFileSync(
        shell,
        'export const settingsPage = "PAGE_V1";\nexport const settingsScript = "SCRIPT_V1";\nexport const settingsStyle = "STYLE_V1";\n',
      );
      const past = new Date(Date.now() - 60_000);
      utimesSync(shell, past, past);
      const first = await loadSettingsAssets(shell, fallback, cache);
      assert.equal(first.page, 'PAGE_V1');
      assert.equal(first.script, 'SCRIPT_V1');

      writeFileSync(
        shell,
        'export const settingsPage = "PAGE_V2";\nexport const settingsScript = "SCRIPT_V2";\nexport const settingsStyle = "STYLE_V2";\n',
      );
      utimesSync(shell, new Date(), new Date());
      const second = await loadSettingsAssets(shell, fallback, cache);
      assert.equal(second.page, 'PAGE_V2');
      assert.equal(second.script, 'SCRIPT_V2');
      assert.equal(second.style, 'STYLE_V2');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('mtime 未变时复用同一份缓存对象', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-settings-shell-'));
    const shell = join(dir, 'settings-shell.js');
    const cache: SettingsAssetsCache = {};
    try {
      writeFileSync(
        shell,
        'export const settingsPage = "PAGE_A";\nexport const settingsScript = "S";\nexport const settingsStyle = "C";\n',
      );
      const first = await loadSettingsAssets(shell, fallback, cache);
      const second = await loadSettingsAssets(shell, fallback, cache);
      assert.equal(first.page, 'PAGE_A');
      assert.equal(second, first, '第二次应直接返回缓存引用');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

