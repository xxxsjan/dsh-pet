/**
 * 控制台背景图：直接读插件自己的 `assets/console-bg.webp`，不在别处复制第二份图。
 *
 * 两个本机服务（独立模式监听器与应用模式路由）共用本模块；读取结果按进程缓存，
 * 文件缺失时回 undefined，由调用方回 404——不在缺图时静默给一张占位图。
 * @module dsh-pet/src/standalone/console-bg
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGE_ROOT_ASSETS } from '../host/paths.ts';

let cached: Buffer | undefined;

/**
 * 读取控制台背景图字节。
 *
 * @returns WebP 字节；文件不存在或不可读时为 undefined。
 */
export function readConsoleBackground(): Buffer | undefined {
  if (cached) return cached;
  try {
    cached = readFileSync(join(PACKAGE_ROOT_ASSETS, 'console-bg.webp'));
    return cached;
  } catch {
    return undefined;
  }
}
