'use strict';
/**
 * B 站直播弹幕直连桥（纯 WSS 自连 + 二进制解包，不依赖内嵌窗口 / CDP）。
 *
 * 与抖音、小红书的「CDP 旁听」方案不同：B 站弹幕通道是标准 WebSocket 明文协议，
 * 自己握手反而更轻、更稳、也更容易控频，所以这里直接自连，不借助页面。
 *
 * 取 token 的两条路（新版接口带 WBI 签名，缺签名会直接 -352 风控）：
 *  1. xlive/web-room/v1/index/getDanmuInfo —— 带 WBI 签名，主路径；
 *  2. room/v1/Danmu/getConf —— 旧接口，无签名可用，作为兜底。
 *
 * 协议要点：
 *  - 包 = 16 字节头（包长4 | 头长16 2 | protover 2 | operation 4 | seq 4，大端）+ body；
 *  - op=7 鉴权、op=2 心跳（30s）、op=5 消息、op=3 人气；
 *  - protover=3 时 body 是 brotli（2 是 zlib），解压后仍是「多个完整包」，需递归拆。
 *
 * @module dsh-pet/runtime/electron-helper/main/bilibili-live
 */

const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

/** 伪装 UA：ws 握手不带 UA 会被服务端直接踢。 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
/** 直播页 Referer：查房间/取 token 的风控必查项。 */
const LIVE_REFERER = 'https://live.bilibili.com/';

/** WBI 混淆表（固定 64 位，顺序不可改，改了就签不出 w_rid）。 */
const WBI_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

/** 心跳间隔（协议要求 30s，超时不发会被服务端断开）。 */
const HEARTBEAT_MS = 30_000;
/** 重连退避：从 2s 起翻倍，封顶 30s。 */
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

const DEFAULT_HEADERS = {
  'User-Agent': UA,
  Referer: LIVE_REFERER,
  Origin: 'https://live.bilibili.com',
};

function md5(s) {
  return createHash('md5').update(String(s)).digest('hex');
}

/** 从 wbi 图片地址里抠出密钥（形如 .../7cd084941338484aae1ad9425b84077c.png）。 */
function pickWbiKey(url) {
  const name = String(url || '').split('/').pop() || '';
  return name.split('.')[0] || '';
}

/** img_key + sub_key 按混淆表重排，取前 32 位。 */
function mixinKeyOf(imgKey, subKey) {
  const raw = String(imgKey) + String(subKey);
  let out = '';
  for (const i of WBI_TAB) out += raw[i] || '';
  return out.slice(0, 32);
}

/** WBI 规定的编码规则：hex 大写、空格 %20、剔除 !'()*。 */
function encodeWbi(v) {
  return encodeURIComponent(String(v)).replace(/[!'()*]/g, '');
}

/**
 * 计算 WBI 签名。
 * @param {Record<string, string|number>} params 业务参数
 * @param {string} imgKey nav 给的 img_key
 * @param {string} subKey nav 给的 sub_key
 * @returns {Record<string, string|number>} 带 w_rid / wts 的参数
 */
function signWbi(params, imgKey, subKey) {
  const p = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(p)
    .sort()
    .map((k) => `${encodeWbi(k)}=${encodeWbi(p[k])}`)
    .join('&');
  return { ...p, w_rid: md5(query + mixinKeyOf(imgKey, subKey)) };
}

async function getJson(url, headers, timeoutMs = 15_000) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { code: -1, message: String(text).slice(0, 120) };
  }
}

/** 拿设备指纹（buvid3/buvid4），不带登录态也能拿，用于降低风控命中。 */
async function fetchBuvid(headers) {
  try {
    const j = await getJson('https://api.bilibili.com/x/frontend/finger/spi', headers);
    return { buvid3: j?.data?.b_3 || '', buvid4: j?.data?.b_4 || '' };
  } catch {
    return { buvid3: '', buvid4: '' };
  }
}

/**
 * 房间号归一：支持短号、房间号、直播间链接。
 * @param {string|number} input
 * @param {Record<string,string>} headers
 */
async function resolveRoom(input, headers) {
  const raw = String(input ?? '').trim();
  const m = raw.match(/(\d{2,})/);
  if (!m) throw new Error('无法识别房间号：' + raw);
  const j = await getJson(`https://api.live.bilibili.com/room/v1/Room/room_init?id=${m[1]}`, headers);
  if (j.code !== 0 || !j.data) throw new Error('room_init 失败：' + JSON.stringify(j).slice(0, 120));
  return { roomId: j.data.room_id, shortId: j.data.short_id || 0, liveStatus: j.data.live_status };
}

/**
 * 取弹幕服务器地址与 token：新版（WBI）优先，旧接口兜底。
 * @param {number} roomId
 * @param {Record<string,string>} headers
 * @param {Console} [log]
 */
async function fetchDanmuEndpoint(roomId, headers, log) {
  try {
    const nav = await getJson('https://api.bilibili.com/x/web-interface/nav', headers);
    const imgKey = pickWbiKey(nav?.data?.wbi_img?.img_url);
    const subKey = pickWbiKey(nav?.data?.wbi_img?.sub_url);
    if (imgKey && subKey) {
      const signed = signWbi({ id: roomId, type: 0, web_location: '444.8' }, imgKey, subKey);
      const qs = Object.keys(signed)
        .sort()
        .map((k) => `${k}=${encodeURIComponent(signed[k])}`)
        .join('&');
      const j = await getJson(
        `https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo?${qs}`,
        headers,
      );
      if (j.code === 0 && j.data?.token) {
        return {
          token: j.data.token,
          hosts: (j.data.host_list || []).map((h) => ({ host: h.host, wss_port: h.wss_port })),
          source: 'getDanmuInfo',
        };
      }
      log?.warn?.('[bili-live] getDanmuInfo 被拒 code=' + j.code + '，转旧接口');
    }
  } catch (e) {
    log?.warn?.('[bili-live] getDanmuInfo 异常：' + (e && e.message));
  }

  const j2 = await getJson(
    `https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${roomId}&platform=pc&player=web`,
    headers,
  );
  if (j2.code === 0 && j2.data?.token) {
    return {
      token: j2.data.token,
      hosts: (j2.data.host_server_list || []).map((h) => ({ host: h.host, wss_port: h.wss_port })),
      source: 'getConf',
    };
  }
  throw new Error('取弹幕服务器失败：' + JSON.stringify(j2).slice(0, 120));
}

/** 组一个上行包。 */
function makePacket(op, body = '', ver = 1) {
  const b = Buffer.from(String(body), 'utf8');
  const h = Buffer.alloc(16);
  h.writeUInt32BE(16 + b.length, 0);
  h.writeUInt16BE(16, 4);
  h.writeUInt16BE(ver, 6);
  h.writeUInt32BE(op, 8);
  h.writeUInt32BE(0, 12);
  return Buffer.concat([h, b]);
}

/**
 * 把一段可能被拼在一起的 JSON 文本切成单条（body 里偶尔是多条对象首尾相接）。
 * @param {string} s
 */
function splitJson(s) {
  const out = [];
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

/**
 * DANMU_MSG → 统一弹幕结构。info 是 B 站那套「位置固定」的数组，字段含义见注释。
 * @param {any} o 原始 cmd 对象
 */
function parseDanmaku(o) {
  const info = o.info || [];
  const head = info[0] || [];
  const user = info[2] || [];
  const medal = info[3] || [];
  return {
    type: 'danmaku',
    id: o.msg_id || o.msgId || '',
    user: user[1] || '',
    uid: Number(user[0] || 0),
    text: info[1] || '',
    color: Number(head[3] ?? 16777215),
    mode: Number(head[1] ?? 1),
    fontsize: Number(head[2] ?? 25),
    ts: Number(head[4] || 0),
    medalLevel: Number(medal[0] || 0),
    medalName: medal[1] || '',
    guardLevel: Number(info[7] || 0),
    raw: o,
  };
}

/**
 * 其他互动事件归一：礼物 / 醒目留言 / 进场关注 / 上舰。
 * @param {any} o
 */
function normalizeEvent(o) {
  const cmd = String(o.cmd || '').split(':')[0];
  const d = o.data || {};
  switch (cmd) {
    case 'SEND_GIFT':
      return {
        type: 'gift',
        user: d.uname || '',
        uid: Number(d.uid || 0),
        gift: d.giftName || '',
        num: Number(d.num || 0),
        price: Number(d.price || 0),
        coin: Number(d.coin_type === 'gold' ? d.total_coin || 0 : 0),
        raw: o,
      };
    case 'SUPER_CHAT':
      return {
        type: 'superchat',
        user: (d.user_info && d.user_info.uname) || '',
        text: d.message || '',
        price: Number(d.price || 0),
        raw: o,
      };
    case 'INTERACT_WORD':
    case 'INTERACT_WORD_V2': {
      const kind = Number(d.msg_type || 0);
      return {
        type: kind === 2 ? 'follow' : kind === 3 ? 'share' : 'enter',
        user: d.uname || '',
        uid: Number(d.uid || 0),
        raw: o,
      };
    }
    case 'GUARD_BUY':
      return {
        type: 'guard',
        user: d.username || '',
        uid: Number(d.uid || 0),
        level: Number(d.guard_level || 0),
        gift: d.gift_name || '',
        raw: o,
      };
    default:
      return { type: 'other', cmd, raw: o };
  }
}

/**
 * 创建 B 站直播弹幕桥。
 * @param {{log?: Console, WebSocketImpl?: any}} [opts]
 */
function createBilibiliLive(opts = {}) {
  const log = opts.log || console;
  const WS = opts.WebSocketImpl || require('ws');

  const danmakuListeners = new Set();
  const eventListeners = new Set();
  const errorListeners = new Set();
  const closeListeners = new Set();

  const state = {
    running: false,
    roomId: 0,
    input: '',
    connected: false,
    tokenSource: '',
    host: '',
    danmakuCount: 0,
    eventCount: 0,
    reconnectAttempt: 0,
    lastError: '',
  };

  let ws = null;
  let hbTimer = null;
  let retryTimer = null;
  let stopped = true;
  let current = null;

  function emit(set, payload) {
    for (const fn of set) {
      try {
        fn(payload);
      } catch (e) {
        log?.error?.('[bili-live] 分发回调失败：', e && e.message);
      }
    }
  }

  function clearTimers() {
    if (hbTimer) clearInterval(hbTimer);
    if (retryTimer) clearTimeout(retryTimer);
    hbTimer = null;
    retryTimer = null;
  }

  function closeSocket() {
    if (!ws) return;
    const s = ws;
    ws = null;
    try {
      s.removeAllListeners();
      s.close();
    } catch {
      /* ignore */
    }
  }

  /** 递归拆包：压缩包解压后仍可能是多个完整包。 */
  function walk(buf) {
    let off = 0;
    while (off + 16 <= buf.length) {
      const total = buf.readUInt32BE(off);
      if (total < 16 || off + total > buf.length) break;
      const hlen = buf.readUInt16BE(off + 4);
      const ver = buf.readUInt16BE(off + 6);
      const op = buf.readUInt32BE(off + 8);
      const body = buf.subarray(off + hlen, off + total);
      if (ver === 2) {
        walk(zlib.inflateSync(body));
      } else if (ver === 3) {
        walk(zlib.brotliDecompressSync(body));
      } else if (op === 5) {
        for (const piece of splitJson(body.toString('utf8'))) {
          let obj;
          try {
            obj = JSON.parse(piece);
          } catch {
            continue;
          }
          const cmd = String(obj.cmd || '').split(':')[0];
          const item = cmd === 'DANMU_MSG' ? parseDanmaku(obj) : normalizeEvent(obj);
          if (item.type === 'danmaku') {
            state.danmakuCount++;
            emit(danmakuListeners, item);
          } else if (item.type !== 'other') {
            state.eventCount++;
            emit(eventListeners, item);
          } else {
            emit(eventListeners, item);
          }
        }
      } else if (op === 3) {
        // 心跳回应，body 前 4 字节是直播间人气值，暂不透出
      } else if (op === 8) {
        log?.info?.('[bili-live] 鉴权回应：' + body.toString('utf8').slice(0, 80));
      }
      off += total;
    }
  }

  function connect() {
    const { host, token, roomId, buvid3, cookieHeader } = current;
    state.host = `${host.host}:${host.wss_port}`;
    const socket = new WS(`wss://${host.host}:${host.wss_port}/sub`, {
      headers: {
        ...DEFAULT_HEADERS,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      handshakeTimeout: 15_000,
    });
    ws = socket;

    socket.on('open', () => {
      state.connected = true;
      state.lastError = '';
      const auth = {
        uid: current.uid,
        roomid: roomId,
        protover: 3,
        buvid: buvid3,
        platform: 'web',
        type: 2,
        key: token,
      };
      socket.send(makePacket(7, JSON.stringify(auth)));
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = setInterval(() => {
        try {
          if (ws && ws.readyState === 1) ws.send(makePacket(2));
        } catch {
          /* ignore */
        }
      }, HEARTBEAT_MS);
      log?.info?.('[bili-live] 已连接 ' + state.host + ' room=' + roomId);
    });

    socket.on('message', (data) => {
      try {
        walk(Buffer.isBuffer(data) ? data : Buffer.from(data));
      } catch (e) {
        state.lastError = '解包失败：' + (e && e.message);
        log?.warn?.('[bili-live] ' + state.lastError);
      }
    });

    socket.on('error', (e) => {
      state.lastError = String((e && e.message) || e);
      emit(errorListeners, { message: state.lastError });
      log?.warn?.('[bili-live] socket 错误：' + state.lastError);
    });

    socket.on('close', () => {
      state.connected = false;
      if (hbTimer) {
        clearInterval(hbTimer);
        hbTimer = null;
      }
      emit(closeListeners, { roomId: state.roomId, willRetry: !stopped });
      if (stopped) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** state.reconnectAttempt, RECONNECT_MAX_MS);
      state.reconnectAttempt++;
      log?.info?.(`[bili-live] 连接断开，${delay}ms 后重连（第 ${state.reconnectAttempt} 次）`);
      retryTimer = setTimeout(() => {
        if (!stopped) connect();
      }, delay);
    });
  }

  /**
   * 开始监听某个直播间。
   * @param {{room: string|number, cookie?: string}} input
   */
  async function start(input) {
    stop();
    stopped = false;
    state.input = String(input?.room ?? '');
    state.lastError = '';

    const cookieHeader = String(input?.cookie || '').trim();
    const headers = { ...DEFAULT_HEADERS, ...(cookieHeader ? { Cookie: cookieHeader } : {}) };

    const { buvid3, buvid4 } = await fetchBuvid(headers);
    const room = await resolveRoom(input?.room, headers);
    state.roomId = room.roomId;

    const endpoint = await fetchDanmuEndpoint(room.roomId, headers, log);
    state.tokenSource = endpoint.source;
    if (!endpoint.hosts.length) throw new Error('弹幕服务器列表为空');

    const uidMatch = cookieHeader.match(/DedeUserID=(\d+)/);
    const uid = uidMatch ? Number(uidMatch[1]) : 0;

    const extraCookies = [
      buvid3 ? `buvid3=${buvid3}` : '',
      buvid4 ? `buvid4=${buvid4}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const mergedCookie = [cookieHeader, extraCookies].filter(Boolean).join('; ');

    current = {
      host: endpoint.hosts[0],
      token: endpoint.token,
      roomId: room.roomId,
      buvid3: buvid3 || '',
      cookieHeader: mergedCookie,
      uid,
    };
    state.reconnectAttempt = 0;
    state.running = true;
    connect();
    return status();
  }

  function stop() {
    stopped = true;
    clearTimers();
    closeSocket();
    state.running = false;
    state.connected = false;
    current = null;
    return status();
  }

  function status() {
    return { ...state };
  }

  return {
    start,
    stop,
    status,
    /** 订阅弹幕（结构化）：{user,text,color,medalName,...} */
    onDanmaku(fn) {
      danmakuListeners.add(fn);
      return () => danmakuListeners.delete(fn);
    },
    /** 订阅互动事件：礼物 / 醒目留言 / 进场关注 / 上舰 */
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    onError(fn) {
      errorListeners.add(fn);
      return () => errorListeners.delete(fn);
    },
    onClose(fn) {
      closeListeners.add(fn);
      return () => closeListeners.delete(fn);
    },
  };
}

/**
 * 与 douyin-cdp / xhs-cdp 对齐的装配入口。
 * @param {Record<string, any>} [opts]
 */
function startBilibiliLiveBridge(opts) {
  return createBilibiliLive(opts || {});
}

module.exports = {
  startBilibiliLiveBridge,
  createBilibiliLive,
  parseDanmaku,
  normalizeEvent,
  signWbi,
  makePacket,
  splitJson,
};
