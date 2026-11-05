'use strict';
/**
 * 抖音 WSS 签名桥：隐藏 BrowserWindow 加载 webmssdk + vFun，本机 HTTP 对外提供签名。
 *
 * 宿主半侧（Node）没有浏览器 API，无法直接跑 frontierSign；Helper 已有 Electron，
 * 与 danmu-ji 同源脚本对齐后把 X-Bogus 回给宿主连 WSS。
 * @module dsh-pet/runtime/electron-helper/main/douyin-sign
 */

const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** 与宿主 sign-client 对齐的 stdout / globalThis 前缀。 */
const SIGN_PREFIX = 'blue-fish-douyin-sign:';
const GLOBAL_KEY = '__dshPetDouyinSignBaseUrl';

/**
 * 启动签名桥。
 *
 * @param deps.BrowserWindow - Electron BrowserWindow。
 * @param deps.helperDir - main.js 所在目录（runtime/electron-helper）。
 * @returns {{ stop: () => void }}
 */
function startDouyinSignBridge({ BrowserWindow, helperDir }) {
  let win = null;
  let ready = false;
  let readyWaiters = [];
  let server = null;
  let baseUrl = '';

  function resolveReady(ok, err) {
    ready = ok;
    const waiters = readyWaiters;
    readyWaiters = [];
    for (const w of waiters) {
      if (ok) w.resolve();
      else w.reject(err || new Error('签名窗未就绪'));
    }
  }

  function waitReady(timeoutMs = 15000) {
    if (ready && win && !win.isDestroyed()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        readyWaiters = readyWaiters.filter((w) => w.resolve !== resolve);
        reject(new Error('签名脚本加载超时'));
      }, timeoutMs);
      readyWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  async function ensureWindow() {
    if (win && !win.isDestroyed() && ready) return;
    if (win && !win.isDestroyed()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
      win = null;
      ready = false;
    }
    const page = path.join(helperDir, 'danmaku', 'sign-page.html');
    win = new BrowserWindow({
      show: false,
      width: 400,
      height: 300,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      resolveReady(false, new Error(`签名页加载失败: ${code} ${desc}`));
    });
    await win.loadURL(pathToFileURL(page).href);
    const ok = await win.webContents.executeJavaScript('Boolean(window.__dshPetDySignReady)');
    if (!ok) {
      resolveReady(false, new Error('抖音签名脚本未加载（webmssdk / vFun）'));
      throw new Error('抖音签名脚本未加载（webmssdk / vFun）');
    }
    resolveReady(true);
  }

  async function sign(roomId, uniqueId) {
    await ensureWindow();
    await waitReady();
    const rid = String(roomId || '').trim();
    const uid = String(uniqueId || '').trim();
    if (!rid || !uid) throw new Error('roomId / uniqueId 不能为空');
    const signature = await win.webContents.executeJavaScript(
      `window.creatSignature(${JSON.stringify(rid)}, ${JSON.stringify(uid)})`,
    );
    if (!signature || typeof signature !== 'string') {
      throw new Error('creatSignature 未返回有效签名');
    }
    return signature;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
        if (raw.length > 64 * 1024) {
          reject(new Error('body too large'));
          req.destroy();
        }
      });
      req.on('end', () => resolve(raw));
      req.on('error', reject);
    });
  }

  function announce(url) {
    baseUrl = url;
    globalThis[GLOBAL_KEY] = url;
    try {
      process.stdout.write(SIGN_PREFIX + url + '\n');
    } catch {
      /* ignore */
    }
    console.error('[blue-fish-desktop-helper] douyin sign bridge: ' + url);
  }

  server = http.createServer(async (req, res) => {
    const send = (status, obj) => {
      const body = JSON.stringify(obj);
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    };
    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
      send(200, { ok: true, ready });
      return;
    }
    if (req.method === 'POST' && req.url === '/douyin-sign') {
      try {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw || '{}');
        const signature = await sign(parsed.roomId, parsed.uniqueId);
        send(200, { ok: true, signature });
      } catch (e) {
        send(500, { ok: false, message: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    send(404, { ok: false, message: 'not found' });
  });

  server.on('error', (e) => {
    console.error(
      '[blue-fish-desktop-helper] douyin sign server error:',
      String(e && e.message ? e.message : e),
    );
  });

  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    const port = addr && typeof addr === 'object' ? addr.port : 0;
    announce('http://127.0.0.1:' + port);
    // 预热隐藏窗，避免第一次 start 才加载 webmssdk
    void ensureWindow().catch((e) => {
      console.error(
        '[blue-fish-desktop-helper] douyin sign preload failed:',
        e instanceof Error ? e.message : String(e),
      );
    });
  });

  function stop() {
    try {
      server?.close();
    } catch {
      /* ignore */
    }
    server = null;
    if (win && !win.isDestroyed()) {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
    }
    win = null;
    if (globalThis[GLOBAL_KEY] === baseUrl) delete globalThis[GLOBAL_KEY];
  }

  return { stop, baseUrl: () => baseUrl };
}

module.exports = { startDouyinSignBridge, SIGN_PREFIX, GLOBAL_KEY };
