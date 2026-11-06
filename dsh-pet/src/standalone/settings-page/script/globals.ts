/**
 * 「桌宠配置」面板的全局部分：开关、外观、物理、对话上下文与落盘位置。
 *
 * 全部读写 state.globals（main 条目的全局字段），由 ./pets 的保存一并提交。
 * 配置页卡片按 builder 数组返回；语音卡由 {@link renderVoicePanel} 挂到侧栏「语音」分区。
 * @module dsh-pet/src/standalone/settings-page/script/globals
 */

/** 生成全局卡片片段。 */
export function globalsScript(): string {
  return `
function globalCards() {
  return [globalFlagsCard, fontCard, physicsCard, modelCard, advancedCard];
}

function setGlobal(key, value) {
  state.globals[key] = value;
}

function globalFlagsCard() {
  const g = state.globals;
  return card('全局开关', '对所有宠物生效；保存后立即写盘。', [
    toggleRow('g-notify', '系统通知', '对话完成、生成失败、权限申请等事件弹出系统通知。', g.notificationsEnabled, (value) => setGlobal('notificationsEnabled', value)),
    toggleRow('g-click', '点击音效', '点击宠物时播放内置音效。', g.clickSoundEnabled, (value) => setGlobal('clickSoundEnabled', value)),
    toggleRow('g-whisper-image', '碎碎念配图', '碎碎念时允许模型挑一张表情包。', g.whisperImageEnabled, (value) => setGlobal('whisperImageEnabled', value)),
    toggleRow('g-chat-image', '对话配图', '对话时把表情包清单交给模型按语境选图。', g.chatImageEnabled, (value) => setGlobal('chatImageEnabled', value)),
    toggleRow('g-chat-anim', '对话动作联动', '对话时让模型挑一个动作当场表演。', g.chatAnimationEnabled, (value) => setGlobal('chatAnimationEnabled', value)),
    toggleRow('g-confine', '锁定在当前屏幕', '抛掷与自主漫游只在当前所在的这块屏幕里活动。', g.confineToScreen, (value) => setGlobal('confineToScreen', value)),
    toggleRow('g-tray', '系统托盘图标', '桌面模式常驻托盘；关掉后只能从任务栏找回。', g.trayEnabled, (value) => setGlobal('trayEnabled', value)),
    toggleRow('g-obs', '窗口模式', '开启后仍保持透明，但出现在任务栏并去掉工具窗样式，便于 OBS 窗口捕获；关掉则藏任务栏（窗口捕获通常列不到）。', g.obsCaptureEnabled === true, (value) => setGlobal('obsCaptureEnabled', value)),
  ]);
}

function voiceOptionsForProvider(provider) {
  if (provider === 'fish') {
    const custom = Array.isArray(state.globals.fishVoices) ? state.globals.fishVoices : [];
    const builtinIds = new Set(FISH_VOICES.map((voice) => voice.id));
    const customOpts = custom
      .filter((voice) => voice && voice.id && !builtinIds.has(voice.id))
      .map((voice) => ({
        value: voice.id,
        label: (voice.label || voice.id) + ' · Fish · 自定义',
      }));
    return FISH_VOICES.map((voice) => ({ value: voice.id, label: voice.name + ' · ' + voice.tag })).concat(customOpts);
  }
  return VOICES.map((voice) => ({ value: voice.id, label: voice.name + ' · ' + voice.tag }));
}

function defaultVoiceForProvider(provider) {
  if (provider === 'fish') return (FISH_VOICES[0] && FISH_VOICES[0].id) || '';
  const edgeDefault = VOICES.find((voice) => voice.id === 'zh-CN-XiaoyiNeural');
  return (edgeDefault && edgeDefault.id) || (VOICES[0] && VOICES[0].id) || '';
}

/** 试听音频句柄与世代号：新点一次会掐掉上一句，避免叠播。 */
let previewAudio = null;
let previewSeq = 0;
const VOICE_PREVIEW_TEXT = '你好，这是音色试听。';

function savedVoiceProvider() {
  const main = state.config && state.config.main;
  return main && main.voiceProvider === 'fish' ? 'fish' : 'edge';
}

function voicePreviewRow() {
  const btn = button('试听', () => { void previewVoice(); });
  btn.id = 'voice-preview-btn';
  return make('div', { class: 'testRow' }, [
    btn,
    make('span', { id: 'voice-preview-status', class: 'status', role: 'status', 'aria-live': 'polite' }),
  ]);
}

/** 试听专用 AudioContext：音量 >100% 时复用，避免反复创建导致二次无声。 */
let previewBoostCtx = null;

async function ensurePreviewBoostContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx = previewBoostCtx;
  if (!ctx || ctx.state === 'closed') {
    ctx = new Ctx();
    previewBoostCtx = ctx;
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch (_) { /* 点试听本身带手势，一般能起来 */ }
  }
  // 未 running 时不要挂 MediaElementSource，否则元素输出被抢走又放不出声。
  return ctx.state === 'running' ? ctx : null;
}

async function applyPreviewVolume(audio, volume) {
  const vol = volume < 0 ? 0 : volume > 4 ? 4 : volume;
  if (!(vol > 1)) {
    audio.volume = vol;
    return;
  }
  const ctx = await ensurePreviewBoostContext();
  if (!ctx) {
    audio.volume = 1;
    return;
  }
  audio.volume = 1;
  try {
    const source = ctx.createMediaElementSource(audio);
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(ctx.destination);
  } catch (_) {
    audio.volume = 1;
  }
}

async function previewVoice() {
  const g = state.globals;
  const status = byId('voice-preview-status');
  const btn = byId('voice-preview-btn');
  if (!g || !g.voiceName) {
    setStatus(status, '请先选择音色。', 'error');
    return;
  }
  const draftProvider = g.voiceProvider === 'fish' ? 'fish' : 'edge';
  if (draftProvider !== savedVoiceProvider()) {
    setStatus(status, '请先保存语音引擎，再试听。', 'error');
    return;
  }
  if (draftProvider === 'fish' && !g.hasFishApiKey) {
    setStatus(status, '请先保存 Fish API Key，再试听。', 'error');
    return;
  }
  const token = ++previewSeq;
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
  }
  if (btn) btn.disabled = true;
  setStatus(status, '正在合成试听…');
  try {
    const absRate = typeof g.voiceRate === 'number' ? g.voiceRate : 1;
    const rateClamped = absRate < 0.5 ? 0.5 : absRate > 2 ? 2 : absRate;
    const ratePct = Math.round((rateClamped - 1) * 100);
    const rate = (ratePct >= 0 ? '+' : '') + ratePct + '%';
    const response = await fetch(API + '/voice/speak', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'X-Blue-Fish-Token': TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: VOICE_PREVIEW_TEXT, voice: g.voiceName, rate: rate }),
    });
    if (token !== previewSeq) return;
    const ctype = response.headers.get('content-type') || '';
    if (!response.ok || !ctype.includes('audio')) {
      const data = await response.json().catch(() => null);
      throw new Error((data && data.message) || '试听合成失败');
    }
    const objectUrl = URL.createObjectURL(await response.blob());
    if (token !== previewSeq) {
      URL.revokeObjectURL(objectUrl);
      return;
    }
    const audio = new Audio(objectUrl);
    audio.onended = () => {
      URL.revokeObjectURL(objectUrl);
      if (previewAudio === audio) previewAudio = null;
      if (token === previewSeq) setStatus(status, '试听结束。', 'ok');
    };
    audio.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      if (previewAudio === audio) previewAudio = null;
      if (token === previewSeq) setStatus(status, '播放失败。', 'error');
    };
    await applyPreviewVolume(audio, typeof g.voiceVolume === 'number' ? g.voiceVolume : 1);
    previewAudio = audio;
    setStatus(status, '正在播放…', 'ok');
    await audio.play();
  } catch (error) {
    if (token === previewSeq) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    }
  } finally {
    if (btn && token === previewSeq) btn.disabled = false;
  }
}

function voiceCard() {
  const g = state.globals;
  const isFish = g.voiceProvider === 'fish';
  const voiceOpts = voiceOptionsForProvider(isFish ? 'fish' : 'edge');
  const fishRows = isFish ? [
    passwordField('g-fish-key', 'Fish Audio API Key', g.fishApiKeyDraft || '', (value) => setGlobal('fishApiKeyDraft', value), g.hasFishApiKey ? '已保存密钥，留空保留；勾选下方可清除' : '在 Fish Audio 控制台获取'),
    g.hasFishApiKey ? toggleRow('g-fish-clear', '清除已保存的 Fish API Key', '下次保存时删除磁盘上的密钥。', g.clearFishApiKey === true, (value) => setGlobal('clearFishApiKey', value)) : null,
    selectField('g-fish-model', 'Fish 合成模型', g.fishTtsModel || 's2.1-pro-free', [
      { value: 's2.1-pro-free', label: 'S2.1 Pro Free' },
      { value: 's2.1-pro', label: 'S2.1 Pro' },
      { value: 's2-pro', label: 'S2 Pro' },
      { value: 'drama-3', label: 'Drama 3' },
    ], (value) => setGlobal('fishTtsModel', value)),
  ].filter(Boolean) : [];
  return card('语音播报', '桌宠开口说话用的引擎、音色与音量；保存后立即写盘。', [
    toggleRow('g-voice', '语音播报', '关闭后所有语音都静音，文字气泡不受影响。', g.voiceEnabled, (value) => setGlobal('voiceEnabled', value)),
    selectField('g-voice-provider', '语音引擎', g.voiceProvider || 'edge', [
      { value: 'edge', label: 'Edge（免费）' },
      { value: 'fish', label: 'Fish Audio' },
    ], (value) => {
      const next = value === 'fish' ? 'fish' : 'edge';
      setGlobal('voiceProvider', next);
      const opts = voiceOptionsForProvider(next);
      if (!opts.some((opt) => opt.value === g.voiceName)) setGlobal('voiceName', defaultVoiceForProvider(next));
      renderVoicePanel();
    }),
    ...fishRows,
    selectField('g-voice-name', '音色', g.voiceName, voiceOpts, (value) => setGlobal('voiceName', value), '切换引擎、模型或 Key 后请先保存再试听；只换音色可直接试。'),
    voicePreviewRow(),
    numberField('g-voice-rate', '语速（0.5–2）', g.voiceRate == null ? 1 : g.voiceRate, (value) => setGlobal('voiceRate', clampNumber(value, 0.5, 2, 1)), { min: 0.5, max: 2, step: 0.05, hint: '1 为原速；会重新合成，试听前建议先保存。' }),
    numberField('g-voice-volume', '音量（0–3，最高 300%）', g.voiceVolume, (value) => setGlobal('voiceVolume', clampNumber(value, 0, 3, 1)), { min: 0, max: 3, step: 0.05, hint: '1 = 100%；超过 1 用增益放大，只影响播放不重新合成。' }),
    toggleRow('g-voice-whisper', '周期碎碎念也念出来', '关掉只影响周期碎碎念，手动对话照常发声。', g.voiceWhisperEnabled, (value) => setGlobal('voiceWhisperEnabled', value)),
    toggleRow('g-voice-todo', '待办提醒也念出来', '关掉只影响待办提醒的朗读。', g.voiceTodoEnabled, (value) => setGlobal('voiceTodoEnabled', value)),
  ]);
}

function fontCard() {
  const g = state.globals;
  return card('外观与字体', '气泡、悬浮提示与对话窗共用的字体。', [
    selectField('g-font-family', '字体', g.font.family, FONT_IDS.map((id) => ({ value: id, label: id })), (value) => { g.font = Object.assign({}, g.font, { family: value }); }),
    numberField('g-font-size', '字号（px）', g.font.size, (value) => { g.font = Object.assign({}, g.font, { size: clampNumber(value, 4, 200, 21) }); }, { min: 4, max: 200, step: 1, hint: '只影响气泡与悬浮提示，对话窗字号不变。' }),
    toggleRow('g-font-follow', '字号随宠物大小缩放', '关掉后恒为上面的字号，不随窗口尺寸变化。', g.font.followPet, (value) => { g.font = Object.assign({}, g.font, { followPet: value }); }),
  ]);
}

function physicsCard() {
  const g = state.globals;
  return card('拖拽与抛掷手感', '所有宠物共用；数值改动保存后生效。', [
    make('div', { class: 'grid2' }, [
      numberField('g-gravity', '重力加速度（px/s²）', g.physics.gravity, (value) => { g.physics = Object.assign({}, g.physics, { gravity: clampNumber(value, 0, 10000, 1400) }); }, { min: 0, max: 10000, step: 10 }),
      numberField('g-restitution', '碰壁弹性（0–1）', g.physics.restitution, (value) => { g.physics = Object.assign({}, g.physics, { restitution: clampNumber(value, 0, 1, 0.78) }); }, { min: 0, max: 1, step: 0.01 }),
    ]),
    make('div', { class: 'grid2' }, [
      numberField('g-friction', '接触面摩擦（/s）', g.physics.groundFriction, (value) => { g.physics = Object.assign({}, g.physics, { groundFriction: clampNumber(value, 0, 30, 2.5) }); }, { min: 0, max: 30, step: 0.1 }),
      numberField('g-power', '总力度', g.physics.throwPower, (value) => { g.physics = Object.assign({}, g.physics, { throwPower: clampNumber(value, 0.1, 5, 1) }); }, { min: 0.1, max: 5, step: 0.1 }),
    ]),
    toggleRow('g-ceiling', '顶部反弹', '关掉后上方没有边界，抛掷可以飞出屏幕顶部。', g.physics.ceilingBounce !== false, (value) => { g.physics = Object.assign({}, g.physics, { ceilingBounce: value }); }),
    toggleRow('g-collide', '宠物互相碰撞', '飞行中的宠物撞到其它宠物时按动量弹开。', g.physics.petCollision !== false, (value) => { g.physics = Object.assign({}, g.physics, { petCollision: value }); }),
  ]);
}

function modelCard() {
  const g = state.globals;
  return card('对话上下文', '模型接入在侧栏「模型」；这里只管对话保留多少上下文。', [
    make('div', { class: 'grid2' }, [
      numberField('g-memory', '对话记忆轮数', g.chatMemoryRounds, (value) => setGlobal('chatMemoryRounds', Math.round(clampNumber(value, 0, 100, 0))), { min: 0, max: 100, step: 1, hint: '0 表示不带历史。' }),
      numberField('g-image-limit', '配图张数上限', g.chatImageLimit, (value) => setGlobal('chatImageLimit', Math.round(clampNumber(value, 0, 50, 0))), { min: 0, max: 50, step: 1, hint: '0 表示不限制。' }),
    ]),
  ]);
}

function pathRows() {
  const meta = state.meta || {};
  const rows = [];
  const pairs = [['用户配置', meta.user], ['内置默认', meta.default], ['动画配置', meta.animations], ['表情包', meta.memes], ['待办数据', meta.todos], ['日志', meta.logs]];
  for (const pair of pairs) {
    if (!pair[1]) continue;
    rows.push(make('div', { class: 'pathRow' }, [
      make('span', { class: 'pathKey', text: pair[0] }),
      make('span', { class: 'pathValue', text: String(pair[1]), title: String(pair[1]) }),
    ]));
  }
  if (Array.isArray(meta.storage)) {
    for (const item of meta.storage) {
      if (!item || !item.path) continue;
      rows.push(make('div', { class: 'pathRow' }, [
        make('span', { class: 'pathKey', text: item.exists === false ? '未生成' : '已存在' }),
        make('span', { class: 'pathValue', text: String(item.path), title: String(item.path) }),
      ]));
    }
  }
  return rows.length ? rows : [make('p', { class: 'empty', text: '读不到落盘位置信息。' })];
}

function advancedCard() {
  return card('高级', '手改配置文件时可以从这里找到位置；「同步」会用内置默认覆盖用户配置。', [
    make('div', {}, pathRows()),
    make('div', { class: 'testRow' }, [button('用内置默认覆盖用户配置', syncFromDefault)]),
  ]);
}

async function syncFromDefault() {
  const confirmed = await confirmDialog({
    title: '用内置默认覆盖用户配置',
    text: '现有的用户配置会被整份替换，这个操作不能撤销。',
    confirmLabel: '覆盖',
    danger: true,
  });
  if (!confirmed) return;
  const status = byId('pet-status');
  setStatus(status, '正在同步…');
  try {
    const merged = await callApi('POST', '/config');
    initDrafts(merged);
    markDirty(false);
    renderPetsPanel();
    setStatus(status, '已用内置默认覆盖用户配置。', 'ok');
  } catch (error) {
    setStatus(status, error && error.message ? error.message : String(error), 'error');
  }
}
`;
}
