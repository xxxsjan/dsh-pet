/**
 * 抖音弹幕监听控制页：房间号 / Cookie / 开始停止 / 状态轮询。
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
      --bg: #0f1419;
      --panel: #1a2332;
      --text: #e7ecf3;
      --muted: #8b9bb4;
      --line: #2a3548;
      --accent: #3d8bfd;
      --ok: #3dd68c;
      --bad: #f07178;
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      margin: 0;
      font: 15px/1.5 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background:
        radial-gradient(1200px 600px at 10% -10%, #1d3a5f 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #243049 0%, transparent 50%),
        var(--bg);
    }
    main {
      height: 100%;
      max-width: 1100px;
      margin: 0 auto;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .layout {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(280px, 400px) minmax(0, 1fr);
      gap: 24px;
      align-items: stretch;
    }
    @media (max-width: 800px) {
      html, body { overflow: auto; height: auto; }
      main { height: auto; min-height: 100dvh; }
      .layout {
        grid-template-columns: 1fr;
        align-items: start;
      }
      .pane-feed { min-height: 50vh; }
    }
    .pane {
      min-width: 0;
      min-height: 0;
    }
    .pane-config {
      overflow: auto;
    }
    .pane-feed {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 1.6rem;
      font-weight: 650;
      letter-spacing: 0.02em;
    }
    .lead {
      margin: 0 0 28px;
      color: var(--muted);
    }
    label {
      display: block;
      margin: 0 0 6px;
      color: var(--muted);
      font-size: 0.85rem;
    }
    input, textarea {
      width: 100%;
      margin: 0 0 16px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
      color: var(--text);
      outline: none;
    }
    input:focus, textarea:focus { border-color: var(--accent); }
    textarea {
      min-height: 72px;
      max-height: 120px;
      resize: vertical;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
    }
    .row { display: flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 20px; }
    button {
      appearance: none;
      border: 0;
      border-radius: 8px;
      padding: 10px 16px;
      font: inherit;
      cursor: pointer;
      background: var(--accent);
      color: #fff;
    }
    button.secondary { background: #2c3a50; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .status {
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel) 90%, black);
      white-space: pre-wrap;
      font-family: ui-monospace, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
    }
    .pill {
      display: inline-block;
      margin-bottom: 10px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: #2c3a50;
      color: var(--muted);
    }
    .pill.on { background: color-mix(in srgb, var(--ok) 25%, #1a2332); color: var(--ok); }
    .pill.off { background: color-mix(in srgb, var(--bad) 20%, #1a2332); color: var(--bad); }
    .msg { margin: 0 0 12px; min-height: 1.2em; color: var(--muted); font-size: 0.9rem; }
    .msg.err { color: var(--bad); }
    .msg.ok { color: var(--ok); }
    .toggles {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin: 0 0 18px;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel) 88%, black);
    }
    .toggles label.switch {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      color: var(--text);
      font-size: 0.95rem;
      cursor: pointer;
    }
    .toggles input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin: 0;
      accent-color: var(--accent);
    }
    .feedHead {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 10px;
      flex-shrink: 0;
    }
    .feedHead h2 {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 600;
    }
    .feedHead .meta { color: var(--muted); font-size: 0.8rem; }
    .feed {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: color-mix(in srgb, var(--panel) 92%, black);
      font-size: 13px;
      line-height: 1.45;
    }
    .feed:empty::before {
      content: "暂无消息";
      color: var(--muted);
    }
    .feedItem {
      display: grid;
      grid-template-columns: 54px 1fr;
      gap: 8px;
      padding: 7px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
    }
    .feedItem:last-child { border-bottom: 0; }
    .feedKind {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.04em;
      padding-top: 2px;
    }
    .feedKind.gift { color: #e6b35a; }
    .feedKind.chat { color: #7eb6ff; }
    .feedNick { color: var(--text); font-weight: 600; margin-right: 6px; }
    .feedText { color: color-mix(in srgb, var(--text) 88%, var(--muted)); word-break: break-word; }
    .feedTime { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
  </style>
</head>
<body>
  <main>
    <div class="layout">
      <section class="pane pane-config" aria-label="监听配置">
        <h1>抖音弹幕监听</h1>
        <p class="lead">监听弹幕/礼物；打开开关后会发给当前活跃宠物（没有则 main）走对话。</p>
        <label for="url">直播间链接或房间号</label>
        <input id="url" placeholder="https://live.douyin.com/123456 或纯数字" autocomplete="off" />
        <label for="cookie">Cookie（可选）</label>
        <textarea id="cookie" placeholder="一般可不填；礼物建议粘贴登录 Cookie"></textarea>
        <div class="toggles">
          <label class="switch"><input id="replyChat" type="checkbox" /> 回复弹幕</label>
          <label class="switch"><input id="thankGift" type="checkbox" /> 感谢礼物</label>
        </div>
        <div class="row">
          <button id="start" type="button">开始监听</button>
          <button id="stop" class="secondary" type="button">停止</button>
          <button id="refresh" class="secondary" type="button">刷新状态</button>
        </div>
        <p id="msg" class="msg" aria-live="polite"></p>
        <div id="status" class="status">加载中…</div>
      </section>
      <section class="pane pane-feed" aria-label="最近消息">
        <div class="feedHead">
          <h2>最近消息</h2>
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
    const startBtn = el('start');
    const stopBtn = el('stop');
    let lastFeedId = 0;
    let stickBottom = true;

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
        return '<div class="feedItem" data-id="' + escapeHtml(item.id) + '">' +
          '<div class="feedKind ' + kind + '">' + label + '</div>' +
          '<div><span class="feedNick">' + escapeHtml(item.nick || '匿名') + '</span>' +
          '<span class="feedText">' + body + '</span>' +
          '<span class="feedTime">' + escapeHtml(formatTime(item.at)) + '</span></div></div>';
      }).join('');
      if (shouldStick && (list.length === 0 || maxId !== lastFeedId)) {
        feedBox.scrollTop = feedBox.scrollHeight;
      }
      lastFeedId = maxId;
    }

    function renderStatus(data, syncToggles) {
      const listening = !!(data && data.listening);
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
      startBtn.disabled = true;
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
        startBtn.disabled = false;
      }
    }

    async function stop() {
      setMsg('正在停止…');
      stopBtn.disabled = true;
      try {
        const data = await api('/danmaku/douyin/stop', { method: 'POST', body: '{}' });
        if (!data.ok) throw new Error(data.message || data.reason || '停止失败');
        renderStatus(data);
        setMsg('已停止', 'ok');
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e), 'err');
      } finally {
        stopBtn.disabled = false;
      }
    }

    loadCache();
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
    el('start').addEventListener('click', () => { void start(); });
    el('stop').addEventListener('click', () => { void stop(); });
    el('refresh').addEventListener('click', () => {
      setMsg('');
      void refresh().catch((e) => setMsg(e instanceof Error ? e.message : String(e), 'err'));
    });
    void refresh().catch((e) => {
      statusBox.textContent = e instanceof Error ? e.message : String(e);
      setMsg('状态不可用（服务或 Helper 可能未就绪）', 'err');
    });
    setInterval(() => { void refresh().catch(() => {}); }, 3000);
  </script>
</body>
</html>`;
}
