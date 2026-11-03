/**
 * 语音音色的唯一真相：白名单、展示元数据与默认值。
 *
 * 请求体里的 `voice` 只接受这里列出的 id——不接受任意音色串，否则等于把上游的能力面
 * 全部开放，出问题也说不清是谁传的。列表接口与校验都读同一个常量，不写第二份。
 *
 * Fish Audio 自定义 Voice ID 的格式校验见 {@link isFishVoiceIdFormat}；是否已入用户目录
 * 由 speak / save 在读到 `fishVoices` 后再判。
 * @module dsh-pet/src/host/voice/voices
 */
import { isFishVoiceIdFormat, FISH_BUILTIN_VOICES } from './fish-voices.ts';

/** 语音引擎：内置 Edge，或 Fish Audio。 */
export type VoiceProvider = 'edge' | 'fish';

/** 一个可选音色；`id` 是上游 short name / reference_id，其余字段只用于展示。 */
export interface VoiceInfo {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly default: boolean;
}

/** 允许请求的五个中文 Edge 音色；标记 `default` 的那个是缺省值。 */
export const VOICES: readonly VoiceInfo[] = [
  { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', tag: '女 · 通用', default: false },
  { id: 'zh-CN-XiaoyiNeural', name: '晓伊', tag: '女 · 活泼', default: true },
  { id: 'zh-CN-XiaoxuanNeural', name: '晓萱', tag: '女 · 沉稳', default: false },
  { id: 'zh-CN-YunxiNeural', name: '云希', tag: '男 · 年轻', default: false },
  { id: 'zh-CN-YunjianNeural', name: '云健', tag: '男 · 沉稳', default: false },
];

/** 默认 Edge 音色 id；请求与配置都没指定时用它，必须与 {@link VOICES} 里 `default` 标记的那个一致。 */
export const DEFAULT_VOICE = 'zh-CN-XiaoyiNeural';

/** 默认语音引擎。 */
export const DEFAULT_VOICE_PROVIDER: VoiceProvider = 'edge';

/**
 * 判断是否为已知 Edge 音色。
 * @param id - 待校验的音色 id。
 */
export function isEdgeVoice(id: string): boolean {
  return VOICES.some((voice) => voice.id === id);
}

/**
 * 判断音色是否可被配置层接受：Edge 白名单，或 Fish 内置 / 合法自定义 Voice ID。
 *
 * 自定义 Fish id 的「是否已入目录」在 speak / save 再判；这里放行格式合法的 id，
 * 避免用户层写了自定义音色后合并阶段被整段打回默认。
 * 看起来像 Edge short name（`zh-CN-…` / `…Neural`）但不在白名单的一律拒绝——
 * 不能因为 Fish 格式宽松就把伪造的 Edge 音色放进来。
 * @param id - 待校验的音色 id。
 */
export function isKnownVoice(id: string): boolean {
  if (isEdgeVoice(id)) return true;
  if (FISH_BUILTIN_VOICES.some((voice) => voice.id === id)) return true;
  if (/^zh-CN-/i.test(id) || /Neural$/i.test(id)) return false;
  return isFishVoiceIdFormat(id);
}

/**
 * 规范化语音引擎；非法回落 edge。
 * @param raw - 配置值。
 */
export function normalizeVoiceProvider(raw: unknown): VoiceProvider {
  return raw === 'fish' ? 'fish' : 'edge';
}
