'use strict';
/**
 * 小红书中控台 CDP 旁听桥（对齐 danmuapp「主播中控台内嵌窗 + CDP 抓帧」方案）。
 *
 * 开一个独立持久分区的隐藏 BrowserWindow 进入主播中控台（redlive.xiaohongshu.com），
 * 主播扫码登录；只听自己中控台这场直播的 longlink。CDP 只旁听入站 WS 帧，base64 解码后
 * 原样回给宿主半侧按 JSON 解析分发。不填他人直播间链接。
 *
 * 登录态：有手填 Cookie 先写进分区；无 Cookie 则显示窗口供扫码，轮询到登录态后自动隐藏并停播省流。
 * 同进程应用模式下控制器挂在 globalThis（见 main.js 装配）；子进程通道留接缝，后续补。
 * @module dsh-pet/runtime/electron-helper/main/xhs-cdp
 */

/** 独立持久会话分区：中控台登录态长期留在这个内嵌窗口自己的 profile。 */
const XHS_PARTITION = 'persist:blue-fish-xhs';
/** 中控台固定地址（与参照 XHS_LIVE_CENTER_URL 对齐）。 */
const XHS_CENTER_URL = 'https://redlive.xiaohongshu.com/live_center_control';
/** 登录态判定键：任一非空即视为已登录。 */
const SESSION_KEYS = ['web_session', 'customer-sso-sid', 'galaxy_creator_session'];
/** 轮询登录态间隔。 */
const LOGIN_POLL_MS = 2000;
/** 页面里与弹幕无关的 WS（埋点/监控），旁听时直接跳过。 */
const NOISE_WS_URL_PARTS = [
  'sentry',
  'google-analytics',
  'googletagmanager',
  'sensorsdata',
  'apm.',
  'hotjar',
  'clarity.ms',
];

/** 登录态探测脚本：返回 '1' 已登录 / '0' 未登录 / 'login_ui' 登录 UI（对齐参照 XHS_LOGIN_CHECK_JS）。 */
const XHS_LOGIN_CHECK_JS = `
(() => {
  const text = ((document.body && document.body.innerText) || '').slice(0, 4000);
  const hasQr = !!document.querySelector(
    'canvas, img[src*="qr"], [class*="qrcode"], [class*="qr-code"], [class*="login-qr"], iframe[src*="login"]'
  );
  const asksLogin = /扫码登录|手机号登录|验证码登录|请先登录|登录后继续|微信扫码|打开小红书App/.test(text);
  if (hasQr || asksLogin || /login/i.test(location.href || '')) return 'login_ui';

  const cookie = document.cookie || '';
  const hasVisibleSession = /(?:^|;\\s*)(web_session|customer-sso-sid|galaxy_creator_session)=[^;]{8,}/i.test(cookie);
  const inApp = /数据中心|直播数据|场次管理|开播设置|我的直播|带货中控|观众分析/.test(text);
  if ((hasVisibleSession || inApp) && !asksLogin) return '1';
  return '0';
})()
`;

/** 省流初始化脚本：不拉直播画面、静音、藏播放器，只留互动通道。 */
const XHS_INIT_SCRIPT = `
(function () {
  try {
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
    if (window.__xhsKillObserver) return;
    var obs = new MutationObserver(kill);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    window.__xhsKillObserver = obs;

    HTMLMediaElement.prototype.play = function () { kill(); return Promise.resolve(); };

    var srcDesc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "src");
    if (srcDesc && srcDesc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, "src", {
        configurable: true,
        get: srcDesc.get,
        set: function (v) { return srcDesc.set.call(this, v); }
      });
    }
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

/**
 * 解 CDP `Network.webSocketFrameReceived` 的 `response.payloadData`。
 *
 * CDP 约定：opcode=1 是 UTF-8 文本，其余（二进制）才是 base64。
 * 小红书 longlink 是文本 JSON，不能无条件 base64 解；个别页面会把 JSON 再包一层
 * base64，所以文本帧再兜底试一次。
 *
 * @param {string} payloadData - CDP 传来的帧载荷。
 * @param {number} [opcode] - WebSocket 帧 opcode。
 * @returns {Buffer|null} 原始字节；空帧返回 null。
 */
function decodeFramePayload(payloadData, opcode) {
  const text = String(payloadData ?? '');
  if (!text) return null;
  if (opcode === 2) {
    try {
      const buf = Buffer.from(text, 'base64');
      return buf.length ? buf : null;
    } catch {
      return null;
    }
  }
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return Buffer.from(trimmed, 'utf8');
  try {
    const buf = Buffer.from(trimmed, 'base64');
    const decoded = buf.toString('utf8').trim();
    if (decoded.startsWith('{') || decoded.startsWith('[')) return buf;
  } catch {
    /* 不是 base64：按原文交给上层，解析失败会被自然忽略 */
  }
  return Buffer.from(text, 'utf8');
}

/**
 * 创建小红书中控台 CDP 旁听桥控制器（进程内单例语义由调用方保证）。
 *
 * @param {object} deps
 * @param {typeof import('electron').BrowserWindow} deps.BrowserWindow - Electron BrowserWindow。
 * @param {typeof import('electron').session} [deps.electronSession] - 可注入 session（测试用）。
 * @param {{ info?: (m:string)=>void, warn?: (m:string)=>void, debug?: (m:string)=>void }} [deps.log]
 */
function startXhsCdpBridge({ BrowserWindow, electronSession, log }) {
  const sessionRef =
    electronSession ||
    (() => {
      try {
        return require('electron').session;
      } catch {
        return undefined;
      }
    })();

  /** @type {import('electron').BrowserWindow|null} */
  let win = null;
  /** @type {Map<string,string>} requestId → WS url（本轮不按地址过滤，仅留作埋点/降噪扩展）。 */
  const wsUrls = new Map();
  /** @type {Set<(frame: Buffer)=>void>} */
  const frameListeners = new Set();
  /** @type {Set<()=>void>} */
  const loginListeners = new Set();
  /** @type {Set<()=>void>} */
  const closedListeners = new Set();
  /** @type {NodeJS.Timeout|null} */
  let loginPoll = null;
  /** 本轮旁听到的业务帧数（仅用于首帧日志）。 */
  let frameCount = 0;

  const state = {
    running: false,
    visible: false,
    loggedIn: false,
    lastError: '',
  };

  function sess() {
    if (!sessionRef) throw new Error('当前环境没有 Electron session，无法开内嵌窗口');
    return sessionRef.fromPartition(XHS_PARTITION);
  }

  function emitFrame(buf) {
    for (const fn of frameListeners) {
      try {
        fn(buf);
      } catch (e) {
        log?.warn?.(`[blue-fish][xhs-cdp] frame listener failed: ${e instanceof Error ? e.message : String(e)}`);
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

  /** 分区内是否已带登录态（cookie 键判定，与页面内探测互补）。 */
  async function hasSession() {
    const cookies = await sess().cookies.get({ domain: 'xiaohongshu.com' });
    return cookies.some((c) => SESSION_KEYS.includes(c.name) && String(c.value || '').trim());
  }

  /** 把手填 Cookie 写进分区（域 .xiaohongshu.com，覆盖同名键）。 */
  async function writeCookies(cookieHeader) {
    if (!String(cookieHeader || '').trim()) return;
    const jar = parseCookieHeader(cookieHeader);
    const c = sess();
    for (const [name, value] of jar) {
      try {
        await c.cookies.set({
          url: XHS_CENTER_URL,
          name,
          value,
          domain: '.xiaohongshu.com',
          path: '/',
          secure: true,
          httpOnly: false,
        });
      } catch (e) {
        log?.warn?.(`[blue-fish][xhs-cdp] cookie ${name} set failed: ${e instanceof Error ? e.message : String(e)}`);
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

  /** 页面埋点/监控类 WS：只旁听业务通道，避免把无关帧送进解码器。 */
  function isNoiseWsUrl(url) {
    const u = String(url || '').toLowerCase();
    return NOISE_WS_URL_PARTS.some((part) => u.includes(part));
  }

  function handleFrame(params) {
    const requestId = params?.requestId;
    if (requestId) wsUrls.set(String(requestId), String(params?.response?.url || ''));
    const url = requestId ? wsUrls.get(String(requestId)) || '' : '';
    if (url && isNoiseWsUrl(url)) return;

    const response = params?.response;
    const payloadData = response?.payloadData;
    if (!payloadData) return;
    const opcode = Number(response?.opcode);
    const buf = decodeFramePayload(payloadData, opcode);
    if (!buf || !buf.length) return;
    frameCount += 1;
    if (frameCount === 1) {
      log?.info?.(
        `[blue-fish][xhs-cdp] 收到首条业务 WS 帧：opcode=${Number.isFinite(opcode) ? opcode : '?'} bytes=${buf.length} url=${url || 'unknown'}`,
      );
    }
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
      }
    });
    contents.debugger.attach('1.3');
    send(contents.debugger, 'Network.enable');
    send(contents.debugger, 'Page.setWebLifecycleState', { state: 'active' });
    // 省流：视频分片/直播源按 URL 直接拒掉；弹幕走 WS，不受影响。
    send(contents.debugger, 'Network.setBlockedURLs', {
      urls: ['*.flv*', '*.m3u8*', '*.mp4*', '*.ts*', '*.m4s*', '*xhscdn.com/live/*', '*live-play*', '*live-source*'],
    });
  }

  function clearLoginPoll() {
    if (loginPoll) {
      clearInterval(loginPoll);
      loginPoll = null;
    }
  }

  async function probeLogin() {
    if (!win || win.isDestroyed()) return false;
    let verdict = '0';
    try {
      verdict = await win.webContents.executeJavaScript(XHS_LOGIN_CHECK_JS);
    } catch {
      verdict = '0';
    }
    if (verdict === '1') return true;
    // 页面探测不到可见会话时，再用分区 cookie 键兜底。
    if (verdict === '0') {
      try {
        return await hasSession();
      } catch {
        return false;
      }
    }
    return false;
  }

  function startLoginPoll() {
    clearLoginPoll();
    loginPoll = setInterval(() => {
      probeLogin()
        .then((ok) => {
          if (!ok) return;
          state.loggedIn = true;
          hide();
          clearLoginPoll();
          emitLogin();
          log?.info?.('[blue-fish][xhs-cdp] 检测到登录态，隐藏内嵌窗口');
        })
        .catch(() => undefined);
    }, LOGIN_POLL_MS);
    loginPoll.unref?.();
  }

  function injectScript() {
    if (!win || win.isDestroyed()) return;
    win.webContents.executeJavaScript(XHS_INIT_SCRIPT).catch(() => undefined);
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
   * 开窗进入中控台并开始旁听。地址固定，不接收直播间链接。
   * @param {{ cookie?: string }} input
   */
  async function start(input) {
    stop();
    state.lastError = '';

    await writeCookies(input?.cookie || '');
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
      title: '小红书中控台（仅弹幕）',
      webPreferences: {
        partition: XHS_PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        // 隐藏窗口后 Chromium 默认会节流定时器，longlink 心跳可能被拖慢/断线。
        backgroundThrottling: false,
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

    await win.loadURL(XHS_CENTER_URL);
    state.running = true;

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
    wsUrls.clear();
    frameCount = 0;
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
    state.loggedIn = false;
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
  };
}

module.exports = { startXhsCdpBridge, decodeFramePayload, XHS_PARTITION, XHS_CENTER_URL };
