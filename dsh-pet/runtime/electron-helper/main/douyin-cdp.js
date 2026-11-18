'use strict';
/**
 * 抖音弹幕 CDP 旁听桥（对齐 danmuapp 的「内嵌隐藏浏览器 + CDP 抓帧」方案）。
 *
 * 与旧「本机签名桥 + 后端直连 WSS」不同：这里不自己握手、不发心跳/ACK，而是开一个隐藏
 * BrowserWindow 加载直播间，让页面自己连弹幕 WebSocket；再用 webContents.debugger 挂 CDP，
 * 只旁听 `/webcast/im/push/` 入站帧，base64 解码后原样回给宿主半侧解码分发。
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

/** 省流初始化脚本：不拉直播画面、静音、藏播放器控件，只留弹幕通道。 */
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
 */
function startDouyinCdpBridge({ BrowserWindow, electronSession, log }) {
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
  /** @type {NodeJS.Timeout|null} */
  let loginPoll = null;
  /** @type {NodeJS.Timeout|null} */
  let metaRetry = null;
  let attached = false;

  const state = {
    running: false,
    visible: false,
    url: '',
    loggedIn: false,
    lastError: '',
    title: '',
    anchor: '',
  };

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
    // 未知 requestId 放行：页面可能在 Network.enable 之前就建好连接，收不到 webSocketCreated。
    if (url && !url.includes(DY_WS_URL_NEEDLE)) return;
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
      if (method === 'Network.webSocketCreated') {
        const rid = params?.requestId;
        const url = params?.url;
        if (rid && url) wsUrls.set(String(rid), String(url));
      } else if (method === 'Network.webSocketFrameReceived') {
        handleFrame(params);
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
    send(contents.debugger, 'Network.enable');
    send(contents.debugger, 'Page.setWebLifecycleState', { state: 'active' });
    send(contents.debugger, 'Network.setBlockedURLs', {
      urls: ['*.flv*', '*.m3u8*', '*.mp4*', '*.ts*', '*.m4s*', '*pull-flv*', '*pull-hls*'],
    });
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
          hide();
          clearLoginPoll();
          emitLogin();
          log?.info?.('[blue-fish][douyin-cdp] 检测到登录态，隐藏内嵌窗口');
        })
        .catch(() => undefined);
    }, LOGIN_POLL_MS);
    loginPoll.unref?.();
  }

  function injectScript() {
    if (!win || win.isDestroyed()) return;
    win.webContents.executeJavaScript(DY_INIT_SCRIPT).catch(() => undefined);
  }

  /** 暂停页面内播放（隐藏窗口时再兜底一次省流）。 */
  function pauseVideo() {
    if (!win || win.isDestroyed()) return;
    win.webContents
      .executeJavaScript(
        `(function(){var v=document.querySelectorAll("video,audio");for(var i=0;i<v.length;i++){try{v[i].pause();v[i].muted=true;}catch(_){}}})();`,
      )
      .catch(() => undefined);
  }

  /**
   * 开窗加载直播间并开始旁听。
   * @param {{url:string, cookie?:string}} input
   */
  async function start(input) {
    stop();
    const url = normalizeLiveUrl(input?.url);
    state.url = url;
    state.lastError = '';

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

    attachDebugger(win.webContents);
    win.webContents.on('dom-ready', injectScript);
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

    await win.loadURL(url);
    state.running = true;

    // 房间标题 / 主播：页面 SSR 的 RENDER_DATA 里就有，加载完读一次，空则补读一次。
    void readRoomMeta();
    clearMetaRetry();
    metaRetry = setTimeout(() => {
      metaRetry = null;
      void readRoomMeta();
    }, META_RETRY_MS);
    metaRetry.unref?.();

    // 已有登录态：全程隐藏；未登录：先显示供扫码，轮询到登录态后自动隐藏停播。
    if (loggedIn) {
      hide();
    } else {
      show();
      startLoginPoll();
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
    pauseVideo();
    win.hide();
    state.visible = false;
  }

  function stop() {
    clearLoginPoll();
    clearMetaRetry();
    wsUrls.clear();
    enterRequests.clear();
    attached = false;
    if (win && !win.isDestroyed()) {
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
  }

  function status() {
    return { ...state };
  }

  return {
    start,
    stop,
    show,
    hide,
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
  };
}

module.exports = { startDouyinCdpBridge, DY_PARTITION, DY_WS_URL_NEEDLE };
