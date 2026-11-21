/**
 * 端侧语音播报：按 `say` 叶子决定这一句要不要念，以及合成请求与播放。
 *
 * 两端各判各的：叶子里的 `voiceTo` 指向哪一端，就只有那一端出声；缺省 = 谁都不念。
 * 网页端另加一道「页面可见」——被切到后台的页面没人看，出声只是打扰。
 * 音色、总开关与音量经 `setVoiceConfig` 从成品配置注入；手动点播（对话面板的喇叭）不受这些门控。
 * 每句的开始与结束经 {@link subscribeVoiceUtterance} 广播出去：说话气泡靠它决定何时收起。
 * 不负责合成与缓存：那些在宿主侧（`/voice/speak`）。
 * @module dsh-pet/src/shared/voice
 */
import { ROUTE_PATH } from './constants.ts';
import type { VoiceTarget } from './state.ts';
import {
  absoluteRateToEdge,
  clampVoiceRate,
  clampVoiceVolume,
  DEFAULT_VOICE_RATE,
  DEFAULT_VOICE_VOLUME,
} from './voice-params.ts';

/** 当前音色；空串 = 不指定，由宿主用默认音色。 */
let voiceName = '';
/** 播报总开关；只有成品配置明确为 true 才播。 */
let voiceEnabled = false;
/** 播放音量系数（0–3，1 = 100%；>1 用 Web Audio 增益）。 */
let voiceVolume = DEFAULT_VOICE_VOLUME;
/** 绝对语速（0.5–2），合成请求换成 Edge 的 `+N%`。 */
let voiceRate = DEFAULT_VOICE_RATE;
/** 超过 100% 时复用的 AudioContext（反复 create/close 会导致二次播放无声）。 */
let boostCtx: AudioContext | null = null;
/** 本端是网页端还是桌面端；`null` = 还没声明，此时不按叶子播放。 */
let surface: VoiceTarget | null = null;
/** 接口基址：网页端是同源前缀，桌面端由 `setVoiceBase` 换成 bridge 地址。 */
let voiceBase = ROUTE_PATH;
/** 配置是否已就绪；网页端由 `setVoiceConfig` 置位，桌面端首次播放时懒加载。 */
let configLoaded = false;
/** 当前播报状态；气泡据此显示图标。 */
let voiceState: VoiceState = 'idle';
/** 状态订阅者：两端的说话气泡据此渲染图标。 */
const stateListeners = new Set<(state: VoiceState) => void>();
/** 播报开始/结束的订阅者：说话气泡据此挂起与收尾。 */
const utteranceListeners = new Set<(event: VoiceUtteranceEvent) => void>();
/** 播报序号；每次决定要念一句就自增，用来让气泡丢掉迟到的「上一句播完了」。 */
let utteranceSeq = 0;
/** 当前自动播报那一句的取消句柄（含等配置/等合成阶段）；null = 没在念。弹幕队列串行，同一时至多一句。 */
let sayCancel: (() => void) | null = null;

/** 语音播报对外的四种状态；只用于展示，不接受外部驱动。`failed` = 这次合成没成功。 */
export type VoiceState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 一句播报的开始与结束事件。
 *
 * `text` 是气泡上的原文，不是送合成的截断文本——气泡要按它认句：同一页面上的多只宠物
 * 共用这份模块单例状态，不认句就会把别人那一句算到自己头上。
 */
export type VoiceUtteranceEvent =
  | { readonly kind: 'start'; readonly seq: number; readonly text: string }
  | { readonly kind: 'end'; readonly seq: number; readonly text: string };

/**
 * 自动播报最多念多少字。
 *
 * 气泡照旧显示全文，只有念的部分截断：一句 500 字能合成几分钟，那段时间气泡无事可做，
 * 用户还会被拖着听半分钟。60 字约 15 秒语音，与气泡的挂起上限配套。
 */
export const VOICE_SPEECH_MAX_CHARS = 60;

/**
 * 客户端等合成结果的上限（ms）。
 *
 * 按最慢的内置引擎（Fish Audio 90s）再宽一点：让宿主先超时并回结构化失败，
 * 客户端这道只是兜底，避免上游挂住时气泡上的转圈永远停不下来。
 */
const SPEAK_TIMEOUT_MS = 95_000;

/** 合成请求的超时信号；自动播报与手动点播共用同一份口径。 */
function speakSignal(): AbortSignal {
  return AbortSignal.timeout(SPEAK_TIMEOUT_MS);
}

/** 切换状态并通知订阅者；同值不重复通知。 */
function setVoiceState(next: VoiceState): void {
  if (voiceState === next) return;
  voiceState = next;
  for (const listener of stateListeners) listener(next);
}

/**
 * 读当前播报状态；桌面端在重绘气泡时直接取（它没有 react 的订阅机制）。
 * @returns `idle` / `loading` / `ready`。
 */
export function getVoiceState(): VoiceState {
  return voiceState;
}

/**
 * 读当前语音播报总开关状态。
 * @returns `true` 表示播报开启，`false` 表示关闭。
 */
export function getVoiceEnabled(): boolean {
  return voiceEnabled;
}

/**
 * 订阅播报状态；订阅时会立刻收到当前值。
 * @param listener - 状态变化回调。
 * @returns 取消订阅；组件卸载/气泡关闭时必须调用。
 */
export function subscribeVoiceState(listener: (state: VoiceState) => void): () => void {
  stateListeners.add(listener);
  listener(voiceState);
  return () => {
    stateListeners.delete(listener);
  };
}

/**
 * 订阅每句播报的开始与结束；不补发历史状态，只报后续事件。
 *
 * @param listener - 事件回调：`start` 表示这一句真正开始出声（气泡此刻才弹，靠它挂起收起计时），
 *   `end` 表示播完、合成失败或超时——三种结局都会报一次，气泡不必自己判超时；
 *   始终没拿到音频（失败）时只有 `end`，没有 `start`。
 * @returns 取消订阅；卡片卸载或气泡关闭时必须调用。
 */
export function subscribeVoiceUtterance(listener: (event: VoiceUtteranceEvent) => void): () => void {
  utteranceListeners.add(listener);
  return () => {
    utteranceListeners.delete(listener);
  };
}

/** 广播一次播报事件；单个订阅者抛错不能挡住其余订阅者。 */
function emitUtterance(event: VoiceUtteranceEvent): void {
  for (const listener of utteranceListeners) listener(event);
}

/**
 * 取真正送合成的那一段：超长时在句读处截断，不把一句话切在半截。
 *
 * @param text - 气泡上的原文。
 * @returns 不超过 {@link VOICE_SPEECH_MAX_CHARS} 的正文；原文够短时原样返回。
 */
export function speechSlice(text: string): string {
  if (text.length <= VOICE_SPEECH_MAX_CHARS) return text;
  const head = text.slice(0, VOICE_SPEECH_MAX_CHARS);
  const cut = Math.max(
    ...['。', '！', '？', '；', '，', '.', '!', '?', ';', ','].map((mark) => head.lastIndexOf(mark)),
  );
  // 句读太靠前就不值得截在那里：宁可硬切，也别只念出半句话。
  return cut >= VOICE_SPEECH_MAX_CHARS / 2 ? head.slice(0, cut + 1) : head;
}

/**
 * 句读切分：把待念正文按标点切成多段，标点留在段末以保留自然停顿。
 *
 * 分句是「首句即播」的前提：每段单独走一次 `/voice/speak`，第一段合成好就能先出声，
 * 不必等整段全部合成。换行同样视为分隔；空白段一律剔除；纯标点输入返回空数组。
 *
 * @param text - 已经过 {@link speechSlice} 截断的待念正文。
 * @returns 去空白后的句子段；原文无标点时为单元素数组。
 */
export function splitSpeech(text: string): string[] {
  const pieces = text.match(/[^。！？；，.!?;、\n\r]+[。！？；，.!?;、]?/g);
  if (!pieces) return [];
  const segments: string[] = [];
  for (const piece of pieces) {
    const part = piece.trim();
    if (part) segments.push(part);
  }
  return segments;
}

/**
 * 换掉接口基址；桌面端在模块加载时调一次（`file://` 页面不能用相对路径）。
 * @param base - 已含前缀的地址，如 `blue-fish-bridge://dsh-pet/blue-fish`。
 */
export function setVoiceBase(base: unknown): void {
  if (typeof base === 'string' && base) voiceBase = base;
}

/**
 * 声明本端是网页端还是桌面端；两端各自在启动时调一次。
 * 没声明时不按 `say` 叶子播放——宁可没声音，也不替另一端出声。
 * @param next - `web` / `desktop`；其余值忽略。
 */
export function setSurface(next: unknown): void {
  if (next === 'web' || next === 'desktop') surface = next;
}

/**
 * 记录成品配置里的音色、总开关、音量与语速；网页端在读到 `/config` 时调一次。
 * 调用即视为配置已就绪，后续播放不再自己去拉。
 * @param name - 音色 id（非字符串按未指定处理）。
 * @param enabled - 播报总开关（严格 `=== true` 才算开启）。
 * @param volume - 音量系数（0–3）；缺省或非数值按 100%。
 * @param rate - 绝对语速（0.5–2）；缺省或非数值按 1。
 */
export function setVoiceConfig(name: unknown, enabled: unknown, volume?: unknown, rate?: unknown): void {
  voiceName = typeof name === 'string' ? name : '';
  voiceEnabled = enabled === true;
  voiceVolume = clampVoiceVolume(volume);
  voiceRate = clampVoiceRate(rate);
  configLoaded = true;
  // >100% 依赖 AudioContext：配置一到就预热，避免第一句自动播时还卡在 suspended。
  if (voiceVolume > 1) void unlockVoiceAudio();
}

/** 取页面里的 AudioContext 构造器；旧内核只有 webkit 前缀。 */
function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const fromWindow =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (fromWindow) return fromWindow;
  // 有的环境构造器挂在全局而不是 window 上。
  const fromGlobal =
    typeof AudioContext !== 'undefined'
      ? AudioContext
      : typeof (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext !== 'undefined'
        ? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        : null;
  return fromGlobal;
}

/**
 * 把增益用的 AudioContext 拉到 `running`。
 * 未 running 时不要挂 MediaElementSource——元素输出会被抢走，上下文又静音，听感比「退回 100%」更糟。
 */
async function ensureBoostContext(): Promise<AudioContext | null> {
  const Ctx = audioContextConstructor();
  if (!Ctx) return null;
  let ctx = boostCtx;
  if (!ctx || ctx.state === 'closed') {
    ctx = new Ctx();
    boostCtx = ctx;
  }
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* 手势未解锁时 resume 会失败：交给调用方退回 element.volume */
    }
  }
  return ctx.state === 'running' ? ctx : null;
}

/**
 * 尽量解锁语音增益用的 AudioContext。
 * 桌面 Helper 开机或首次点击时调用；自动播报没有用户手势时，靠 Electron 的
 * `autoplay-policy=no-user-gesture-required` 与这次预热把上下文拉起来。
 */
export async function unlockVoiceAudio(): Promise<void> {
  await ensureBoostContext();
}

/**
 * 按配置音量播放：≤1 用 `audio.volume`；>1 用 GainNode（与弹幕机同口径）。
 * Context 起不来时绝不挂 MediaElementSource，只把 element 放到上限 1，避免「增益失败 → 更小声/无声」。
 * @param audio - 即将 play 的元素。
 * @param volume - 0–3。
 */
async function applyPlaybackVolume(audio: HTMLAudioElement, volume: number): Promise<void> {
  const vol = clampVoiceVolume(volume);
  if (!(vol > 1)) {
    audio.volume = vol;
    return;
  }
  const ctx = await ensureBoostContext();
  if (!ctx) {
    audio.volume = 1;
    return;
  }
  audio.volume = 1;
  try {
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(ctx.destination);
  } catch {
    audio.volume = 1;
  }
}

/** 懒加载成品配置；失败按「不播」处理，且只试一次（避免每句都发请求）。 */
async function loadConfigOnce(): Promise<void> {
  if (configLoaded) return;
  try {
    const response = await fetch(voiceBase + '/config', { cache: 'no-store' });
    const body = (await response.json()) as { main?: Record<string, unknown> } | null;
    const main = body?.main;
    voiceName = typeof main?.voiceName === 'string' ? main.voiceName : '';
    voiceEnabled = main?.voiceEnabled === true;
    voiceVolume = clampVoiceVolume(main?.voiceVolume);
    voiceRate = clampVoiceRate(main?.voiceRate);
    // 只有成功才置位：拉不到（bridge 还没就绪 / 瞬时故障）留给下一句重试——
    // 否则一次失败就把这一端永久静音了。
    configLoaded = true;
    if (voiceVolume > 1) void unlockVoiceAudio();
  } catch {
    /* 拉不到就保持关闭：宁可没声音，也不乱播 */
  }
}

/** 等不到音频时，气泡最多再压这么久就先显示（ms）：合成卡住不能把文字一起拖没。 */
const BUBBLE_VOICE_WAIT_MS = 4_000;

/**
 * 按 `say` 叶子播放：叶子指定了本端、且总开关开着才念。
 *
 * 三个门依次是：叶子有没有点名本端 → 网页端页面是否可见 → 成品配置的总开关。
 * 任何一道没过都只把状态归回 `idle`，并立刻触发 `onAudible`——气泡照常显示。
 * 叶子带了 `voiceUtteranceId` 时，本端（点名端）必须向宿主上报读完 / 跳过 / 失败——
 * 弹幕队列靠这条回执决定能不能进下一条；另一端看到 id 也不报（只有点名端知道真相）。
 *
 * @param say - 要念的那一句：`text` 正文，`voiceTo` 该由哪一端念，可选 `voiceUtteranceId` 回执编号。
 * @param onAudible - 真正出声（或确定这句不会出声）时调用一次。调用方用它把气泡压到声音之后显示：
 *   先弹泡后出声会让文字与语音错位，还容易在合成期间就自动收起。
 */
export function playSayVoice(
  say: {
    readonly text: string;
    readonly voiceTo?: VoiceTarget;
    readonly voiceUtteranceId?: string;
  },
  onAudible?: () => void,
): void {
  const utteranceId = say.voiceUtteranceId;
  const isMine = say.voiceTo !== undefined && say.voiceTo === surface;
  if (!say.text || !isMine) {
    setVoiceState('idle');
    onAudible?.();
    return;
  }
  if (surface === 'web' && typeof document !== 'undefined' && document.hidden) {
    setVoiceState('idle');
    if (utteranceId) reportVoiceUtterance(utteranceId, 'skipped', 'hidden');
    onAudible?.();
    return;
  }
  // 在调用栈尚有用户手势时预热增益上下文（合成是异步的，回来时手势往往已过期）。
  void unlockVoiceAudio();
  void speakIfEnabled(say.text, utteranceId, onAudible); // 不 await：播放是旁路
}

/** 把一句朗读的终态报给宿主；失败静默——宿主侧有超时兜底，报不上也不能拖垮渲染。 */
function reportVoiceUtterance(
  utteranceId: string,
  status: 'ended' | 'skipped' | 'failed',
  reason?: string,
): void {
  void fetch(voiceBase + '/voice/utterance/' + encodeURIComponent(utteranceId) + '/report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  }).catch(() => undefined);
}

/** 确认配置后再播；桌面端首次调用会顺手拉一次 `/config`。 */
async function speakIfEnabled(text: string, utteranceId?: string, onAudible?: () => void): Promise<void> {
  // 取消句柄从等配置阶段就挂上：stopSayVoice 在任何时刻进来都能拦住这一句。
  let cancelled = false;
  // 分段后在播段与预取段各登记一个取消回调，用集合统一触发。
  const cancelFns = new Set<() => void>();
  /** 气泡只放出来一次：首段出声、失败收尾或等太久，先到者生效。 */
  let shown = false;
  let startEmitted = false;
  let seq = 0;
  const showOnce = (): void => {
    if (shown) return;
    shown = true;
    onAudible?.();
  };
  const ctl: SpeakControl = {
    isCancelled: () => cancelled,
    onCancel: (fn) => {
      cancelFns.add(fn);
      if (cancelled) fn();
    },
    // 第一段真正开始出声：先弹气泡，再挂起收起计时（气泡必须在，hold 才有意义）。
    onFirstAudio: () => {
      showOnce();
      if (startEmitted) return;
      startEmitted = true;
      emitUtterance({ kind: 'start', seq, text });
    },
  };
  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    for (const fn of cancelFns) fn();
  };
  // 总时限覆盖整段串播：到点统一取消，在途 abort、在播 pause。
  const overallTimer = setTimeout(cancel, SPEAK_TIMEOUT_MS);
  overallTimer.unref?.();
  // 合成迟迟不出声时的兜底：先放文字，别让气泡陪着一起等。
  const waitTimer = setTimeout(showOnce, BUBBLE_VOICE_WAIT_MS);
  waitTimer.unref?.();
  sayCancel = cancel;
  try {
    await loadConfigOnce();
    if (cancelled) {
      // 被掐断（关闭弹幕开关等）：气泡应保持收起，交给 clear 叶子处理，这里不再弹。
      setVoiceState('idle');
      if (utteranceId) reportVoiceUtterance(utteranceId, 'skipped', 'cancelled');
      return;
    }
    if (!voiceEnabled) {
      setVoiceState('idle');
      if (utteranceId) reportVoiceUtterance(utteranceId, 'skipped', 'disabled');
      showOnce();
      return;
    }
    // 先截断到朗读上限，再按句读切分：不改变「最多念多少」，只改变「怎么念」。
    const segments = splitSpeech(speechSlice(text));
    if (segments.length === 0) {
      setVoiceState('idle');
      if (utteranceId) reportVoiceUtterance(utteranceId, 'skipped', 'empty');
      showOnce();
      return;
    }
    seq = ++utteranceSeq;
    setVoiceState('loading');
    let failed = false;
    try {
      // 能真流式（http 直连 + Web Audio）就整段一边收一边播；否则回退「分句 + 整包」。
      const result = canStreamVoice()
        ? await speakStreamed(speechSlice(text), ctl)
        : await speakSegmented(segments, ctl);
      // 串播/流式内部状态会在 ready/failed 间跳，这里按最终结论统一一次图标与回执。
      failed = !cancelled && result.failed;
      if (failed) setVoiceState('failed');
    } finally {
      // 成功、失败、超时、被打断都走这里：气泡在等这个收尾，漏一次就永远挂着。
      // 没出过声（失败 / 始终没就绪）也要把文字放出来，只是没有 start/hold。
      if (!cancelled) showOnce();
      emitUtterance({ kind: 'end', seq, text });
      if (utteranceId) {
        reportVoiceUtterance(
          utteranceId,
          cancelled ? 'skipped' : failed ? 'failed' : 'ended',
          cancelled ? 'cancelled' : failed ? 'speak-failed' : undefined,
        );
      }
    }
    if (cancelled) setVoiceState('idle');
  } finally {
    clearTimeout(overallTimer);
    clearTimeout(waitTimer);
    if (sayCancel === cancel) sayCancel = null;
  }
}

/**
 * 打断当前自动播报（宿主关闭弹幕开关时经 say `clear.stopVoice` 下发到这里）。
 * 中止在途的合成请求、暂停在播音频并释放资源；手动点播不受影响。没在念时无操作。
 */
export function stopSayVoice(): void {
  const cancel = sayCancel;
  sayCancel = null;
  cancel?.();
}

/** 合成与播放的打断控制：调用方（speakIfEnabled）注入「是否已被打断」并登记打断回调。
 *  分段后同一时刻可能有「在播段 + 预取段」，各自登记一个回调，因此 onCancel 要支持多个。
 *  `onFirstAudio` 只在第一段真正可播时调用一次（由编排层保证幂等）。 */
interface SpeakControl {
  isCancelled: () => boolean;
  onCancel: (fn: () => void) => void;
  onFirstAudio: () => void;
}

/** 发起一次 `/voice/speak` 合成，返回可播放的 blob 地址；非音频响应、网络失败或被打断均返回 null。 */
async function fetchAudio(text: string, ctl: SpeakControl): Promise<string | null> {
  const abort = new AbortController();
  ctl.onCancel(() => abort.abort());
  try {
    const response = await fetch(voiceBase + '/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        rate: absoluteRateToEdge(voiceRate),
        ...(voiceName ? { voice: voiceName } : {}),
      }),
      signal: abort.signal,
    });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('audio')) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    /* 含主动 abort：返回 null 由编排层归类，不直接改全局状态，避免预取段失败干扰主状态 */
    return null;
  }
}

/** 播放一段已合成的音频，等到 onended/出错/被打断才返回；返回 false 表示该段未成功读完。 */
async function playAudio(objectUrl: string, ctl: SpeakControl): Promise<boolean> {
  const audio = new Audio(objectUrl);
  await applyPlaybackVolume(audio, voiceVolume);
  if (ctl.isCancelled()) {
    URL.revokeObjectURL(objectUrl);
    return false;
  }
  // 音频就绪即置 ready：喇叭表示「这句有语音」，不跟播放进度绑定
  setVoiceState('ready');
  ctl.onFirstAudio();
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      resolve(ok);
    };
    ctl.onCancel(() => {
      audio.pause();
      finish(true);
    });
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    void audio.play().catch(() => finish(false));
  });
}

/**
 * 分句串播（非流式回退）：第一段合成好即起播，同时预取下一段，播完无缝衔接。
 *
 * 预取严格只提前一段，保证段顺序、且不挤占 host 的串行队列（同一时至多一个在途合成）。
 * 某段失败只记标记并跳过，尽量把其余段念完；返回是否出现过失败，供回执区分 ended/failed。
 */
async function speakSegmented(segments: readonly string[], ctl: SpeakControl): Promise<{ failed: boolean }> {
  let failed = false;
  let next = fetchAudio(segments[0] as string, ctl);
  for (let i = 0; i < segments.length; i++) {
    const objectUrl = await next;
    if (ctl.isCancelled()) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      return { failed };
    }
    // 起播当前段前先把下一段发出去：当前段播放期间，下一段在后台合成。
    if (i + 1 < segments.length) next = fetchAudio(segments[i + 1] as string, ctl);
    if (!objectUrl) {
      failed = true;
      continue;
    }
    const ok = await playAudio(objectUrl, ctl);
    if (!ok && !ctl.isCancelled()) failed = true;
  }
  return { failed };
}

/** 流式 PCM 起播前的最短预缓冲（秒）：太小会在句首听到断续。 */
const STREAM_PREBUFFER_SECONDS = 0.12;

/** 服务端没给 rate 时的 PCM 采样率（与 BREEZE_STREAM_SAMPLE_RATE 一致）。 */
const DEFAULT_STREAM_SAMPLE_RATE = 24_000;

/**
 * 本端能不能走真流式。
 *
 * 需要两个条件同时成立：基址是真实 HTTP（网页同源相对路径，或桌面直连宿主），
 * 以及有 Web Audio（PCM 排程播放靠它）。bridge 自定义协议是整包应答，直接不试。
 */
function canStreamVoice(): boolean {
  if (!audioContextConstructor()) return false;
  return voiceBase.startsWith('/') || /^https?:\/\//i.test(voiceBase);
}

/** 从 `Content-Type` 里读 PCM 采样率；缺失或越界回落默认值。 */
function streamSampleRate(contentType: string): number {
  const match = /rate=(\d+)/i.exec(contentType);
  const rate = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(rate) && rate >= 8_000 && rate <= 96_000 ? rate : DEFAULT_STREAM_SAMPLE_RATE;
}

/** 请求一次流式合成；失败（含打断）返回 null。 */
async function fetchStreamedAudio(text: string, ctl: SpeakControl): Promise<Response | null> {
  const abort = new AbortController();
  ctl.onCancel(() => abort.abort());
  try {
    return await fetch(voiceBase + '/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        rate: absoluteRateToEdge(voiceRate),
        ...(voiceName ? { voice: voiceName } : {}),
        stream: true,
      }),
      signal: abort.signal,
    });
  } catch {
    /* 含主动 abort：返回 null 由编排层归为失败 */
    return null;
  }
}

/**
 * 整段流式播报：一次请求念完整段文本（真流式下再分句只会牺牲韵律）。
 *
 * 服务端若回退成 mp3（引擎不支持流式），本端按整包播放，行为与非流式一致。
 * @returns 是否出现过失败。
 */
async function speakStreamed(text: string, ctl: SpeakControl): Promise<{ failed: boolean }> {
  const response = await fetchStreamedAudio(text, ctl);
  if (!response || ctl.isCancelled()) return { failed: !ctl.isCancelled() };
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) return { failed: true };
  // 引擎不支持流式时宿主回整包 mp3：直接走原来的 blob 播放
  if (!contentType.includes('pcm')) {
    if (!contentType.includes('audio') || !response.body) return { failed: true };
    try {
      const objectUrl = URL.createObjectURL(await response.blob());
      if (ctl.isCancelled()) {
        URL.revokeObjectURL(objectUrl);
        return { failed: false };
      }
      const ok = await playAudio(objectUrl, ctl);
      return { failed: !ok && !ctl.isCancelled() };
    } catch {
      return { failed: true };
    }
  }
  if (!response.body) return { failed: true };
  const sampleRate = streamSampleRate(contentType);
  // 拿不到可用的 AudioContext：把剩余流收成整包，退回 element 播放（音量上限 100%）
  const ctx = await ensureBoostContext();
  if (!ctx) {
    try {
      const objectUrl = URL.createObjectURL(await new Response(response.body).blob());
      if (ctl.isCancelled()) {
        URL.revokeObjectURL(objectUrl);
        return { failed: false };
      }
      const ok = await playAudio(objectUrl, ctl);
      return { failed: !ok && !ctl.isCancelled() };
    } catch {
      return { failed: true };
    }
  }
  return { failed: !(await playPcmStream(response.body, sampleRate, ctx, ctl)) && !ctl.isCancelled() };
}

/**
 * 边收 PCM 边用 Web Audio 排程播放（16bit little-endian，单声道）。
 *
 * 首段攒够 {@link STREAM_PREBUFFER_SECONDS} 才起播，之后每块按时间轴接在上一块后面，
 * 避免网络抖动造成句间断续。取消时停掉所有已排程音源并取消上游流。
 * @returns 是否完整播到结尾（被打断、无音频、上游出错都算 false）。
 */
async function playPcmStream(
  body: ReadableStream<Uint8Array>,
  sampleRate: number,
  ctx: AudioContext,
  ctl: SpeakControl,
): Promise<boolean> {
  const gain = ctx.createGain();
  gain.gain.value = clampVoiceVolume(voiceVolume);
  gain.connect(ctx.destination);
  const sources: AudioBufferSourceNode[] = [];
  const reader = body.getReader();
  let pending = new Uint8Array(0);
  let nextTime = 0;
  let started = false;
  let cancelled = false;

  const stopAll = (): void => {
    if (cancelled) return;
    cancelled = true;
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* 已结束 */
      }
    }
    sources.length = 0;
    try {
      gain.disconnect();
    } catch {
      /* 已断开 */
    }
    void reader.cancel().catch(() => undefined);
  };
  ctl.onCancel(stopAll);

  const schedule = (bytes: Uint8Array): void => {
    if (cancelled) return;
    const even = bytes.byteLength - (bytes.byteLength % 2);
    if (even < 2) return;
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, even / 2);
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) floats[i] = pcm[i] / 32768;
    const buffer = ctx.createBuffer(1, floats.length, sampleRate);
    buffer.copyToChannel(floats, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    const startAt = Math.max(nextTime, ctx.currentTime + 0.05);
    try {
      source.start(startAt);
    } catch {
      return;
    }
    nextTime = startAt + buffer.duration;
    sources.push(source);
    if (!started) {
      started = true;
      setVoiceState('ready');
      ctl.onFirstAudio();
    }
  };

  const prebufferBytes = Math.max(2, Math.round(sampleRate * STREAM_PREBUFFER_SECONDS) * 2);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (cancelled) return false;
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const merged = new Uint8Array(pending.byteLength + value.byteLength);
      merged.set(pending, 0);
      merged.set(value, pending.byteLength);
      const even = merged.byteLength - (merged.byteLength % 2);
      // 预缓冲没攒够：整段留着下次一起排，不能只保留奇数字节的尾巴——那等于把刚收到的音频扔了。
      if (!started && even < prebufferBytes) {
        pending = merged;
        continue;
      }
      pending = merged.slice(even);
      schedule(merged.subarray(0, even));
    }
    if (!cancelled && pending.byteLength >= 2) {
      schedule(pending.subarray(0, pending.byteLength - (pending.byteLength % 2)));
      pending = new Uint8Array(0);
    }
  } catch {
    if (cancelled) return false;
    stopAll();
    return false;
  }
  if (cancelled) return false;
  if (!started) return false;
  // 等已排程的音频放完（按上下文时钟，而不是固定睡多久）
  for (;;) {
    if (cancelled) return false;
    const remainMs = (nextTime - ctx.currentTime) * 1000;
    if (remainMs <= 20) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(50, remainMs)));
  }
  try {
    gain.disconnect();
  } catch {
    /* 已断开 */
  }
  return true;
}

/** 手动点播时正在响的那个音频；新的一句先掐掉旧的，避免两句话叠在一起。 */
let manualAudio: HTMLAudioElement | null = null;

/** 手动点播对外暴露的阶段；`idle` = 没在放（含被打断），`failed` = 合成没成功。 */
export type SpeakPhase = 'idle' | 'loading' | 'playing' | 'failed';

/** 手动点播的世代号：新的点播会作废旧请求的阶段回调，避免旧回调清掉新状态。 */
let manualSeq = 0;

/**
 * 手动播报一句（对话面板的喇叭按钮用）。
 *
 * 与自动播报有两点不同：不看待播标记（用户点的就是这一句），也不受总开关限制——
 * 开关管的是「自动念不念」，用户主动点播是明确意图。音色仍取配置值。
 *
 * @param text - 要念的正文。
 * @param onPhase - 阶段回调：请求合成时 `loading`、音频就绪开始播时 `playing`、播完 `idle`、失败或超时 `failed`。
 */
export function speakText(text: string, onPhase?: (phase: SpeakPhase) => void): void {
  if (!text) return;
  // 喇叭点击当下预热 AudioContext：等 /voice/speak 返回后再 resume，浏览器常已收回手势，>1 增益会掉回 100%。
  void unlockVoiceAudio();
  void playManual(text, onPhase);
}

/** 请求合成并播放手动点播；失败静默，不打断面板交互。 */
async function playManual(text: string, onPhase?: (phase: SpeakPhase) => void): Promise<void> {
  const token = ++manualSeq;
  await loadConfigOnce();
  if (manualAudio) {
    manualAudio.pause();
    manualAudio = null;
  }
  if (token !== manualSeq) return; // 等配置期间又被点了一次：这次直接让位
  onPhase?.('loading');
  try {
    const response = await fetch(voiceBase + '/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        rate: absoluteRateToEdge(voiceRate),
        ...(voiceName ? { voice: voiceName } : {}),
      }),
      signal: speakSignal(),
    });
    if (token !== manualSeq) return;
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('audio')) {
      onPhase?.('failed');
      return;
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    if (token !== manualSeq) return;
    const audio = new Audio(objectUrl);
    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      if (manualAudio === audio) {
        manualAudio = null;
        onPhase?.('idle');
      }
    };
    audio.onerror = () => URL.revokeObjectURL(objectUrl);
    await applyPlaybackVolume(audio, voiceVolume);
    manualAudio = audio;
    onPhase?.('playing');
    await audio.play();
  } catch {
    /* 含超时：面板里还有文字，不弹错误打断阅读，只把按钮换成失败态 */
    if (token === manualSeq) onPhase?.('failed');
  }
}
