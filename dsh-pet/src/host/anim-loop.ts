/**
 * 自播链宿主侧调度器：集中掷骰选下一个自播动画，写进 pets.<id>.anim 叶子。
 *
 * 两端（桌面 / OBS）都消费同一个 anim 叶子，从而自播链严格同步。
 * 宿主只管"选哪个动画名"，不负责渲染/物理——桌面端收到 move 类动画名后
 * 走 onMenuAction → tryMove()（真实移动），OBS 端原地播放动作。
 *
 * 渲染端播完自播动画后 POST /anim/next?pet=<id> 通知宿主，宿主掷骰写下一个。
 * 睡眠、占用锁、外部点播会暂停/覆盖自播链：睡眠/锁到期后渲染端自然回拨，
 * 外部点播带 playbackId，和自播 anim 叶子是同一条通道——点播叶子 counter 变化
 * 会让两端立刻切到点播；点播播完后渲染端继续 POST /anim/next。
 *
 * 宿主侧掷骰逻辑与渲染端 shared/pickers.ts 完全同构，确保两端独立掷骰时代码语义一致。
 * @module dsh-pet/src/host/anim-loop
 */

import { readAllConfig } from './config.ts';
import { findPetInstance } from './config.ts';
import type { ConfigPaths } from './config.ts';
import type { PollStateStore } from './state.ts';

/** 宿主侧日志出口（和 setup.ts 里的 log 同一份类型）。 */
interface LoggerLike {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * 宿主侧掷骰逻辑（与 src/shared/pickers.ts 同构，宿主不 import shared）。
 * 纯函数集合，不依赖 DOM / React。
 */

/** 从池里等概率抽一个，exclude 避开某个名字（减少连续重复）；池空返回 null。 */
function pick<T>(pool: readonly T[] | undefined, exclude?: T): T | null {
  if (!pool || pool.length === 0) return null;
  const entries = exclude !== undefined ? pool.filter((n) => n !== exclude) : pool;
  const src = entries.length > 0 ? entries : pool;
  return src[Math.floor(Math.random() * src.length)];
}

/** 按权重掷骰，返回类别。opts.fixed 为真时 turn/move 权重按 0 算。 */
function rollKind(
  roll: number,
  w: { idle: number; turn: number; move: number },
  opts?: { fixed?: boolean },
): 'idle' | 'turn' | 'move' | 'action' {
  const turn = opts?.fixed ? 0 : w.turn;
  const move = opts?.fixed ? 0 : w.move;
  const topEnd = (w.idle + turn + move) / 100;
  if (roll < w.idle / 100) return 'idle';
  if (roll < (w.idle + turn) / 100) return 'turn';
  if (roll < topEnd) return 'move';
  return 'action';
}

/**
 * 从 categories 里按权重选一个分类，再从分类的 actions 里选一个动作名。
 * facing='right' 时排除 noMirror 分类（镜像不能用 noMirror 分类的动画）。
 * facing 缺席时按 'left' 处理（宿主侧默认朝左）。
 */
function pickCategoryAction(
  categories: readonly unknown[] | undefined,
  idlePool: readonly string[] | undefined,
  facing: string,
  current: string,
): { name: string } | null {
  const idle = idlePool ?? [];
  if (!Array.isArray(categories) || categories.length === 0) {
    const fallback = pick(idle, current);
    return fallback !== null ? { name: fallback } : null;
  }
  // 过滤掉空 actions 的分类
  type Category = { id?: string; name?: string; weight?: number; noMirror?: boolean; actions?: unknown[] };
  const valid = categories.filter(
    (c): c is Category =>
      !!c &&
      typeof c === 'object' &&
      Array.isArray((c as Category).actions) &&
      (c as Category).actions!.length > 0,
  );
  if (valid.length === 0) {
    const fallback = pick(idle, current);
    return fallback !== null ? { name: fallback } : null;
  }
  // facing 朝右 → 排除 noMirror 分类
  const eligible = facing === 'right' ? valid.filter((c) => !c.noMirror) : valid;
  const pool = eligible.length > 0 ? eligible : valid;
  const totalW = pool.reduce((s, c) => s + (c.weight ?? 0), 0) || 1;
  let t = Math.random() * totalW;
  let chosen: Category | null = null;
  for (const c of pool) {
    t -= c.weight ?? 0;
    if (t <= 0) {
      chosen = c;
      break;
    }
  }
  if (!chosen) chosen = pool[pool.length - 1] ?? null;
  if (!chosen) {
    const fallback = pick(idle, current);
    return fallback !== null ? { name: fallback } : null;
  }
  const actions = (chosen.actions as Array<{ name?: unknown }> | undefined) ?? [];
  const names = actions.map((a) => (typeof a.name === 'string' ? a.name : '')).filter((n) => n !== '');
  const chosenName = pick(names, current);
  if (chosenName === null) {
    const fallback = pick(idle, current);
    return fallback !== null ? { name: fallback } : null;
  }
  return { name: chosenName };
}

/** moves.actions → 动画名数组。 */
function moveActionNames(moves: unknown): string[] {
  if (!moves || typeof moves !== 'object') return [];
  const actions = (moves as { actions?: unknown[] }).actions;
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => (typeof a === 'object' && a !== null ? (a as { name?: unknown }).name : '')).filter(
    (n): n is string => typeof n === 'string' && n !== '',
  );
}

/** animations.idle / animations.turn → 动画名数组（宿主侧收窄）。 */
function asStringArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x !== '');
}

// ---------------------------------------------------------------------------

/** AnimLoop 的依赖。 */
export interface AnimLoopDeps {
  configPaths: ConfigPaths;
  state: PollStateStore;
  log: LoggerLike;
}

/** 单只宠物的自播状态。 */
interface PetLoop {
  /** 当前朝向：host 只管逻辑朝向，渲染端据此镜像；turn 类别后翻转。 */
  facing: 'left' | 'right';
  /** 正在播放的动画名（宿主上次掷骰选的那个）；用于下次 pick 时排除。 */
  currentAnim: string;
  /** 是否被暂停（sleep / lock 期间）。暂停时不掷骰。 */
  paused: boolean;
  /** 是否已启动过自播链（writePet('anim', ...) 写过至少一次）。 */
  started: boolean;
}

/**
 * 自播链调度器：集中掷骰 + 写 anim 叶子。
 * 单例（进程内），每个宿主插件实例一个。
 */
export class AnimLoop {
  /** petId → 自播状态。 */
  private readonly loops = new Map<string, PetLoop>();

  private readonly deps: AnimLoopDeps;

  constructor(deps: AnimLoopDeps) {
    this.deps = deps;
  }

  /**
   * 为某只宠物启动自播链：写第一个自播 anim。
   * 渲染端加载后消费这个叶子开始播；播完 POST /anim/next 继续循环。
   *
   * 幂等：已启动的宠物重复调用只重置 facing 和 currentAnim（读当前配置），
   * 不重复写 anim 叶子——让渲染端保持当前帧。
   */
  start(petId: string): void {
    const cfg = this.readPetConfig(petId);
    if (!cfg) {
      this.deps.log.warn(`[blue-fish] anim-loop.start：找不到宠物 ${petId}`);
      return;
    }
    const existing = this.loops.get(petId);
    if (existing?.started) return; // 已启动，不重复写
    const loop: PetLoop = {
      facing: (cfg.facing === 'right' ? 'right' : 'left') as 'left' | 'right',
      currentAnim: '',
      paused: false,
      started: false,
    };
    this.loops.set(petId, loop);
    this.writeNext(petId);
  }

  /** 停止某只宠物的自播链（不再掷骰）。 */
  stop(petId: string): void {
    this.loops.delete(petId);
  }

  /** 暂停（sleep / lock 期间调用）：当前 anim 不动，但不再掷下一个。 */
  pause(petId: string): void {
    const loop = this.loops.get(petId);
    if (loop) loop.paused = true;
  }

  /** 恢复 + 立即掷一个新的（解冻/醒来后调用）。 */
  resume(petId: string): void {
    const loop = this.loops.get(petId);
    if (!loop) return;
    loop.paused = false;
    this.writeNext(petId);
  }

  /**
   * 渲染端上报"我播完了" → 掷骰写下一个自播 anim。
   * 这是自播链的主循环：渲染端播完 → 宿主掷骰 → 两端消费 → 渲染端播完 → ...
   *
   * 如果宿主还没为这只宠物启动过自播链（renderer 比 host 先 ready 的竞态），
   * 就当 start 调过了——直接掷第一个。
   *
   * sleep / lock 期间自播链应暂停：animLoop 自己读 state 的 sleep/lock 叶子来判断，
   * 这样即使宿主侧没显式调 pause/resume 也能自洽跳过。
   */
  next(petId: string): void {
    let loop = this.loops.get(petId);
    if (!loop) {
      const cfg = this.readPetConfig(petId);
      if (!cfg) {
        this.deps.log.warn(`[blue-fish] anim-loop.next：找不到宠物 ${petId}`);
        return;
      }
      loop = {
        facing: (cfg.facing === 'right' ? 'right' : 'left') as 'left' | 'right',
        currentAnim: '',
        paused: false,
        started: false,
      };
      this.loops.set(petId, loop);
    }
    if (loop.paused) return; // 显式暂停（pause() 调用）

    // 自洽检查：读 state 的 sleep/lock 叶子，这两种状态都不该推进自播链
    if (this.isSleepingOrLocked(petId)) return;

    this.writeNext(petId);
  }

  /** 读 state 检查某只宠物是否在 sleep 或被 lock 占着。 */
  private isSleepingOrLocked(petId: string): boolean {
    try {
      const snap = this.deps.state.read();
      const entry = snap.pets[petId];
      if (!entry) return false;
      const sleepData = entry.sleep?.data as { sleeping?: unknown } | undefined;
      if (sleepData && sleepData.sleeping === true) return true;
      const lockData = entry.lock?.data as { locked?: unknown } | undefined;
      if (lockData && lockData.locked === true) return true;
    } catch {
      // 读 state 失败（不应该）→ 保守放行，下一次自然收敛
    }
    return false;
  }

  /** 遍历所有已知宠物的自播状态（排障用）。 */
  activePetIds(): string[] {
    return [...this.loops.keys()];
  }

  // -------------------------------------------------------------------------

  /** 掷骰选下一个自播动画并写入 anim 叶子。 */
  private writeNext(petId: string): void {
    const loop = this.loops.get(petId);
    if (!loop) return;
    const cfg = this.readPetConfig(petId);
    if (!cfg) return;

    const animations = (cfg.animations ?? {}) as {
      idle?: unknown;
      turn?: unknown;
      moves?: unknown;
      categories?: unknown;
    };
    const weights = cfg.animationWeights ?? { idle: 10, turn: 5, move: 5 };
    const fixed = cfg.fixedEnabled === true;

    const idlePool = asStringArr(animations.idle);
    const turnPool = asStringArr(animations.turn);
    const moveNames = moveActionNames(animations.moves);
    const categories = Array.isArray(animations.categories) ? animations.categories : [];

    // 没有 idle 池 → 无法自播（配置损坏），跳过
    if (idlePool.length === 0) {
      this.deps.log.warn(`[blue-fish] anim-loop：宠物 ${petId} 缺少 idle 动画池，跳过自播`);
      return;
    }

    const kind = rollKind(Math.random(), weights as { idle: number; turn: number; move: number }, { fixed });
    let name: string | null = null;

    switch (kind) {
      case 'idle':
        name = pick(idlePool, loop.currentAnim);
        break;
      case 'turn': {
        const turnAnim = pick(turnPool.length > 0 ? turnPool : idlePool, loop.currentAnim);
        if (turnAnim !== null) {
          loop.facing = loop.facing === 'left' ? 'right' : 'left';
          name = turnAnim;
        }
        break;
      }
      case 'move': {
        if (moveNames.length > 0) {
          // 宿主只选 move 类动画名，桌面端收到后走 onMenuAction → tryMove()（真实移动）
          name = pick(moveNames, loop.currentAnim);
        }
        // 没配置 move 动作 → 退到 category
        if (name === null) {
          const act = pickCategoryAction(categories, idlePool, loop.facing, loop.currentAnim);
          name = act?.name ?? null;
        }
        break;
      }
      case 'action':
      default: {
        const act = pickCategoryAction(categories, idlePool, loop.facing, loop.currentAnim);
        name = act?.name ?? null;
        break;
      }
    }

    if (name === null || name === '') {
      // 极端退化：所有池都空（但我们已在开头 guard idlePool）→ 选 idle[0]
      name = idlePool[0];
    }

    loop.currentAnim = name;
    loop.started = true;

    // 自播 anim：不带 playbackId（null/undefined），facing 只在 turn 后需要时带上
    const data: Record<string, unknown> = { name };
    // facing 只有在宿主显式翻了朝向（turn 类别）才带——否则渲染端保持当前朝向
    // 但为了同步，每次都带上 facing 值更稳：渲染端 applyAnimLeaf 里会先设置 facing 再换源
    data.facing = loop.facing;

    this.deps.state.writePet(petId, 'anim', data);
  }

  /** 读某只宠物的成品配置（轻量：只取自播链需要的字段）。 */
  private readPetConfig(petId: string): {
    animations?: unknown;
    animationWeights?: unknown;
    fixedEnabled?: boolean;
    facing?: string;
  } | null {
    try {
      const cfg = readAllConfig(this.deps.configPaths);
      const found = findPetInstance(cfg, petId);
      if (!found) return null;
      return found.conf as {
        animations?: unknown;
        animationWeights?: unknown;
        fixedEnabled?: boolean;
        facing?: string;
      };
    } catch {
      return null;
    }
  }
}
