/**
 * Breeze Blue TTS 封装：`xi-api-key` + Voice ID 换音频，失败收敛成 {@link VoiceSynthError}。
 *
 * 契约对齐 danmu-ji 的 `breeze_tts_speak`：`POST https://api.breeze.blue/v1/text-to-speech/{id}/stream`。
 * 请求体只有 `text` 与 `voice_settings.speed`，语速由绝对倍率 0.5–2.0 换算而来。
 *
 * 两条出口：
 * - {@link synthesizeBreeze}：要 mp3、收齐落盘，给缓存 / bridge / 非流式链路；
 * - {@link synthesizeBreezeStream}：要 PCM、边收边转，给网页与独立模式桌宠的真流式播放。
 * 不负责缓存与队列。
 * @module dsh-pet/src/host/voice/breeze
 */
import { rename, rm, writeFile } from 'node:fs/promises';
import { decodeChunkedBody, fetchStreamViaOutboundProxy, fetchViaOutboundProxy } from '../net/proxy-fetch.ts';
import { percentRateToSpeed } from '../../shared/voice-params.ts';
import { looksLikeMpegAudio } from './cache.ts';
import { VoiceSynthError } from './edge.ts';
import { isBreezeVoiceIdFormat } from './breeze-voices.ts';

/** Breeze TTS HTTP 总时限（ms）：与 danmu-ji 的 reqwest 90s 同口径。 */
export const BREEZE_SYNTHESIS_TIMEOUT_MS = 90_000;

/** Breeze 流式 PCM 的采样率（Hz）：与 danmu-ji 的 AudioContext 一致。 */
export const BREEZE_STREAM_SAMPLE_RATE = 24_000;

/** 流式响应的 Content-Type：前端据此识别 PCM 与采样率。 */
export const BREEZE_STREAM_CONTENT_TYPE = `audio/pcm; rate=${BREEZE_STREAM_SAMPLE_RATE}; channels=1; format=s16le`;

/** Breeze TTS 端点前缀；后面拼 Voice ID 与 `/stream`。 */
const BREEZE_TTS_BASE = 'https://api.breeze.blue/v1/text-to-speech';

/** 一次 Breeze 合成需要的参数。 */
export interface BreezeSynthInput {
  /** 已通过长度与空白校验的文本。 */
  readonly text: string;
  /** Breeze Voice ID（内置大肥鱼或用户追加的自定义音色）。 */
  readonly voice: string;
  /** 绝对语速倍率，落在 0.5–2.0；换算成 `voice_settings.speed`。 */
  readonly speed: number;
  /** Developer API Key（请求头 `xi-api-key`）。 */
  readonly apiKey: string;
  /** 目标 mp3 的最终路径；父目录必须已存在。 */
  readonly target: string;
  /** 总时限；缺省 {@link BREEZE_SYNTHESIS_TIMEOUT_MS}。 */
  readonly signal?: AbortSignal;
}

/**
 * 把 `+N% / -N%` 形式的语速换成 Breeze 的绝对倍率。
 * @param rate - 已通过 speak 校验的语速表达式。
 */
export function breezeRateToSpeed(rate: string): number {
  return percentRateToSpeed(rate);
}

/** 429 时最多尝试次数：Breeze 容量是瞬时争抢，`retry_after_seconds` 通常 1–2 秒。 */
const BREEZE_MAX_ATTEMPTS = 3;

/** 等一会儿再重试；优先用上游 `Retry-After`，没有则按次数线性退避。 */
function breezeRetryDelayMs(response: Response, attempt: number): number {
  const header = Number(response.headers.get('retry-after'));
  const seconds = Number.isFinite(header) && header > 0 ? header : attempt * 1.2;
  return Math.min(5_000, Math.max(50, Math.round(seconds * 1000)));
}

/** 可被总时限打断的等待：`sleep` 只是退避，不引入新的取消机制。 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 校验并归一合成入参；两条出口共用。 */
function resolveBreezeParams(input: {
  readonly apiKey: string;
  readonly text: string;
  readonly voice: string;
  readonly speed: number;
}): { apiKey: string; text: string; voice: string; speed: number } {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new VoiceSynthError('请先填写 Breeze Blue API Key');
  const text = input.text.trim();
  if (!text) throw new VoiceSynthError('朗读文本为空');
  const voice = input.voice.trim();
  if (!voice) throw new VoiceSynthError('请先选择 Breeze 音色');
  if (!isBreezeVoiceIdFormat(voice)) throw new VoiceSynthError('Voice ID 格式不正确');
  const speed = Math.min(2, Math.max(0.5, Number(input.speed) || 1));
  return { apiKey, text, voice, speed };
}

/**
 * 把一段文本经 Breeze Blue 合成到目标 mp3。
 *
 * 先写 `<target>.part` 再改名：中途失败不会留下半截 mp3 被缓存命中逻辑当成有效音频。
 * 429（容量瞬时耗尽）按上游给的 `Retry-After` 重试，最多三次。
 * @param input - 文本、音色、语速、密钥与目标路径。
 * @throws {VoiceSynthError} 缺密钥、上游失败、超时、返回非 mp3 或写盘失败时。
 */
export async function synthesizeBreeze(input: BreezeSynthInput): Promise<void> {
  const { apiKey, text, voice, speed } = resolveBreezeParams(input);
  const signal = input.signal ?? AbortSignal.timeout(BREEZE_SYNTHESIS_TIMEOUT_MS);
  const staging = `${input.target}.part`;
  const url = `${BREEZE_TTS_BASE}/${encodeURIComponent(voice)}/stream?output_format=mp3`;

  try {
    let response: Response;
    let bytes: Buffer;
    for (let attempt = 1; ; attempt += 1) {
      // 经系统 / 环境代理出站（与 danmu-ji 的 reqwest 默认行为对齐），避开本机污染 DNS 直连超时。
      response = await fetchViaOutboundProxy(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg, audio/*, application/octet-stream',
        },
        body: JSON.stringify({ text, voice_settings: { speed } }),
        signal,
      });
      bytes = Buffer.from(await response.arrayBuffer());
      if (response.ok || response.status !== 429 || attempt >= BREEZE_MAX_ATTEMPTS) break;
      await sleep(breezeRetryDelayMs(response, attempt));
    }
    if (!response.ok) {
      const snippet = bytes.toString('utf8').slice(0, 240);
      throw new VoiceSynthError(`Breeze TTS 失败 (${response.status}): ${snippet}`);
    }
    if (bytes[0] === 0x7b /* '{' */) {
      const snippet = bytes.toString('utf8').slice(0, 240);
      throw new VoiceSynthError(`Breeze 未返回音频: ${snippet}`);
    }
    if (bytes.length < 32) {
      throw new VoiceSynthError(
        `Breeze 返回音频过短（${bytes.length} 字节，Content-Type: ${response.headers.get('content-type') ?? ''}）`,
      );
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
      throw new VoiceSynthError(`Breeze 返回内容不是 mp3（头字节 ${bytes.subarray(0, 8).toString('hex')}）`);
    }
    await writeFile(staging, bytes);
    await rename(staging, input.target);
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined);
    if (error instanceof VoiceSynthError) throw error;
    throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
  }
}

/** 流式合成入参：与 {@link BreezeSynthInput} 相同，但没有落盘目标。 */
export type BreezeStreamInput = Omit<BreezeSynthInput, 'target'>;

/** 流式合成结果：PCM 字节流 + 给调用方的内容类型。 */
export interface BreezeStreamResult {
  readonly stream: ReadableStream<Uint8Array>;
  readonly contentType: string;
}

/**
 * 把一段文本经 Breeze Blue 合成成 PCM 流：解析完响应头、拿到第一块音频就返回。
 *
 * 首块先校验（JSON 错误体、空流）再交出去，避免把上游错误当成音频写给客户端；
 * 剩余字节随上游到达逐块入流，客户端可以边收边播。
 * 少于 32 字节的音频在流结束时按错误收尾，由客户端标记这句失败。
 *
 * @param input - 文本、音色、语速、密钥与总时限。
 * @throws {VoiceSynthError} 缺密钥 / 上游失败 / 超时 / 首块不是音频时。
 */
export async function synthesizeBreezeStream(input: BreezeStreamInput): Promise<BreezeStreamResult> {
  const { apiKey, text, voice, speed } = resolveBreezeParams(input);
  const signal = input.signal ?? AbortSignal.timeout(BREEZE_SYNTHESIS_TIMEOUT_MS);
  const url = `${BREEZE_TTS_BASE}/${encodeURIComponent(voice)}/stream?output_format=pcm`;

  let response: Response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      // 经系统 / 环境代理出站；流式版本解析完响应头就返回，正文继续按到达顺序读取。
      response = await fetchStreamViaOutboundProxy(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/pcm, application/octet-stream, */*',
        },
        body: JSON.stringify({ text, voice_settings: { speed } }),
        signal,
      });
    } catch (error) {
      throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
    }
    if (response.ok) break;
    // 429 是瞬时容量争抢：把错误体丢掉，等 `Retry-After` 再要一次
    if (response.status === 429 && attempt < BREEZE_MAX_ATTEMPTS) {
      await response.body?.cancel().catch(() => undefined);
      await sleep(breezeRetryDelayMs(response, attempt));
      continue;
    }
    const snippet = (await response.text().catch(() => '')).slice(0, 240);
    throw new VoiceSynthError(`Breeze TTS 流式失败 (${response.status}): ${snippet}`);
  }
  const body = response.body;
  if (!body) throw new VoiceSynthError('Breeze 未返回音频流');

  const reader = body.getReader();
  let first: ReadableStreamReadResult<Uint8Array>;
  try {
    first = await reader.read();
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
  }
  if (first.done || !first.value || first.value.byteLength === 0) {
    await reader.cancel().catch(() => undefined);
    throw new VoiceSynthError('Breeze 未返回音频流');
  }
  if (first.value[0] === 0x7b /* '{' */) {
    const snippet = Buffer.from(first.value).toString('utf8').slice(0, 240);
    await reader.cancel().catch(() => undefined);
    throw new VoiceSynthError(`Breeze 未返回音频: ${snippet}`);
  }

  const head = first.value;
  let total = head.byteLength;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(head);
    },
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (total < 32) {
            controller.error(new VoiceSynthError(`Breeze 返回音频过短（${total} 字节）`));
          } else {
            controller.close();
          }
          return;
        }
        if (value && value.byteLength > 0) {
          total += value.byteLength;
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason).catch(() => undefined);
    },
  });

  return { stream, contentType: BREEZE_STREAM_CONTENT_TYPE };
}
