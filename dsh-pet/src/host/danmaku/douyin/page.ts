/**
 * 抖音弹幕监听控制页：房间号 / Cookie / 开始停止 / 状态轮询 / 打开直播间。
 *
 * 自包含 HTML，由 `/dsh-pet-7340/danmaku/` 返回；不接气泡与 LLM。
 * @module dsh-pet/src/host/danmaku/douyin/page
 */
import { ROUTE_SEGMENT } from '../../../shared/constants.ts';

/** 控制页 HTML（内联样式与脚本，避免再挂静态资源路由）。 */
export function douyinDanmakuPageHtml(): string {
  const base = ROUTE_SEGMENT;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>抖音弹幕监听</title>
  <style>
    :root {
      --bg: #f2f2f7;
      --card: #ffffff;
      --text: #1c1c1e;
      --muted: #8e8e93;
      --line: rgba(60, 60, 67, 0.12);
      --separator: rgba(60, 60, 67, 0.29);
      --accent: #007aff;
      --accent-press: #0062cc;
      --fill: #78788014;
      --ok: #34c759;
      --bad: #ff3b30;
      --gift: #ff9500;
      --radius: 12px;
      --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06);
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      font: 15px/1.47 -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
        "PingFang SC", "Helvetica Neue", "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    main {
      height: 100%;
      max-width: 1080px;
      margin: 0 auto;
      padding: 20px 16px 24px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .layout {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
      gap: 16px;
      align-items: stretch;
    }
    @media (max-width: 800px) {
      html, body { overflow: auto; height: auto; }
      main { height: auto; min-height: 100dvh; }
      .layout {
        grid-template-columns: 1fr;
        align-items: start;
      }
      .pane-feed { min-height: 52vh; }
    }
    .pane {
      min-width: 0;
      min-height: 0;
    }
    .pane-config {
      overflow: auto;
      padding-right: 2px;
    }
    .pane-feed {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      padding: 16px;
      border-radius: 16px;
      background: var(--card);
      box-shadow: var(--shadow);
    }
    .pageTitle {
      margin: 4px 0 4px;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }
    .pageTitle + .group { margin-top: 14px; }
    .group {
      margin: 0 0 14px;
      border-radius: var(--radius);
      background: var(--card);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .groupRow {
      padding: 10px 14px 12px;
      border-bottom: 0.5px solid var(--separator);
    }
    .groupRow:last-child { border-bottom: 0; }
    .fieldLabel {
      display: block;
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.01em;
    }
    .group input,
    .group textarea {
      width: 100%;
      margin: 0;
      padding: 8px 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: var(--text);
      outline: none;
      font: inherit;
    }
    .group input::placeholder,
    .group textarea::placeholder { color: #c7c7cc; }
    .group textarea {
      min-height: 68px;
      max-height: 120px;
      resize: vertical;
      font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }
    .toggles {
      margin: 0 0 14px;
      border-radius: var(--radius);
      background: var(--card);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .toggles label.switch {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0;
      padding: 12px 14px;
      color: var(--text);
      font-size: 16px;
      cursor: pointer;
      border-bottom: 0.5px solid var(--separator);
      user-select: none;
    }
    .toggles label.switch:last-child { border-bottom: 0; }
    .toggles input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      position: relative;
      width: 51px;
      height: 31px;
      margin: 0;
      flex: 0 0 auto;
      border-radius: 999px;
      background: #e9e9eb;
      transition: background-color .2s ease;
      cursor: pointer;
    }
    .toggles input[type="checkbox"]::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 27px;
      height: 27px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 1px 2px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12);
      transition: transform .2s ease;
    }
    .toggles input[type="checkbox"]:checked {
      background: var(--ok);
    }
    .toggles input[type="checkbox"]:checked::after {
      transform: translateX(20px);
    }
    .toggles input[type="checkbox"]:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--accent) 55%, white);
      outline-offset: 2px;
    }
    .row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 12px;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 980px;
      padding: 9px 16px;
      font: inherit;
      font-size: 15px;
      font-weight: 560;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
      transition: background-color .15s ease, opacity .15s ease, transform .08s ease;
    }
    button:hover { background: var(--accent-press); }
    button:active { transform: scale(0.98); }
    button.secondary {
      background: var(--fill);
      color: var(--accent);
    }
    button.secondary:hover {
      background: color-mix(in srgb, var(--fill) 70%, #aeaeb2);
    }
    button.danger {
      background: color-mix(in srgb, var(--bad) 12%, white);
      color: var(--bad);
    }
    button.danger:hover {
      background: color-mix(in srgb, var(--bad) 18%, white);
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      transform: none;
    }
    .msg {
      margin: 0 0 10px;
      min-height: 1.2em;
      color: var(--muted);
      font-size: 13px;
    }
    .msg.err { color: var(--bad); }
    .msg.ok { color: var(--ok); }
    .status {
      padding: 12px 14px;
      border-radius: var(--radius);
      background: var(--card);
      box-shadow: var(--shadow);
      white-space: pre-wrap;
      font-size: 13px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--text) 88%, var(--muted));
    }
    .pill {
      display: inline-flex;
      align-items: center;
      margin-bottom: 8px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: var(--fill);
      color: var(--muted);
    }
    .pill.on {
      background: color-mix(in srgb, var(--ok) 16%, white);
      color: #248a3d;
    }
    .pill.off {
      background: color-mix(in srgb, var(--bad) 12%, white);
      color: #d70015;
    }
    .feedHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 12px;
      flex-shrink: 0;
    }
    .feedHead h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .feedHead .meta {
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--fill);
      color: var(--muted);
      font-size: 12px;
      font-weight: 560;
      font-variant-numeric: tabular-nums;
    }
    .feed {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 10px;
      border-radius: 14px;
      background: #f7f7f9;
      border: 0.5px solid var(--line);
      font-size: 14px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .feed:empty::before {
      content: "弹幕区空空的，开始监听后会出现在这里";
      display: block;
      margin: auto;
      padding: 28px 12px;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
    }
    .feedItem {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: start;
      padding: 10px 12px;
      border-radius: 14px;
      background: var(--card);
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .feedItem.chat {
      background: color-mix(in srgb, var(--accent) 6%, white);
    }
    .feedItem.gift {
      background: color-mix(in srgb, var(--gift) 8%, white);
    }
    .feedKind {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.02em;
      line-height: 1;
      white-space: nowrap;
    }
    .feedKind.chat {
      color: #0051d5;
      background: color-mix(in srgb, var(--accent) 14%, white);
    }
    .feedKind.gift {
      color: #9a5200;
      background: color-mix(in srgb, var(--gift) 18%, white);
    }
    .feedBody { min-width: 0; }
    .feedNick {
      display: inline-block;
      margin-right: 6px;
      color: var(--accent);
      font-weight: 650;
    }
    .feedItem.gift .feedNick { color: #c93400; }
    .feedText {
      color: var(--text);
      word-break: break-word;
    }
    .feedItem.gift .feedText { color: #9a5200; font-weight: 560; }
    .feedTime {
      color: var(--muted);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      padding-top: 3px;
    }
  </style>
</head>
<body>
  <main>
    <div class="layout">
      <section class="pane pane-config" aria-label="监听配置">
        <h1 class="pageTitle">抖音弹幕监听</h1>
        <div class="group">
          <div class="groupRow">
            <label class="fieldLabel" for="url">直播间链接或房间号</label>
            <input id="url" placeholder="https://live.douyin.com/123456 或纯数字" autocomplete="off" />
          </div>
          <div class="groupRow">
            <label class="fieldLabel" for="cookie">Cookie（可选）</label>
            <textarea id="cookie" placeholder="一般可不填；礼物建议粘贴登录 Cookie"></textarea>
          </div>
        </div>
        <div class="toggles">
          <label class="switch"><span>回复弹幕</span><input id="replyChat" type="checkbox" /></label>
          <label class="switch"><span>感谢礼物</span><input id="thankGift" type="checkbox" /></label>
        </div>
        <div class="row">
          <button id="toggle-listen" type="button">开始监听</button>
          <button id="refresh" class="secondary" type="button">刷新状态</button>
          <button id="open-live" class="secondary" type="button">打开直播间</button>
        </div>
        <p id="msg" class="msg" aria-live="polite"></p>
        <div id="status" class="status">加载中…</div>
      </section>
      <section class="pane pane-feed" aria-label="弹幕区">
        <div class="feedHead">
          <h2>弹幕区</h2>
          <span class="meta" id="feed-meta">0 / 50</span>
        </div>
        <div id="feed" class="feed" aria-live="polite"></div>
      </section>
    </div>
  </main>
  <script>
    const BASE = ${JSON.stringify(base)};
    const CACHE_KEY = 'dsh_pet_douyin_danmaku_form_v1';
    const el = (id) => document.getElementById(id);
    const msg = el('msg');
    const statusBox = el('status');
    const feedBox = el('feed');
    const feedMeta = el('feed-meta');
    const urlInput = el('url');
    const cookieInput = el('cookie');
    const replyChatInput = el('replyChat');
    const thankGiftInput = el('thankGift');
    const toggleBtn = el('toggle-listen');
    let listening = false;
    let lastFeedId = 0;
    let stickBottom = true;
    let lastStatusUrl = '';

    function syncToggleBtn() {
      if (listening) {
        toggleBtn.textContent = '停止监听';
        toggleBtn.className = 'danger';
      } else {
        toggleBtn.textContent = '开始监听';
        toggleBtn.className = '';
      }
    }

    function extractWebRid(raw) {
      const text = String(raw || '').trim();
      if (/^\\d{5,}$/.test(text)) return text;
      const m = text.match(/live\\.douyin\\.com\\/(\\d{5,})/i);
      return m ? m[1] : '';
    }

    function resolveLiveUrl() {
      const fromInput = extractWebRid(urlInput.value);
      if (fromInput) return 'https://live.douyin.com/' + fromInput;
      const fromStatus = extractWebRid(lastStatusUrl);
      if (fromStatus) return 'https://live.douyin.com/' + fromStatus;
      return '';
    }

    function openLiveRoom() {
      const liveUrl = resolveLiveUrl();
      if (!liveUrl) {
        setMsg('请先填写直播间链接或房间号', 'err');
        return;
      }
      window.open(liveUrl, '_blank', 'noopener,noreferrer');
      setMsg('已打开直播间', 'ok');
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatTime(at) {
      const d = new Date(Number(at) || 0);
      if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return '';
      return d.toLocaleTimeString('zh-CN', { hour12: false });
    }

    function setMsg(text, kind) {
      msg.textContent = text || '';
      msg.className = 'msg' + (kind ? ' ' + kind : '');
    }

    function formState() {
      return {
        url: urlInput.value.trim(),
        cookie: cookieInput.value.trim(),
        replyChat: !!replyChatInput.checked,
        thankGift: !!thankGiftInput.checked,
      };
    }

    function loadCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;
        if (typeof parsed.url === 'string' && parsed.url.trim()) urlInput.value = parsed.url.trim();
        if (typeof parsed.cookie === 'string') cookieInput.value = parsed.cookie;
        if (typeof parsed.replyChat === 'boolean') replyChatInput.checked = parsed.replyChat;
        if (typeof parsed.thankGift === 'boolean') thankGiftInput.checked = parsed.thankGift;
      } catch { /* ignore */ }
    }

    function saveCache() {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(formState()));
      } catch { /* ignore */ }
    }

    function renderFeed(recent) {
      const list = Array.isArray(recent) ? recent : [];
      feedMeta.textContent = list.length + ' / 50';
      const nearBottom =
        feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
      const shouldStick = stickBottom || nearBottom;
      const maxId = list.reduce((m, item) => Math.max(m, Number(item.id) || 0), 0);
      if (list.length === 0) lastFeedId = 0;
      feedBox.innerHTML = list.map((item) => {
        const kind = item.kind === 'gift' ? 'gift' : 'chat';
        const label = kind === 'gift' ? '礼物' : '弹幕';
        const body = kind === 'gift'
          ? escapeHtml(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)
          : escapeHtml(item.text || '');
        return '<div class="feedItem ' + kind + '" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="feedKind ' + kind + '">' + label + '</div>' +
          '<div class="feedBody"><span class="feedNick">' + escapeHtml(item.nick || '匿名') + '</span>' +
          '<span class="feedText">' + body + '</span></div>' +
          '<span class="feedTime">' + escapeHtml(formatTime(item.at)) + '</span></div>';
      }).join('');
      if (shouldStick && (list.length === 0 || maxId !== lastFeedId)) {
        feedBox.scrollTop = feedBox.scrollHeight;
      }
      lastFeedId = maxId;
    }

    function renderStatus(data, syncToggles) {
      listening = !!(data && data.listening);
      syncToggleBtn();
      if (typeof data?.url === 'string' && data.url.trim()) lastStatusUrl = data.url.trim();
      const pill = '<span class="pill ' + (listening ? 'on' : 'off') + '">' +
        (listening ? '监听中' : '未监听') + '</span>';
      const lines = [
        '直播间：' + (data?.title || '未知'),
        '主播：' + (data?.anchor || '未知'),
      ];
      const err = String(data?.lastError || '').trim();
      if (err) lines.push('最近问题：' + err);
      statusBox.innerHTML = pill + '\\n' + lines.join('\\n');
      renderFeed(data?.recent);
      // 未监听时保留本地缓存勾选，避免 status 默认 false 冲掉表单
      if (syncToggles || listening) {
        if (typeof data?.replyChat === 'boolean') replyChatInput.checked = data.replyChat;
        if (typeof data?.thankGift === 'boolean') thankGiftInput.checked = data.thankGift;
      }
    }

    async function api(path, options) {
      const res = await fetch(BASE + path, {
        headers: { 'content-type': 'application/json', ...(options?.headers || {}) },
        ...options,
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch {
        throw new Error('响应不是 JSON（HTTP ' + res.status + '）');
      }
      return json;
    }

    async function refresh() {
      const data = await api('/danmaku/douyin/status');
      if (!data || data.ok === false) throw new Error(data?.message || '读取状态失败');
      renderStatus(data, false);
      return data;
    }

    async function pushOptions() {
      saveCache();
      const data = await api('/danmaku/douyin/options', {
        method: 'POST',
        body: JSON.stringify({
          replyChat: !!replyChatInput.checked,
          thankGift: !!thankGiftInput.checked,
        }),
      });
      if (!data.ok) throw new Error(data.message || data.reason || '更新开关失败');
      renderStatus(data, true);
      return data;
    }

    async function start() {
      setMsg('正在连接…');
      toggleBtn.disabled = true;
      saveCache();
      try {
        const form = formState();
        const data = await api('/danmaku/douyin/start', {
          method: 'POST',
          body: JSON.stringify(form),
        });
        if (!data.ok) throw new Error(data.message || data.reason || '启动失败');
        if (data.url) urlInput.value = data.url;
        saveCache();
        renderStatus(data, true);
        setMsg('已开始监听', 'ok');
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e), 'err');
        try { await refresh(); } catch { /* ignore */ }
      } finally {
        toggleBtn.disabled = false;
        syncToggleBtn();
      }
    }

    async function stop() {
      setMsg('正在停止…');
      toggleBtn.disabled = true;
      try {
        const data = await api('/danmaku/douyin/stop', { method: 'POST', body: '{}' });
        if (!data.ok) throw new Error(data.message || data.reason || '停止失败');
        renderStatus(data);
        setMsg('已停止', 'ok');
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e), 'err');
      } finally {
        toggleBtn.disabled = false;
        syncToggleBtn();
      }
    }

    loadCache();
    syncToggleBtn();
    feedBox.addEventListener('scroll', () => {
      stickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    });
    for (const node of [urlInput, cookieInput]) {
      node.addEventListener('change', saveCache);
      node.addEventListener('blur', saveCache);
    }
    for (const node of [replyChatInput, thankGiftInput]) {
      node.addEventListener('change', () => {
        saveCache();
        void pushOptions().catch((e) => setMsg(e instanceof Error ? e.message : String(e), 'err'));
      });
    }
    toggleBtn.addEventListener('click', () => {
      if (listening) void stop();
      else void start();
    });
    el('refresh').addEventListener('click', () => {
      setMsg('');
      void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e), 'err'));
    });
    el('open-live').addEventListener('click', () => { openLiveRoom(); });
    void refresh().catch((e) => {
      statusBox.textContent = e instanceof Error ? e.message : String(e);
      setMsg('状态不可用（服务或 Helper 可能未就绪）', 'err');
    });
    setInterval(() => { void refresh().catch(() => {}); }, 3000);
  </script>
</body>
</html>`;
}
