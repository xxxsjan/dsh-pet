/**
 * 独立 / 桌面应用运行状态的落盘：把端口、令牌与设置页地址写给本机对接方。
 *
 * 只服务本机启动器与其它本机程序，不进入 /health 响应，也不参与路由。
 * 必须始终成立：权限沿用私有 JSON 写入；清理时只删自己写的那一份。
 * 桌面与 CLI 目录不同：桌面用用户主目录下的 `.blue-fish6`，CLI 仍在 DSH_HOME 下的 `blue-fish6`。
 * @module dsh-pet/src/standalone/runtime-state
 */
import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { writePrivateJson } from './ai-storage.ts';

/** CLI 运行状态目录名（相对 DSH_HOME）。 */
export const CLI_RUNTIME_STATE_DIR = 'blue-fish6';

/** 桌面应用运行状态目录名（相对用户主目录，带点前缀）。 */
export const APP_RUNTIME_STATE_DIR = '.blue-fish6';

/** 运行状态文件名。 */
export const RUNTIME_STATE_FILE = 'standalone-runtime.json';

/** 运行状态内容；token 只交给本机启动器。 */
interface RuntimeDetails {
  /** 实际监听端口。 */
  port: number;
  /** 本次运行的能力令牌。 */
  token: string;
  /** 带令牌的设置页地址。 */
  settingsUrl: string;
  /** 插件包根目录。 */
  pluginRoot: string;
}

/** CLI：`{DSH_HOME}/blue-fish6`。 */
export function cliRuntimeStateDir(dshHome: string): string {
  return join(dshHome, CLI_RUNTIME_STATE_DIR);
}

/** 桌面应用：`{用户主目录}/.blue-fish6`。 */
export function appRuntimeStateDir(): string {
  return join(homedir(), APP_RUNTIME_STATE_DIR);
}

/**
 * 运行状态文件路径。
 * @param stateDir - 已解析好的状态目录（CLI 或桌面）。
 */
export function runtimeStatePath(stateDir: string): string {
  return join(stateDir, RUNTIME_STATE_FILE);
}

/**
 * 写入运行状态并返回幂等的清理函数。
 * @param stateDir - 状态目录绝对路径（见 {@link cliRuntimeStateDir} / {@link appRuntimeStateDir}）。
 * @param details - 端口、令牌、设置页地址与插件根。
 * @returns 幂等的清理函数。
 * @throws 无法安全写入时抛出。
 */
export function writeStandaloneRuntime(stateDir: string, details: RuntimeDetails): () => void {
  mkdirSync(stateDir, { recursive: true });
  const file = runtimeStatePath(stateDir);
  try {
    writePrivateJson(file, {
      name: 'blue-fish6',
      pid: process.pid,
      startedAt: new Date().toISOString(),
      ...details,
    });
  } catch (error) {
    throw new Error('无法安全写入桌宠运行状态，请检查数据目录的访问权限。', { cause: error });
  }
  let released = false;
  // 只删 pid 与令牌都匹配的文件，避免误删另一个实例的状态。
  return () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(readFileSync(file, 'utf8')) as { pid?: number; token?: string };
      if (current.pid === process.pid && current.token === details.token) unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error('清理桌宠运行状态失败；请检查数据目录，未删除其他进程的状态。', { cause: error });
    }
  };
}
