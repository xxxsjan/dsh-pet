/**
 * B 站直连弹幕监听器：换票（WBI 签名 + getInfoByRoom + getDanmuInfo）→ WSS 直连 →
 * 认证包 + 30s 心跳 → 二进制帧解码分发。
 *
 * 不走 CDP 旁听；入库弹幕 + 礼物 + 在线人数，进场 / 关注 / 点赞 / 醒目留言留样本。
 * 进房握手（登录 Cookie / WBI / 风控）只能桌面真机连直播间验证。
 * @module dsh-pet/src/host/danmaku/bilibili/monitor
 */
import WebSocket from 'ws';

import type { LoggerLike } from '../../log-file.ts';
import { resolveBiliWsInfo, type BiliWsInfo } from './bili-live-info.ts';
import {
  encodeBiliAuthPacket,
  encodeBiliHeartbeatPacket,
  parseBiliWsFrame,
  type BiliParsedItem,
} from './bili-danmaku.ts';

/** 启动参数。 */
export type BiliMonitorStartInput = {
  /** 直播间 URL / 主播短链 / 裸房间号。 */
  url: string;
  /** 登录 Cookie（可选；不填走访客匿名）。 */
  cookie?: string;
  /** 是否把弹幕交给宠物 /chat。 */
  replyChat?: boolean;
  /** 是否把礼物感谢交给宠物 /chat。 */
  thankGift?: boolean;
};

/** 运行中可热更新的开关。 */
export type BiliMonitorOptions = {
  replyChat: boolean;
  thankGift: boolean;
};

/** 控制页轮询展示的一条消息。 */
export type BiliFeedItem = {
  id: number;
  at: number;
  kind: 'chat' | 'gift';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0。 */
  count: number;
};

/** 对外状态快照。 */
export type BiliMonitorStatus = {
  listening: boolean;
  url: string;
  roomId: string;
  title: string;
  anchor: string;
  chatCount: number;
  giftCount: number;
  /** 在线观众人数（ONLINE_RANK_COUNT 高能用户数）；-1 = 本场还没收到统计帧。 */
  viewerCount: number;
  lastError: string;
  startedAt: number | null;
  replyChat: boolean;
  thankGift: boolean;
  /** 当前链路：ws = 直连；idle = 未启动。 */
  mode: 'ws' | 'idle';
  /** 本次监听是否因「主播已下播」而自动结束（true 时 listening 恒为 false，需用户手动重连）。 */
  ended: boolean;
  recent: BiliFeedItem[];
};

/** 对话入口（与路由层 chatWithPet 同形；kind 用于宿主侧区分弹幕/礼物语音的取消）。 */
export type BiliChatFn = (
  petId: string,
  text: string,
  kind: 'chat' | 'gift',
) => Promise<{ ok: boolean; message?: string }>;

/** createBiliMonitor 依赖。 */
export type BiliMonitorDeps = {
  log: LoggerLike;
  /** 活跃宠物；空串时回落 main。 */
  resolvePetId: () => string;
  /** 把一条用户文本交给宠物对话。 */
  chatWithPet: BiliChatFn;
  /** 开关关闭时掐断该类正在生成/朗读的回复（宿主侧取消 utterance 并通知渲染端停播）；缺省不掐。 */
  cancelVoice?: (kind: 'chat' | 'gift') => void;
  /** 进房换票；缺省用真实 resolveBiliWsInfo，测试可注入避免打真实网络。 */
  fetchWsInfo?: (url: string, cookie: string) => Promise<BiliWsInfo>;
  /** 自动结束（下播）时回调一次，宿主可据此回写 state / 推通知。 */
  onEnded?: (status: BiliMonitorStatus) => void;
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const FEED_MAX = 50;
const CHAT_QUEUE_MAX = 3;
/** 断线重连退避：2s → 5s → 15s → 30s；用完仍起不来就判定下播，不再无限重连。 */
const RECONNECT_DELAYS = [2000, 5000, 15000, 30_000];
/** 静默探活：多久没有业务帧才去查房间是否还在播。 */
const IDLE_PROBE_SILENT_MS = 180_000;
/** 静默探活的检查间隔。 */
const IDLE_PROBE_TICK_MS = 90_000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 创建 B 站直连弹幕监听器（进程内单例语义由调用方保证）。
 */
export function createBiliMonitor(deps: BiliMonitorDeps) {
  const { log, resolvePetId, chatWithPet, cancelVoice, onEnded } = deps;
  const fetchWsInfo = deps.fetchWsInfo ?? resolveBiliWsInfo;

  let listening = false;
  let wantListen = false;
  let connecting = false;
  let chatCount = 0;
  let giftCount = 0;
  /** 在线观众人数；-1 表示本场还没收到统计帧。 */
  let viewerCount = -1;
  let feedSeq = 0;
  let lastError = '';
  let startedAt: number | null = null;
  let currentUrl = '';
  let currentCookie = '';
  let replyChat = false;
  let thankGift = false;
  let mode: 'ws' | 'idle' = 'idle';
  let info: BiliWsInfo | null = null;
  let ws: WebSocket | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** WS 消息去重集合。 */
  const seenIds = new Set<string>();
  /** 控制页展示：最多保留 50 条（旧→新）。 */
  const recentFeed: BiliFeedItem[] = [];
  /** 待发给宠物的对话；超出则丢最旧。 */
  const pendingChats: Array<{ prompt: string; kind: 'chat' | 'gift' }> = [];
  let chatPumpRunning = false;
  /** 正在交给宠物处理的那一条的类型；开关关闭时据此决定要不要掐断在播语音。 */
  let currentJobKind: 'chat' | 'gift' | null = null;
  /** 本次监听是否已判定「主播下播」并自动停听；start 时清零。 */
  let ended = false;
  /** 最近一帧业务帧的时间；用于长时间静默后的探活。 */
  let lastFrameAt = 0;
  /** 当前连续重连次数；连上或探活确认在播即清零。 */
  let reconnectAttempts = 0;
  /** 静默探活定时器（每个监听周期最多一个）。 */
  let idleProbeTimer: ReturnType<typeof setInterval> | null = null;

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

  function noteError(err: unknown): void {
    lastError = err instanceof Error ? err.message : String(err);
    log.warn?.(`[blue-fish][bilibili] ${lastError}`);
  }

  function enqueueChat(prompt: string, kind: 'chat' | 'gift'): void {
    pendingChats.push({ prompt, kind });
    while (pendingChats.length > CHAT_QUEUE_MAX) {
      const dropped = pendingChats.shift();
      if (dropped) {
        log.info?.(
          `[blue-fish][bilibili] chat queue full, drop oldest kind=${dropped.kind} pending=${pendingChats.length}`,
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
        // 消费时复查开关：入队后开关被关掉的任务直接跳过，不再发给宠物。
        if (job.kind === 'chat' ? !replyChat : !thankGift) {
          log.info?.(`[blue-fish][bilibili] skip queued kind=${job.kind}: switch off`);
          continue;
        }
        const petId = (resolvePetId() || 'main').trim() || 'main';
        currentJobKind = job.kind;
        try {
          log.info?.(
            `[blue-fish][bilibili] → chat pet=${petId} kind=${job.kind} pending=${pendingChats.length}`,
          );
          const r = await chatWithPet(petId, job.prompt, job.kind);
          if (!r.ok) {
            log.warn?.(`[blue-fish][bilibili] chat failed kind=${job.kind}: ${r.message || 'unknown'}`);
          }
        } catch (e) {
          log.warn?.(
            `[blue-fish][bilibili] chat exception kind=${job.kind}: ${e instanceof Error ? e.message : String(e)}`,
          );
        } finally {
          currentJobKind = null;
        }
      }
    } finally {
      chatPumpRunning = false;
      if (pendingChats.length > 0) void pumpChatQueue();
    }
  }

  function handleItem(item: BiliParsedItem): void {
    if (item.kind === 'online') {
      viewerCount = Math.max(0, item.count);
      log.debug?.(`[blue-fish][bilibili] online viewers=${viewerCount}`);
      return;
    }
    if (item.kind === 'chat') {
      chatCount += 1;
      pushFeed('chat', item.nick, item.text);
      log.info?.(`[blue-fish][bilibili] chat nick=${item.nick} text=${item.text}`);
      if (replyChat) {
        enqueueChat(
          `[直播弹幕] 观众「${item.nick}」说：${item.text}\n请用你的人设简短回复这条弹幕（一两句即可）。`,
          'chat',
        );
      }
      return;
    }
    giftCount += 1;
    pushFeed('gift', item.nick, item.giftName, item.count);
    log.info?.(`[blue-fish][bilibili] gift nick=${item.nick} gift=${item.giftName} x${item.count}`);
    if (thankGift) {
      enqueueChat(
        `[直播礼物] 观众「${item.nick}」送出了「${item.giftName}」×${item.count}。\n请用你的人设简短感谢对方（一两句即可）。`,
        'gift',
      );
    }
  }

  function onMessage(data: WebSocket.RawData): void {
    lastFrameAt = Date.now();
    const buf =
      data instanceof Buffer
        ? new Uint8Array(data)
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : Array.isArray(data)
            ? Buffer.concat(data)
            : new Uint8Array(data as Uint8Array);
    let items: BiliParsedItem[];
    try {
      items = parseBiliWsFrame(buf, seenIds);
    } catch (e) {
      log.debug?.(`[blue-fish][bilibili] decode failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    for (const item of items) handleItem(item);
  }

  function clearHb(): void {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null;
  }

  function clearReconnect(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearIdleProbe(): void {
    if (idleProbeTimer) clearInterval(idleProbeTimer);
    idleProbeTimer = null;
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

  /**
   * 主播下播：停听 + 标记 ended，不再重连。
   * 触发点：重连/静默探活拿到「主播未开播」、退避重连次数耗尽。
   */
  function markEnded(reason: string): void {
    // 同一次收听里重复探活：状态照旧刷新，但不重复回调宿主。
    const already = ended && !wantListen;
    wantListen = false;
    ended = true;
    listening = false;
    mode = 'idle';
    clearReconnect();
    clearIdleProbe();
    teardownSocket();
    reconnectAttempts = 0;
    if (pendingChats.length) {
      log.info?.(`[blue-fish][bilibili] ended: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    lastError = reason;
    if (already) return;
    log.info?.(`[blue-fish][bilibili] ended: ${reason}`);
    try {
      onEnded?.(status());
    } catch (e) {
      log.warn?.(`[blue-fish][bilibili] onEnded failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 探活：能进房 = 在播；抛「主播未开播」= 已下播（直接 markEnded）；其它错误（风控 / 网络）当未知，继续重连。
   * 返回 false 表示调用方不要再连。
   */
  async function probeRoomLiving(): Promise<boolean> {
    if (!wantListen || ended) return false;
    try {
      await fetchWsInfo(currentUrl, currentCookie);
      reconnectAttempts = 0;
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/未开播|直播已结束|已结束|下播/.test(msg)) {
        markEnded('主播已下播（直播结束）');
        return false;
      }
      log.debug?.(`[blue-fish][bilibili] liveness unknown: ${msg}`);
      return true;
    }
  }

  /**
   * 静默探活：长时间没有业务帧就主动查一次房间是否还在播，
   * 避免下播后 WS 没断、监听一直空转。
   */
  function startIdleProbe(): void {
    clearIdleProbe();
    if (typeof setInterval !== 'function') return;
    idleProbeTimer = setInterval(() => {
      if (!wantListen || ended || connecting) return;
      if (Date.now() - lastFrameAt < IDLE_PROBE_SILENT_MS) return;
      void (async () => {
        // 探到还在播：重置静默窗口，避免每隔 90s 就请求一次房间接口。
        if (await probeRoomLiving()) lastFrameAt = Date.now();
      })().catch((e) => noteError(e));
    }, IDLE_PROBE_TICK_MS);
    idleProbeTimer.unref?.();
  }

  function scheduleReconnect(reason: string): void {
    if (!wantListen || reconnectTimer || ended) return;
    noteError(reason);
    if (reconnectAttempts >= RECONNECT_DELAYS.length) {
      markEnded('重连多次失败，已停止监听');
      return;
    }
    const delay = RECONNECT_DELAYS[Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1)] ?? 2000;
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!wantListen) return;
      void (async () => {
        // 重连前先确认房间还在播：下播后无限重连没有任何意义。
        if (!(await probeRoomLiving())) return;
        await connect();
      })().catch((e) => {
        noteError(e);
        scheduleReconnect('reconnect failed');
      });
    }, delay);
    reconnectTimer.unref?.();
  }

  async function connect(): Promise<void> {
    if (connecting) return;
    connecting = true;
    try {
      teardownSocket();
      info = await fetchWsInfo(currentUrl, currentCookie);

      log.info?.(
        `[blue-fish][bilibili] connect room=${info.roomId} title=${info.title || '-'} replyChat=${replyChat} thankGift=${thankGift}`,
      );

      const socket = new WebSocket(info.websocketUrl, {
        headers: {
          cookie: info.cookie || currentCookie,
          'user-agent': UA,
          origin: 'https://live.bilibili.com',
          referer: 'https://live.bilibili.com/',
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

      // 认证包：roomId + token + uid（访客 uid=0）。
      socket.send(
        encodeBiliAuthPacket({ roomId: info.roomId, token: info.token, uid: info.uid }),
      );

      listening = true;
      mode = 'ws';
      lastError = '';
      if (!startedAt) startedAt = Date.now();

      hbTimer = setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        try {
          ws.send(encodeBiliHeartbeatPacket());
        } catch {
          scheduleReconnect('heartbeat send failed');
        }
      }, HEARTBEAT_INTERVAL_MS);
      hbTimer.unref?.();

      socket.on('message', (data) => onMessage(data));
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

  /** 开关 true→false：清掉该类排队任务；正在处理的那条同类时通知宿主掐断语音。 */
  function dropPendingKind(kind: 'chat' | 'gift'): void {
    const before = pendingChats.length;
    for (let i = pendingChats.length - 1; i >= 0; i -= 1) {
      if (pendingChats[i]?.kind === kind) pendingChats.splice(i, 1);
    }
    if (before !== pendingChats.length) {
      log.info?.(
        `[blue-fish][bilibili] switch off kind=${kind}: drop queued=${before - pendingChats.length}`,
      );
    }
    if (currentJobKind === kind) {
      log.info?.(`[blue-fish][bilibili] switch off kind=${kind}: cancel in-flight voice`);
      cancelVoice?.(kind);
    }
  }

  function applyOptions(input: Partial<BiliMonitorOptions>): BiliMonitorOptions {
    const prevReplyChat = replyChat;
    const prevThankGift = thankGift;
    if (typeof input.replyChat === 'boolean') replyChat = input.replyChat;
    if (typeof input.thankGift === 'boolean') thankGift = input.thankGift;
    if (prevReplyChat && !replyChat) dropPendingKind('chat');
    if (prevThankGift && !thankGift) dropPendingKind('gift');
    return { replyChat, thankGift };
  }

  async function startMonitor(input: BiliMonitorStartInput): Promise<BiliMonitorStatus> {
    wantListen = true;
    currentUrl = String(input.url || '').trim();
    currentCookie = String(input.cookie || '');
    applyOptions({ replyChat: input.replyChat === true, thankGift: input.thankGift === true });
    seenIds.clear();
    chatCount = 0;
    giftCount = 0;
    viewerCount = -1;
    feedSeq = 0;
    recentFeed.length = 0;
    startedAt = null;
    lastError = '';
    ended = false;
    reconnectAttempts = 0;
    lastFrameAt = Date.now();
    clearIdleProbe();

    await connect();
    startIdleProbe();
    return status();
  }

  function stop(): BiliMonitorStatus {
    wantListen = false;
    ended = false;
    reconnectAttempts = 0;
    clearReconnect();
    clearIdleProbe();
    teardownSocket();
    listening = false;
    mode = 'idle';
    info = null;
    if (pendingChats.length) {
      log.info?.(`[blue-fish][bilibili] stop: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    return status();
  }

  function setOptions(input: Partial<BiliMonitorOptions>): BiliMonitorStatus {
    applyOptions(input);
    log.info?.(`[blue-fish][bilibili] options replyChat=${replyChat} thankGift=${thankGift}`);
    return status();
  }

  function status(): BiliMonitorStatus {
    return {
      listening: listening && wantListen,
      url: currentUrl,
      roomId: info?.roomId || '',
      title: info?.title || '',
      anchor: info?.anchor || '',
      chatCount,
      giftCount,
      viewerCount,
      lastError,
      startedAt,
      replyChat,
      thankGift,
      mode,
      ended,
      recent: recentFeed.slice(),
    };
  }

  return { start: startMonitor, stop, status, setOptions };
}

/** B 站直连弹幕监听器实例。 */
export type BiliMonitor = ReturnType<typeof createBiliMonitor>;
