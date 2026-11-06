/**
 * 设置页启动：分区切换、初次加载与保存按钮接线。
 *
 * 配置 / 语音读 /config（共用顶栏保存）；模型在侧栏独立分区（读 /standalone-ai/settings）。
 * 缺令牌时只提示、不发任何请求——本页所有写操作都依赖那次运行有效的凭证。
 * @module dsh-pet/src/standalone/settings-page/script/boot
 */

/** 生成启动片段。 */
export function bootScript(): string {
  return `
let protocolSelect = null;
let balanceSelect = null;

function mountProtocolSelect() {
  const host = byId('protocol-host');
  if (!host) return;
  protocolSelect = createSelect(
    [
      { value: 'openai-compatible', label: 'OpenAI 兼容' },
      { value: 'anthropic', label: 'Anthropic' },
    ],
    'openai-compatible',
    () => forgetModelOptions(),
  );
  protocolSelect.root.firstElementChild.setAttribute('aria-labelledby', 'protocol-label');
  host.append(protocolSelect.root);
}

function mountBalanceSelect() {
  const host = byId('balance-provider-host');
  if (!host) return;
  balanceSelect = createSelect(
    [
      { value: '', label: '不查询余额' },
      { value: 'deepseek-official', label: 'DeepSeek 官方' },
      { value: 'opencode-go', label: 'opencode Go' },
      { value: 'commandcode', label: 'commandcode' },
    ],
    '',
    (picked) => {
      const button = byId('balance-btn');
      if (button) button.disabled = picked === '';
      const result = byId('balance-result');
      if (result) {
        result.textContent = '';
        result.dataset.ok = '';
        result.dataset.error = '';
      }
    },
  );
  balanceSelect.root.firstElementChild.setAttribute('aria-labelledby', 'balance-provider-label');
  host.append(balanceSelect.root);
}

function selectTab(name) {
  // 对话标签：只打开全局悬浮弹窗，不切换面板、不改导航高亮。
  if (name === 'chat') {
    const chatDialog = byId('chat-dialog');
    if (chatDialog) chatDialog.hidden = false;
    return;
  }
  // 其他标签：正常切换面板，同时关闭对话弹窗。
  const chatDialog = byId('chat-dialog');
  if (chatDialog) chatDialog.hidden = true;
  for (const cell of document.querySelectorAll('[data-tab]')) {
    const active = cell.dataset.tab === name;
    cell.setAttribute('aria-selected', active ? 'true' : 'false');
    const panel = byId('panel-' + cell.dataset.tab);
    if (panel) panel.hidden = !active;
    if (active && cell.dataset.title) {
      const title = byId('page-title');
      if (title) title.textContent = cell.dataset.title;
    }
  }
  // 配置与语音共用顶栏 pet-save（/config）；模型用顶栏 save（/standalone-ai/settings）。
  const petSave = byId('pet-save');
  if (petSave) petSave.hidden = name !== 'config' && name !== 'voice';
  const modelSave = byId('save');
  if (modelSave) modelSave.hidden = name !== 'model';
  // 弹幕分区切进来就立刻拉一次状态，不用等下一轮轮询。
  if (name === 'danmaku') void dmRefresh().catch(() => {});
}

function closeChatDialog() {
  const chatDialog = byId('chat-dialog');
  if (chatDialog) chatDialog.hidden = true;
}

function wireTabs() {
  // 侧栏分区全部是 data-tab 按钮；没有外链，切换只改 aria-selected 与面板可见性。
  const cells = Array.prototype.slice.call(document.querySelectorAll('.navCell[data-tab]'));
  cells.forEach((cell, index) => {
    cell.addEventListener('click', () => selectTab(cell.dataset.tab));
    cell.addEventListener('keydown', (event) => {
      const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
      const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft';
      if (!forward && !backward) return;
      event.preventDefault();
      const step = forward ? 1 : -1;
      const next = cells[(index + step + cells.length) % cells.length];
      next.focus();
      selectTab(next.dataset.tab);
    });
  });
}

async function loadPets() {
  const status = byId('pet-status');
  setStatus(status, '正在读取本机配置…');
  try {
    const config = await callApi('GET', '/config');
    const meta = await callApi('GET', '/config/meta').catch(() => null);
    if (!config || config.ok === false || !config.main) throw new Error('读取配置失败：宿主没有返回可用的配置。');
    state.meta = meta;
    initDrafts(config);
    renderPetsPanel();
    byId('pet-save').disabled = false;
    setStatus(status, '');
  } catch (error) {
    const message = (error && error.message) || String(error);
    setStatus(status, message, 'error');
  }
}

async function loadAi() {
  const status = byId('status');
  try {
    populateAi(await aiRequest('GET'));
    byId('save').disabled = false;
    setStatus(status, '设置只在本机保存。');
  } catch (error) {
    setStatus(status, (error && error.message) || String(error), 'error');
  }
}

const THEME_KEY = 'blue_fish_ui_theme';

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch (_) {
    return 'light';
  }
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  if (root && typeof root.setAttribute === 'function') {
    root.setAttribute('data-theme', next);
    if (root.style) root.style.colorScheme = next;
  }
  const btn = byId('theme-toggle');
  if (btn && typeof btn.setAttribute === 'function') {
    btn.setAttribute('aria-label', next === 'dark' ? '切换到亮色' : '切换到暗色');
  }
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
}

function wireTheme() {
  applyTheme(readTheme());
  const btn = byId('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    applyTheme(readTheme() === 'dark' ? 'light' : 'dark');
  });
}

function boot() {
  wireTheme();
  wireTabs();
  // 默认显示配置面板，对话以弹窗形式悬浮。
  selectTab('config');
  // 刷新后地址栏里的令牌已被清掉，此时靠首次访问换来的 HttpOnly cookie 继续；
  // cookie 也没了的时候，各面板自己的请求会失败并显示重新打开设置的提示。
  mountProtocolSelect();
  mountBalanceSelect();
  wireAiPanel();
  wireDanmakuPanel();
  byId('pet-save').addEventListener('click', savePets);
  // 对话弹窗：关闭按钮 + 点遮罩关闭 + Esc 关闭。
  const chatCloseBtn = byId('chat-dialog-close');
  if (chatCloseBtn) chatCloseBtn.addEventListener('click', closeChatDialog);
  const chatDialog = byId('chat-dialog');
  if (chatDialog) {
    chatDialog.addEventListener('click', (event) => {
      if (event.target === chatDialog) closeChatDialog();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && chatDialog && !chatDialog.hidden) closeChatDialog();
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadPets();
  loadAi();
}
`;
}
