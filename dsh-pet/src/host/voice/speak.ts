/**
 * 语音服务：校验输入、串行排队、查缓存、调合成，把结果收敛成「文件路径或失败原因」。
 *
 * 队列放在这里而不是路由里：并发上限是资源约束，与 HTTP 无关。串行保证同一时刻只有
 * 一条上游连接，也保证先点先响——并发合成会让顺序不可预测。
 * 不负责把 mp3 交给客户端：那是路由与 bridge 的事。
 * @module dsh-pet/src/host/voice/speak
 */
import { open, rm, stat, writeFile } from 'node:fs/promises';
import { cacheKey, cachePath, ensureCacheDir, looksLikeMpegAudio, pruneCache } from './cache.ts';
import { VoiceSynthError, synthesize, type SynthInput } from './edge.ts';
import { edgeRateToFishSpeed, synthesizeFish, FISH_SYNTHESIS_TIMEOUT_MS } from './fish.ts';
import {
  DEFAULT_FISH_TTS_MODEL,
  DEFAULT_FISH_VOICE,
  FISH_TTS_MODELS,
  isKnownFishVoice,
  listFishVoices,
  normalizeFishCustomVoices,
  normalizeFishTtsModel,
  type FishCustomVoice,
} from './fish-voices.ts';
import { BUILTIN_VOICE_ID, activeVoiceProvider, type VoiceProvider as RegisteredVoiceProvider } from './registry.ts';
import { absoluteRateToEdge, clampVoiceRate, DEFAULT_VOICE_RATE } from '../../shared/voice-params.ts';
import {
  DEFAULT_VOICE,
  DEFAULT_VOICE_PROVIDER,
  VOICES,
  isEdgeVoice,
  normalizeVoiceProvider,
  type VoiceInfo,
  type VoiceProvider,
} from './voices.ts';

/** 单次请求允许的最大文本长度（字符，按 UTF-16 计）。 */
export const MAX_TEXT_CHARS = 500;
/** 同时排队的合成上限（含正在跑的那个）；超出直接拒绝，不无限堆积。 */
export const MAX_QUEUE = 3;

/** 语速表达式：`+N%` 或 `-N%`。 */
const RATE_PATTERN = /^[+-]\d{1,3}%$/;
/** 语速下界（百分比）。 */
const RATE_MIN_PERCENT = -50;
/** 语速上界（百分比）。 */
const RATE_MAX_PERCENT = 100;
/** 第三方实现的单次合成上限（ms）：与内置同口径，避免一句卡住串行队列。 */
const PROVIDER_TIMEOUT_MS = 15_000;
/** 内置 edge 合成的总时限（ms）：依赖自带的 15s 只是「静默」超时，每来一帧就重置，不能当总时限用。 */
const BUILTIN_TIMEOUT_MS = 28_000;
/** 排队超过这么久还没轮到就丢弃（ms）：按最慢的内置引擎（Fish 90s）留余量。 */
const STALE_WAIT_MS = FISH_SYNTHESIS_TIMEOUT_MS;

/** 一次合成的输入（已校验）。 */
interface SpeakInput {
  readonly text: string;
  readonly voice: string;
  readonly rate: string;
}

/** 失败原因；路由层原样映射成 `result.ts` 的 reason。 */
export type SpeakFailure = 'bad-request' | 'voice-busy' | 'generate-error';

/** 合成结果：成功时给出最终 mp3 的绝对路径。 */
export type SpeakResult = { ok: true; file: string } | { ok: false; reason: SpeakFailure; message: string };

/** speak 运行时读取的 Fish / 引擎配置（每次请求现查，保存后立刻生效）。 */
export interface VoiceRuntimeConfig {
  readonly provider: VoiceProvider;
  readonly fishApiKey: string;
  readonly fishTtsModel: string;
  readonly fishVoices: readonly FishCustomVoice[];
  /** 绝对语速 0.5–2；请求体未带 rate 时换成 Edge 的 `+N%`。 */
  readonly voiceRate: number;
}

/** 音色目录响应：Edge / Fish 分列，外加当前引擎下的合并列表（兼容旧客户端只读 `voices`）。 */
export interface VoiceCatalog {
  readonly voices: readonly VoiceInfo[];
  readonly edgeVoices: readonly VoiceInfo[];
  readonly fishVoices: readonly VoiceInfo[];
  readonly fishModels: readonly { id: string; label: string }[];
  readonly voiceProvider: VoiceProvider;
}

/** 语音服务：路由层只依赖这两个方法。 */
export interface VoiceService {
  /** 合成一段文本；同一输入命中缓存时不再联网。 */
  speak(raw: unknown): Promise<SpeakResult>;
  /** 可选音色目录（与白名单同源）。 */
  listVoices(): VoiceCatalog;
}

/** 解析结论：成功给已校验输入，失败给一句可直接回给调用方的说明。 */
type ParseResult = { ok: true; value: SpeakInput } | { ok: false; message: string };

/** 默认运行时配置：没有注入读取函数时当 Edge。 */
const DEFAULT_RUNTIME: VoiceRuntimeConfig = {
  provider: DEFAULT_VOICE_PROVIDER,
  fishApiKey: '',
  fishTtsModel: DEFAULT_FISH_TTS_MODEL,
  fishVoices: [],
  voiceRate: DEFAULT_VOICE_RATE,
};

/** 校验请求体；只认 `text` / `voice` / `rate` 三个字段，其余忽略。 */
function parseSpeakInput(raw: unknown, runtime: VoiceRuntimeConfig): ParseResult {
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return { ok: false, message: 'text is required' };
  if (text.length > MAX_TEXT_CHARS) return { ok: false, message: `text too long (max ${MAX_TEXT_CHARS} chars)` };
  const defaultVoice = runtime.provider === 'fish' ? DEFAULT_FISH_VOICE : DEFAULT_VOICE;
  const voice = body.voice === undefined ? defaultVoice : body.voice;
  if (typeof voice !== 'string') {
    return { ok: false, message: 'voice must be a string' };
  }
  if (runtime.provider === 'fish') {
    if (!isKnownFishVoice(voice, runtime.fishVoices)) {
      const allowed = listFishVoices(runtime.fishVoices)
        .map((item) => item.id)
        .join(', ');
      return { ok: false, message: `unknown fish voice; allowed: ${allowed}` };
    }
  } else if (!isEdgeVoice(voice)) {
    return { ok: false, message: `unknown voice; allowed: ${VOICES.map((item) => item.id).join(', ')}` };
  }
  const rate = body.rate === undefined ? absoluteRateToEdge(runtime.voiceRate) : body.rate;
  if (typeof rate !== 'string' || !RATE_PATTERN.test(rate)) {
    return { ok: false, message: 'rate must look like +0% or -10%' };
  }
  const percent = Number(rate.slice(1, -1));
  if (!Number.isFinite(percent) || percent < RATE_MIN_PERCENT || percent > RATE_MAX_PERCENT) {
    return { ok: false, message: `rate out of range (${RATE_MIN_PERCENT}%..+${RATE_MAX_PERCENT}%)` };
  }
  return { ok: true, value: { text, voice, rate } };
}

/** 断言用：`SpeakResult` 的构造点都经过这里，避免各处手写同一句文案。 */
function dropped(): SpeakResult {
  return { ok: false, reason: 'voice-busy', message: 'queued too long, dropped' };
}

/**
 * 这一条排队等得太久了吗。
 *
 * 等得比一次合成允许的时长还久，客户端那边早已超时放弃：再合成只是白烧上游，
 * 而且声音出来时说的已经是上一件事。
 *
 * @param queuedMs - 入队时刻。
 * @param nowMs - 轮到自己时的时刻。
 * @param waitMs - 容许的最长排队时间；缺省用 {@link STALE_WAIT_MS}，测试注入更短的值。
 * @returns 应该丢弃时为 true。
 * @internal
 */
export function isQueueStale(queuedMs: number, nowMs: number, waitMs: number = STALE_WAIT_MS): boolean {
  return nowMs - queuedMs > waitMs;
}

/** 造语音服务。 */
export function createVoiceService(options: {
  /** 用户数据根；缓存落在 `<userRoot>/voice-cache/`。 */
  userRoot: string;
  /** 留痕用；不传则静默。只记字数与结果，不记正文（用户内容不进日志）。 */
  log?: { info?(message: string): void; warn?(message: string): void };
  /** 合成实现；测试注入替身，缺省走 edge 的真实实现。 */
  synthesize?: (input: SynthInput) => Promise<void>;
  /** Fish 合成实现；测试注入替身。 */
  synthesizeFish?: typeof synthesizeFish;
  /** 每次合成前读取的引擎配置；缺省当 Edge。 */
  readRuntime?: () => VoiceRuntimeConfig;
  /** 容许的最长排队时间（ms）；缺省 {@link STALE_WAIT_MS}，测试用它把丢弃分支逼出来。 */
  staleWaitMs?: number;
}): VoiceService {
  const { userRoot, log } = options;
  const synthesizeImpl = options.synthesize ?? synthesize;
  const synthesizeFishImpl = options.synthesizeFish ?? synthesizeFish;
  const readRuntime = options.readRuntime ?? (() => DEFAULT_RUNTIME);
  const staleWaitMs = options.staleWaitMs ?? STALE_WAIT_MS;
  /** 已占用的队列名额（含正在跑的那个）。 */
  let queueUsed = 0;
  /** 串行链：上一件事收尾（成功或失败）后才轮到下一件。 */
  let chain: Promise<void> = Promise.resolve();

  /** 把一次合成排进串行链；无论成败都释放名额。 */
  function enqueue(task: () => Promise<void>): Promise<void> {
    queueUsed += 1;
    const run = chain.then(task, task);
    // 链本身不能带拒绝，否则后续任务会继承同一个失败；拒绝只交给本次的调用方
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run.finally(() => {
      queueUsed -= 1;
    });
  }

  /** 缓存命中返回文件路径；不存在、空文件或头不是 MPEG 时返回 undefined（并删掉坏缓存）。 */
  async function findCached(target: string): Promise<string | undefined> {
    try {
      const info = await stat(target);
      if (!info.isFile() || info.size <= 0) return undefined;
      const handle = await open(target, 'r');
      try {
        const head = Buffer.alloc(3);
        const { bytesRead } = await handle.read(head, 0, 3, 0);
        if (bytesRead < 2 || !looksLikeMpegAudio(head.subarray(0, bytesRead))) {
          await rm(target, { force: true });
          return undefined;
        }
      } finally {
        await handle.close();
      }
      return target;
    } catch {
      return undefined;
    }
  }

  function catalog(): VoiceCatalog {
    const runtime = readRuntime();
    const provider = normalizeVoiceProvider(runtime.provider);
    const fish = listFishVoices(runtime.fishVoices);
    return {
      voiceProvider: provider,
      edgeVoices: VOICES,
      fishVoices: fish,
      fishModels: FISH_TTS_MODELS.map((item) => ({ id: item.id, label: item.label })),
      voices: provider === 'fish' ? fish : VOICES,
    };
  }

  async function speak(raw: unknown): Promise<SpeakResult> {
    const runtime = readRuntime();
    const parsed = parseSpeakInput(raw, runtime);
    if (!parsed.ok) return { ok: false, reason: 'bad-request', message: parsed.message };
    const { text, voice, rate } = parsed.value;
    // 每次请求现查一次：第三方可能运行中才注册、也可能被卸载，启动快照会漏掉这两种
    const registered = activeVoiceProvider();
    // 第三方注册优先于内置引擎（与旧行为一致：单槽覆盖）
    const provider = registered;
    const engine = normalizeVoiceProvider(runtime.provider);
    const model = normalizeFishTtsModel(runtime.fishTtsModel);
    const source = provider ? provider.id : engine === 'fish' ? `fish:${model}` : BUILTIN_VOICE_ID;
    // 第三方没有音色概念，缓存键里把 voice 置空；来源进键，换实现 / 换模型不会命中旧音频
    const target = cachePath(userRoot, cacheKey(source, provider ? '' : voice, rate, text));
    const startedMs = Date.now();
    const cached = await findCached(target);
    if (cached) {
      log?.info?.(`[blue-fish] voice speak: cache=hit chars=${text.length} voice=${source}`);
      return { ok: true, file: cached };
    }
    if (queueUsed >= MAX_QUEUE) {
      log?.warn?.(`[blue-fish] voice speak: queue full (max ${MAX_QUEUE}) chars=${text.length} voice=${source}`);
      return { ok: false, reason: 'voice-busy', message: 'voice queue is full, retry later' };
    }
    const queue = { dropped: false };
    const queuedMs = Date.now();
    try {
      await enqueue(async () => {
        if (isQueueStale(queuedMs, Date.now(), staleWaitMs)) {
          queue.dropped = true;
          return;
        }
        const dir = await ensureCacheDir(userRoot);
        if (provider) {
          await synthesizeWithProvider(provider, { text, voice, rate, target });
        } else if (engine === 'fish') {
          await synthesizeFishImpl({
            signal: AbortSignal.timeout(FISH_SYNTHESIS_TIMEOUT_MS),
            target,
            text,
            voice,
            speed: edgeRateToFishSpeed(rate),
            model,
            apiKey: runtime.fishApiKey,
          });
        } else {
          await synthesizeImpl({ signal: AbortSignal.timeout(BUILTIN_TIMEOUT_MS), target, text, voice, rate });
        }
        // 淘汰放在成功之后：失败时不该为腾地方而删掉还能用的缓存
        await pruneCache(dir);
      });
    } catch (error) {
      // 上游细节（含 URL、状态码）不外泄，只留在日志里
      log?.warn?.(
        `[blue-fish] voice speak: failed chars=${text.length} voice=${source} ` +
          `ms=${Date.now() - startedMs} reason=${error instanceof VoiceSynthError ? error.message : String(error)}`,
      );
      return { ok: false, reason: 'generate-error', message: 'voice synthesis failed' };
    }
    if (queue.dropped) {
      log?.warn?.(
        `[blue-fish] voice speak: dropped chars=${text.length} voice=${source} queued=${Date.now() - queuedMs}ms`,
      );
      return dropped();
    }
    log?.info?.(`[blue-fish] voice speak: cache=miss chars=${text.length} voice=${source} ms=${Date.now() - startedMs}`);
    return { ok: true, file: target };
  }

  return { listVoices: catalog, speak };
}

/** 给一个 Promise 套超时；超时 reject，原 Promise 不被取消（provider 自己该处理放弃）。 */
function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('voice provider timed out')), timeoutMs);
    timer.unref?.();
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 用第三方实现合成并落盘。
 *
 * 空字节按失败处理：0 字节文件会被 {@link findCached} 的 `size > 0` 跳过，
 * 于是每次请求都重新合成、每次又得到空文件，白烧上游。
 */
async function synthesizeWithProvider(provider: RegisteredVoiceProvider, input: SynthInput): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await withTimeout(provider.synthesize({ text: input.text, rate: input.rate }), PROVIDER_TIMEOUT_MS);
  } catch (error) {
    throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
  }
  if (bytes.length === 0) throw new VoiceSynthError('voice provider returned empty audio');
  await writeFile(input.target, bytes);
}

/**
 * 从成品 main 条目抽出 speak 需要的运行时配置。
 * @param main - `readAllConfig(...).main`。
 */
export function voiceRuntimeFromMain(main: Record<string, unknown> | undefined): VoiceRuntimeConfig {
  if (!main) return DEFAULT_RUNTIME;
  return {
    provider: normalizeVoiceProvider(main.voiceProvider),
    fishApiKey: typeof main.fishApiKey === 'string' ? main.fishApiKey : '',
    fishTtsModel: normalizeFishTtsModel(main.fishTtsModel),
    fishVoices: normalizeFishCustomVoices(main.fishVoices),
    voiceRate: clampVoiceRate(main.voiceRate),
  };
}
