/**
 * 设置页启动：分区切换、初次加载与保存按钮接线。
 *
 * 配置面板包含宠物、全局开关、字体、物理、模型、语音、高级等 Tab；
 * 模型与语音集成在配置面板中，不再作为独立侧栏分区。
 * 主题以服务端 `GET /ui-theme` 为准（磁盘是唯一真相），localStorage / cookie 只是首帧缓存：
 * 独立模式端口会被占用顺延、浏览器也可能换 host，只有服务端能跨这些差异记住偏好。
 * 缺令牌时只提示、不发任何请求——本页所有写操作都依赖那次运行有效的凭证。
 * @module dsh-pet/src/standalone/settings-page/script/boot
 */

/** 生成启动片段。 */
export function bootScript(): string {
  return `
let protocolSelect = null;
let balanceSelect = null;
// 当前顶层分区（对话 / 配置）；configTab 定义在 pets 片段里，二者一起决定顶栏保存按钮。
let activeTab = 'chat';

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

// 顶栏只放桌宠配置保存（/config）；模型保存按钮在模型卡片内部，随卡片显隐。
// 模型子标签下顶栏不显示宠物保存，避免在模型表单里误提交桌宠配置。
function updateSaveButtons() {
  const inConfig = activeTab === 'config';
  const petSave = byId('pet-save');
  if (petSave) petSave.hidden = !(inConfig && configTab !== 'model');
}

function selectTab(name) {
  activeTab = name;
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
  updateSaveButtons();
  // 弹幕分区切进来就立刻拉一次状态，不用等下一轮轮询。
  if (name === 'danmaku') void dmRefresh().catch(() => {});
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

// 读 cookie 里的主题值；不区分端口，独立模式端口被占用顺延（3080→3081）也读得到。
function readThemeCookie() {
  try {
    const hit = document.cookie
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.indexOf(THEME_KEY + '=') === 0)[0];
    return hit ? decodeURIComponent(hit.slice(THEME_KEY.length + 1)) : '';
  } catch (_) {
    return '';
  }
}

// 主题记忆：cookie 优先（按域名隔离、跨端口共享），localStorage 仅作同端口兜底。
// 只存 localStorage 时，端口一变 localStorage 的 origin 也跟着变，主题就被当成新站点重置成亮色。
function readTheme() {
  let stored = readThemeCookie();
  if (!stored) {
    try { stored = localStorage.getItem(THEME_KEY) || ''; } catch (_) { stored = ''; }
  }
  return stored === 'dark' ? 'dark' : 'light';
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
  // 双写：cookie 是跨端口的那份记忆，localStorage 只在本端口兜底。
  try { document.cookie = THEME_KEY + '=' + next + '; path=/standalone-ai; max-age=31536000; SameSite=Lax'; } catch (_) {}
}

async function saveThemeRemote(theme) {
  try { await callApi('POST', '/ui-theme', { theme }); } catch (_) {}
}

// 磁盘是唯一真相：首帧先按本地缓存画出，再拿服务端值纠正（端口/host/浏览器换了也一致）。
// 服务端还没有记录（saved=false）时，把浏览器里此前的选择迁过去，避免升级后第一次打开被默认值覆盖。
async function syncThemeRemote() {
  try {
    const result = await callApi('GET', '/ui-theme');
    if (!result) return;
    if (result.saved === false) {
      if (readTheme() === 'dark') void saveThemeRemote('dark');
      return;
    }
    const theme = result.theme === 'dark' || result.theme === 'light' ? result.theme : '';
    if (theme && theme !== readTheme()) applyTheme(theme);
  } catch (_) {}
}

function wireTheme() {
  applyTheme(readTheme());
  void syncThemeRemote();
  const btn = byId('theme-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = readTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    void saveThemeRemote(next);
  });
}

function boot() {
  wireTheme();
  wireTabs();
  wireConfigTabs();
  // 默认显示对话面板。
  selectTab('chat');
  // 刷新后地址栏里的令牌已被清掉，此时靠首次访问换来的 HttpOnly cookie 继续；
  // cookie 也没了的时候，各面板自己的请求会失败并显示重新打开设置的提示。
  mountProtocolSelect();
  mountBalanceSelect();
  wireAiPanel();
  wireDanmakuPanel();
  byId('pet-save').addEventListener('click', savePets);
  // 弹幕 Cookie 弹窗：关闭按钮 + 点遮罩 + Esc。
  const dmCookieDialog = byId('dm-cookie-dialog');
  const dmCookieClose = byId('dm-cookie-close');
  if (dmCookieClose) dmCookieClose.addEventListener('click', () => { if (dmCookieDialog) dmCookieDialog.hidden = true; });
  if (dmCookieDialog) {
    dmCookieDialog.addEventListener('click', (event) => {
      if (event.target === dmCookieDialog) dmCookieDialog.hidden = true;
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dmCookieDialog && !dmCookieDialog.hidden) dmCookieDialog.hidden = true;
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
