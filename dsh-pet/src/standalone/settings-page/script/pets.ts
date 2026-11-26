/**
 * 「桌宠配置」面板的草稿与保存：条目切换、实例列表的读入、面板装配与两个写接口。
 *
 * 编辑的是一份草稿（state.pets / state.globals），只有点当前 Tab 的保存才写盘：
 * 每个配置 Tab 各自一个保存按钮，只提交自己那一段（未传字段由宿主按磁盘旧值透传保留），
 * 因此某个 Tab 的草稿有问题不会拦住别的 Tab 写盘。main 条目走 PUT /config，
 * 其余条目在「宠物」页走 POST /pet-config。单只宠物的字段与增删见 ./pet-card，条目级全局字段见 ./globals。
 * @module dsh-pet/src/standalone/settings-page/script/pets
 */

/** 生成宠物面板片段。 */
export function petsScript(): string {
  return `
let configTab = 'pet';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** 原配置里的 physics 段，用来判断哪些可选键「本来就有」。 */
let physicsSource = null;

function pickGlobals(main) {
  const source = main || {};
  const physics = source.physics && typeof source.physics === 'object' ? source.physics : null;
  physicsSource = physics;
  return {
    notificationsEnabled: source.notificationsEnabled !== false,
    whisperImageEnabled: source.whisperImageEnabled === true,
    chatImageEnabled: source.chatImageEnabled === true,
    chatAnimationEnabled: source.chatAnimationEnabled === true,
    confineToScreen: source.confineToScreen === true,
    trayEnabled: source.trayEnabled !== false,
    obsCaptureEnabled: source.obsCaptureEnabled !== false,
    obsShowPet: source.obsShowPet !== false,
    obsShowBubble: source.obsShowBubble !== false,
    obsScale: typeof source.obsScale === 'number' && Number.isFinite(source.obsScale)
      ? Math.min(3, Math.max(0.2, source.obsScale))
      : 1,
    voiceEnabled: source.voiceEnabled === true,
    voiceProvider: source.voiceProvider === 'fish' || source.voiceProvider === 'breeze' ? source.voiceProvider : 'edge',
    voiceName: typeof source.voiceName === 'string' && source.voiceName ? source.voiceName : (VOICES[1] ? VOICES[1].id : ''),
    voiceVolume: typeof source.voiceVolume === 'number' && Number.isFinite(source.voiceVolume)
      ? Math.min(3, Math.max(0, source.voiceVolume))
      : 1,
    voiceRate: typeof source.voiceRate === 'number' && Number.isFinite(source.voiceRate)
      ? Math.min(2, Math.max(0.5, source.voiceRate))
      : 1,
    voiceWhisperEnabled: source.voiceWhisperEnabled !== false,
    voiceTodoEnabled: source.voiceTodoEnabled !== false,
    fishTtsModel: typeof source.fishTtsModel === 'string' && source.fishTtsModel ? source.fishTtsModel : 's2.1-pro-free',
    fishVoices: Array.isArray(source.fishVoices) ? source.fishVoices : [],
    hasFishApiKey: source.hasFishApiKey === true,
    fishApiKeyDraft: '',
    clearFishApiKey: false,
    breezeVoices: Array.isArray(source.breezeVoices) ? source.breezeVoices : [],
    hasBreezeApiKey: source.hasBreezeApiKey === true,
    breezeApiKeyDraft: '',
    clearBreezeApiKey: false,
    physics: Object.assign({}, FALLBACK_PHYSICS, source.physics || {}),
    font: Object.assign({}, FALLBACK_FONT, source.font || {}),
    chatMemoryRounds: Number.isFinite(Number(source.chatMemoryRounds)) ? Number(source.chatMemoryRounds) : 0,
    chatImageLimit: Number.isFinite(Number(source.chatImageLimit)) ? Number(source.chatImageLimit) : 0,
  };
}

function initDrafts(config) {
  state.config = config;
  state.globals = pickGlobals(config.main);
  state.pets = {};
  state.prompts = {};
  for (const key of Object.keys(config)) {
    const conf = config[key];
    if (!conf || !Array.isArray(conf.pets)) continue;
    state.pets[key] = cloneJson(conf.pets);
    if (typeof conf.whisperPrompt === 'string') state.prompts[key] = conf.whisperPrompt;
  }
  if (!state.pets.main) state.pets.main = [];
  if (!state.pets[state.entry]) state.entry = 'main';
}

function currentPets() {
  return state.pets[state.entry] || [];
}

function currentPet() {
  return currentPets()[state.petIndex];
}

function entryTabs(keys) {
  const tabs = keys.map((key) => tabButton(key === 'main' ? '默认条目' : key, key === state.entry, () => {
    state.entry = key;
    state.petIndex = 0;
    renderPetsPanel();
  }));
  return make('div', { class: 'tabs' }, tabs);
}

function packNote() {
  return card('条目说明', null, [
    make('p', { class: 'cardHint', text: '这个条目来自文件宠物，只保存它自己的实例；全局开关与外观在「默认条目」里改。模型接入请到侧栏「模型」。' }),
  ]);
}

function renderVoicePanel() {
  const host = byId('voice-host');
  if (!host) return;
  host.textContent = '';
  if (!state.globals) {
    host.append(make('p', { class: 'empty', text: '正在读取本机配置…' }));
    return;
  }
  host.append(voiceCard());
  host.append(tabFooter('voice'));
}

function renderPetsPanel() {
  const host = byId('pet-cards');
  const modelHost = byId('model-settings-host');
  const voiceHost = byId('voice-settings-host');
  if (!host) return;
  // 隐藏所有区域
  if (host) host.hidden = true;
  if (modelHost) modelHost.hidden = true;
  if (voiceHost) voiceHost.hidden = true;
  if (!state.globals) {
    host.hidden = false;
    host.textContent = '';
    host.append(make('p', { class: 'empty', text: '正在读取本机配置…' }));
    renderVoicePanel();
    return;
  }
  // 宠物 Tab：显示条目切换 + 宠物卡片
  if (configTab === 'pet') {
    host.hidden = false;
    host.textContent = '';
    const keys = Object.keys(state.pets);
    if (keys.length > 1) host.append(entryTabs(keys));
    host.append(petCard());
    if (state.entry !== 'main') host.append(packNote());
    host.append(tabFooter('pet'));
  }
  // 模型 Tab：显示模型设置（保存按钮在模型表单内部，写的是 /standalone-ai/settings，与配置无关）
  else if (configTab === 'model') {
    if (modelHost) modelHost.hidden = false;
  }
  // 语音 Tab：显示语音设置
  else if (configTab === 'voice') {
    if (voiceHost) voiceHost.hidden = false;
    renderVoicePanel();
  }
  // 其他 Tab：显示对应的全局卡片（全局页除开关外还有 OBS 直播源卡片）
  else {
    host.hidden = false;
    host.textContent = '';
    const cardMap = {
      global: [globalFlagsCard, obsSourceCard],
      font: [fontCard],
      physics: [physicsCard],
      advanced: [advancedCard],
    };
    for (const builder of cardMap[configTab] || []) host.append(builder());
    // 高级 Tab 只有落盘路径与「同步」，没有可保存的字段；其余 Tab 各自带一个保存按钮。
    if (configTab === 'advanced') {
      host.append(make('p', { class: 'status', text: '这一页只有说明与「同步」，没有需要保存的配置项。' }));
    } else host.append(tabFooter(configTab));
  }
}

function selectConfigTab(name) {
  configTab = name;
  for (const tab of document.querySelectorAll('.configTab')) {
    tab.setAttribute('aria-selected', tab.dataset.configTab === name ? 'true' : 'false');
  }
  renderPetsPanel();
}

function wireConfigTabs() {
  for (const tab of document.querySelectorAll('.configTab')) {
    tab.addEventListener('click', () => selectConfigTab(tab.dataset.configTab));
  }
}

/** 提交用的 physics 段：原配置没写过的可选键不带出去，避免保存时凭空补键。 */
function physicsBody() {
  const out = Object.assign({}, state.globals.physics);
  for (const key of ['tiltGravity', 'shakeThrow', 'hapticEnabled']) {
    if (!physicsSource || !(key in physicsSource)) delete out[key];
  }
  return out;
}

/** 语音段：引擎、音色、语速音量与两家的 Key/自定义目录。 */
function voiceBody() {
  const g = state.globals;
  return {
    voiceEnabled: g.voiceEnabled,
    voiceProvider: g.voiceProvider,
    voiceName: g.voiceName,
    voiceVolume: g.voiceVolume,
    voiceRate: g.voiceRate,
    voiceWhisperEnabled: g.voiceWhisperEnabled,
    voiceTodoEnabled: g.voiceTodoEnabled,
    fishTtsModel: g.fishTtsModel,
    fishVoices: g.fishVoices,
    breezeVoices: g.breezeVoices,
    ...(g.clearFishApiKey
      ? { clearFishApiKey: true }
      : g.fishApiKeyDraft
        ? { fishApiKey: g.fishApiKeyDraft }
        : {}),
    ...(g.clearBreezeApiKey
      ? { clearBreezeApiKey: true }
      : g.breezeApiKeyDraft
        ? { breezeApiKey: g.breezeApiKeyDraft }
        : {}),
  };
}

/**
 * 每个 Tab 只提交自己那一段：未传的顶层字段由宿主按磁盘旧值透传保留（见 host/config/save 的 bodyOwned），
 * 所以某个 Tab 的草稿非法不会再连累别的 Tab 保存失败——这正是共用一个保存按钮时会「点了没反应」的根源。
 * pets 是唯一由请求体独占的字段，任何一段都得原样带上当前草稿。
 */
function tabBody(tab) {
  const p = { pets: state.pets.main };
  if (tab === 'global') {
    return Object.assign(p, {
      notificationsEnabled: state.globals.notificationsEnabled,
      whisperImageEnabled: state.globals.whisperImageEnabled,
      chatImageEnabled: state.globals.chatImageEnabled,
      chatAnimationEnabled: state.globals.chatAnimationEnabled,
      confineToScreen: state.globals.confineToScreen,
      trayEnabled: state.globals.trayEnabled,
      obsCaptureEnabled: state.globals.obsCaptureEnabled,
      obsShowPet: state.globals.obsShowPet,
      obsShowBubble: state.globals.obsShowBubble,
      obsScale: state.globals.obsScale,
    });
  }
  if (tab === 'font') return Object.assign(p, { font: state.globals.font });
  if (tab === 'physics') return Object.assign(p, { physics: physicsBody() });
  if (tab === 'voice') return Object.assign(p, voiceBody());
  return p;
}

/** 每个 Tab 自己的保存按钮与就地状态行。 */
function tabFooter(tab) {
  const button = make('button', { type: 'button', class: 'btn primary', id: 'save-' + tab, text: '保存' });
  button.addEventListener('click', () => { void saveConfigTab(tab); });
  const status = make('p', { class: 'status', id: 'status-' + tab, text: '', role: 'status' });
  status.setAttribute('aria-live', 'polite');
  return make('div', { class: 'footer' }, [button, status]);
}

/**
 * 保存成功后只回写这个 Tab 的那一段。
 * 整份 initDrafts 会把别的 Tab 里还没保存的输入（改了一半的开关、Key 草稿）一起刷回磁盘旧值，
 * 分 Tab 保存后这种「顺手清掉」更容易踩到，所以按段回写。
 */
function applySavedTab(tab, merged) {
  const main = merged && merged.main && typeof merged.main === 'object' ? merged.main : {};
  const g = state.globals;
  if (tab === 'pet') {
    const conf = merged ? merged[state.entry] : null;
    if (conf && Array.isArray(conf.pets)) {
      state.pets[state.entry] = cloneJson(conf.pets);
      if (typeof conf.whisperPrompt === 'string') state.prompts[state.entry] = conf.whisperPrompt;
    }
    return;
  }
  if (tab === 'global') {
    g.notificationsEnabled = main.notificationsEnabled !== false;
    g.whisperImageEnabled = main.whisperImageEnabled === true;
    g.chatImageEnabled = main.chatImageEnabled === true;
    g.chatAnimationEnabled = main.chatAnimationEnabled === true;
    g.confineToScreen = main.confineToScreen === true;
    g.trayEnabled = main.trayEnabled !== false;
    g.obsCaptureEnabled = main.obsCaptureEnabled !== false;
    g.obsShowPet = main.obsShowPet !== false;
    g.obsShowBubble = main.obsShowBubble !== false;
    g.obsScale = typeof main.obsScale === 'number' && Number.isFinite(main.obsScale)
      ? Math.min(3, Math.max(0.2, main.obsScale))
      : 1;
    return;
  }
  if (tab === 'font') {
    g.font = Object.assign({}, FALLBACK_FONT, main.font || {});
    return;
  }
  if (tab === 'physics') {
    // 「原配置本来有哪些可选键」这一判断也要跟着刷新，否则下一次保存会按旧判断补键或删键。
    physicsSource = main.physics && typeof main.physics === 'object' ? main.physics : null;
    g.physics = Object.assign({}, FALLBACK_PHYSICS, main.physics || {});
    return;
  }
  if (tab === 'voice') {
    g.voiceEnabled = main.voiceEnabled === true;
    g.voiceProvider = main.voiceProvider === 'fish' || main.voiceProvider === 'breeze' ? main.voiceProvider : 'edge';
    if (typeof main.voiceName === 'string' && main.voiceName) g.voiceName = main.voiceName;
    g.voiceVolume = typeof main.voiceVolume === 'number' && Number.isFinite(main.voiceVolume)
      ? Math.min(3, Math.max(0, main.voiceVolume)) : 1;
    g.voiceRate = typeof main.voiceRate === 'number' && Number.isFinite(main.voiceRate)
      ? Math.min(2, Math.max(0.5, main.voiceRate)) : 1;
    g.voiceWhisperEnabled = main.voiceWhisperEnabled !== false;
    g.voiceTodoEnabled = main.voiceTodoEnabled !== false;
    g.fishTtsModel = typeof main.fishTtsModel === 'string' && main.fishTtsModel ? main.fishTtsModel : 's2.1-pro-free';
    g.fishVoices = Array.isArray(main.fishVoices) ? cloneJson(main.fishVoices) : [];
    g.breezeVoices = Array.isArray(main.breezeVoices) ? cloneJson(main.breezeVoices) : [];
    // 密钥只回显「有没有」：刚提交的草稿与清空标记都清掉，免得下一次保存再带一遍。
    g.hasFishApiKey = main.hasFishApiKey === true;
    g.hasBreezeApiKey = main.hasBreezeApiKey === true;
    g.fishApiKeyDraft = '';
    g.clearFishApiKey = false;
    g.breezeApiKeyDraft = '';
    g.clearBreezeApiKey = false;
  }
}

async function saveConfigTab(tab) {
  const status = byId('status-' + tab);
  const saveBtn = byId('save-' + tab);
  // 只有「宠物」页在非默认条目下才走条目级接口；其余 Tab 写的都是 main 的全局字段。
  const entrySave = tab === 'pet' && state.entry !== 'main';
  if (tab === 'pet' && state.entry === 'main' && currentPets().length === 0) {
    const message = '默认条目至少要保留一只宠物，否则宿主会拒绝保存。';
    setStatus(status, message, 'error');
    flashSaveHint(message, 'error');
    return;
  }
  if (saveBtn) saveBtn.disabled = true;
  setStatus(status, '正在保存…');
  flashSaveHint('正在保存…');
  try {
    let merged;
    if (entrySave) {
      merged = await callApi('POST', '/pet-config', { entry: state.entry, pets: currentPets() });
    } else {
      merged = await callApi('PUT', '/config', tabBody(tab));
      if (merged && merged.ok === false && merged.reason === 'user-config-unparsable') {
        const message = (merged.userFile ? String(merged.userFile) : '用户配置') + '\\n继续保存会按白名单重建这个文件，里面其它内容会丢失。';
        const confirmed = await confirmDialog({
          title: '配置文件无法解析',
          text: message,
          confirmLabel: '覆盖保存',
          danger: true,
        });
        if (!confirmed) {
          setStatus(status, '已取消保存。', 'error');
          flashSaveHint('已取消保存。', 'error');
          return;
        }
        merged = await callApi('PUT', '/config?force=1', tabBody(tab));
      }
    }
    if (!merged || merged.ok === false) {
      const message = (merged && (merged.message || merged.reason)) || '宿主拒绝了这次保存。';
      setStatus(status, message, 'error');
      flashSaveHint(message, 'error');
      return;
    }
    // 只回写本 Tab 那一段：别的 Tab 里还没保存的输入（Key 草稿、自定义音色）不能被一次保存顺手刷掉。
    applySavedTab(tab, merged);
    clearDirtyTab(tab);
    renderPetsPanel();
    setStatus(byId('status-' + tab), '已保存到本机。', 'ok');
    flashSaveHint('已保存到本机。', 'ok');
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setStatus(byId('status-' + tab), message, 'error');
    flashSaveHint(message, 'error');
  } finally {
    const btn = byId('save-' + tab);
    if (btn) btn.disabled = false;
  }
}
`;
}
