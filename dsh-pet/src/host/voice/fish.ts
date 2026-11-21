/**
 * Fish Audio TTS 封装：Bearer + reference_id 换 mp3，失败收敛成 {@link VoiceSynthError}。
 *
 * 契约对齐 danmu-ji 的 `fish_tts_speak`：`POST https://api.fish.audio/v1/tts`，
 * 请求头带 `model`，正文用 `reference_id`。不负责缓存与队列。
 * @module dsh-pet/src/host/voice/fish
 */
import { rename, rm, writeFile } from 'node:fs/promises';
import { decodeChunkedBody } from '../net/proxy-fetch.ts';
import { fetchViaOutboundProxy } from '../net/proxy-fetch.ts';
import { looksLikeMpegAudio } from './cache.ts';
import { VoiceSynthError } from './edge.ts';
import { isFishVoiceIdFormat } from './fish-voices.ts';
import { percentRateToSpeed } from '../../shared/voice-params.ts';

/** Fish TTS HTTP 总时限（ms）：上游偶发较慢，与 danmu-ji 90s 同口径。 */
export const FISH_SYNTHESIS_TIMEOUT_MS = 90_000;

/** 单次尝试的时限（ms）：卡住的连接不该吃掉全部总时限，留余量给重试。 */
const FISH_ATTEMPT_TIMEOUT_MS = 30_000;

/** 网络层失败的总尝试次数：直连偶发 TLS 重置会白等数秒且丢首句，一次重试基本能救回。 */
const FISH_MAX_ATTEMPTS = 2;

/** 两次尝试之间的退避（ms）：瞬时重置立刻重连通常还是失败。 */
const FISH_RETRY_DELAY_MS = 200;

/** Fish Audio TTS 端点。 */
const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';

/** 语速下界（绝对倍率）。 */
const SPEED_MIN = 0.5;
/** 语速上界（绝对倍率）。 */
const SPEED_MAX = 2;

/** 一次 Fish 合成需要的参数。 */
export interface FishSynthInput {
  /** 已通过长度与空白校验的文本。 */
  readonly text: string;
  /** Fish Voice ID（= reference_id）。 */
  readonly voice: string;
  /** 绝对语速倍率，落在 0.5–2.0。 */
  readonly speed: number;
  /** 合成模型 id（请求头 `model`）。 */
  readonly model: string;
  /** Bearer API Key。 */
  readonly apiKey: string;
  /** 目标 mp3 的最终路径；父目录必须已存在。 */
  readonly target: string;
  /** 总时限；缺省 {@link FISH_SYNTHESIS_TIMEOUT_MS}。 */
  readonly signal?: AbortSignal;
}

/**
 * 把 Edge 风格的 `+N%` / `-N%` 映射成 Fish 的绝对语速。
 *
 * `+0%` → 1.0，`+50%` → 1.5，`-50%` → 0.5；结果夹到 0.5–2.0。
 * 与 Breeze 的 `voice_settings.speed` 同一份换算，实现收敛在 shared/voice-params。
 * @param rate - 已通过 speak 校验的语速表达式。
 */
export function edgeRateToFishSpeed(rate: string): number {
  return percentRateToSpeed(rate);
}

/** 等 `ms` 后继续；总信号已中止时立刻返回，不再空等。 */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    // 不 unref：退避期间必须真的等到点，否则进程空闲时会直接退出、把重试吞掉。
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

/**
 * 向 Fish 发一次合成请求；网络层失败（连接被重置、TLS 握手断开、单次尝试超时）重试一次。
 *
 * 只重试「没拿到响应」的情况：上游明确回的非 2xx 不在这里重试。
 * 调用方主动中止（切句、整段超时）时立刻放弃，不再空等。
 */
async function requestFishTts(
  init: { headers: Record<string, string>; body: string },
  signal: AbortSignal,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= FISH_MAX_ATTEMPTS; attempt += 1) {
    const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(FISH_ATTEMPT_TIMEOUT_MS)]);
    try {
      // 经系统 / 环境代理出站（与 danmu-ji 的 reqwest 默认行为对齐），避开本机污染 DNS 直连超时。
      return await fetchViaOutboundProxy(FISH_TTS_URL, { method: 'POST', ...init, signal: attemptSignal });
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === FISH_MAX_ATTEMPTS) break;
      await delay(FISH_RETRY_DELAY_MS, signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * 把一段文本经 Fish Audio 合成到目标 mp3。
 *
 * 先写 `<target>.part` 再改名：中途失败不会留下半截 mp3 被缓存命中。
 * @param input - 文本、音色、语速、模型、密钥与目标路径。
 * @throws {VoiceSynthError} 缺密钥、上游失败、超时或写盘失败时。
 */
export async function synthesizeFish(input: FishSynthInput): Promise<void> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new VoiceSynthError('请先填写 Fish Audio API Key');
  const text = input.text.trim();
  if (!text) throw new VoiceSynthError('朗读文本为空');
  const voice = input.voice.trim();
  if (!voice) throw new VoiceSynthError('请先选择 Fish Audio 音色');
  if (!isFishVoiceIdFormat(voice)) throw new VoiceSynthError('Voice ID 格式不正确');
  const model = input.model.trim() || 's2.1-pro-free';
  const speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, input.speed));
  const signal = input.signal ?? AbortSignal.timeout(FISH_SYNTHESIS_TIMEOUT_MS);
  const staging = `${input.target}.part`;

  try {
    const response = await requestFishTts(
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          model,
          Accept: 'audio/mpeg, audio/*, application/octet-stream',
        },
        body: JSON.stringify({
          text,
          reference_id: voice,
          format: 'mp3',
          mp3_bitrate: 128,
          normalize: true,
          prosody: { speed, volume: 0, normalize_loudness: true },
        }),
      },
      signal,
    );
    let bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      const snippet = bytes.toString('utf8').slice(0, 240);
      throw new VoiceSynthError(`Fish Audio TTS 失败 (${response.status}): ${snippet}`);
    }
    if (bytes.length < 32) {
      throw new VoiceSynthError(
        `Fish Audio 返回音频过短（${bytes.length} 字节，Content-Type: ${response.headers.get('content-type') ?? ''}）`,
      );
    }
    if (bytes[0] === 0x7b /* '{' */) {
      const snippet = bytes.toString('utf8').slice(0, 240);
      throw new VoiceSynthError(`Fish Audio 未返回音频: ${snippet}`);
    }
    // 与弹幕机一致：落盘 / 播放前必须是 MPEG；若仍像 chunked 残片则再解一次兜底。
    if (!looksLikeMpegAudio(bytes)) {
      try {
        const recovered = decodeChunkedBody(bytes);
        if (looksLikeMpegAudio(recovered)) bytes = recovered;
      } catch {
        /* 下面统一报头校验失败 */
      }
    }
    if (!looksLikeMpegAudio(bytes)) {
      throw new VoiceSynthError(`Fish Audio 返回内容不是 mp3（头字节 ${bytes.subarray(0, 8).toString('hex')}）`);
    }
    await writeFile(staging, bytes);
    await rename(staging, input.target);
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined);
    if (error instanceof VoiceSynthError) throw error;
    throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
  }
}
