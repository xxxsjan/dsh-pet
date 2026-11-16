/**
 * Breeze Blue 音色目录的唯一真相：内置大肥鱼双音色、用户追加的 Voice ID 与格式校验。
 *
 * 移植自 danmu-ji 的 `composables/tts/useTtsSettings.js`（`BREEZE_BUILTIN_VOICES` 与
 * `normalizeBreezeVoices`）：音色 id 就是 Breeze 控制台的 Voice ID（`voc_…`），
 * 内置的两条「大肥鱼」默认加入音色池，用户可按 Voice ID 追加自己的嗓子。
 *
 * 请求体与配置里的 `voiceName` 只接受「内置 ∪ 用户已追加」——任意串直打上游等于开放能力面，
 * 出问题也说不清是谁传的。列表接口与校验都读这里，不写第二份。
 * @module dsh-pet/src/host/voice/breeze-voices
 */
import type { VoiceInfo } from './voices.ts';

/** Breeze Blue 内置音色；`default` 标记缺省选中项。 */
export const BREEZE_BUILTIN_VOICES: readonly VoiceInfo[] = [
  { id: 'voc_u3nxkd5578wc', name: '大肥鱼（机灵版）', tag: 'Breeze · 默认', default: true },
  { id: 'voc_8yud7hz7c9q2', name: '大肥鱼（迷糊版）', tag: 'Breeze', default: false },
];

/** 默认 Breeze 音色 id；请求与配置都没指定时用它，必须与 {@link BREEZE_BUILTIN_VOICES} 里 `default` 标记一致。 */
export const DEFAULT_BREEZE_VOICE = 'voc_u3nxkd5578wc';

/** 用户追加的一条 Breeze 音色（只存自定义；内置由常量合并）。 */
export interface BreezeCustomVoice {
  readonly id: string;
  readonly label: string;
}

const BREEZE_BUILTIN_IDS: ReadonlySet<string> = new Set(BREEZE_BUILTIN_VOICES.map((voice) => voice.id));

/**
 * Voice ID 允许的字符：字母数字与 `_` `-`。
 *
 * 与 Breeze 控制台 / danmu-ji 的 `validate_breeze_tts_input` 同口径：id 会拼进请求路径，
 * 放开其它字符等于让配置值决定打到哪个端点。
 */
const BREEZE_VOICE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * 判断是否像合法的 Breeze Voice ID（只看格式，不看是否已入目录）。
 * @param id - 待校验串。
 */
export function isBreezeVoiceIdFormat(id: string): boolean {
  return id.length > 0 && id.length <= 128 && BREEZE_VOICE_ID_PATTERN.test(id);
}

/**
 * 规范化用户自定义音色列表：去掉非法项与内置重复，保留用户标签。
 * @param raw - 配置里的 `breezeVoices`。
 */
export function normalizeBreezeCustomVoices(raw: unknown): BreezeCustomVoice[] {
  if (!Array.isArray(raw)) return [];
  const out: BreezeCustomVoice[] = [];
  const seen = new Set<string>(BREEZE_BUILTIN_IDS);
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim().replace(/\s+/g, '') : '';
    if (!isBreezeVoiceIdFormat(id) || seen.has(id)) continue;
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
export function listBreezeVoices(custom: readonly BreezeCustomVoice[] = []): readonly VoiceInfo[] {
  const customs = custom.map((voice): VoiceInfo => ({
    id: voice.id,
    name: voice.label,
    tag: 'Breeze · 自定义',
    default: false,
  }));
  return [...BREEZE_BUILTIN_VOICES, ...customs];
}

/**
 * 判断音色是否在「内置 ∪ 自定义」白名单内。
 * @param id - 待校验的音色 id。
 * @param custom - 用户已追加的自定义列表。
 */
export function isKnownBreezeVoice(id: string, custom: readonly BreezeCustomVoice[] = []): boolean {
  if (BREEZE_BUILTIN_IDS.has(id)) return true;
  return custom.some((voice) => voice.id === id);
}
