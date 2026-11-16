/**
 * Breeze Blue TTS 封装：`xi-api-key` + Voice ID 换 mp3，失败收敛成 {@link VoiceSynthError}。
 *
 * 契约对齐 danmu-ji 的 `breeze_tts_speak`：`POST https://api.breeze.blue/v1/text-to-speech/{id}/stream`，
 * 走 `/stream?output_format=mp3`（首包更快、体积更小），收齐后落盘成一份 mp3。
 * 请求体只有 `text` 与 `voice_settings.speed`，语速由绝对倍率 0.5–2.0 换算而来。
 *
 * 与弹幕机的差别只在「谁来播」：那边把 PCM 逐块推给前端做流式播放，这边沿用桌宠的
 * 「合成 → mp3 → 端侧播放」链路，因此请求 mp3 而不是 PCM。不负责缓存与队列。
 * @module dsh-pet/src/host/voice/breeze
 */
import { rename, rm, writeFile } from 'node:fs/promises';
import { decodeChunkedBody, fetchViaOutboundProxy } from '../net/proxy-fetch.ts';
import { percentRateToSpeed } from '../../shared/voice-params.ts';
import { looksLikeMpegAudio } from './cache.ts';
import { VoiceSynthError } from './edge.ts';
import { isBreezeVoiceIdFormat } from './breeze-voices.ts';

/** Breeze TTS HTTP 总时限（ms）：与 danmu-ji 的 reqwest 90s 同口径。 */
export const BREEZE_SYNTHESIS_TIMEOUT_MS = 90_000;

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

/**
 * 把一段文本经 Breeze Blue 合成到目标 mp3。
 *
 * 先写 `<target>.part` 再改名：中途失败不会留下半截 mp3 被缓存命中逻辑当成有效音频。
 * @param input - 文本、音色、语速、密钥与目标路径。
 * @throws {VoiceSynthError} 缺密钥、上游失败、超时、返回非 mp3 或写盘失败时。
 */
export async function synthesizeBreeze(input: BreezeSynthInput): Promise<void> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new VoiceSynthError('请先填写 Breeze Blue API Key');
  const text = input.text.trim();
  if (!text) throw new VoiceSynthError('朗读文本为空');
  const voice = input.voice.trim();
  if (!voice) throw new VoiceSynthError('请先选择 Breeze 音色');
  if (!isBreezeVoiceIdFormat(voice)) throw new VoiceSynthError('Voice ID 格式不正确');
  const speed = Math.min(2, Math.max(0.5, Number(input.speed) || 1));
  const signal = input.signal ?? AbortSignal.timeout(BREEZE_SYNTHESIS_TIMEOUT_MS);
  const staging = `${input.target}.part`;
  const url = `${BREEZE_TTS_BASE}/${encodeURIComponent(voice)}/stream?output_format=mp3`;

  try {
    // 经系统 / 环境代理出站（与 danmu-ji 的 reqwest 默认行为对齐），避开本机污染 DNS 直连超时。
    const response = await fetchViaOutboundProxy(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg, audio/*, application/octet-stream',
      },
      body: JSON.stringify({ text, voice_settings: { speed } }),
      signal,
    });
    let bytes = Buffer.from(await response.arrayBuffer());
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
