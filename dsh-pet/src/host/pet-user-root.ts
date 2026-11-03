/**
 * 桌宠用户数据根：默认 `~/.blue-fish`，自定义 `DSH_HOME` 时仍为 `$DSH_HOME/dsh-pet`。
 *
 * 配置、日志、语音缓存、表情包与独立 AI 密钥都落在这一棵目录下。
 * 不迁移旧的 `~/.dsh/dsh-pet`；需要旧数据时请自行拷贝。
 * @module dsh-pet/src/host/pet-user-root
 */
import { basename, dirname, join } from 'node:path';

/** 默认用户数据目录名（相对用户主目录）。 */
export const PET_USER_DIR = '.blue-fish';

/**
 * 由 DSH_HOME 路径推导桌宠数据根。
 *
 * - `…/.dsh`（默认家目录）→ 同级的 `…/.blue-fish`
 * - 其它（测试 / 显式 `DSH_HOME`）→ `{home}/dsh-pet`
 *
 * @param home - {@link dshHomeDir} 的返回值或测试注入的假路径。
 */
export function petUserRootForHome(home: string): string {
  if (basename(home) === '.dsh') return join(dirname(home), PET_USER_DIR);
  return join(home, 'dsh-pet');
}
