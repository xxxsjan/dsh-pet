'use strict';
/**
 * 抖音弹幕 CDP 旁听桥（对齐 danmuapp 的「内嵌隐藏浏览器 + CDP 抓帧」方案）。
 *
 * 开一个隐藏 BrowserWindow 加载直播间，让页面自己连接弹幕 WebSocket；用 webContents.debugger
 * 挂 CDP，只旁听 `/webcast/im/push/` 入站帧，base64 解码后原样回给宿主半侧解码分发。
 *
 * 登录态：
 *  - 有手填 Cookie：加载前写进独立持久分区 `persist:blue-fish-douyin`；
 *  - 无 Cookie 或分区内未登录：显示窗口供扫码登录，轮询到 sessionid 类键后自动隐藏并停播省流。
 *
 * 同进程应用模式下控制器挂在 globalThis（见 main.js 装配）；子进程形态的 HTTP/WS 通道留接缝，后续补。
 * @module dsh-pet/runtime/electron-helper/main/douyin-cdp
 */

/** 独立持久会话分区：登录态长期留在这个内嵌窗口自己的 profile，不碰日常浏览器。 */
const DY_PARTITION = 'persist:blue-fish-douyin';
/** 抖音弹幕 WS 地址特征：用来过滤埋点 / 心跳通道。 */
const DY_WS_URL_NEEDLE = '/webcast/im/push/';
/** 登录态判定键：任一非空即视为已登录。 */
const SESSION_KEYS = ['sessionid', 'sessionid_ss', 'sid_tt', 'uid_tt'];
/** 省流：直播流地址后缀 / 关键字。 */
const STREAM_RE = /\.(flv|m3u8|ts|m4s|mp4)(\?|$)|pull-flv|pull-hls|live-play/i;
/** 轮询登录态间隔。 */
const LOGIN_POLL_MS = 2000;
/** 浏览器窗口使用正常桌面 Chrome UA，避免抖音把 Electron 壳识别成异常环境并渲染空白页。 */
const DY_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** DOM 探测：页面加载 15s 后把礼物面板 / 弹幕 / 进场 / 点赞 的 DOM 结构打出来。
 * 等拿到真实选择器后再换成稳定的 MutationObserver。 */
const DY_DOM_PROBE_SCRIPT = `
(function(){
  if (!/douyin\\.com$/.test(location.hostname)) return;
  if (window.__dyDomProbeDone) return;
  window.__dyDomProbeDone = true;
  setTimeout(function(){
    function describe(el, depth){
      if (!el || depth <= 0) return '';
      if (el.nodeType !== 1) return '';
      var tag = el.tagName.toLowerCase();
      var cls = (el.className && typeof el.className === 'string') ? el.className.split(/\\s+/).filter(Boolean).slice(0,3).join('.') : '';
      var id = el.id ? '#'+el.id : '';
      return '<'+tag+id+(cls?'.'+cls:'')+'>';
    }
    function findAllByKeyword(keyword, limit){
      var all = document.querySelectorAll('*');
      var hits = [];
      var re = new RegExp(keyword, 'i');
      for (var i = 0; i < all.length && hits.length < limit; i++) {
        var el = all[i];
        var cls = (el.className && typeof el.className === 'string') ? el.className : '';
        var id = el.id || '';
        if (re.test(cls) || re.test(id)) {
          hits.push({ selector: describe(el), text: (el.textContent||'').trim().slice(0,60), cls: cls, id: id });
        }
      }
      return hits;
    }

    // 关键词分组：礼物、弹幕、进场、点赞
    var groups = [
      ['gift|礼物|Gift|gift-panel|gift-list', 'GIFT关键字'],
      ['chat|barrage|danmaku|comment|弹幕', 'CHAT关键字'],
      ['enter|member|进场|MemberMessage', 'MEMBER关键字'],
      ['like|点赞|Like', 'LIKE关键字'],
      ['webcast|live-pc|live-room', 'LIVE关键字']
    ];
    var result = {};
    for (var g = 0; g < groups.length; g++) {
      result[groups[g][1]] = findAllByKeyword(groups[g][0], 15);
    }

    // 另外直接扫所有 DOM，收集 class 里含 gift 的节点
    var giftSpecific = [];
    var all = document.querySelectorAll('[class*="gift"],[class*="Gift"],[id*="gift"],[id*="Gift"]');
    for (var j = 0; j < all.length && giftSpecific.length < 20; j++) {
      var el = all[j];
      giftSpecific.push({
        selector: describe(el),
        cls: typeof el.className === 'string' ? el.className : '',
        childCount: el.children.length,
        sampleChild: el.children[0] ? describe(el.children[0]) : '',
        text: (el.textContent||'').trim().slice(0,80)
      });
    }
    result['ALL_GIFT_ATTR'] = giftSpecific;

    console.log('[DY-DOM-PROBE]', JSON.stringify(result));
  }, 15000);
})();
`;
const DY_INIT_SCRIPT = `
(function () {
  try {
    if (!/douyin\\.com$/.test(location.hostname)) return;
    var STREAM_RE = /\\.(flv|m3u8|ts|m4s|mp4)(\\?|$)|pull-flv|pull-hls|live-play/i;
    var isStreamUrl = function (url) {
      try { return STREAM_RE.test(String(url || "")); } catch (_) { return false; }
    };
    var kill = function () {
      var els = document.querySelectorAll("video, audio");
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        try {
          el.pause();
          el.removeAttribute("src");
          el.srcObject = null;
          el.muted = true;
          el.volume = 0;
          el.style.cssText = "display:none!important;width:0!important;height:0!important";
        } catch (_) {}
      }
    };
    kill();
    if (window.__dyKillObserver) return;
    var obs = new MutationObserver(kill);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    window.__dyKillObserver = obs;

    HTMLMediaElement.prototype.play = function () { kill(); return Promise.resolve(); };

    var srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (srcDesc && srcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        get: srcDesc.get,
        set: function (v) { if (isStreamUrl(v)) return; return srcDesc.set.call(this, v); }
      });
    }

    if (typeof window.fetch === "function" && !window.fetch.__dyBlock) {
      var origFetch = window.fetch;
      window.fetch = function (input, init) {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (isStreamUrl(url)) return Promise.reject(new Error("dy-stream-blocked"));
        return origFetch.apply(this, arguments);
      };
      window.fetch.__dyBlock = true;
    }

    var xhrProto = window.XMLHttpRequest && XMLHttpRequest.prototype;
    if (xhrProto && !xhrProto.open.__dyBlock) {
      var origOpen = xhrProto.open;
      var origSend = xhrProto.send;
      xhrProto.open = function (method, url) {
        this.__dyBlockStream = isStreamUrl(url);
        return origOpen.apply(this, arguments);
      };
      xhrProto.send = function () {
        if (this.__dyBlockStream) return;
        return origSend.apply(this, arguments);
      };
      xhrProto.open.__dyBlock = true;
    }

    var hidePlayers = function () {
      var nodes = document.querySelectorAll("[class*='xgplayer'], [class*='video-container']");
      for (var j = 0; j < nodes.length; j++) {
        try { nodes[j].style.cssText = "display:none!important"; } catch (_) {}
      }
    };
    hidePlayers();
    setInterval(hidePlayers, 2000);
  } catch (_) {}
})();
`;

/** 把 Cookie 头拆成 name→value 表。 */
function parseCookieHeader(cookieHeader) {
  const map = new Map();
  for (const part of String(cookieHeader || '').split(/[;\n\r]+/)) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf('=');
    if (i <= 0) continue;
    map.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return map;
}

/** 从直播间链接或纯数字房间号收成 live.douyin.com/<rid>。 */
function normalizeLiveUrl(input) {
  const raw = String(input || '').trim();
  if (/^\d{5,}$/.test(raw)) return `https://live.douyin.com/${raw}`;
  const m = raw.match(/live\.douyin\.com\/(\d{5,})/i);
  if (m?.[1]) return `https://live.douyin.com/${m[1]}`;
  throw new Error('请提供 live.douyin.com/数字 形式的直播间链接或房间号');
}

/** 页面内读房间标题 / 主播：旧 RENDER_DATA 标签与新 window.SSR_RENDER_DATA 状态都试；读不到回空，不抛错。 */
const DY_META_SCRIPT = `(function(){
  function pick(v) {
    if (!v || typeof v !== 'object') return null;
    var paths = [['app','initialState','roomStore','roomInfo','room'],['roomStore','roomInfo','room'],['initialState','roomStore','roomInfo','room']];
    for (var i = 0; i < paths.length; i++) {
      var cur = v;
      for (var j = 0; j < paths[i].length; j++) cur = cur && typeof cur === 'object' ? cur[paths[i][j]] : undefined;
      if (cur && typeof cur === 'object' && (cur.id_str || cur.id)) {
        var owner = cur.owner || cur.anchor || {};
        return { title: String(cur.title || cur.room_title || ''), anchor: String(owner.nickname || owner.nick_name || owner.nickName || '') };
      }
    }
    return null;
  }
  function parseSource(raw) {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try { return JSON.parse(decodeURIComponent(raw)); } catch (_) { /* 再试原串 */ }
    try { return JSON.parse(raw); } catch (_) { /* 读不到就算了 */ }
    return null;
  }
  try {
    var el = document.getElementById('RENDER_DATA');
    var sources = [el && el.textContent, window.SSR_RENDER_DATA, window.SSR_RENDER_DATA_DOC];
    for (var s = 0; s < sources.length; s++) {
      var hit = pick(parseSource(sources[s]));
      if (hit && (hit.title || hit.anchor)) return hit;
    }
  } catch (_) { /* 页面结构变了就当读不到 */ }
  // 最后兜底：页面标题形如「{主播}的抖音直播间 - 抖音直播」，只取主播，不把整串当房间标题。
  var t = document.querySelector('title');
  var text = t ? String(t.textContent || '').trim() : '';
  var m = text.match(/^(.+?)的抖音直播间/);
  return { title: '', anchor: m ? m[1] : '' };
})();`;

/** 加载后首读为空时的补读间隔。 */
const META_RETRY_MS = 3000;

/**
 * 创建抖音 CDP 旁听桥控制器（进程内单例语义由调用方保证）。
 *
 * @param {object} deps
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow - Electron BrowserWindow。
 * @param {typeof import('electron').session} [deps.electronSession] - 可注入 session（测试用），缺省取 electron 内置。
 * @param {{ info?: (m:string)=>void, warn?: (m:string)=>void, debug?: (m:string)=>void }} [deps.log]
 * @param {number} [deps.pushReconnectDelayMs] - 推送 WS 断开后等页面自建的宽限期，超时重载页面；缺省 6s。
 */
function startDouyinCdpBridge({ BrowserWindow, electronSession, log, pushReconnectDelayMs }) {
  const PUSH_RECONNECT_DELAY_MS = Number(pushReconnectDelayMs) > 0 ? Number(pushReconnectDelayMs) : 6000;
  /** 连续自动重载上限：超过就交给监听层提示，避免被挤时无限刷新。 */
  const PUSH_RECONNECT_MAX = 3;
  /** 推送连接活过这么久才算“稳定”，充许清零连续失败计数。 */
  const PUSH_STABLE_MS = 60_000;
  let pushReconnectTimer = null;
  let pushReconnectAttempts = 0;
  const sessionRef =
    electronSession || (() => {
      try {
        return require('electron').session;
      } catch {
        return undefined;
      }
    })();

  /** @type {import('electron').BrowserWindow|null} */
  let win = null;
  /** @type {Map<string,string>} requestId → WS url */
  const wsUrls = new Map();
  /** @type {Map<string,number>} requestId → 建连时间：用来判断连接是否稳定，决定要不要清零重载计数。 */
  const wsCreatedAt = new Map();
  /** @type {Set<string>} 页面 enter 请求的 requestId，等 loadingFinished 取 body */
  const enterRequests = new Set();
  /** @type {Set<(frame: Buffer)=>void>} */
  const frameListeners = new Set();
  /** @type {Set<()=>void>} */
  const loginListeners = new Set();
  /** @type {Set<()=>void>} */
  const closedListeners = new Set();
  /** @type {Set<(meta:{title:string,anchor:string})=>void>} */
  const metaListeners = new Set();
  /** @type {Set<(url:string)=>void>} */
  const wsClosedListeners = new Set();
  /** @type {NodeJS.Timeout|null} */
  let loginPoll = null;
  /** @type {NodeJS.Timeout|null} */
  let metaRetry = null;
  /** @type {NodeJS.Timeout|null} */
  let pauseKeeper = null;
  let attached = false;

  const state = {
    running: false,
    visible: false,
    url: '',
    loggedIn: false,
    lastError: '',
    title: '',
    anchor: '',
    /** 开发调试：保持窗口可见，仅周期暂停视频省流（不拦流、不删播放器），用于观察页面自身重连。 */
    debugVisible: false,
  };
  /** 主动销毁窗口（stop / 换页）时不再把 close 拦成隐藏。 */
  let destroying = false;
  /** 应用退出：close 事件不能再 preventDefault，否则退不掉。 */
  let appQuitting = false;
  try {
    const appRef = require('electron').app;
    appRef?.once?.('before-quit', () => {
      appQuitting = true;
    });
  } catch {
    /* 非 Electron / 测试环境没有 app，忽略 */
  }

  function sess() {
    if (!sessionRef) throw new Error('当前环境没有 Electron session，无法开内嵌窗口');
    return sessionRef.fromPartition(DY_PARTITION);
  }

  function emitFrame(buf) {
    for (const fn of frameListeners) {
      try {
        fn(buf);
      } catch (e) {
        log?.warn?.(`[blue-fish][douyin-cdp] frame listener failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function emitLogin() {
    for (const fn of loginListeners) {
      try {
        fn();
      } catch {
        /* ignore */
      }
    }
  }

  function emitMeta() {
    for (const fn of metaListeners) {
      try {
        fn({ title: state.title, anchor: state.anchor });
      } catch {
        /* ignore */
      }
    }
  }

  function emitWsClosed(url) {
    for (const fn of wsClosedListeners) {
      try {
        fn(url);
      } catch (e) {
        log?.warn?.(`[blue-fish][douyin-cdp] ws closed listener failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** 当前是否还有开着的弹幕推送 WS。 */
  function hasOpenPushSocket() {
    for (const url of wsUrls.values()) {
      if (String(url).includes(DY_WS_URL_NEEDLE)) return true;
    }
    return false;
  }

  function clearPushReconnect() {
    if (pushReconnectTimer) clearTimeout(pushReconnectTimer);
    pushReconnectTimer = null;
  }

  /**
   * 推送 WS 被服务端轮换关闭后，页面不一定自己重建（隐藏 / 暂停播放时实测不会）。
   * 宽限期内没有新的推送连接就重载直播页重建，最多连续重载 3 次；仍失败交给监听层提示。
   */
  function schedulePushReconnect() {
    clearPushReconnect();
    if (pushReconnectAttempts >= PUSH_RECONNECT_MAX) return;
    pushReconnectTimer = setTimeout(() => {
      pushReconnectTimer = null;
      if (!state.running || destroying || !win || win.isDestroyed()) return;
      if (hasOpenPushSocket()) return;
      pushReconnectAttempts += 1;
      log?.warn?.(
        `[blue-fish][douyin-cdp] push ws gone, reload room page (${pushReconnectAttempts}/${PUSH_RECONNECT_MAX})`,
      );
      try {
        win.webContents.reload();
      } catch (e) {
        log?.warn?.(`[blue-fish][douyin-cdp] reload failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // 重载后如果页面连推送 WS 都没建出来，也要在下一拍继续尝试（有连接会撤销这里）。
      schedulePushReconnect();
    }, PUSH_RECONNECT_DELAY_MS);
    pushReconnectTimer.unref?.();
  }

  function clearMetaRetry() {
    if (metaRetry) {
      clearTimeout(metaRetry);
      metaRetry = null;
    }
  }

  /**
   * 从内嵌页的 SSR 状态读房间标题 / 主播昵称（旧 RENDER_DATA 标签与新 window.SSR_RENDER_DATA 都试）。
   * 读不到就保持空串，不影响旁听；加载后先读一次，空则 3s 后补读一次。
   */
  async function readRoomMeta() {
    if (!win || win.isDestroyed()) return;
    let meta = null;
    try {
      meta = await win.webContents.executeJavaScript(DY_META_SCRIPT);
    } catch {
      return;
    }
    applyMeta(meta?.title, meta?.anchor);
  }

  /** 合并非空元数据；空值不覆盖已读到的值，有变化才广播。 */
  function applyMeta(title, anchor) {
    const t = String(title || '').trim();
    const a = String(anchor || '').trim();
    if (!t && !a) return;
    const nextTitle = t || state.title;
    const nextAnchor = a || state.anchor;
    if (nextTitle === state.title && nextAnchor === state.anchor) return;
    state.title = nextTitle;
    state.anchor = nextAnchor;
    emitMeta();
  }

  /** 页面 enter 响应里的 room 对象（data.room 或 data.data 列表项）。 */
  function pickEnterRoom(json) {
    const data = json?.data;
    if (!data || typeof data !== 'object') return null;
    const hasId = (r) => r && typeof r === 'object' && (r.id_str || r.id);
    if (hasId(data.room)) return data.room;
    const list = Array.isArray(data.data) ? data.data : [data.data];
    for (const item of list) {
      if (hasId(item)) return item;
      if (hasId(item?.room)) return item.room;
    }
    return null;
  }

  /** 取页面自己 enter 请求的响应体：带 Cookie、页域签名，比外部补请求稳。 */
  async function readEnterMeta(contents, requestId) {
    let res = null;
    try {
      res = await contents.debugger.sendCommand('Network.getResponseBody', { requestId });
    } catch {
      return;
    }
    let json = null;
    try {
      const body = res?.base64Encoded
        ? Buffer.from(String(res.body || ''), 'base64').toString('utf8')
        : String(res?.body || '');
      json = JSON.parse(body);
    } catch {
      return;
    }
    const room = pickEnterRoom(json);
    if (!room) return;
    const owner = room.owner || room.anchor || {};
    applyMeta(room.title || room.room_title, owner.nickname || owner.nick_name || owner.nickName);
  }

  /** 分区内是否已带登录态。 */
  async function hasSession() {
    const cookies = await sess().cookies.get({ domain: 'douyin.com' });
    return cookies.some((c) => SESSION_KEYS.includes(c.name) && String(c.value || '').trim());
  }

  /** 把手填 Cookie 写进分区（域 .douyin.com，覆盖同名键）。 */
  async function writeCookies(cookieHeader, targetUrl) {
    if (!String(cookieHeader || '').trim()) return;
    const jar = parseCookieHeader(cookieHeader);
    const c = sess();
    for (const [name, value] of jar) {
      try {
        await c.cookies.set({
          url: targetUrl,
          name,
          value,
          domain: '.douyin.com',
          path: '/',
          secure: true,
          httpOnly: false,
        });
      } catch (e) {
        log?.warn?.(`[blue-fish][douyin-cdp] cookie ${name} set failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  function send(debuggerRef, method, params) {
    try {
      debuggerRef.sendCommand(method, params ?? {}).catch(() => undefined);
    } catch {
      /* attach 未就绪时命令会抛，忽略 */
    }
  }

  function handleFrame(params) {
    const requestId = params?.requestId;
    const url = requestId ? wsUrls.get(requestId) : undefined;
    // 推送连接稳定出帧（≥60s）才算真恢复：每次断开都重载的循环靠这里清零，避免被挤时无限刷新。
    if (url && url.includes(DY_WS_URL_NEEDLE) && requestId) {
      const born = wsCreatedAt.get(String(requestId)) || 0;
      if (born && Date.now() - born >= PUSH_STABLE_MS) pushReconnectAttempts = 0;
    }
    // 移除 URL 过滤：抖音可能把礼物 / 点赞 / 在线人数分流到不同 WS URL，
    // 以前只放行 /webcast/im/push/ 会导致这些高频业务帧被丢弃。
    // 保留 info 日志帮我们确认实际抓到了哪些 WS。
    if (url) {
      log?.debug?.(`[blue-fish][douyin-cdp] frame from rid=${requestId} url=${url}`);
    }
    const payloadData = params?.response?.payloadData;
    if (!payloadData) return;
    let buf;
    try {
      buf = Buffer.from(payloadData, 'base64');
    } catch {
      return;
    }
    if (!buf.length) return;
    emitFrame(buf);
  }

  function attachDebugger(contents) {
    contents.debugger.on('message', (_event, method, params) => {
      if (method === 'Runtime.consoleAPICalled') {
        // 把页面 console.log 透传到宿主日志——DOM probe 结果从这里出来
        try {
          const args = params?.args || [];
          const first = args[0]?.value ?? String(args[0]?.description || '');
          if (String(first).startsWith('[DY-DOM-PROBE]')) {
            log?.info?.(`[blue-fish][douyin-cdp] DOM PROBE: ${String(first).slice(0, 8000)}`);
          }
        } catch {}
      } else if (method === 'Network.webSocketCreated') {
        const rid = params?.requestId;
        const url = params?.url;
        if (rid && url) {
          wsUrls.set(String(rid), String(url));
          wsCreatedAt.set(String(rid), Date.now());
          log?.info?.(`[blue-fish][douyin-cdp] ws created rid=${rid} url=${url}`);
          // 页面自己重建了推送连接：撤销待重载；计数是否清零看这条连接能不能稳定活下来。
          if (String(url).includes(DY_WS_URL_NEEDLE)) clearPushReconnect();
        }
      } else if (method === 'Network.webSocketFrameReceived') {
        handleFrame(params);
      } else if (method === 'Network.webSocketClosed') {
        // 只认弹幕推送 WS：埋点 / 心跳通道关闭属正常波动，不能拿来判定「被挤下线」。
        const rid = String(params?.requestId || '');
        const url = wsUrls.get(rid);
        wsUrls.delete(rid);
        wsCreatedAt.delete(rid);
        if (url && url.includes(DY_WS_URL_NEEDLE)) {
          log?.info?.(`[blue-fish][douyin-cdp] ws closed rid=${rid} url=${url}`);
          emitWsClosed(url);
          schedulePushReconnect();
        }
      } else if (method === 'Network.responseReceived') {
        // 页面自己带 Cookie 发的 enter 请求：标题/主播最稳的来源，记下来等 body 就绪。
        const url = String(params?.response?.url || '');
        if (params?.requestId && url.includes('/webcast/room/') && url.includes('/enter/')) {
          enterRequests.add(String(params.requestId));
        }
      } else if (method === 'Network.loadingFinished') {
        const rid = String(params?.requestId || '');
        if (enterRequests.has(rid)) {
          enterRequests.delete(rid);
          void readEnterMeta(contents, rid);
        }
      }
    });
    contents.debugger.attach('1.3');
    attached = true;
    send(contents.debugger, 'Runtime.enable');
    send(contents.debugger, 'Network.enable');
    send(contents.debugger, 'Page.setWebLifecycleState', { state: 'active' });
    // 正常模式整段拦流；调试可见模式不拦流，只靠暂停播放省流量（保留播放器和页面原状）。
    if (!state.debugVisible) {
      send(contents.debugger, 'Network.setBlockedURLs', {
        urls: ['*.flv*', '*.m3u8*', '*.mp4*', '*.ts*', '*.m4s*', '*pull-flv*', '*pull-hls*'],
      });
    }
  }

  function clearLoginPoll() {
    if (loginPoll) {
      clearInterval(loginPoll);
      loginPoll = null;
    }
  }

  function startLoginPoll() {
    clearLoginPoll();
    loginPoll = setInterval(() => {
      hasSession()
        .then((ok) => {
          if (!ok) return;
          state.loggedIn = true;
          if (state.debugVisible) {
            // 调试可见模式保持窗口：登录前 dom-ready 没跑省流脚本，这里等首帧后再暂停，避免黑屏。
            pauseVideo({ onlyStarted: true });
          } else {
            hide();
          }
          clearLoginPoll();
          emitLogin();
          log?.info?.(`[blue-fish][douyin-cdp] 检测到登录态，${state.debugVisible ? '保持窗口可见并暂停播放' : '隐藏内嵌窗口'}`);
        })
        .catch(() => undefined);
    }, LOGIN_POLL_MS);
    loginPoll.unref?.();
  }

  function injectScript() {
    if (!win || win.isDestroyed()) return;
    // 未登录的扫码窗口必须保留直播页和播放器，不能在 dom-ready 阶段就删视频/隐藏播放器；
    // 否则抖音会只剩黑色壳页，用户既看不到二维码也无法完成登录。
    // 调试可见模式也不删播放器：省流只靠周期暂停（见 pauseKeeper），页面结构保持原状。
    if (state.loggedIn && !state.debugVisible) {
      win.webContents.executeJavaScript(DY_INIT_SCRIPT).catch(() => undefined);
    }
    // DOM 探测脚本只读结构，不修改页面。
    win.webContents.executeJavaScript(DY_DOM_PROBE_SCRIPT).catch(() => undefined);
  }

  /** 调试可见模式的省流节奏：只暂停/静音视频，不删播放器、不拦流。 */
  const PAUSE_KEEP_MS = 3000;

  /**
   * 暂停页面内播放。
   * @param {{ onlyStarted?: boolean }} [opts] onlyStarted：只暂停已出首帧的媒体。
   *   调试可见模式必须等首帧再暂停，否则播放器停在加载态，整页显示为黑屏。
   */
  function pauseVideo(opts) {
    if (!win || win.isDestroyed()) return;
    const onlyStarted = opts?.onlyStarted === true;
    win.webContents
      .executeJavaScript(
        `(function(){var only=${onlyStarted};var v=document.querySelectorAll("video,audio");for(var i=0;i<v.length;i++){var el=v[i];try{if(only&&el.readyState<2&&el.currentTime<=0)continue;el.pause();el.muted=true;}catch(_){}}})();`,
      )
      .catch(() => undefined);
  }

  function stopPauseKeeper() {
    if (pauseKeeper) clearInterval(pauseKeeper);
    pauseKeeper = null;
  }

  /** 调试可见模式：首帧出来后再周期暂停（暂停即停止拉流，页面仍保留最后一帧和 UI）。 */
  function startPauseKeeper() {
    stopPauseKeeper();
    if (!state.debugVisible || typeof setInterval !== 'function') return;
    // 立即试一次（未出首帧会被跳过），之后周期补暂停。
    pauseVideo({ onlyStarted: true });
    pauseKeeper = setInterval(() => pauseVideo({ onlyStarted: true }), PAUSE_KEEP_MS);
    pauseKeeper.unref?.();
  }

  /**
   * 开窗加载直播间并开始旁听。
   * @param {{url:string, cookie?:string, debugVisible?:boolean}} input
   */
  async function start(input) {
    stop();
    destroying = false;
    const url = normalizeLiveUrl(input?.url);
    state.debugVisible = input?.debugVisible === true;
    state.url = url;
    state.lastError = '';
    if (state.debugVisible) log?.info?.('[blue-fish][douyin-cdp] debug visible mode: 保持窗口可见，仅暂停视频省流');

    await writeCookies(input?.cookie || '', url);
    let loggedIn = false;
    try {
      loggedIn = await hasSession();
    } catch {
      loggedIn = false;
    }
    state.loggedIn = loggedIn;

    win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      skipTaskbar: true,
      autoHideMenuBar: true,
      backgroundColor: '#0f1115',
      title: '抖音直播间（仅弹幕）',
      webPreferences: {
        partition: DY_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    try {
      if (typeof win.webContents.setUserAgent === 'function') win.webContents.setUserAgent(DY_USER_AGENT);
    } catch (e) {
      log?.warn?.(`[blue-fish][douyin-cdp] set user-agent failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    attachDebugger(win.webContents);
    win.webContents.on('dom-ready', injectScript);
    win.webContents.on('did-fail-load', (_event, code, description) => {
      if (code === -3) return;
      state.lastError = `抖音直播页加载失败：${description || '未知错误'}（${code}）`;
      log?.warn?.(`[blue-fish][douyin-cdp] ${state.lastError}`);
    });
    win.on('closed', () => {
      if (win) win = null;
      state.running = false;
      state.visible = false;
      for (const fn of closedListeners) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    });
    // 用户点窗口的 X 一律当作隐藏：页面和弹幕连接都留着，监听不中断。
    // 只有 stop() 主动销毁和应用退出才真正关窗。
    win.on('close', (event) => {
      if (destroying || appQuitting) return;
      event.preventDefault();
      win.hide();
      state.visible = false;
      log?.info?.('[blue-fish][douyin-cdp] window closed by user → hidden, keeping danmaku');
    });

    await win.loadURL(url);
    state.running = true;
    startPauseKeeper();

    // 房间标题 / 主播：页面 SSR 的 RENDER_DATA 里就有，加载完读一次，空则补读一次。
    void readRoomMeta();
    clearMetaRetry();
    metaRetry = setTimeout(() => {
      metaRetry = null;
      void readRoomMeta();
    }, META_RETRY_MS);
    metaRetry.unref?.();

    // 已有登录态：全程隐藏；未登录：先显示供扫码，轮询到登录态后自动隐藏停播。
    // 开发调试模式保持可见（含已登录），用来观察断开后页面是否自己重连。
    if (loggedIn && !state.debugVisible) {
      hide();
    } else {
      show();
      if (!loggedIn) startLoginPoll();
    }
  }

  function show() {
    if (!win || win.isDestroyed()) return;
    win.show();
    win.focus();
    state.visible = true;
  }

  function hide() {
    if (!win || win.isDestroyed()) return;
    if (state.debugVisible) return;
    // 登录后再启用省流脚本：先暂停并移除播放器，再隐藏窗口。
    win.webContents.executeJavaScript(DY_INIT_SCRIPT).catch(() => undefined);
    pauseVideo();
    win.hide();
    state.visible = false;
  }

  /** 仅切换窗口可见性（调试开关即时生效用）：不删播放器、不改播放状态。 */
  function setVisible(visible) {
    if (!win || win.isDestroyed()) return;
    if (visible === true) {
      show();
      return;
    }
    win.hide();
    state.visible = false;
  }

  function stop() {
    clearLoginPoll();
    clearMetaRetry();
    stopPauseKeeper();
    clearPushReconnect();
    pushReconnectAttempts = 0;
    wsUrls.clear();
    wsCreatedAt.clear();
    enterRequests.clear();
    attached = false;
    if (win && !win.isDestroyed()) {
      destroying = true;
      try {
        if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
      } catch {
        /* ignore */
      }
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
    win = null;
    state.running = false;
    state.visible = false;
    state.url = '';
    state.loggedIn = false;
    state.title = '';
    state.anchor = '';
    state.debugVisible = false;
  }

  function status() {
    return { ...state };
  }

  return {
    start,
    stop,
    show,
    hide,
    setVisible,
    status,
    /** 订阅入站弹幕帧（Buffer）。返回取消订阅函数。 */
    onFrame(fn) {
      frameListeners.add(fn);
      return () => frameListeners.delete(fn);
    },
    /** 订阅「检测到登录态」事件。返回取消订阅函数。 */
    onLogin(fn) {
      loginListeners.add(fn);
      return () => loginListeners.delete(fn);
    },
    /** 订阅内嵌窗口被关闭（旁听中断）事件。返回取消订阅函数。 */
    onClosed(fn) {
      closedListeners.add(fn);
      return () => closedListeners.delete(fn);
    },
    /** 订阅「读到房间标题 / 主播」事件。返回取消订阅函数。 */
    onMeta(fn) {
      metaListeners.add(fn);
      return () => metaListeners.delete(fn);
    },
    /** 订阅弹幕推送 WS 被关闭（页面 push 连接断开）。返回取消订阅函数。 */
    onWsClosed(fn) {
      wsClosedListeners.add(fn);
      return () => wsClosedListeners.delete(fn);
    },
  };
}

module.exports = { startDouyinCdpBridge, DY_PARTITION, DY_WS_URL_NEEDLE };
