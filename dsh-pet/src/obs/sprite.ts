/**
 * OBS 页面里的单只宠物：A/B 双视频换源、随机自播链、朝向镜像与头顶气泡。
 *
 * 只搬桌面端的行为语义（掷骰选池、播完回随机链、说话/工作气泡优先级），
 * 不包含漫游、拖拽、抛掷、菜单与点击音效；所有网络请求由调用方负责。
 * 必须始终成立：同一时刻只有一个待播换源，迟到的加载结果按世代号丢弃。
 * @module dsh-pet/src/obs/sprite
 */
import { pickSlot, pick, pickCategoryAction, rollKind } from '../shared/pickers.ts';
import { WORK_STATUS_INDEX, type WorkStatusSnapshot } from '../shared/work-status.ts';
import { readSay, type StateLeaf } from '../shared/state.ts';
import { thumbExt } from '../client/pet/animation/media.ts';
import type { Animations, EventSlot, Pet, Weights } from '../shared/types.ts';
import { ObsBubble } from './bubble.ts';
import type { ObsOptions } from './params.ts';

const FALLBACK_WEIGHTS: Weights = { idle: 10, turn: 5, move: 5 };
const SAY_DEFAULT_MS = 10_000;

/** OBS 页面的一只宠物。 */
export class ObsSprite {
  /** 该宠物的实例 id（/state 按它取叶子）。 */
  readonly id: string;
  /** 宠物舞台元素（视频与气泡都在里面）。 */
  readonly el: HTMLDivElement;

  readonly #animations: Animations;
  readonly #weights: Weights;
  readonly #fixed: boolean;
  readonly #bubble: ObsBubble;
  readonly #videoA: HTMLVideoElement;
  readonly #videoB: HTMLVideoElement;
  readonly #assetBase: string;
  readonly #ext = thumbExt();

  #front = 0;
  #gen = 0;
  #facing: 'left' | 'right' = 'left';
  #anim = '';

  /**
   * 造一只宠物的舞台。
   *
   * @param pet - 拍平后的成品宠物（动画池已从条目吹入）。
   * @param options - 页面显示选项（缩放来自这里）。
   * @param base - 页面根地址（以 `/` 结尾）；素材地址按它拼。
   * @throws {Error} 动画池缺失或为空时——没有可播素材，画不出宠物。
   */
  constructor(pet: Pet, options: ObsOptions, base: string) {
    if (!pet.animations || pet.animations.idle.length === 0) {
      throw new Error(`pet「${pet.id}」缺少 animations.idle，无法渲染 OBS 页面`);
    }
    this.id = pet.id;
    this.#animations = pet.animations;
    this.#weights = pet.animationWeights ?? FALLBACK_WEIGHTS;
    this.#fixed = pet.fixedEnabled === true;

    const width = Math.round(pet.size * options.scale);
    const height = Math.round((width * 9) / 16);
    this.el = document.createElement('div');
    this.el.className = 'obs-pet';
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    this.el.style.setProperty('--obs-size', `${width}px`);
    this.el.style.setProperty('--f', `${Math.max(1, Math.round(width * 0.0455))}px`);
    if (!options.showPet) this.el.classList.add('is-pet-hidden');

    this.#videoA = this.#makeVideo();
    this.#videoB = this.#makeVideo();
    this.#bubble = new ObsBubble(this.el);
    const root = pet.assetRoot === '' ? pet.id : (pet.assetRoot ?? pet.id);
    this.#assetBase = `${base}thumb/${encodeURIComponent(root)}/`;
  }

  /** 从待机随机链开始播。 */
  start(): void {
    this.#playIdle();
  }

  /**
   * 处理一次 `pets.<id>.say` 叶子。
   *
   * @param leaf - `/state` 里的说话叶子。
   * @param showBubble - 页面是否允许画气泡（关掉时仍播说话动画）。
   */
  applySay(leaf: StateLeaf, showBubble: boolean): void {
    const said = readSay(leaf);
    if (!said) return;
    if (said.kind === 'clear') {
      if (showBubble) this.#bubble.clearSay();
      return;
    }
    if (said.anim !== false) this.#playEvent(this.#animations.events?.whisper);
    if (!showBubble) return;
    const duration = said.duration ?? SAY_DEFAULT_MS;
    if (duration === 0) return; // 0 = 只播动画，不动当前气泡
    this.#bubble.showSay(said.text, duration);
  }

  /** 处理一次 `pets.<id>.anim` 叶子：按名字点播一遍。 */
  applyAnim(leaf: StateLeaf): void {
    const data = leaf.data;
    if (!data || typeof data !== 'object') return;
    const name = (data as { name?: unknown }).name;
    if (typeof name === 'string' && name) this.#playOnce(name);
  }

  /**
   * 同步工作状态气泡；动画仍由随机链负责。
   *
   * @param snapshot - `/state` 的工作状态快照；`state === null` 表示空闲。
   * @param pet - 该宠物的成品配置（读 workStatusEnabled 与条目级文案）。
   * @param showBubble - 页面是否允许画气泡。
   */
  applyWork(snapshot: WorkStatusSnapshot | null, pet: Pet, showBubble: boolean): void {
    if (!showBubble || !pet.workStatusEnabled || !snapshot || snapshot.state === null) {
      if (showBubble) this.#bubble.clearWork();
      return;
    }
    const index = WORK_STATUS_INDEX[snapshot.state];
    const group = pet.workStatusTexts?.[index];
    const configured =
      Array.isArray(group) && group.length > 0 ? group[Math.floor(Math.random() * group.length)] : null;
    const text = snapshot.task || configured || '';
    if (!text) {
      this.#bubble.clearWork();
      return;
    }
    const terminal = snapshot.state === 'success' || snapshot.state === 'error';
    this.#bubble.showWork(text, terminal);
  }

  /** 卸载：停视频、清气泡计时器、摘 DOM。 */
  dispose(): void {
    this.#gen += 1;
    this.#bubble.dispose();
    for (const video of [this.#videoA, this.#videoB]) {
      video.onended = null;
      video.pause();
      video.remove();
    }
    this.el.remove();
  }

  #makeVideo(): HTMLVideoElement {
    const video = document.createElement('video');
    video.className = 'obs-video';
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    this.el.appendChild(video);
    return video;
  }

  #playIdle(): void {
    const kind = rollKind(Math.random(), this.#weights, { fixed: this.#fixed });
    const next = this.#nextOfKind(kind);
    if (next) this.#playOnce(next);
  }

  #nextOfKind(kind: ReturnType<typeof rollKind>): string | null {
    const idle = this.#animations.idle;
    if (kind === 'idle') return this.#pickFrom(this.#animations.idle, idle);
    if (kind === 'turn') return this.#pickFrom(this.#animations.turn, idle);
    // OBS 页面不走位：移动档按原地小动作处理，宠物始终站在舞台里。
    const action = pickCategoryAction(this.#animations.categories ?? [], idle, this.#facing, this.#anim);
    return action.name;
  }

  #pickFrom(pool: readonly string[], fallback: readonly string[]): string | null {
    const list = pool.length > 0 ? pool : fallback;
    return list.length > 0 ? pick(list, this.#anim) : null;
  }

  #playEvent(pool: readonly EventSlot[] | undefined): void {
    if (!pool || pool.length === 0) return;
    const slot = pick(pool, this.#anim);
    this.#playOnce(pickSlot(slot, this.#anim));
  }

  #playOnce(name: string): void {
    this.#anim = name;
    const gen = ++this.#gen;
    const target = this.#front === 0 ? this.#videoB : this.#videoA;
    const old = this.#front === 0 ? this.#videoA : this.#videoB;

    target.loop = false;
    target.onended = () => this.#handleEnded();
    target.src = this.#assetBase + encodeURIComponent(name) + this.#ext;

    const onReady = (): void => {
      target.removeEventListener('loadeddata', onReady);
      if (gen !== this.#gen) return;
      old.classList.remove('is-front');
      old.onended = null;
      old.pause();
      this.#front = this.#front === 0 ? 1 : 0;
      target.classList.add('is-front');
      target.style.transform = this.#facing === 'right' ? 'scaleX(-1)' : '';
      void target.play().catch(() => {
        /* 自动播放被拒：保持这一帧，等下一次换源再试 */
      });
    };
    target.addEventListener('loadeddata', onReady);
    target.addEventListener(
      'error',
      () => {
        if (gen !== this.#gen) return;
        console.warn(`[blue-fish] OBS 素材加载失败 pet=${this.id} anim=${name}`);
        window.setTimeout(() => this.#playIdle(), 1000);
      },
      { once: true },
    );
    if (target.readyState >= 2) onReady();
    target.load();
  }

  #handleEnded(): void {
    if (this.#animations.turn.includes(this.#anim)) {
      this.#facing = this.#facing === 'left' ? 'right' : 'left';
    }
    this.#playIdle();
  }
}
