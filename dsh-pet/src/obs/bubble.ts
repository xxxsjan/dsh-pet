/**
 * OBS 页面的头顶气泡：工作状态与说话共用一槽，按优先级择一显示。
 *
 * 优先级与桌面端一致：终态工作状态 > 说话 > 进行中工作状态；不渲染配图、余额与语音角标。
 * 只写自己那个气泡元素与计时器，不碰宠物视频。
 * @module dsh-pet/src/obs/bubble
 */

/** 说话气泡缺省停留时长；与宿主写 say 叶子时的缺省一致。 */
const SAY_DEFAULT_MS = 10_000;
/** 终态工作气泡停留时长；与桌面端的 BUBBLE_DURATION_MS 同值。 */
const TERMINAL_MS = 10_000;

interface ChatLine {
  readonly text: string;
}

interface WorkLine {
  readonly text: string;
}

/** 单只宠物的气泡槽。 */
export class ObsBubble {
  readonly #el: HTMLDivElement;
  #say: ChatLine | null = null;
  #work: WorkLine | null = null;
  #terminal: WorkLine | null = null;
  #sayTimer: number | null = null;
  #terminalTimer: number | null = null;

  /** @param parent - 气泡挂载的宠物舞台（相对定位）。 */
  constructor(parent: HTMLElement) {
    this.#el = document.createElement('div');
    this.#el.className = 'obs-bubble is-compact';
    parent.appendChild(this.#el);
  }

  /**
   * 弹一句说话气泡。
   *
   * @param text - 气泡正文；空串视为不显示。
   * @param durationMs - 停留时长；缺省 10s，调用方已处理 0（表示保持当前气泡不动）。
   */
  showSay(text: string, durationMs?: number): void {
    if (!text) return;
    this.#say = { text };
    this.#restartSayTimer(durationMs ?? SAY_DEFAULT_MS);
    this.#render();
  }

  /** 收起说话气泡；工作状态槽不受影响。 */
  clearSay(): void {
    this.#say = null;
    this.#clearSayTimer();
    this.#render();
  }

  /**
   * 工作状态气泡：非终态常驻，终态停留 10s 后自动收起。
   *
   * @param text - 任务详情或档位文案；空串视为不显示。
   * @param terminal - 是否 success / error 终态。
   */
  showWork(text: string, terminal: boolean): void {
    if (!text) return;
    if (terminal) {
      this.#terminal = { text };
      this.#work = null;
      this.#restartTerminalTimer();
    } else {
      this.#work = { text };
    }
    this.#render();
  }

  /** 清空工作状态槽（终态与进行中一起收）。 */
  clearWork(): void {
    this.#work = null;
    this.#terminal = null;
    this.#clearTerminalTimer();
    this.#render();
  }

  /** 卸载：清计时器并移除元素。 */
  dispose(): void {
    this.#clearSayTimer();
    this.#clearTerminalTimer();
    this.#el.remove();
  }

  #render(): void {
    const line = this.#terminal ?? this.#say ?? this.#work;
    this.#el.classList.toggle('is-on', line !== null);
    this.#el.textContent = line?.text ?? '';
  }

  #restartSayTimer(ms: number): void {
    this.#clearSayTimer();
    this.#sayTimer = window.setTimeout(() => {
      this.#sayTimer = null;
      this.#say = null;
      this.#render();
    }, ms);
  }

  #clearSayTimer(): void {
    if (this.#sayTimer === null) return;
    window.clearTimeout(this.#sayTimer);
    this.#sayTimer = null;
  }

  #restartTerminalTimer(): void {
    this.#clearTerminalTimer();
    this.#terminalTimer = window.setTimeout(() => {
      this.#terminalTimer = null;
      this.#terminal = null;
      this.#render();
    }, TERMINAL_MS);
  }

  #clearTerminalTimer(): void {
    if (this.#terminalTimer === null) return;
    window.clearTimeout(this.#terminalTimer);
    this.#terminalTimer = null;
  }
}
