/**
 * OBS 页面脚本的读取：运行时取同包内的 `lib/obs-page.js`。
 *
 * 按 mtime 缓存：`npm run watch` 重建后下次请求自动换新，不必重启进程。
 * 读不到回 undefined，由路由回 404——缺产物时宁可显式报错，也不静默回空脚本。
 * @module dsh-pet/src/host/obs-asset
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from './paths.ts';

let cached: { mtimeMs: number; body: string } | undefined;

/** 读取 OBS 页面脚本源码；未构建或文件不可读时为 undefined。 */
export function readObsPageScript(): string | undefined {
  const file = join(PACKAGE_ROOT, 'lib', 'obs-page.js');
  try {
    const mtimeMs = statSync(file).mtimeMs;
    if (cached && cached.mtimeMs === mtimeMs) return cached.body;
    const body = readFileSync(file, 'utf8');
    cached = { mtimeMs, body };
    return body;
  } catch {
    return undefined;
  }
}
