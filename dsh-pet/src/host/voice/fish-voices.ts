/**
 * Fish Audio 音色与模型的唯一真相：内置目录、自定义 Voice ID 规范化与格式校验。
 *
 * 请求体与配置里的 Fish `voiceName` 只接受「内置 id ∪ 用户已追加的自定义 id」——
 * 任意字符串直打上游等于开放能力面。列表接口与校验都读这里，不写第二份。
 * @module dsh-pet/src/host/voice/fish-voices
 */
import type { VoiceInfo } from './voices.ts';

/** Fish Audio 可选合成模型（请求头 `model`）。 */
export const FISH_TTS_MODELS = [
  { id: 's2.1-pro-free', label: 'S2.1 Pro Free' },
  { id: 's2.1-pro', label: 'S2.1 Pro' },
  { id: 's2-pro', label: 'S2 Pro' },
  { id: 'drama-3', label: 'Drama 3' },
] as const;

/** 合法的模型 id 集合。 */
const FISH_TTS_MODEL_IDS: ReadonlySet<string> = new Set(FISH_TTS_MODELS.map((item) => item.id));

/** 默认模型：免费档，避免无额度时直接 402。 */
export const DEFAULT_FISH_TTS_MODEL: (typeof FISH_TTS_MODELS)[number]['id'] = 's2.1-pro-free';

/** 用户追加的一条 Fish 音色（只存自定义；内置由常量合并）。 */
export interface FishCustomVoice {
  readonly id: string;
  readonly label: string;
}

/** Fish Audio 内置音色；`default` 标记缺省选中项。 */
export const FISH_BUILTIN_VOICES: readonly VoiceInfo[] = [
  { id: '55b28b196e1c4fff9a55cd32a46eff25', name: '永雏塔菲', tag: 'Fish · 默认', default: true },
  { id: '0eb38bc974e1459facca38b359e13511', name: '赛马娘', tag: 'Fish', default: false },
  { id: '0f08cacd3e354471a4b94dd00b4cc4a3', name: '曼波', tag: 'Fish', default: false },
  { id: '4ed45d53ee9245d9abf20db5221b19b2', name: '莫提斯', tag: 'Fish', default: false },
  { id: '626bb6d3f3364c9cbc3aa6a67300a664', name: '可莉', tag: 'Fish', default: false },
  { id: '8413d380d1d54f7599d9b68b5cc1faea', name: '纳西妲', tag: 'Fish', default: false },
  { id: 'efc1ce3726a64bbc947d53a1465204aa', name: '派蒙', tag: 'Fish', default: false },
  { id: '7fba0463ac2a44b68851233e3463807a', name: '高松灯', tag: 'Fish', default: false },
];

/** 默认 Fish 音色 id；必须与 {@link FISH_BUILTIN_VOICES} 里 `default` 标记一致。 */
export const DEFAULT_FISH_VOICE = '55b28b196e1c4fff9a55cd32a46eff25';

const FISH_BUILTIN_IDS: ReadonlySet<string> = new Set(FISH_BUILTIN_VOICES.map((voice) => voice.id));

/** Voice ID 允许的字符：字母数字与 `_` `-`（与 Fish 控制台 / danmu-ji 同口径）。 */
const FISH_VOICE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 判断是否像合法的 Fish Voice ID（格式，不含是否已入目录）。
 * @param id - 待校验串。
 */
export function isFishVoiceIdFormat(id: string): boolean {
  return id.length > 0 && id.length <= 128 && FISH_VOICE_ID_PATTERN.test(id);
}

/**
 * 规范化合成模型；非法或空串回落默认免费档。
 * @param raw - 配置或请求里的模型 id。
 */
export function normalizeFishTtsModel(raw: unknown): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  return FISH_TTS_MODEL_IDS.has(id) ? id : DEFAULT_FISH_TTS_MODEL;
}

/**
 * 规范化用户自定义音色列表：去掉非法项与内置重复，保留用户标签。
 * @param raw - 配置里的 `fishVoices`。
 */
export function normalizeFishCustomVoices(raw: unknown): FishCustomVoice[] {
  if (!Array.isArray(raw)) return [];
  const out: FishCustomVoice[] = [];
  const seen = new Set<string>(FISH_BUILTIN_IDS);
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim().replace(/\s+/g, '') : '';
    if (!isFishVoiceIdFormat(id) || seen.has(id)) continue;
    seen.add(id);
    const label = typeof row.label === 'string' ? row.label.trim() : '';
    out.push({ id, label: label || id });
  }
  return out;
}

/**
 * 展示用完整音色表：内置在前，用户自定义在后（tag 标「自定义」）。
 * @param custom - 已规范化的自定义列表；缺省当空。
 */
export function listFishVoices(custom: readonly FishCustomVoice[] = []): readonly VoiceInfo[] {
  const customs = custom.map(
    (voice): VoiceInfo => ({ id: voice.id, name: voice.label, tag: 'Fish · 自定义', default: false }),
  );
  return [...FISH_BUILTIN_VOICES, ...customs];
}

/**
 * 判断音色是否在「内置 ∪ 自定义」白名单内。
 * @param id - 待校验的音色 id。
 * @param custom - 用户已追加的自定义列表。
 */
export function isKnownFishVoice(id: string, custom: readonly FishCustomVoice[] = []): boolean {
  if (FISH_BUILTIN_IDS.has(id)) return true;
  return custom.some((voice) => voice.id === id);
}
