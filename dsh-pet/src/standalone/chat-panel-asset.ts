/**
 * 设置页对话面板的浏览器产物：运行时读同包内的 `lib/chat-panel.js`。
 *
 * 按 mtime 缓存：`npm run watch` 重建后下次请求自动换新，不必重启进程。
 * 读不到回 undefined，由调用方回 404——缺产物时宁可显式报错，也不静默回空脚本。
 * @module dsh-pet/src/standalone/chat-panel-asset
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../host/paths.ts';

let cached: { mtimeMs: number; body: string } | undefined;

/**
 * 读取对话面板脚本。
 *
 * @returns 打包后的脚本源码；未构建或文件不可读时为 undefined。
 */
export function readChatPanelScript(): string | undefined {
  const file = join(PACKAGE_ROOT, 'lib', 'chat-panel.js');
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
