/**
 * OBS 直播间页面入口：拉成品配置、建宠物舞台、长轮询 `/state` 分发说话与工作状态。
 *
 * 页面是被 OBS「浏览器源」直接加载的只读客户端：不写宿主状态、不参与物理与互动。
 * 配置只在加载时读一次（改了配置刷新浏览器源即可生效）；状态断线 2s 后自动重连。
 * @module dsh-pet/src/obs/main
 */
import { flattenConfigPets, isDesktopVisible } from '../shared/config.ts';
import { readWorkStatus, type StateLeaf } from '../shared/state.ts';
import type { WorkStatusSnapshot } from '../shared/work-status.ts';
import type { Pet } from '../shared/types.ts';
import { parseObsOptions, type ObsOptions } from './params.ts';
import { ObsSprite } from './sprite.ts';

const BASE = new URL('.', location.href).href;
const STATE_TIMEOUT_MS = 10_000;
const RETRY_MS = 2_000;
const CONFIG_RETRY_MS = 5_000;

/** 本页面只消费 /state 的这三个字段，其余叶子与宿主内部无关。 */
interface StateSnapshot {
  counter: number;
  sections?: { workStatus?: StateLeaf };
  pets?: Record<string, { say?: StateLeaf; anim?: StateLeaf }>;
}

interface MountedSprite {
  readonly pet: Pet;
  readonly sprite: ObsSprite;
  /** 该宠物是否已建立叶子基线；首拉只记计数器，不重放页面打开前的旧指令。 */
  ready: boolean;
  sayCounter: number;
  animCounter: number;
}

const stage = document.getElementById('obs-stage');
if (stage === null) throw new Error('OBS 舞台缺失：页面模板损坏');
const mounted: MountedSprite[] = [];
let workCounter = -1;

void boot();

async function boot(): Promise<void> {
  let merged: Record<string, unknown>;
  try {
    merged = await fetchConfig();
  } catch (error) {
    console.warn('[blue-fish] OBS 配置加载失败，5s 后重试：', error);
    window.setTimeout(() => void boot(), CONFIG_RETRY_MS);
    return;
  }
  const options = parseObsOptions(merged.main, new URLSearchParams(location.search));
  const pets = flattenConfigPets(merged as Record<string, Record<string, unknown>>).filter((pet) =>
    isDesktopVisible(pet.display),
  );
  for (const pet of pets) {
    try {
      const sprite = new ObsSprite(pet, options, BASE);
      stage?.appendChild(sprite.el);
      mounted.push({ pet, sprite, ready: false, sayCounter: 0, animCounter: 0 });
      sprite.start();
    } catch (error) {
      console.warn('[blue-fish] 跳过无法渲染的宠物：', error);
    }
  }
  if (mounted.length > 0) void pollState(options, 0);
}

async function fetchConfig(): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE}config`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`config HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (body && typeof body === 'object' && (body as { ok?: unknown }).ok === false) {
    throw new Error(`config rejected: ${String((body as { reason?: unknown }).reason ?? 'unknown')}`);
  }
  if (!body || typeof body !== 'object') throw new Error('config body is not an object');
  return body as Record<string, unknown>;
}

async function pollState(options: ObsOptions, since: number): Promise<void> {
  let next = since;
  try {
    const response = await fetch(`${BASE}state?since=${since}&timeout=${STATE_TIMEOUT_MS}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`state HTTP ${response.status}`);
    const snapshot = (await response.json()) as StateSnapshot;
    next = Number.isFinite(snapshot.counter) ? snapshot.counter : since;
    applySnapshot(snapshot, options);
  } catch (error) {
    console.warn('[blue-fish] OBS 状态轮询失败，稍后重连：', error);
    window.setTimeout(() => void pollState(options, next), RETRY_MS);
    return;
  }
  window.setTimeout(() => void pollState(options, next), 0);
}

function applySnapshot(snapshot: StateSnapshot, options: ObsOptions): void {
  for (const item of mounted) {
    const leaves = snapshot.pets?.[item.sprite.id];
    // 首拉建立基线：页面打开前写过的 say / anim 是历史指令，不凭空重放。
    // 但如果 anim 叶子已经有值（宿主启动时写的初始自播 anim），立即 apply 覆盖本地 playIdle——
    // 这样 OBS 端 start() 里本地随机播的动画会被宿主集中掷骰的结果立即替换，两端同步。
    if (!item.ready) {
      item.ready = true;
      item.sayCounter = leaves?.say?.counter ?? 0;
      item.animCounter = leaves?.anim?.counter ?? 0;
      // 宿主已经写了 anim（counter > 0）→ 立即覆盖本地播放，保证同步
      if (item.animCounter > 0 && leaves?.anim) {
        item.sprite.applyAnim(leaves.anim);
      }
      continue;
    }
    if (leaves?.say && leaves.say.counter !== item.sayCounter) {
      item.sayCounter = leaves.say.counter;
      item.sprite.applySay(leaves.say, options.showBubble);
    }
    if (leaves?.anim && leaves.anim.counter !== item.animCounter) {
      item.animCounter = leaves.anim.counter;
      item.sprite.applyAnim(leaves.anim);
    }
  }
  applyWork(snapshot, options);
}

function applyWork(snapshot: StateSnapshot, options: ObsOptions): void {
  const leaf = snapshot.sections?.workStatus;
  if (!leaf) return;
  const state = readWorkStatus(leaf);
  // 首拉只接进行中的状态：终态（成功/失败）多半是页面打开前的旧结果，重放会凭空弹一句。
  if (workCounter < 0) {
    workCounter = leaf.counter;
    if (!isOngoing(state)) return;
    applyWorkToAll(state, options);
    return;
  }
  if (leaf.counter === workCounter) return;
  workCounter = leaf.counter;
  applyWorkToAll(state, options);
}

function applyWorkToAll(state: WorkStatusSnapshot | null, options: ObsOptions): void {
  for (const item of mounted) item.sprite.applyWork(state, item.pet, options.showBubble);
}

function isOngoing(state: WorkStatusSnapshot | null): boolean {
  return state !== null && state.state !== null && state.state !== 'success' && state.state !== 'error';
}
