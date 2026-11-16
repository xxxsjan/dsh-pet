import http from 'node:http';
import { readFileSync } from 'node:fs';
import { consolePage, consoleScript, consoleStyle } from './src/standalone/console-page.ts';

const DEFAULTS = {
  whisperPrompt: '你是小蓝，一只住在桌面上的蓝色小鱼宠物；说话简短、偶尔撒娇，不用敬语。',
  notificationsEnabled: true,
  clickSoundEnabled: true,
  clickSoundVolume: 0.5,
  whisperImageEnabled: false,
  chatImageEnabled: false,
  chatAnimationEnabled: false,
  confineToScreen: false,
  trayEnabled: true,
  obsCaptureEnabled: true,
  voiceEnabled: false,
  voiceProvider: 'edge',
  voiceName: 'zh-CN-XiaoyiNeural',
  voiceVolume: 1,
  voiceRate: 1,
  voiceWhisperEnabled: true,
  voiceTodoEnabled: true,
  hasFishApiKey: false,
  hasBreezeApiKey: false,
  fishTtsModel: 's2.1-pro-free',
  fishVoices: [],
  breezeVoices: [],
  chatMemoryRounds: 0,
  chatImageLimit: 0,
  whisperModel: { provider: '', model: '' },
  chatModel: { provider: '', model: '' },
  physics: {
    gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1,
    ceilingBounce: true, petCollision: true, hapticEnabled: true, tiltGravity: true, shakeThrow: true
  },
  font: { family: 'candy', size: 21, followPet: true },
  pets: [
    { id: 'p1', name: '小蓝', size: 462, display: 'both', balanceEnabled: true, whisperEnabled: true, workStatusEnabled: true, fixedEnabled: false, position: { corner: 'bottom-right', marginX: 40, marginY: 40 } },
    { id: 'p2', name: '小白', size: 256, sizePercent: 18, display: 'desktop', balanceEnabled: false, whisperEnabled: false, workStatusEnabled: true, fixedEnabled: true, position: { corner: 'top-left', marginX: 12, marginY: 24 }, whisperPrompt: '傲娇但心软' }
  ]
};

let main: Record<string, unknown> = JSON.parse(JSON.stringify(DEFAULTS));
let lastPut: unknown = null;
let putCount = 0;
let savedTheme = 'light';
let savedThemeSaved = true;
let themePutCount = 0;
let lastThemePut: unknown = null;

const catalog = {
  voices: [],
  edgeVoices: [
    { id: 'zh-CN-XiaoyiNeural', name: '晓伊', tag: '女 · 活泼', default: true },
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', tag: '女 · 通用', default: false }
  ],
  fishVoices: [{ id: '55b28b196e1c4fff9a55cd32a46eff25', name: '永雏塔菲', tag: 'Fish · 默认', default: true }],
  breezeVoices: [{ id: 'voc_u3nxkd5578wc', name: '大肥鱼（机灵版）', tag: 'Breeze · 默认', default: true }],
  fishModels: [
    { id: 's2.1-pro-free', label: 'S2.1 Pro Free' },
    { id: 's2.1-pro', label: 'S2.1 Pro' },
    { id: 's2-pro', label: 'S2 Pro' },
    { id: 'drama-3', label: 'Drama 3' }
  ]
};

/** 1x1 透明 PNG：让头像预览走通（真实服务返回的是包内 logo）。 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** 独立模式模型设置：密钥只给 hasKey，页面靠它决定是否显示「删除密钥」。 */
const aiSettings = {
  protocol: 'openai-compatible',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  balanceProvider: '',
  hasKey: true
};
let lastAiPut: Record<string, unknown> = {};
let aiPutCount = 0;

/** 对话（mock）：按宠物存历史，POST 后 600ms 追加一句假回复。 */
const chatHistory: Record<string, Array<{ role: string; content: string; ts: number }>> = { p1: [], p2: [] };
let chatSendCount = 0;

/** 抖音弹幕（mock）：start 之后每 3 秒追加一条假弹幕，stop 停下。 */
const danmakuState = {
  listening: false,
  url: '',
  title: '',
  anchor: '',
  roomId: '',
  chatCount: 0,
  giftCount: 0,
  lastError: '',
  replyChat: false,
  thankGift: false,
  mode: 'cdp' as 'cdp' | 'direct' | 'idle',
  cdpVisible: false,
  cdpLoggedIn: true,
  recent: [] as Array<{ id: number; kind: string; nick: string; text: string; at: number; count?: number }>
};
let danmakuTimer: ReturnType<typeof setInterval> | null = null;
let danmakuSeq = 0;

/** 小红书中控台弹幕（mock）：start 之后每 3 秒追加一条假弹幕，stop 停下。 */
const xhsState = {
  listening: false,
  chatCount: 0,
  giftCount: 0,
  lastError: '',
  replyChat: false,
  thankGift: false,
  mode: 'cdp' as 'cdp' | 'idle',
  cdpVisible: false,
  cdpLoggedIn: true,
  recent: [] as Array<{ id: number; kind: string; nick: string; text: string; at: number; count?: number }>
};
let xhsTimer: ReturnType<typeof setInterval> | null = null;
let xhsSeq = 0;

function xhsPush(kind: 'chat' | 'gift') {
  xhsSeq += 1;
  xhsState.recent.push({
    id: xhsSeq,
    kind,
    nick: (kind === 'gift' ? '送礼观众' : '观众') + xhsSeq,
    text: kind === 'gift' ? '小心心' : '这是第 ' + xhsSeq + ' 条 mock 弹幕',
    at: Date.now(),
    ...(kind === 'gift' ? { count: 1 } : {})
  });
  if (xhsState.recent.length > 50) xhsState.recent.shift();
  if (kind === 'gift') xhsState.giftCount += 1;
  else xhsState.chatCount += 1;
}

function xhsStatus() {
  return {
    listening: xhsState.listening,
    url: 'https://redlive.xiaohongshu.com/live_center_control',
    roomId: '',
    title: '',
    anchor: '',
    chatCount: xhsState.chatCount,
    giftCount: xhsState.giftCount,
    lastError: xhsState.lastError,
    replyChat: xhsState.replyChat,
    thankGift: xhsState.thankGift,
    mode: xhsState.mode,
    cdpVisible: xhsState.cdpVisible,
    cdpLoggedIn: xhsState.cdpLoggedIn,
    recent: xhsState.recent.slice(-50)
  };
}

/** 快手直连弹幕（mock）：start 之后每 3 秒追加一条假弹幕，stop 停下。 */
const ksState = {
  listening: false,
  url: '',
  chatCount: 0,
  giftCount: 0,
  lastError: '',
  replyChat: false,
  thankGift: false,
  mode: 'idle' as 'ws' | 'idle',
  recent: [] as Array<{ id: number; kind: string; nick: string; text: string; at: number; count?: number }>
};
let ksTimer: ReturnType<typeof setInterval> | null = null;
let ksSeq = 0;

function ksPush(kind: 'chat' | 'gift') {
  ksSeq += 1;
  ksState.recent.push({
    id: ksSeq,
    kind,
    nick: (kind === 'gift' ? '送礼观众' : '快手观众') + ksSeq,
    text: kind === 'gift' ? '礼物#' + ksSeq : '这是第 ' + ksSeq + ' 条 mock 弹幕',
    at: Date.now(),
    ...(kind === 'gift' ? { count: 1 } : {})
  });
  if (ksState.recent.length > 50) ksState.recent.shift();
  if (kind === 'gift') ksState.giftCount += 1;
  else ksState.chatCount += 1;
}

function ksStatus() {
  return {
    listening: ksState.listening,
    url: ksState.url,
    roomId: '',
    title: '',
    anchor: '',
    chatCount: ksState.chatCount,
    giftCount: ksState.giftCount,
    lastError: ksState.lastError,
    replyChat: ksState.replyChat,
    thankGift: ksState.thankGift,
    mode: ksState.mode,
    recent: ksState.recent.slice(-50)
  };
}

/** B 站直连弹幕（mock）：start 之后每 3 秒追加一条假弹幕，stop 停下。 */
const blState = {
  listening: false,
  url: '',
  roomId: '',
  title: '',
  anchor: '',
  chatCount: 0,
  giftCount: 0,
  lastError: '',
  replyChat: false,
  thankGift: false,
  mode: 'idle' as 'ws' | 'idle',
  recent: [] as Array<{ id: number; kind: string; nick: string; text: string; at: number; count?: number }>
};
let blTimer: ReturnType<typeof setInterval> | null = null;
let blSeq = 0;

function blPush(kind: 'chat' | 'gift') {
  blSeq += 1;
  blState.recent.push({
    id: blSeq,
    kind,
    nick: (kind === 'gift' ? '送礼观众' : 'B站观众') + blSeq,
    text: kind === 'gift' ? '点赞' : '这是第 ' + blSeq + ' 条 mock 弹幕',
    at: Date.now(),
    ...(kind === 'gift' ? { count: 1 } : {})
  });
  if (blState.recent.length > 50) blState.recent.shift();
  if (kind === 'gift') blState.giftCount += 1;
  else blState.chatCount += 1;
}

function blStatus() {
  return {
    listening: blState.listening,
    url: blState.url,
    roomId: blState.roomId,
    title: blState.title,
    anchor: blState.anchor,
    chatCount: blState.chatCount,
    giftCount: blState.giftCount,
    lastError: blState.lastError,
    replyChat: blState.replyChat,
    thankGift: blState.thankGift,
    mode: blState.mode,
    recent: blState.recent.slice(-50)
  };
}

function danmakuPush(kind: 'chat' | 'gift') {
  danmakuSeq += 1;
  danmakuState.recent.push({
    id: danmakuSeq,
    kind,
    nick: (kind === 'gift' ? '送礼观众' : '观众') + danmakuSeq,
    text: kind === 'gift' ? '小心心' : '这是第 ' + danmakuSeq + ' 条 mock 弹幕',
    at: Date.now(),
    ...(kind === 'gift' ? { count: 1 } : {})
  });
  if (danmakuState.recent.length > 50) danmakuState.recent.shift();
  if (kind === 'gift') danmakuState.giftCount += 1;
  else danmakuState.chatCount += 1;
}

function danmakuStatus() {
  return {
    listening: danmakuState.listening,
    url: danmakuState.url,
    title: danmakuState.title,
    anchor: danmakuState.anchor,
    roomId: danmakuState.roomId,
    chatCount: danmakuState.chatCount,
    giftCount: danmakuState.giftCount,
    lastError: danmakuState.lastError,
    replyChat: danmakuState.replyChat,
    thankGift: danmakuState.thankGift,
    mode: danmakuState.mode,
    cdpVisible: danmakuState.cdpVisible,
    cdpLoggedIn: danmakuState.cdpLoggedIn,
    recent: danmakuState.recent.slice(-50)
  };
}

function makeWav(seconds = 1, freq = 440): Buffer {
  const sampleRate = 8000;
  const n = Math.floor(seconds * sampleRate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 8000), 44 + i * 2);
  }
  return buf;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8'); });
    req.on('end', () => resolve(raw));
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '';
  const send = (code: number, type: string, body: Buffer | string) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };

  if (url.startsWith('/standalone-console/chat-panel.js')) {
    // 与真实服务同一份产物：lib/chat-panel.js 是 bundle 出来的对话面板
    const file = new URL('./lib/chat-panel.js', import.meta.url);
    try { send(200, 'text/javascript; charset=utf-8', readFileSync(file, 'utf8')); }
    catch { send(404, 'text/plain; charset=utf-8', '对话面板脚本缺失，请重新构建（npm run bundle）'); }
    return;
  }
  if (url.startsWith('/standalone-console/') && !url.startsWith('/standalone-console/console.')) {
    send(200, 'text/html; charset=utf-8', consolePage());
    return;
  }
  if (url === '/standalone-console/console.css') { send(200, 'text/css; charset=utf-8', consoleStyle); return; }
  if (url === '/standalone-console/console.js') { send(200, 'text/javascript; charset=utf-8', consoleScript); return; }
  if (url === '/blue-fish/logo' || url.startsWith('/blue-fish/logo?')) { send(200, 'image/png', PNG); return; }
  if (url === '/standalone-ai/settings' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify(aiSettings));
    return;
  }
  if (url === '/standalone-ai/settings' && req.method === 'POST') {
    const raw = await readBody(req);
    const patch: Record<string, unknown> = (() => {
      try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
    })();
    lastAiPut = patch;
    aiPutCount += 1;
    if (patch.clearApiKey === true) aiSettings.hasKey = false;
    if (typeof patch.protocol === 'string') aiSettings.protocol = patch.protocol;
    if (typeof patch.baseUrl === 'string') aiSettings.baseUrl = patch.baseUrl;
    if (typeof patch.model === 'string') aiSettings.model = patch.model;
    if (typeof patch.balanceProvider === 'string') aiSettings.balanceProvider = patch.balanceProvider;
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim() !== '') aiSettings.hasKey = true;
    send(200, 'application/json', JSON.stringify(aiSettings));
    return;
  }
  if (url === '/standalone-ai/test' && req.method === 'POST') {
    send(200, 'application/json', JSON.stringify({ ok: true, message: '连接成功（HTTP 200）', reply: '你好，我是测试回复。' }));
    return;
  }
  if (url === '/standalone-ai/models' && req.method === 'POST') {
    send(200, 'application/json', JSON.stringify({ ok: true, models: ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o-mini'] }));
    return;
  }
  if (url === '/standalone-ai/balance' && req.method === 'POST') {
    send(200, 'application/json', JSON.stringify({ ok: false, provider: aiSettings.balanceProvider, reason: 'unsupported' }));
    return;
  }
  if (url === '/debug/last-ai') {
    send(200, 'application/json', JSON.stringify({ aiPutCount, lastAiPut }));
    return;
  }
  if (url === '/blue-fish/config/meta' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({
      ok: true,
      user: 'C:\\Users\\admin\\.blue-fish\\main-config.jsonc',
      default: 'C:\\Users\\admin\\Desktop\\dsh-pet\\dsh-pet\\assets\\config.jsonc',
      animations: 'C:\\Users\\admin\\.blue-fish\\main-animation',
      memes: 'C:\\Users\\admin\\.blue-fish\\memes',
      todos: 'C:\\Users\\admin\\.blue-fish\\todos.json',
      logs: 'C:\\Users\\admin\\.blue-fish\\logs.txt',
      storage: [
        { path: 'C:\\Users\\admin\\.blue-fish', exists: true },
        { path: 'C:\\Users\\admin\\.blue-fish\\electron', exists: true },
        { path: 'C:\\Users\\admin\\AppData\\Roaming\\blue-fish-electron-helper', exists: false }
      ]
    }));
    return;
  }
  if (url === '/blue-fish/config' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, main, entry: 'main' }));
    return;
  }
  if (url === '/blue-fish/config' && req.method === 'PUT') {
    const raw = await readBody(req);
    try { lastPut = JSON.parse(raw); } catch { lastPut = { parseError: raw }; }
    putCount += 1;
    const patch = lastPut as Record<string, unknown>;
    main = { ...main, ...patch };
    send(200, 'application/json', JSON.stringify({ ok: true, main, entry: 'main' }));
    return;
  }
  if (url === '/blue-fish/config' && req.method === 'POST') {
    main = JSON.parse(JSON.stringify(DEFAULTS));
    send(200, 'application/json', JSON.stringify({ ok: true, main, entry: 'main' }));
    return;
  }
  if (url === '/blue-fish/voice/voices') { send(200, 'application/json', JSON.stringify({ ok: true, ...catalog })); return; }
  if (url === '/blue-fish/ui-theme' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, theme: savedTheme, saved: savedThemeSaved }));
    return;
  }
  if (url === '/blue-fish/ui-theme' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const patch = JSON.parse(raw) as { theme?: string };
      if (patch.theme === 'light' || patch.theme === 'dark') {
        savedTheme = patch.theme;
        savedThemeSaved = true;
        themePutCount += 1;
        lastThemePut = patch.theme;
      }
    } catch { lastThemePut = 'parse-error'; }
    send(200, 'application/json', JSON.stringify({ ok: true, theme: savedTheme }));
    return;
  }
  if (url === '/blue-fish/voice/speak') { send(200, 'audio/wav', makeWav()); return; }
  if (url === '/blue-fish/danmaku/douyin/status' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, ...danmakuStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/douyin/options' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { replyChat?: unknown; thankGift?: unknown };
      if (typeof body.replyChat === 'boolean') danmakuState.replyChat = body.replyChat;
      if (typeof body.thankGift === 'boolean') danmakuState.thankGift = body.thankGift;
    } catch { /* 体不合法就按原状态返回 */ }
    send(200, 'application/json', JSON.stringify({ ok: true, ...danmakuStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/douyin/start' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { url?: unknown; replyChat?: unknown; thankGift?: unknown };
      const room = String(body.url ?? '').trim();
      danmakuState.url = room.indexOf('live.douyin.com/') >= 0 ? room : 'https://live.douyin.com/' + room;
      danmakuState.replyChat = body.replyChat === true;
      danmakuState.thankGift = body.thankGift === true;
    } catch { /* 体不合法就按原状态启动 */ }
    danmakuState.listening = true;
    danmakuState.title = danmakuState.title || 'mock 直播间';
    danmakuState.anchor = danmakuState.anchor || 'mock 主播';
    danmakuState.roomId = danmakuState.roomId || '123456789';
    danmakuState.lastError = '';
    if (danmakuTimer) clearInterval(danmakuTimer);
    danmakuPush('chat');
    danmakuTimer = setInterval(() => danmakuPush(danmakuSeq % 4 === 0 ? 'gift' : 'chat'), 3000);
    send(200, 'application/json', JSON.stringify({ ok: true, ...danmakuStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/douyin/stop' && req.method === 'POST') {
    danmakuState.listening = false;
    if (danmakuTimer) { clearInterval(danmakuTimer); danmakuTimer = null; }
    send(200, 'application/json', JSON.stringify({ ok: true, ...danmakuStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/xiaohongshu/status' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, ...xhsStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/xiaohongshu/options' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { replyChat?: unknown; thankGift?: unknown };
      if (typeof body.replyChat === 'boolean') xhsState.replyChat = body.replyChat;
      if (typeof body.thankGift === 'boolean') xhsState.thankGift = body.thankGift;
    } catch { /* 体不合法就按原状态返回 */ }
    send(200, 'application/json', JSON.stringify({ ok: true, ...xhsStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/xiaohongshu/start' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { cookie?: unknown; replyChat?: unknown; thankGift?: unknown };
      xhsState.replyChat = body.replyChat === true;
      xhsState.thankGift = body.thankGift === true;
    } catch { /* 体不合法就按原状态启动 */ }
    xhsState.listening = true;
    xhsState.lastError = '';
    if (xhsTimer) clearInterval(xhsTimer);
    xhsPush('chat');
    xhsTimer = setInterval(() => xhsPush(xhsSeq % 4 === 0 ? 'gift' : 'chat'), 3000);
    send(200, 'application/json', JSON.stringify({ ok: true, ...xhsStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/xiaohongshu/stop' && req.method === 'POST') {
    xhsState.listening = false;
    if (xhsTimer) { clearInterval(xhsTimer); xhsTimer = null; }
    send(200, 'application/json', JSON.stringify({ ok: true, ...xhsStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/kuaishou/status' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, ...ksStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/kuaishou/options' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { replyChat?: unknown; thankGift?: unknown };
      if (typeof body.replyChat === 'boolean') ksState.replyChat = body.replyChat;
      if (typeof body.thankGift === 'boolean') ksState.thankGift = body.thankGift;
    } catch { /* 体不合法就按原状态返回 */ }
    send(200, 'application/json', JSON.stringify({ ok: true, ...ksStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/kuaishou/start' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { url?: unknown; replyChat?: unknown; thankGift?: unknown };
      ksState.url = String(body.url || '');
      ksState.replyChat = body.replyChat === true;
      ksState.thankGift = body.thankGift === true;
    } catch { /* 体不合法就按原状态启动 */ }
    ksState.listening = true;
    ksState.mode = 'ws';
    ksState.lastError = '';
    if (ksTimer) clearInterval(ksTimer);
    ksPush('chat');
    ksTimer = setInterval(() => ksPush(ksSeq % 4 === 0 ? 'gift' : 'chat'), 3000);
    send(200, 'application/json', JSON.stringify({ ok: true, ...ksStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/kuaishou/stop' && req.method === 'POST') {
    ksState.listening = false;
    ksState.mode = 'idle';
    if (ksTimer) { clearInterval(ksTimer); ksTimer = null; }
    send(200, 'application/json', JSON.stringify({ ok: true, ...ksStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/bilibili/status' && req.method === 'GET') {
    send(200, 'application/json', JSON.stringify({ ok: true, ...blStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/bilibili/options' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { replyChat?: unknown; thankGift?: unknown };
      if (typeof body.replyChat === 'boolean') blState.replyChat = body.replyChat;
      if (typeof body.thankGift === 'boolean') blState.thankGift = body.thankGift;
    } catch { /* 体不合法就按原状态返回 */ }
    send(200, 'application/json', JSON.stringify({ ok: true, ...blStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/bilibili/start' && req.method === 'POST') {
    const raw = await readBody(req);
    try {
      const body = JSON.parse(raw) as { url?: unknown; replyChat?: unknown; thankGift?: unknown };
      blState.url = String(body.url || '');
      blState.replyChat = body.replyChat === true;
      blState.thankGift = body.thankGift === true;
    } catch { /* 体不合法就按原状态启动 */ }
    blState.listening = true;
    blState.mode = 'ws';
    blState.title = 'mock B站直播间';
    blState.anchor = 'mock 主播';
    blState.roomId = '10086';
    blState.lastError = '';
    if (blTimer) clearInterval(blTimer);
    blPush('chat');
    blTimer = setInterval(() => blPush(blSeq % 4 === 0 ? 'gift' : 'chat'), 3000);
    send(200, 'application/json', JSON.stringify({ ok: true, ...blStatus() }));
    return;
  }
  if (url === '/blue-fish/danmaku/bilibili/stop' && req.method === 'POST') {
    blState.listening = false;
    blState.mode = 'idle';
    if (blTimer) { clearInterval(blTimer); blTimer = null; }
    send(200, 'application/json', JSON.stringify({ ok: true, ...blStatus() }));
    return;
  }
  if (url === '/blue-fish/pet-avatar') { send(200, 'application/json', JSON.stringify({ ok: false, message: '内置条目固定用包里的 logo' })); return; }
  if (url.startsWith('/blue-fish/chat/memory')) { send(200, 'application/json', JSON.stringify({ ok: true, orphans: [] })); return; }
  if (url.startsWith('/blue-fish/chat') && req.method === 'GET') {
    const pet = new URL(url, 'http://127.0.0.1').searchParams.get('pet') || 'p1';
    send(200, 'application/json', JSON.stringify({ ok: true, messages: chatHistory[pet] ?? [] }));
    return;
  }
  if (url.startsWith('/blue-fish/chat') && req.method === 'POST') {
    const pet = new URL(url, 'http://127.0.0.1').searchParams.get('pet') || 'p1';
    const raw = await readBody(req);
    let text: string;
    try { text = String((JSON.parse(raw) as { text?: unknown }).text ?? ''); } catch { text = ''; }
    const now = Date.now();
    chatSendCount += 1;
    chatHistory[pet] = chatHistory[pet] ?? [];
    chatHistory[pet].push({ role: 'user', content: text, ts: now });
    const reply = '（mock 回复）我听到你说：' + text;
    setTimeout(() => {
      chatHistory[pet].push({ role: 'assistant', content: reply, ts: now + 1 });
    }, 600);
    setTimeout(() => { /* 让 GET 之后能拿到回复 */ }, 700);
    send(200, 'application/json', JSON.stringify({ ok: true }));
    return;
  }
  if (url.startsWith('/blue-fish/chat') && req.method === 'DELETE') {
    const pet = new URL(url, 'http://127.0.0.1').searchParams.get('pet') || 'p1';
    const removed = (chatHistory[pet] ?? []).length;
    chatHistory[pet] = [];
    send(200, 'application/json', JSON.stringify({ ok: true, removed }));
    return;
  }
  if (url === '/debug/chat') { send(200, 'application/json', JSON.stringify({ chatSendCount, chatHistory })); return; }
  if (url === '/debug/last-put') { send(200, 'application/json', JSON.stringify({ putCount, lastPut, themePutCount, lastThemePut, savedTheme })); return; }
  send(404, 'text/plain', 'not found');
});

server.listen(3999, '127.0.0.1', () => console.log('console preview on http://127.0.0.1:3999/standalone-console/'));
