/**
 * 语音语速 / 音量的共用口径：配置存绝对值，Edge 请求再换成 `+N%`。
 *
 * 音量 0–3（300%）：`HTMLAudioElement.volume` 只到 1，超过 1 由播放侧 Web Audio 增益补。
 * 语速 0.5–2：与 Fish 绝对倍率、Edge ±50%…+100% 同量纲。
 * @module dsh-pet/src/shared/voice-params
 */

/** 默认语速（1 = 原速）。 */
export const DEFAULT_VOICE_RATE = 1;
/** 语速下限。 */
export const VOICE_RATE_MIN = 0.5;
/** 语速上限。 */
export const VOICE_RATE_MAX = 2;
/** 默认音量（1 = 100%）。 */
export const DEFAULT_VOICE_VOLUME = 1;
/** 音量上限（3 = 300%）。 */
export const VOICE_VOLUME_MAX = 3;

/** 把配置里的语速夹到合法区间；非法回落默认。 */
export function clampVoiceRate(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_RATE;
  return Math.min(VOICE_RATE_MAX, Math.max(VOICE_RATE_MIN, n));
}

/** 把配置里的音量夹到 0–{@link VOICE_VOLUME_MAX}；非法回落默认。 */
export function clampVoiceVolume(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_VOICE_VOLUME;
  return Math.min(VOICE_VOLUME_MAX, Math.max(0, n));
}

/**
 * 绝对语速 → Edge / speak 请求体用的 `+N%` / `-N%`。
 * 1 → `+0%`，1.5 → `+50%`，0.5 → `-50%`。
 */
export function absoluteRateToEdge(rate: number): string {
  const clamped = clampVoiceRate(rate);
  const percent = Math.round((clamped - 1) * 100);
  return `${percent >= 0 ? '+' : ''}${percent}%`;
}
