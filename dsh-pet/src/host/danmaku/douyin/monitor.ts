/**
 * 抖音弹幕监听器：进房 → 签名桥 → WSS → 打日志；可选把弹幕/礼物交给活跃宠物 /chat。
 *
 * @module dsh-pet/src/host/danmaku/douyin/monitor
 */
import { inflate } from 'pako';
import WebSocket from 'ws';

import type { LoggerLike } from '../../log-file.ts';
import { DY_UA, fetchDyLiveInfo, normalizeDyCookieHeader, type DyLiveInfo } from './live-info.ts';
import { ChatMessage, DyResponse, GiftMessage, PushFrame, encodeAck, encodeHeartbeat } from './proto.ts';
import { readInProcessSignBaseUrl, requestDySignature } from './sign-client.ts';

/** 启动参数。 */
export type DouyinMonitorStartInput = {
  /** 直播间 URL 或数字房间号。 */
  url: string;
  /** 可选登录 Cookie。 */
  cookie?: string;
  /** 是否把弹幕交给宠物 /chat。 */
  replyChat?: boolean;
  /** 是否把礼物感谢交给宠物 /chat。 */
  thankGift?: boolean;
};

/** 运行中可热更新的开关。 */
export type DouyinMonitorOptions = {
  replyChat: boolean;
  thankGift: boolean;
};

/** 控制页轮询展示的一条消息。 */
export type DouyinFeedItem = {
  id: number;
  at: number;
  kind: 'chat' | 'gift';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0。 */
  count: number;
};

/** 对外状态快照。 */
export type DouyinMonitorStatus = {
  listening: boolean;
  url: string;
  roomId: string;
  title: string;
  anchor: string;
  chatCount: number;
  giftCount: number;
  lastError: string;
  startedAt: number | null;
  replyChat: boolean;
  thankGift: boolean;
  /** 最近消息（新→旧或旧→新：按 at 升序，页面底部最新）。 */
  recent: DouyinFeedItem[];
};

/** 对话入口（与路由层 chatWithPet 同形，只要 text）。 */
export type DouyinChatFn = (petId: string, text: string) => Promise<{ ok: boolean; message?: string }>;

/** createDouyinMonitor 依赖。 */
export type DouyinMonitorDeps = {
  log: LoggerLike;
  /** 解析签名桥基址；缺省时再读同进程 globalThis。 */
  getSignBaseUrl: () => string | undefined;
  /** 活跃宠物；空串时回落 main。 */
  resolvePetId: () => string;
  /** 把一条用户文本交给宠物对话。 */
  chatWithPet: DouyinChatFn;
};

function parseCookieMap(cookieStr: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of String(cookieStr || '').split(/[;\n\r]+/)) {
    const p = part.trim();
    if (!p) continue;
    const i = p.indexOf('=');
    if (i <= 0) continue;
    map.set(p.slice(0, i).trim(), p.slice(i + 1).trim());
  }
  return map;
}

function cookieMapToHeader(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function numish(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (v && typeof v === 'object' && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function buildWsUrl(roomId: string, userUniqueId: string, signature: string): string {
  const sdkVer = '1.0.15.0';
  const now = Date.now();
  const uaEnc = encodeURIComponent(
    '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  );
  return (
    `wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/` +
    `?app_name=douyin_web&version_code=180800&webcast_sdk_version=${sdkVer}` +
    `&update_version_code=${sdkVer}&compress=gzip&device_platform=web` +
    `&cookie_enabled=true&screen_width=1920&screen_height=1080` +
    `&browser_language=zh-CN&browser_platform=Win32&browser_name=Mozilla` +
    `&browser_version=${uaEnc}&browser_online=true&tz_name=Asia/Shanghai` +
    `&cursor=d-1_u-1_fh-0_t-${now}_r-1` +
    `&internal_ext=${encodeURIComponent(
      `internal_src:dim|wss_push_room_id:${roomId}|wss_push_did:${userUniqueId}|first_req_ms:${now}|fetch_time:${now}|seq:1|wss_info:0-${now}-0-0|wrds_v:0`,
    )}` +
    `&host=https://live.douyin.com&aid=6383&live_id=1&did_rule=3` +
    `&endpoint=live_pc&support_wrds=1&user_unique_id=${userUniqueId}` +
    `&im_path=/webcast/im/fetch/&identity=audience&need_persist_msg_count=0` +
    `&insert_task_id=&live_reason=&room_id=${roomId}&heartbeatDuration=0` +
    `&signature=${signature}`
  );
}

/**
 * 创建抖音弹幕监听器（进程内单例语义由调用方保证）。
 */
export function createDouyinMonitor(deps: DouyinMonitorDeps) {
  const { log, getSignBaseUrl, resolvePetId, chatWithPet } = deps;

  let listening = false;
  let connecting = false;
  let ws: WebSocket | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wantListen = false;
  let chatCount = 0;
  let giftCount = 0;
  let feedSeq = 0;
  let lastError = '';
  let startedAt: number | null = null;
  let currentUrl = '';
  let currentCookie = '';
  let replyChat = false;
  let thankGift = false;
  let info: DyLiveInfo | null = null;
  const recentKeys = new Map<string, number>();
  /** 礼物连击：key → 已处理的最高件数（用于放行升高、拦重放） */
  const giftCounts = new Map<string, number>();
  /** 控制页展示：最多保留 50 条（旧→新）。 */
  const recentFeed: DouyinFeedItem[] = [];
  const FEED_MAX = 50;
  /** 待发给宠物的对话；不含正在执行的那一条。超出则丢最旧。 */
  const pendingChats: Array<{ prompt: string; kind: 'chat' | 'gift' }> = [];
  const CHAT_QUEUE_MAX = 3;
  let chatPumpRunning = false;

  function pushFeed(kind: 'chat' | 'gift', nick: string, text: string, count = 0): void {
    feedSeq += 1;
    recentFeed.push({
      id: feedSeq,
      at: Date.now(),
      kind,
      nick,
      text,
      count: kind === 'gift' ? Math.max(1, count) : 0,
    });
    while (recentFeed.length > FEED_MAX) recentFeed.shift();
  }

  function clearHb(): void {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null;
  }

  function clearReconnect(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function teardownSocket(): void {
    clearHb();
    const cur = ws;
    ws = null;
    if (!cur) return;
    try {
      cur.removeAllListeners();
      cur.close();
    } catch {
      /* ignore */
    }
  }

  function noteError(err: unknown): void {
    lastError = err instanceof Error ? err.message : String(err);
    log.warn?.(`[dsh-pet][douyin] ${lastError}`);
  }

  function pruneDedup(now = Date.now()): void {
    for (const [k, at] of recentKeys) {
      if (now - at > 45 * 60_000) recentKeys.delete(k);
    }
    while (recentKeys.size > 2000) {
      const first = recentKeys.keys().next().value;
      if (first == null) break;
      recentKeys.delete(first);
    }
  }

  function isDup(key: string): boolean {
    if (!key) return false;
    const now = Date.now();
    const prev = recentKeys.get(key);
    if (prev && now - prev < 45 * 60_000) return true;
    recentKeys.set(key, now);
    pruneDedup(now);
    return false;
  }

  function enqueueChat(prompt: string, kind: 'chat' | 'gift'): void {
    pendingChats.push({ prompt, kind });
    while (pendingChats.length > CHAT_QUEUE_MAX) {
      const dropped = pendingChats.shift();
      if (dropped) {
        log.info?.(
          `[dsh-pet][douyin] chat queue full, drop oldest kind=${dropped.kind} pending=${pendingChats.length}`,
        );
      }
    }
    void pumpChatQueue();
  }

  async function pumpChatQueue(): Promise<void> {
    if (chatPumpRunning) return;
    chatPumpRunning = true;
    try {
      while (pendingChats.length > 0) {
        const job = pendingChats.shift();
        if (!job) break;
        const petId = (resolvePetId() || 'main').trim() || 'main';
        try {
          log.info?.(
            `[dsh-pet][douyin] → chat pet=${petId} kind=${job.kind} pending=${pendingChats.length}`,
          );
          const r = await chatWithPet(petId, job.prompt);
          if (!r.ok) {
            log.warn?.(`[dsh-pet][douyin] chat failed kind=${job.kind}: ${r.message || 'unknown'}`);
          }
        } catch (e) {
          log.warn?.(
            `[dsh-pet][douyin] chat exception kind=${job.kind}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    } finally {
      chatPumpRunning = false;
      if (pendingChats.length > 0) void pumpChatQueue();
    }
  }

  function scheduleReconnect(reason: string): void {
    if (!wantListen || reconnectTimer) return;
    noteError(reason);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!wantListen) return;
      void connect().catch((e) => {
        noteError(e);
        scheduleReconnect('reconnect failed');
      });
    }, 2000);
    reconnectTimer.unref?.();
  }

  async function connect(): Promise<void> {
    if (connecting) return;
    connecting = true;
    try {
      teardownSocket();
      const signBase = getSignBaseUrl() || readInProcessSignBaseUrl();
      if (!signBase) {
        throw new Error('签名桥未就绪：需要桌面 Helper 在跑（应用模式或桌面宠物已启动）');
      }

      info = await fetchDyLiveInfo(currentUrl, currentCookie);
      const signature = await requestDySignature(signBase, info.roomId, info.uniqueId);
      const wsUrl = buildWsUrl(info.roomId, info.uniqueId, signature);

      const cookieMap = parseCookieMap(info.cookie);
      cookieMap.set('ttwid', info.ttwid);
      if (!cookieMap.has('__live_version__')) cookieMap.set('__live_version__', '%221.1.4.7838%22');
      if (!cookieMap.has('live_use_vvc')) cookieMap.set('live_use_vvc', '%22false%22');
      for (const [k, v] of parseCookieMap(normalizeDyCookieHeader(currentCookie))) {
        cookieMap.set(k, v);
      }
      if (!cookieMap.get('ttwid')) cookieMap.set('ttwid', info.ttwid);

      log.info?.(
        `[dsh-pet][douyin] connect room=${info.roomId} title=${info.title || '-'} anchor=${info.anchor || '-'} replyChat=${replyChat} thankGift=${thankGift}`,
      );

      const socket = new WebSocket(wsUrl, {
        headers: {
          cookie: cookieMapToHeader(cookieMap),
          'user-agent': DY_UA,
          origin: 'https://live.douyin.com',
          referer: 'https://live.douyin.com/',
        },
        perMessageDeflate: false,
      });
      ws = socket;

      await new Promise<void>((resolve, reject) => {
        const onOpen = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          socket.off('open', onOpen);
          socket.off('error', onError);
        };
        socket.once('open', onOpen);
        socket.once('error', onError);
      });

      listening = true;
      lastError = '';
      if (!startedAt) startedAt = Date.now();

      hbTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(encodeHeartbeat());
        } catch {
          scheduleReconnect('heartbeat send failed');
        }
      }, 10_000);
      hbTimer.unref?.();

      socket.on('message', (data) => {
        void onBinary(data).catch((e) => noteError(e));
      });
      socket.on('close', () => {
        ws = null;
        clearHb();
        listening = false;
        if (wantListen) scheduleReconnect('closed');
      });
      socket.on('error', (err) => {
        noteError(err);
      });
    } finally {
      connecting = false;
    }
  }

  function handleChatPayload(m: { method?: string; payload?: Uint8Array; msgId?: unknown }): void {
    if (!m.payload) return;
    const chat = ChatMessage.decode(m.payload) as {
      content?: string;
      user?: { nickName?: string; id?: unknown };
    };
    const content = String(chat.content || '').trim();
    if (!content) return;
    const nick = String(chat.user?.nickName || '匿名').trim() || '匿名';
    const key = `chat:${String(m.msgId ?? '')}|${nick}|${content}`;
    if (isDup(key)) return;
    chatCount += 1;
    pushFeed('chat', nick, content);
    log.info?.(`[dsh-pet][douyin] chat nick=${nick} text=${content}`);
    if (replyChat) {
      enqueueChat(
        `[直播弹幕] 观众「${nick}」说：${content}\n请用你的人设简短回复这条弹幕（一两句即可）。`,
        'chat',
      );
    }
  }

  function handleGiftPayload(m: { method?: string; payload?: Uint8Array; msgId?: unknown }): void {
    if (!m.payload) return;
    const giftMsg = GiftMessage.decode(m.payload) as {
      giftId?: unknown;
      repeatCount?: unknown;
      comboCount?: unknown;
      repeatEnd?: unknown;
      groupId?: unknown;
      user?: { nickName?: string; id?: unknown };
      gift?: {
        name?: string;
        describe?: string;
        combo?: boolean;
        type?: number;
        id?: unknown;
      };
    };
    const nick = String(giftMsg.user?.nickName || '匿名').trim() || '匿名';
    const giftObj = giftMsg.gift || {};
    let giftName = String(giftObj.name || '').trim();
    if (!giftName && giftObj.describe) {
      giftName = String(giftObj.describe).replace(/^送出?/, '').trim();
    }
    const giftId = String(giftMsg.giftId ?? giftObj.id ?? '').trim();
    if (!giftName) giftName = giftId ? `礼物#${giftId}` : '礼物';
    const count = Math.max(1, numish(giftMsg.comboCount, 0) || numish(giftMsg.repeatCount, 0) || 1);
    const repeatEnd = numish(giftMsg.repeatEnd, 0);
    const giftType = numish(giftObj.type, 0);
    const combo = !!giftObj.combo || giftType === 1;
    const groupId = String(giftMsg.groupId ?? '').trim();
    const key = `gift:${groupId || String(m.msgId ?? '') || `${nick}|${giftName}`}`;
    const prev = giftCounts.get(key) || 0;
    if (count > prev) giftCounts.set(key, count);
    while (giftCounts.size > 2000) {
      const first = giftCounts.keys().next().value;
      if (first == null) break;
      giftCounts.delete(first);
    }

    // 可连击：中间帧只更新件数，定稿（repeatEnd=1）再感谢/计数
    if (combo && repeatEnd !== 1) {
      log.debug?.(`[dsh-pet][douyin] gift combo pending nick=${nick} gift=${giftName} x${count}`);
      return;
    }
    const finalCount = Math.max(count, giftCounts.get(key) || count);
    const settleKey = `gift-settle:${key}`;
    if (isDup(settleKey)) return;

    giftCount += 1;
    pushFeed('gift', nick, giftName, finalCount);
    log.info?.(`[dsh-pet][douyin] gift nick=${nick} gift=${giftName} x${finalCount}`);
    if (thankGift) {
      enqueueChat(
        `[直播礼物] 观众「${nick}」送出了「${giftName}」×${finalCount}。\n请用你的人设简短感谢对方（一两句即可）。`,
        'gift',
      );
    }
  }

  async function onBinary(data: WebSocket.RawData): Promise<void> {
    const buf =
      data instanceof Buffer
        ? new Uint8Array(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : Array.isArray(data)
            ? Buffer.concat(data)
            : new Uint8Array(data as Uint8Array);
    const frame = PushFrame.decode(buf) as {
      payload?: Uint8Array;
      logId?: unknown;
      payloadType?: string;
    };
    let payload = frame.payload && frame.payload.length ? frame.payload : buf;
    if (frame.payload && frame.payload.length) {
      try {
        payload = inflate(frame.payload);
      } catch {
        payload = frame.payload;
      }
    }
    const resp = DyResponse.decode(payload) as {
      needAck?: boolean;
      internalExt?: string;
      messagesList?: Array<{ method?: string; payload?: Uint8Array; msgId?: unknown }>;
    };
    if (resp.needAck && ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(encodeAck(frame.logId, resp.internalExt || ''));
      } catch {
        scheduleReconnect('ack send failed');
        return;
      }
    }
    for (const m of resp.messagesList || []) {
      try {
        if (m.method === 'WebcastChatMessage') handleChatPayload(m);
        else if (m.method === 'WebcastGiftMessage') handleGiftPayload(m);
      } catch (e) {
        log.debug?.(
          `[dsh-pet][douyin] decode failed method=${m.method}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  function applyOptions(input: Partial<DouyinMonitorOptions>): DouyinMonitorOptions {
    if (typeof input.replyChat === 'boolean') replyChat = input.replyChat;
    if (typeof input.thankGift === 'boolean') thankGift = input.thankGift;
    return { replyChat, thankGift };
  }

  async function start(input: DouyinMonitorStartInput): Promise<DouyinMonitorStatus> {
    const url = String(input.url || '').trim();
    if (!url) throw new Error('缺少直播间 url');
    wantListen = true;
    currentUrl = url;
    currentCookie = String(input.cookie || '');
    applyOptions({
      replyChat: input.replyChat === true,
      thankGift: input.thankGift === true,
    });
    clearReconnect();
    chatCount = 0;
    giftCount = 0;
    feedSeq = 0;
    recentFeed.length = 0;
    startedAt = null;
    lastError = '';
    await connect();
    return status();
  }

  function stop(): DouyinMonitorStatus {
    wantListen = false;
    clearReconnect();
    teardownSocket();
    listening = false;
    if (pendingChats.length) {
      log.info?.(`[dsh-pet][douyin] stop: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    return status();
  }

  function setOptions(input: Partial<DouyinMonitorOptions>): DouyinMonitorStatus {
    applyOptions(input);
    log.info?.(`[dsh-pet][douyin] options replyChat=${replyChat} thankGift=${thankGift}`);
    return status();
  }

  function status(): DouyinMonitorStatus {
    return {
      listening: listening && wantListen,
      url: currentUrl,
      roomId: info?.roomId || '',
      title: info?.title || '',
      anchor: info?.anchor || '',
      chatCount,
      giftCount,
      lastError,
      startedAt,
      replyChat,
      thankGift,
      recent: recentFeed.slice(),
    };
  }

  return { start, stop, status, setOptions };
}

/** 抖音弹幕监听器实例。 */
export type DouyinMonitor = ReturnType<typeof createDouyinMonitor>;
