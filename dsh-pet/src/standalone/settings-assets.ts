/**
 * 设置页三份静态资源：优先读同包 `lib/settings-shell.js`，mtime 变了再加载。
 *
 * 开发期 `npm run watch` 重建 shell 后，刷新设置页即可；不必重启进程。
 * 磁盘上没有产物时（源码测试、尚未 bundle）退回进程内编译进来的那份，行为与改前一致。
 * @module dsh-pet/src/standalone/settings-assets
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_ROOT } from '../host/paths.ts';
import { settingsPage, settingsScript, settingsStyle } from './settings-page.ts';

/** 设置页三份静态资源。 */
export interface SettingsAssets {
  readonly page: string;
  readonly script: string;
  readonly style: string;
}

/** @internal 进程内缓存形状，测试可注入空对象以隔离。 */
export interface SettingsAssetsCache {
  mtimeMs?: number;
  assets?: SettingsAssets;
}

const baked: SettingsAssets = {
  page: settingsPage,
  script: settingsScript,
  style: settingsStyle,
};

const defaultCache: SettingsAssetsCache = {};

/**
 * 从指定 shell 文件按 mtime 热读；读不到或解析失败时回落 `fallback`。
 *
 * @param shellFile - `lib/settings-shell.js` 的绝对路径。
 * @param fallback - 磁盘不可用时的回落内容。
 * @param cache - 可选缓存槽；默认用模块级单例。
 */
export async function loadSettingsAssets(
  shellFile: string,
  fallback: SettingsAssets = baked,
  cache: SettingsAssetsCache = defaultCache,
): Promise<SettingsAssets> {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(shellFile).mtimeMs;
  } catch {
    return fallback;
  }
  if (cache.mtimeMs === mtimeMs && cache.assets) return cache.assets;
  try {
    // 查询串打碎 Node ESM 模块缓存，否则 mtime 变了仍拿到旧 exports。
    const mod = (await import(`${pathToFileURL(shellFile).href}?t=${mtimeMs}`)) as {
      settingsPage: string;
      settingsScript: string;
      settingsStyle: string;
    };
    const assets: SettingsAssets = {
      page: mod.settingsPage,
      script: mod.settingsScript,
      style: mod.settingsStyle,
    };
    cache.mtimeMs = mtimeMs;
    cache.assets = assets;
    return assets;
  } catch {
    return fallback;
  }
}

/**
 * 读取设置页 HTML / JS / CSS（生产路径：`lib/settings-shell.js`）。
 *
 * @returns 三份字符串；磁盘产物可读时用磁盘，否则用进程内那份。
 */
export function readSettingsAssets(): Promise<SettingsAssets> {
  return loadSettingsAssets(join(PACKAGE_ROOT, 'lib', 'settings-shell.js'));
}
