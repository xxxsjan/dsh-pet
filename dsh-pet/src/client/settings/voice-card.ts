/**
 * 语音卡：播报开关、引擎（Edge / Fish Audio / Breeze Blue）、音色、音量与引擎专用字段。
 *
 * 切换只改本地状态、随「保存」整包写入——即时写盘会重启桌面 Helper、重建全部桌面宠物窗口。
 * 音色选择器由外壳注入（与模型卡注入 picker 同构），卡片本身不硬编码任何音色 id。
 * Fish 与 Breeze 的「Key + 自定义 Voice ID」是同一套形状，用两个局部构造器各渲染一份，
 * 差异只在文案与回写字段——避免复制两大段 JSX。
 * @module dsh-pet/src/client/settings/voice-card
 */
import type { FunctionComponent } from 'react';
import type { jsx } from 'react/jsx-runtime';
import type { VoiceOption, VoicePickerProps } from './picker/voice-picker.ts';
import type { SettingsRuntime } from './runtime.ts';
import { INPUT_CLASS, makeUiKit, numberInputProps } from './ui.ts';
import { BREEZE_API_KEY_URL } from '../../shared/voice-links.ts';

export type { VoiceOption } from './picker/voice-picker.ts';

/** 设置页节点类型（jsx-runtime 的返回值），与 ui.ts 的构造器保持同一口径。 */
type Node = ReturnType<typeof jsx>;

/** 自定义音色草稿（Fish / Breeze 共用形状）。 */
export interface CustomVoiceDraft {
  readonly id: string;
  readonly label: string;
}

/** 语音卡的输入。 */
export interface VoiceCardProps {
  /** 保存中或配置未就绪时禁用全部控件。 */
  readonly busy: boolean;
  /** 播报总开关的当前值。 */
  readonly enabled: boolean;
  /** 语音引擎。 */
  readonly provider: 'edge' | 'fish' | 'breeze';
  /** 当前音色 id。 */
  readonly voiceName: string;
  /** 播放音量系数：0–3，1 = 100%，3 = 300%。 */
  readonly volume: number;
  /** 绝对语速：0.5–2，1 = 原速。 */
  readonly rate: number;
  /** 当前引擎下的可选音色；为空时选择器只显示当前值。 */
  readonly voices: readonly VoiceOption[];
  /** Fish 合成模型 id。 */
  readonly fishTtsModel: string;
  /** Fish 可选模型。 */
  readonly fishModels: readonly { id: string; label: string }[];
  /** 磁盘上是否已有 Fish API Key（响应体不回传明文）。 */
  readonly hasFishApiKey: boolean;
  /** 用户新输入的 Fish Key；空串 = 保存时保留旧值。 */
  readonly fishApiKeyDraft: string;
  /** 是否在下次保存时清空已存 Fish Key。 */
  readonly clearFishApiKey: boolean;
  /** 用户追加的 Fish 音色。 */
  readonly fishCustomVoices: readonly CustomVoiceDraft[];
  /** 磁盘上是否已有 Breeze API Key（响应体不回传明文）。 */
  readonly hasBreezeApiKey: boolean;
  /** 用户新输入的 Breeze Key；空串 = 保存时保留旧值。 */
  readonly breezeApiKeyDraft: string;
  /** 是否在下次保存时清空已存 Breeze Key。 */
  readonly clearBreezeApiKey: boolean;
  /** 用户追加的 Breeze 音色。 */
  readonly breezeCustomVoices: readonly CustomVoiceDraft[];
  /** 周期碎碎念要不要念出来（受总开关约束）。 */
  readonly whisperEnabled: boolean;
  /** 待办提醒要不要念出来（受总开关约束）。 */
  readonly todoEnabled: boolean;
  /** 切换播报开关。 */
  readonly onToggle: (value: boolean) => void;
  /** 切换引擎。 */
  readonly onProviderChange: (provider: 'edge' | 'fish' | 'breeze') => void;
  /** 选择音色。 */
  readonly onVoiceChange: (voiceName: string) => void;
  /** 调整播放音量。 */
  readonly onVolumeChange: (volume: number) => void;
  /** 调整语速。 */
  readonly onRateChange: (rate: number) => void;
  /** 切换周期碎碎念的播报。 */
  readonly onWhisperToggle: (value: boolean) => void;
  /** 切换待办提醒的播报。 */
  readonly onTodoToggle: (value: boolean) => void;
  /** 选择 Fish 模型。 */
  readonly onFishModelChange: (model: string) => void;
  /** 编辑 Fish Key 草稿。 */
  readonly onFishApiKeyDraftChange: (value: string) => void;
  /** 标记清空 / 取消清空已存 Fish Key。 */
  readonly onClearFishApiKeyChange: (clear: boolean) => void;
  /** 追加一条 Fish 自定义 Voice ID。 */
  readonly onAddFishVoice: (id: string, label: string) => void;
  /** 删除一条 Fish 自定义 Voice ID。 */
  readonly onRemoveFishVoice: (id: string) => void;
  /** 编辑 Breeze Key 草稿。 */
  readonly onBreezeApiKeyDraftChange: (value: string) => void;
  /** 标记清空 / 取消清空已存 Breeze Key。 */
  readonly onClearBreezeApiKeyChange: (clear: boolean) => void;
  /** 追加一条 Breeze 自定义 Voice ID。 */
  readonly onAddBreezeVoice: (id: string, label: string) => void;
  /** 删除一条 Breeze 自定义 Voice ID。 */
  readonly onRemoveBreezeVoice: (id: string) => void;
}

/**
 * 造语音卡。
 *
 * @param rt - 注入的 react 能力与翻译函数。
 * @param picker - 音色选择器组件；与模型卡一样由装配根造一次后注入，保证组件类型跨渲染稳定。
 * @returns 卡片组件。
 */
export function makeVoiceCard(
  rt: SettingsRuntime,
  picker: FunctionComponent<VoicePickerProps>,
): FunctionComponent<VoiceCardProps> {
  const { h, t, useState } = rt;
  const { cardHead, field, toggleCell } = makeUiKit({ h, t });

  return function VoiceCard(props: VoiceCardProps) {
    const [draftId, setDraftId] = useState('');
    const [draftLabel, setDraftLabel] = useState('');
    const [breezeDraftId, setBreezeDraftId] = useState('');
    const [breezeDraftLabel, setBreezeDraftLabel] = useState('');

    /** 引擎专用字段共用的一套：口令输入 + 清空勾选；可选的控制台跳转链接。 */
    const apiKeyField = (opts: {
      label: string;
      hint: string;
      draft: string;
      hasKey: boolean;
      clear: boolean;
      onDraft: (value: string) => void;
      onClear: (clear: boolean) => void;
      keyUrl?: string;
    }): Node =>
      field(
        opts.label,
        h('div', {
          className: 'blue-fish-cfg__stack',
          children: [
            h('div', {
              className: 'blue-fish-cfg__keyRow',
              children: [
                opts.keyUrl
                  ? h('a', {
                      href: opts.keyUrl,
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      className: 'blue-fish-cfg__btn is-ghost is-sm',
                      children: t('breezeKeyLink'),
                    })
                  : null,
                h('input', {
                  type: 'password',
                  className: INPUT_CLASS,
                  autoComplete: 'new-password',
                  disabled: props.busy || opts.clear,
                  value: opts.draft,
                  placeholder: opts.hasKey ? t('fishApiKeyKeepPlaceholder') : t('fishApiKeyPlaceholder'),
                  onChange: (e: { target: { value: string } }) => opts.onDraft(e.target.value),
                }),
              ],
            }),
            opts.hasKey
              ? h('label', {
                  className: 'blue-fish-cfg__check',
                  children: [
                    h('input', {
                      type: 'checkbox',
                      disabled: props.busy,
                      checked: opts.clear,
                      onChange: (e: { target: { checked: boolean } }) => {
                        opts.onClear(e.target.checked);
                        if (e.target.checked) opts.onDraft('');
                      },
                    }),
                    t('fishApiKeyClear'),
                  ],
                })
              : null,
          ],
        }),
        opts.hint,
      );

    /** 自定义 Voice ID 列表：输入草稿 + 添加按钮 + 已追加项（可删）。 */
    const customVoiceField = (opts: {
      label: string;
      hint: string;
      voices: readonly CustomVoiceDraft[];
      draftId: string;
      draftLabel: string;
      onDraftId: (value: string) => void;
      onDraftLabel: (value: string) => void;
      onAdd: (id: string, label: string) => void;
      onRemove: (id: string) => void;
    }): Node =>
      field(
        opts.label,
        h('div', {
          className: 'blue-fish-cfg__stack',
          children: [
            h('div', {
              className: 'blue-fish-cfg__grid2',
              children: [
                h('input', {
                  type: 'text',
                  className: INPUT_CLASS,
                  disabled: props.busy,
                  value: opts.draftId,
                  placeholder: t('fishCustomVoiceIdPlaceholder'),
                  onChange: (e: { target: { value: string } }) => opts.onDraftId(e.target.value),
                }),
                h('input', {
                  type: 'text',
                  className: INPUT_CLASS,
                  disabled: props.busy,
                  value: opts.draftLabel,
                  placeholder: t('fishCustomVoiceLabelPlaceholder'),
                  onChange: (e: { target: { value: string } }) => opts.onDraftLabel(e.target.value),
                }),
              ],
            }),
            h('button', {
              type: 'button',
              className: 'blue-fish-cfg__btn',
              disabled: props.busy || opts.draftId.trim() === '',
              onClick: () => {
                opts.onAdd(opts.draftId, opts.draftLabel);
                opts.onDraftId('');
                opts.onDraftLabel('');
              },
              children: t('fishCustomVoiceAdd'),
            }),
            opts.voices.length > 0
              ? h('ul', {
                  className: 'blue-fish-cfg__list',
                  children: opts.voices.map((voice) =>
                    h('li', {
                      key: voice.id,
                      className: 'blue-fish-cfg__listRow',
                      children: [
                        h('span', {
                          children: voice.label === voice.id ? voice.id : `${voice.label}（${voice.id}）`,
                        }),
                        h('button', {
                          type: 'button',
                          className: 'blue-fish-cfg__btn is-ghost is-sm',
                          disabled: props.busy,
                          onClick: () => opts.onRemove(voice.id),
                          children: t('fishCustomVoiceRemove'),
                        }),
                      ],
                    }),
                  ),
                })
              : null,
          ],
        }),
        opts.hint,
      );

    const fishBlocks =
      props.provider === 'fish'
        ? [
            apiKeyField({
              label: t('fishApiKeyLabel'),
              hint: t('fishApiKeyHint'),
              draft: props.fishApiKeyDraft,
              hasKey: props.hasFishApiKey,
              clear: props.clearFishApiKey,
              onDraft: props.onFishApiKeyDraftChange,
              onClear: props.onClearFishApiKeyChange,
            }),
            field(
              t('fishTtsModelLabel'),
              h('select', {
                className: INPUT_CLASS,
                disabled: props.busy,
                value: props.fishTtsModel,
                onChange: (e: { target: { value: string } }) => props.onFishModelChange(e.target.value),
                // h 是 jsx-runtime 的 jsx(type, props, key)：children 必须进 props，第三参是 key
                children: props.fishModels.map((model) =>
                  h('option', { key: model.id, value: model.id, children: model.label }),
                ),
              }),
              t('fishTtsModelHint'),
            ),
            customVoiceField({
              label: t('fishCustomVoiceLabel'),
              hint: t('fishCustomVoiceHint'),
              voices: props.fishCustomVoices,
              draftId,
              draftLabel,
              onDraftId: setDraftId,
              onDraftLabel: setDraftLabel,
              onAdd: props.onAddFishVoice,
              onRemove: props.onRemoveFishVoice,
            }),
          ]
        : [];

    const breezeBlocks =
      props.provider === 'breeze'
        ? [
            apiKeyField({
              label: t('breezeApiKeyLabel'),
              hint: t('breezeApiKeyHint'),
              draft: props.breezeApiKeyDraft,
              hasKey: props.hasBreezeApiKey,
              clear: props.clearBreezeApiKey,
              onDraft: props.onBreezeApiKeyDraftChange,
              onClear: props.onClearBreezeApiKeyChange,
              keyUrl: BREEZE_API_KEY_URL,
            }),
            customVoiceField({
              label: t('breezeCustomVoiceLabel'),
              hint: t('breezeCustomVoiceHint'),
              voices: props.breezeCustomVoices,
              draftId: breezeDraftId,
              draftLabel: breezeDraftLabel,
              onDraftId: setBreezeDraftId,
              onDraftLabel: setBreezeDraftLabel,
              onAdd: props.onAddBreezeVoice,
              onRemove: props.onRemoveBreezeVoice,
            }),
          ]
        : [];

    return h('div', {
      className: 'blue-fish-cfg__card',
      children: [
        cardHead(t('voiceTitle'), t('voiceHint')),
        h('div', {
          className: 'blue-fish-cfg__grid3',
          children: [
            toggleCell('voiceEnabled', props.enabled, props.busy, props.onToggle),
            toggleCell('voiceWhisperEnabled', props.whisperEnabled, props.busy, props.onWhisperToggle),
            toggleCell('voiceTodoEnabled', props.todoEnabled, props.busy, props.onTodoToggle),
          ],
        }),
        field(
          t('voiceProviderLabel'),
          h('select', {
            className: INPUT_CLASS,
            disabled: props.busy,
            value: props.provider,
            onChange: (e: { target: { value: string } }) => {
              // 只认这三种；非法值回落 edge（与宿主 normalizeVoiceProvider 同口径）
              const next = e.target.value;
              props.onProviderChange(next === 'fish' || next === 'breeze' ? next : 'edge');
            },
            // h 是 jsx-runtime 的 jsx(type, props, key)：children 必须进 props，第三参是 key
            children: [
              h('option', { key: 'edge', value: 'edge', children: t('voiceProviderEdge') }),
              h('option', { key: 'fish', value: 'fish', children: t('voiceProviderFish') }),
              h('option', { key: 'breeze', value: 'breeze', children: t('voiceProviderBreeze') }),
            ],
          }),
          t('voiceProviderHint'),
        ),
        ...fishBlocks,
        ...breezeBlocks,
        h('div', {
          className: 'blue-fish-cfg__grid2',
          children: [
            h(picker, {
              label: t('voiceNameLabel'),
              value: props.voiceName,
              options: props.voices,
              disabled: props.busy,
              onChange: props.onVoiceChange,
            }),
            field(
              t('voiceRateLabel'),
              h(
                'input',
                numberInputProps(props.rate, props.onRateChange, {
                  step: '0.05',
                  min: '0.5',
                  max: '2',
                  disabled: props.busy,
                }),
              ),
              t('voiceRateHint'),
            ),
            field(
              t('voiceVolumeLabel'),
              h(
                'input',
                numberInputProps(props.volume, props.onVolumeChange, {
                  step: '0.05',
                  min: '0',
                  max: '3',
                  disabled: props.busy,
                }),
              ),
              t('voiceVolumeHint'),
            ),
          ],
        }),
      ],
    });
  };
}
