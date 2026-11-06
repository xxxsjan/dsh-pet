/**
 * 抖音弹幕分区：表单、开关、状态与弹幕流。
 *
 * 控制面板原先挂在独立页 `/blue-fish/danmaku/`，现在并进设置页的「抖音弹幕」分区，
 * 与其它分区共用令牌、请求封装和主题，不再开新窗口。
 * 表单缓存沿用旧页的 key，升级后已填内容不丢；Cookie 只在勾选「保存到本地」时落盘。
 * 片段里不许出现 innerHTML：弹幕内容一律走文本节点，避免把观众昵称当成标签解析。
 * @module dsh-pet/src/standalone/settings-page/script/danmaku
 */

/** 生成抖音弹幕片段。 */
export function danmakuScript(): string {
  return `
const DM_CACHE_KEY = 'blue_fish_douyin_danmaku_form_v1';
const DM_POLL_MS = 3000;

let dmListening = false;
let dmLastFeedId = 0;
let dmStickBottom = true;
let dmLastStatusUrl = '';

function dmSyncToggle() {
  const button = byId('dm-toggle');
  if (!button) return;
  button.textContent = dmListening ? '停止监听' : '开始监听';
  button.className = dmListening ? 'btn danger' : 'btn primary';
}

function dmExtractWebRid(raw) {
  const text = String(raw || '').trim();
  if (/^\\d{5,}$/.test(text)) return text;
  const matched = text.match(/live\\.douyin\\.com\\/(\\d{5,})/i);
  return matched ? matched[1] : '';
}

function dmResolveLiveUrl() {
  const fromInput = dmExtractWebRid(byId('dm-url').value);
  if (fromInput) return 'https://live.douyin.com/' + fromInput;
  const fromStatus = dmExtractWebRid(dmLastStatusUrl);
  if (fromStatus) return 'https://live.douyin.com/' + fromStatus;
  return '';
}

function dmOpenLiveRoom() {
  const liveUrl = dmResolveLiveUrl();
  if (!liveUrl) {
    setStatus(byId('dm-msg'), '请先填写直播间链接或房间号', 'error');
    return;
  }
  window.open(liveUrl, '_blank', 'noopener,noreferrer');
  setStatus(byId('dm-msg'), '已打开直播间', 'ok');
}

function dmFormatTime(at) {
  const date = new Date(Number(at) || 0);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function dmFormState() {
  return {
    url: byId('dm-url').value.trim(),
    cookie: byId('dm-cookie').value.trim(),
    saveCookieLocal: !!byId('dm-save-cookie').checked,
    replyChat: !!byId('dm-reply-chat').checked,
    thankGift: !!byId('dm-thank-gift').checked,
  };
}

function dmLoadCache() {
  try {
    const raw = localStorage.getItem(DM_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const urlInput = byId('dm-url');
    const cookieInput = byId('dm-cookie');
    const saveCookieInput = byId('dm-save-cookie');
    if (urlInput && typeof parsed.url === 'string' && parsed.url.trim()) urlInput.value = parsed.url.trim();
    const hadCookie = typeof parsed.cookie === 'string' && parsed.cookie.trim().length > 0;
    if (saveCookieInput && typeof parsed.saveCookieLocal === 'boolean') {
      saveCookieInput.checked = parsed.saveCookieLocal;
    } else if (saveCookieInput && hadCookie) {
      // 旧缓存没有这个字段但存过 Cookie：视为已勾选，免得刷新后 Cookie 没了。
      saveCookieInput.checked = true;
    }
    if (saveCookieInput && saveCookieInput.checked && cookieInput && typeof parsed.cookie === 'string') {
      cookieInput.value = parsed.cookie;
    }
    if (typeof parsed.replyChat === 'boolean') byId('dm-reply-chat').checked = parsed.replyChat;
    if (typeof parsed.thankGift === 'boolean') byId('dm-thank-gift').checked = parsed.thankGift;
  } catch (_) { /* 缓存坏了就当没填过 */ }
}

function dmSaveCache() {
  try {
    const form = dmFormState();
    if (!form.saveCookieLocal) form.cookie = '';
    localStorage.setItem(DM_CACHE_KEY, JSON.stringify(form));
  } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
}

function dmRenderFeed(recent) {
  const list = Array.isArray(recent) ? recent : [];
  const meta = byId('dm-feed-meta');
  if (meta) meta.textContent = list.length + ' / 50';
  const feedBox = byId('dm-feed');
  if (!feedBox) return;
  const nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
  const shouldStick = dmStickBottom || nearBottom;
  const maxId = list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
  if (list.length === 0) dmLastFeedId = 0;
  feedBox.textContent = '';
  for (const item of list) {
    const kind = item.kind === 'gift' ? 'gift' : 'chat';
    const label = kind === 'gift' ? '礼物' : '弹幕';
    const body = kind === 'gift'
      ? String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)
      : String(item.text || '');
    feedBox.append(make('div', { class: 'dmFeedItem ' + kind }, [
      make('span', { class: 'dmFeedKind', text: label }),
      make('div', { class: 'dmFeedBody' }, [
        make('span', { class: 'dmFeedNick', text: String(item.nick || '匿名') }),
        make('span', { class: 'dmFeedText', text: body }),
      ]),
      make('span', { class: 'dmFeedTime', text: dmFormatTime(item.at) }),
    ]));
  }
  if (shouldStick && (list.length === 0 || maxId !== dmLastFeedId)) {
    feedBox.scrollTop = feedBox.scrollHeight;
  }
  dmLastFeedId = maxId;
}

function dmRenderStatus(data, syncToggles) {
  const status = data || {};
  dmListening = !!status.listening;
  dmSyncToggle();
  if (typeof status.url === 'string' && status.url.trim()) dmLastStatusUrl = status.url.trim();
  const box = byId('dm-status');
  if (box) {
    box.textContent = '';
    box.append(make('span', { class: 'dmPill ' + (dmListening ? 'on' : 'off'), text: dmListening ? '监听中' : '未监听' }));
    const lines = ['直播间：' + (status.title || '未知'), '主播：' + (status.anchor || '未知')];
    const roomId = status.roomId || dmExtractWebRid(status.url);
    if (roomId) lines.push('房间号：' + roomId);
    lines.push('收到弹幕 ' + (Number(status.chatCount) || 0) + ' 条 / 礼物 ' + (Number(status.giftCount) || 0) + ' 件');
    const error = String(status.lastError || '').trim();
    if (error) lines.push('最近问题：' + error);
    box.append(make('div', { class: 'dmStatusLine', text: lines.join('\\n') }));
  }
  dmRenderFeed(status.recent);
  // 未监听时保留本地勾选，避免 status 的默认 false 冲掉表单。
  if (syncToggles || dmListening) {
    if (typeof status.replyChat === 'boolean') byId('dm-reply-chat').checked = status.replyChat;
    if (typeof status.thankGift === 'boolean') byId('dm-thank-gift').checked = status.thankGift;
  }
}

async function dmRefresh() {
  const data = await callApi('GET', '/danmaku/douyin/status');
  if (!data || data.ok === false) throw new Error((data && data.message) || '读取状态失败');
  dmRenderStatus(data, false);
  return data;
}

async function dmPushOptions() {
  dmSaveCache();
  const data = await callApi('POST', '/danmaku/douyin/options', {
    replyChat: !!byId('dm-reply-chat').checked,
    thankGift: !!byId('dm-thank-gift').checked,
  });
  if (!data || data.ok === false) throw new Error((data && data.message) || '更新开关失败');
  dmRenderStatus(data, true);
  return data;
}

async function dmStart() {
  const button = byId('dm-toggle');
  setStatus(byId('dm-msg'), '正在连接…');
  if (button) button.disabled = true;
  dmSaveCache();
  try {
    const data = await callApi('POST', '/danmaku/douyin/start', dmFormState());
    if (!data || data.ok === false) throw new Error((data && data.message) || '启动失败');
    if (data.url) byId('dm-url').value = data.url;
    dmSaveCache();
    dmRenderStatus(data, true);
    setStatus(byId('dm-msg'), '已开始监听', 'ok');
  } catch (error) {
    setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
    try { await dmRefresh(); } catch (_) { /* 状态也读不到时保留报错文案 */ }
  } finally {
    if (button) button.disabled = false;
    dmSyncToggle();
  }
}

async function dmStop() {
  const button = byId('dm-toggle');
  setStatus(byId('dm-msg'), '正在停止…');
  if (button) button.disabled = true;
  try {
    const data = await callApi('POST', '/danmaku/douyin/stop', {});
    if (!data || data.ok === false) throw new Error((data && data.message) || '停止失败');
    dmRenderStatus(data, false);
    setStatus(byId('dm-msg'), '已停止', 'ok');
  } catch (error) {
    setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
  } finally {
    if (button) button.disabled = false;
    dmSyncToggle();
  }
}

function wireDanmakuPanel() {
  const urlInput = byId('dm-url');
  const cookieInput = byId('dm-cookie');
  const saveCookieInput = byId('dm-save-cookie');
  const toggleBtn = byId('dm-toggle');
  const feedBox = byId('dm-feed');
  const dialog = byId('dm-cookie-dialog');

  dmLoadCache();
  dmSyncToggle();

  if (feedBox) {
    feedBox.addEventListener('scroll', () => {
      dmStickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    });
  }
  for (const node of [urlInput, cookieInput]) {
    if (!node) continue;
    node.addEventListener('change', dmSaveCache);
    node.addEventListener('blur', dmSaveCache);
  }
  if (saveCookieInput) saveCookieInput.addEventListener('change', dmSaveCache);
  for (const node of [byId('dm-reply-chat'), byId('dm-thank-gift')]) {
    if (!node) continue;
    node.addEventListener('change', () => {
      dmSaveCache();
      void dmPushOptions().catch((error) => {
        setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
      });
    });
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (dmListening) void dmStop();
      else void dmStart();
    });
  }
  byId('dm-refresh').addEventListener('click', () => {
    setStatus(byId('dm-msg'), '');
    void dmRefresh().catch((error) => {
      setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
    });
  });
  byId('dm-open-live').addEventListener('click', dmOpenLiveRoom);

  const openCookieHelp = () => { if (dialog) dialog.hidden = false; };
  const closeCookieHelp = () => { if (dialog) dialog.hidden = true; };
  byId('dm-cookie-help').addEventListener('click', openCookieHelp);
  byId('dm-cookie-close').addEventListener('click', closeCookieHelp);
  if (dialog) {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeCookieHelp();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dialog && !dialog.hidden) closeCookieHelp();
  });

  void dmRefresh().catch((error) => {
    setStatus(byId('dm-msg'), '状态不可用（服务或 Helper 可能未就绪）', 'error');
    const box = byId('dm-status');
    if (box) box.textContent = (error && error.message) || String(error);
  });
  // 只在弹幕分区可见时轮询，避免在别的分区空转。
  if (typeof setInterval === 'function') {
    setInterval(() => {
      const panel = byId('panel-danmaku');
      if (panel && panel.hidden) return;
      void dmRefresh().catch(() => {});
    }, DM_POLL_MS);
  }
}
`;
}
