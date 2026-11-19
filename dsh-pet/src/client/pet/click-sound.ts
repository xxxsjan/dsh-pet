/**
 * 点击音效：单例 audio，按键连点节流，播放失败一律静默（没有声音也不该有报错）。
 * 开关与音量是实例级配置（pets[].clickSoundEnabled / clickSoundVolume），由调用方按宠物传入；
 * 成品配置没加载前调用方拿不到 true，天然保守静音。
 * audio 与节流仍是模块级单例（不是每个宠物一份），多开时同时点也只响一次。
 * @module dsh-pet/src/client/pet/click-sound
 */
import { ROUTE_PATH } from '../../shared/constants.ts';

/** 音效文件地址。 */
const CLICK_SOUND_URL = ROUTE_PATH + '/sound/click-duck.wav';
/** 音量缺省值：与其余提示音同一档，不抢对话内容。 */
const CLICK_SOUND_VOLUME_DEFAULT = 0.5;
/** 连点节流：100ms 内只响一次，避免连点变成噪音。 */
const CLICK_SOUND_THROTTLE_MS = 100;

/** 复用的 audio 实例，首次播放时创建。 */
let clickAudio: HTMLAudioElement | null = null;
/** 上一次真正播放的时间戳（ms）。 */
let lastClickSoundAt = 0;

/**
 * 播放点击音效；开关关闭、节流中或音频不可用时静默返回。
 *
 * @param enabled - 该宠物成品配置里的 `clickSoundEnabled`；非 true 一律静音。
 * @param volume - 该宠物成品配置里的 `clickSoundVolume`（0–1）；非法或缺省回退 0.5。
 */
export function playClickSound(enabled: boolean, volume?: number): void {
  if (enabled !== true) return;
  const now = Date.now();
  if (now - lastClickSoundAt < CLICK_SOUND_THROTTLE_MS) return;
  lastClickSoundAt = now;
  const vol =
    typeof volume === 'number' && Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : CLICK_SOUND_VOLUME_DEFAULT;
  try {
    clickAudio ??= new Audio(CLICK_SOUND_URL);
    clickAudio.volume = vol;
    clickAudio.currentTime = 0;
    void clickAudio.play().catch(() => {});
  } catch {
    /* 音频不可用，静默忽略。 */
  }
}
