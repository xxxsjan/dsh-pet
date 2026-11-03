/**
 * 语音卡：播报开关、引擎（Edge / Fish Audio）、音色、音量与 Fish 专用字段。
 *
 * 切换只改本地状态、随「保存」整包写入——即时写盘会重启桌面 Helper、重建全部桌面宠物窗口。
 * 音色选择器由外壳注入（与模型卡注入 picker 同构），卡片本身不硬编码任何音色 id。
 * @module dsh-pet/src/client/settings/voice-card
 */
import type { FunctionComponent } from 'react';
import type { VoiceOption, VoicePickerProps } from './picker/voice-picker.ts';
import type { SettingsRuntime } from './runtime.ts';
import { INPUT_CLASS, makeUiKit, numberInputProps } from './ui.ts';

export type { VoiceOption } from './picker/voice-picker.ts';

/** Fish 自定义音色草稿。 */
export interface FishCustomVoiceDraft {
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
  readonly provider: 'edge' | 'fish';
  /** 当前音色 id。 */
  readonly voiceName: string;
  /** 播放音量系数：0–4，1 = 100%，4 = 400%。 */
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
  /** 用户新输入的 Key；空串 = 保存时保留旧值。 */
  readonly fishApiKeyDraft: string;
  /** 是否在下次保存时清空已存 Key。 */
  readonly clearFishApiKey: boolean;
  /** 用户追加的 Fish 音色。 */
  readonly fishCustomVoices: readonly FishCustomVoiceDraft[];
  /** 周期碎碎念要不要念出来（受总开关约束）。 */
  readonly whisperEnabled: boolean;
  /** 待办提醒要不要念出来（受总开关约束）。 */
  readonly todoEnabled: boolean;
  /** 切换播报开关。 */
  readonly onToggle: (value: boolean) => void;
  /** 切换引擎。 */
  readonly onProviderChange: (provider: 'edge' | 'fish') => void;
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
  /** 编辑 Key 草稿。 */
  readonly onFishApiKeyDraftChange: (value: string) => void;
  /** 标记清空 / 取消清空已存 Key。 */
  readonly onClearFishApiKeyChange: (clear: boolean) => void;
  /** 追加一条自定义 Voice ID。 */
  readonly onAddFishVoice: (id: string, label: string) => void;
  /** 删除一条自定义 Voice ID。 */
  readonly onRemoveFishVoice: (id: string) => void;
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

    const fishBlocks =
      props.provider === 'fish'
        ? [
            field(
              t('fishApiKeyLabel'),
              h('div', {
                className: 'dsh-pet-cfg__stack',
                children: [
                  h('input', {
                    type: 'password',
                    className: INPUT_CLASS,
                    autoComplete: 'new-password',
                    disabled: props.busy || props.clearFishApiKey,
                    value: props.fishApiKeyDraft,
                    placeholder: props.hasFishApiKey ? t('fishApiKeyKeepPlaceholder') : t('fishApiKeyPlaceholder'),
                    onChange: (e: { target: { value: string } }) => props.onFishApiKeyDraftChange(e.target.value),
                  }),
                  props.hasFishApiKey
                    ? h('label', {
                        className: 'dsh-pet-cfg__check',
                        children: [
                          h('input', {
                            type: 'checkbox',
                            disabled: props.busy,
                            checked: props.clearFishApiKey,
                            onChange: (e: { target: { checked: boolean } }) => {
                              props.onClearFishApiKeyChange(e.target.checked);
                              if (e.target.checked) props.onFishApiKeyDraftChange('');
                            },
                          }),
                          t('fishApiKeyClear'),
                        ],
                      })
                    : null,
                ],
              }),
              t('fishApiKeyHint'),
            ),
            field(
              t('fishTtsModelLabel'),
              h(
                'select',
                {
                  className: INPUT_CLASS,
                  disabled: props.busy,
                  value: props.fishTtsModel,
                  onChange: (e: { target: { value: string } }) => props.onFishModelChange(e.target.value),
                },
                props.fishModels.map((model) =>
                  h('option', { key: model.id, value: model.id, children: model.label }),
                ),
              ),
              t('fishTtsModelHint'),
            ),
            field(
              t('fishCustomVoiceLabel'),
              h('div', {
                className: 'dsh-pet-cfg__stack',
                children: [
                  h('div', {
                    className: 'dsh-pet-cfg__grid2',
                    children: [
                      h('input', {
                        type: 'text',
                        className: INPUT_CLASS,
                        disabled: props.busy,
                        value: draftId,
                        placeholder: t('fishCustomVoiceIdPlaceholder'),
                        onChange: (e: { target: { value: string } }) => setDraftId(e.target.value),
                      }),
                      h('input', {
                        type: 'text',
                        className: INPUT_CLASS,
                        disabled: props.busy,
                        value: draftLabel,
                        placeholder: t('fishCustomVoiceLabelPlaceholder'),
                        onChange: (e: { target: { value: string } }) => setDraftLabel(e.target.value),
                      }),
                    ],
                  }),
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-pet-cfg__btn',
                      disabled: props.busy || draftId.trim() === '',
                      onClick: () => {
                        props.onAddFishVoice(draftId, draftLabel);
                        setDraftId('');
                        setDraftLabel('');
                      },
                      children: t('fishCustomVoiceAdd'),
                    },
                  ),
                  props.fishCustomVoices.length > 0
                    ? h('ul', {
                        className: 'dsh-pet-cfg__list',
                        children: props.fishCustomVoices.map((voice) =>
                          h('li', {
                            key: voice.id,
                            className: 'dsh-pet-cfg__listRow',
                            children: [
                              h('span', {
                                children: voice.label === voice.id ? voice.id : `${voice.label}（${voice.id}）`,
                              }),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'dsh-pet-cfg__btn is-ghost is-sm',
                                  disabled: props.busy,
                                  onClick: () => props.onRemoveFishVoice(voice.id),
                                  children: t('fishCustomVoiceRemove'),
                                },
                              ),
                            ],
                          }),
                        ),
                      })
                    : null,
                ],
              }),
              t('fishCustomVoiceHint'),
            ),
          ]
        : [];

    return h('div', {
      className: 'dsh-pet-cfg__card',
      children: [
        cardHead(t('voiceTitle'), t('voiceHint')),
        h('div', {
          className: 'dsh-pet-cfg__grid3',
          children: [
            toggleCell('voiceEnabled', props.enabled, props.busy, props.onToggle),
            toggleCell('voiceWhisperEnabled', props.whisperEnabled, props.busy, props.onWhisperToggle),
            toggleCell('voiceTodoEnabled', props.todoEnabled, props.busy, props.onTodoToggle),
          ],
        }),
        field(
          t('voiceProviderLabel'),
          h(
            'select',
            {
              className: INPUT_CLASS,
              disabled: props.busy,
              value: props.provider,
              onChange: (e: { target: { value: string } }) =>
                props.onProviderChange(e.target.value === 'fish' ? 'fish' : 'edge'),
            },
            [
              h('option', { key: 'edge', value: 'edge', children: t('voiceProviderEdge') }),
              h('option', { key: 'fish', value: 'fish', children: t('voiceProviderFish') }),
            ],
          ),
          t('voiceProviderHint'),
        ),
        ...fishBlocks,
        h('div', {
          className: 'dsh-pet-cfg__grid2',
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
                  max: '4',
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
