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

/** Fish TTS HTTP 总时限（ms）：上游偶发较慢，与 danmu-ji 90s 同口径。 */
export const FISH_SYNTHESIS_TIMEOUT_MS = 90_000;

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
 * @param rate - 已通过 speak 校验的语速表达式。
 */
export function edgeRateToFishSpeed(rate: string): number {
  const sign = rate.startsWith('-') ? -1 : 1;
  const percent = Number(rate.slice(1, -1));
  if (!Number.isFinite(percent)) return 1;
  const speed = 1 + (sign * percent) / 100;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
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
    // 经系统 / 环境代理出站（与 danmu-ji 的 reqwest 默认行为对齐），避开本机污染 DNS 直连超时。
    const response = await fetchViaOutboundProxy(FISH_TTS_URL, {
      method: 'POST',
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
      signal,
    });
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
      throw new VoiceSynthError(
        `Fish Audio 返回内容不是 mp3（头字节 ${bytes.subarray(0, 8).toString('hex')}）`,
      );
    }
    await writeFile(staging, bytes);
    await rename(staging, input.target);
  } catch (error) {
    await rm(staging, { force: true }).catch(() => undefined);
    if (error instanceof VoiceSynthError) throw error;
    throw new VoiceSynthError(error instanceof Error ? error.message : String(error));
  }
}
