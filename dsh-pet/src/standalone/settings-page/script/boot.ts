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
}

function wireTabs() {
  // 只绑分区 tab；侧栏若有外链（无 data-tab）交给浏览器跳转。
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
  selectTab('chat');
  // 刷新后地址栏里的令牌已被清掉，此时靠首次访问换来的 HttpOnly cookie 继续；
  // cookie 也没了的时候，各面板自己的请求会失败并显示重新打开设置的提示。
  mountProtocolSelect();
  mountBalanceSelect();
  wireAiPanel();
  byId('pet-save').addEventListener('click', savePets);
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
