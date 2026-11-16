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
    let text = '';
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
