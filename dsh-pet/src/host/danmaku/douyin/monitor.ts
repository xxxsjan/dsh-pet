/**
 * 抖音弹幕监听器：进房 → 签名桥 → WSS → 打日志；可选把弹幕/礼物交给活跃宠物 /chat。
 *
 * @module dsh-pet/src/host/danmaku/douyin/monitor
 */
import { inflate } from 'pako';
import WebSocket from 'ws';

import type { LoggerLike } from '../../log-file.ts';
import { DY_UA, fetchDyLiveInfo, normalizeDyCookieHeader, type DyLiveInfo } from './live-info.ts';
import {
  ChatMessage,
  ControlMessage,
  DyResponse,
  LikeMessage,
  PushFrame,
  RoomUserSeqMessage,
  encodeAck,
  encodeHeartbeat,
} from './proto.ts';
import { numish, parseGiftMessage, parseLightGiftMessage } from './gift-parse.ts';
import { readInProcessSignBaseUrl, requestDySignature } from './sign-client.ts';
import type { DouyinCdpBridge } from './cdp-bridge.ts';

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
  /** 礼物条数：同一连击组只算一条，收到首帧即计，不等 repeat_end=1 定稿。 */
  giftCount: number;
  /** 本场累计点赞总数（WebcastLikeMessage.total）；0 = 本场还没收到点赞帧。 */
  likeCount: number;
  /** 在线观众人数（WebcastRoomUserSeqMessage.total）；-1 = 本场还没收到统计帧。 */
  viewerCount: number;
  lastError: string;
  startedAt: number | null;
  replyChat: boolean;
  thankGift: boolean;
  /** 当前链路：cdp = 内嵌窗旁听；direct = 旧直连 WSS（回退）；idle = 未启动。 */
  mode: 'cdp' | 'direct' | 'idle';
  /** CDP 内嵌窗当前是否可见（扫码登录时为 true）。 */
  cdpVisible: boolean;
  /** CDP 分区内是否已检测到登录态。 */
  cdpLoggedIn: boolean;
  /** 本次监听是否因「主播已下播」而自动结束（true 时 listening 恒为 false，需用户手动重连）。 */
  ended: boolean;
  /** 最近消息（新→旧或旧→新：按 at 升序，页面底部最新）。 */
  recent: DouyinFeedItem[];
};

/** 对话入口（与路由层 chatWithPet 同形；kind 用于宿主侧区分弹幕/礼物语音的取消）。 */
export type DouyinChatFn = (
  petId: string,
  text: string,
  kind: 'chat' | 'gift',
) => Promise<{ ok: boolean; message?: string }>;

/** createDouyinMonitor 依赖。 */
export type DouyinMonitorDeps = {
  log: LoggerLike;
  /** 解析签名桥基址；缺省时再读同进程 globalThis。 */
  getSignBaseUrl: () => string | undefined;
  /** 取进程内 CDP 旁听桥控制器；返回 undefined 时回退旧直连链路。 */
  getCdpBridge?: () => DouyinCdpBridge | undefined;
  /** 活跃宠物；空串时回落 main。 */
  resolvePetId: () => string;
  /** 把一条用户文本交给宠物对话。 */
  chatWithPet: DouyinChatFn;
  /** 开关关闭时掐断该类正在生成/朗读的回复（宿主侧取消 utterance 并通知渲染端停播）；缺省不掐。 */
  cancelVoice?: (kind: 'chat' | 'gift') => void;
  /** 进房取元数据（标题/主播）；CDP 旁听页读不到时兜底，缺省用真实 fetchDyLiveInfo。 */
  fetchLiveInfo?: (url: string, cookie: string) => Promise<DyLiveInfo>;
  /** 自动结束（下播）时回调一次，宿主可据此回写 state / 推通知。 */
  onEnded?: (status: DouyinMonitorStatus) => void;
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

/** 断线重连退避：2s → 5s → 15s → 30s；用完仍起不来就判定下播，不再无限重连。 */
const RECONNECT_DELAYS = [2000, 5000, 15000, 30_000];
/** 静默探活：多久没有业务帧才去查房间是否还在播（CDP 旁听收不到页面内 WS 的 close）。 */
const IDLE_PROBE_SILENT_MS = 180_000;
/** 静默探活的检查间隔。 */
const IDLE_PROBE_TICK_MS = 90_000;
/** 开始监听前的探活超时：超过就当作「状态未知」放行，不拖住启动流程。 */
const PREFLIGHT_TIMEOUT_MS = 8000;

/**
 * 创建抖音弹幕监听器（进程内单例语义由调用方保证）。
 */
export function createDouyinMonitor(deps: DouyinMonitorDeps) {
  const { log, getSignBaseUrl, getCdpBridge, resolvePetId, chatWithPet, cancelVoice, onEnded } = deps;
  const fetchLiveInfo = deps.fetchLiveInfo ?? fetchDyLiveInfo;

  let listening = false;
  let connecting = false;
  let ws: WebSocket | null = null;
  let hbTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wantListen = false;
  let chatCount = 0;
  let giftCount = 0;
  /**
   * 本场累计点赞总数：取 `WebcastLikeMessage.total`，只增不减。
   * 点赞帧高频（每秒多帧、每帧批量）且取 max 天然幂等，所以只维护这一个内存变量：
   * 不 pushFeed、不写状态叶子、不发任何通知，避免 /status 与事件总线被打爆。
   */
  let likeTotal = 0;
  /** 在线观众人数；-1 表示本场还没收到统计帧。 */
  let viewerCount = -1;
  let feedSeq = 0;
  let lastError = '';
  let startedAt: number | null = null;
  let currentUrl = '';
  let currentCookie = '';
  let replyChat = false;
  let thankGift = false;
  let info: DyLiveInfo | null = null;
  /** 当前链路模式。 */
  let mode: 'cdp' | 'direct' | 'idle' = 'idle';
  /** CDP 桥实例与订阅回退集合。 */
  let cdp: DouyinCdpBridge | null = null;
  let cdpUnsubs: Array<() => void> = [];
  let cdpVisible = false;
  let cdpLoggedIn = false;
  /** CDP 旁听不做签名进房，标题/主播由内嵌页 RENDER_DATA 补（直连路径仍用 info）。 */
  let cdpMeta = { title: '', anchor: '' };
  const recentKeys = new Map<string, number>();
  /**
   * 礼物连击：key → 已落地的 feed 条目。同组后续帧只抬高这里的件数（只增不减），
   * 不再等 `repeat_end=1` 定稿——定稿帧不保证会到，等它会把整场礼物等丢。
   */
  const giftSessions = new Map<string, { item: DouyinFeedItem; at: number }>();
  /** 每个 method 首次出现 / 首次解码失败各提醒一次：默认日志级别下也能看出礼物卡在哪一步。 */
  const seenMethods = new Set<string>();
  const decodeFailures = new Set<string>();
  /** 控制页展示：最多保留 50 条（旧→新）。 */
  const recentFeed: DouyinFeedItem[] = [];
  const FEED_MAX = 50;
  /** 待发给宠物的对话；不含正在执行的那一条。超出则丢最旧。 */
  const pendingChats: Array<{ prompt: string; kind: 'chat' | 'gift' }> = [];
  const CHAT_QUEUE_MAX = 3;
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

  /** 追加一条互动消息；返回落地的条目，礼物连击后续帧据此原地抬高件数。 */
  function pushFeed(kind: 'chat' | 'gift', nick: string, text: string, count = 0): DouyinFeedItem {
    feedSeq += 1;
    const item: DouyinFeedItem = {
      id: feedSeq,
      at: Date.now(),
      kind,
      nick,
      text,
      count: kind === 'gift' ? Math.max(1, count) : 0,
    };
    recentFeed.push(item);
    while (recentFeed.length > FEED_MAX) recentFeed.shift();
    return item;
  }

  /** 礼物组表按 10 分钟过期、最多 2000 组：连击结束后不再需要，防止长时间直播里无限增长。 */
  function pruneGiftSessions(now = Date.now()): void {
    for (const [key, session] of giftSessions) {
      if (now - session.at > 10 * 60_000) giftSessions.delete(key);
    }
    while (giftSessions.size > 2000) {
      const first = giftSessions.keys().next().value;
      if (first == null) break;
      giftSessions.delete(first);
    }
  }

  /** 新一场/停听：清空礼物组与解码样本，避免跨场串数据；已展示的 feed 保留。 */
  function clearGiftSessions(): void {
    giftSessions.clear();
    seenMethods.clear();
    decodeFailures.clear();
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

  /**
   * 主播下播：停听 + 标记 ended，不再重连。
   * 三个触发点：控制帧 status=3、重连/静默探活拿到「主播未开播」、退避重连次数耗尽。
   */
  function markEnded(reason: string): void {
    // 同一次收听里重复的下播帧 / 再次探活：状态照旧刷新，但不重复回调宿主。
    const already = ended && !wantListen;
    wantListen = false;
    ended = true;
    listening = false;
    mode = 'idle';
    clearReconnect();
    clearIdleProbe();
    clearHb();
    teardownSocket();
    clearCdp();
    reconnectAttempts = 0;
    if (pendingChats.length) {
      log.info?.(`[blue-fish][douyin] ended: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    clearGiftSessions();
    lastError = reason;
    if (already) return;
    log.info?.(`[blue-fish][douyin] ended: ${reason}`);
    try {
      onEnded?.(status());
    } catch (e) {
      log.warn?.(`[blue-fish][douyin] onEnded failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 探活：能进房 = 在播；抛「主播未开播」= 已下播（直接 markEnded）；其它错误（风控 / 网络）当未知，继续重连。
   * 返回 false 表示调用方不要再连。
   */
  async function probeRoomLiving(): Promise<boolean> {
    if (!wantListen || ended) return false;
    try {
      await fetchLiveInfo(currentUrl, currentCookie);
      reconnectAttempts = 0;
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/未开播|直播已结束|已结束|下播/.test(msg)) {
        markEnded('主播已下播（直播结束）');
        return false;
      }
      log.debug?.(`[blue-fish][douyin] liveness unknown: ${msg}`);
      return true;
    }
  }

  /**
   * 静默探活：CDP 旁听时页面自己重连，宿主收不到 close，
   * 所以长时间没有业务帧就主动查一次房间是否还在播。
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

  function clearCdp(): void {
    for (const unsub of cdpUnsubs) {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    }
    cdpUnsubs = [];
    if (cdp) {
      try {
        cdp.stop();
      } catch (e) {
        noteError(e);
      }
    }
    cdp = null;
    cdpVisible = false;
    cdpLoggedIn = false;
    cdpMeta = { title: '', anchor: '' };
  }

  /**
   * CDP 旁听路径：让 Helper 开内嵌隐藏窗加载直播间，页面自己连弹幕 WS，我们抓帧交 onBinary。
   * 不发心跳/ACK（页面自己维护）；不做签名进房。
   */
  async function startCdp(bridge: DouyinCdpBridge): Promise<void> {
    clearCdp();
    cdp = bridge;
    cdpUnsubs.push(
      bridge.onFrame((frame) => {
        void onBinary(frame).catch((e) => noteError(e));
      }),
      bridge.onLogin(() => {
        cdpLoggedIn = true;
        cdpVisible = false;
      }),
      bridge.onClosed(() => {
        if (!wantListen) return;
        listening = false;
        noteError('内嵌窗口已关闭，弹幕旁听中断');
      }),
      bridge.onMeta((meta) => {
        cdpMeta = {
          title: String(meta?.title || '').trim() || cdpMeta.title,
          anchor: String(meta?.anchor || '').trim() || cdpMeta.anchor,
        };
      }),
    );
    await bridge.start({ url: currentUrl, cookie: currentCookie });
    const snap = bridge.status();
    cdpVisible = snap.visible;
    cdpLoggedIn = snap.loggedIn;
    cdpMeta = { title: String(snap.title || '').trim(), anchor: String(snap.anchor || '').trim() };
    // 元数据双保险：内嵌页 SSR 状态读不到时，带用户 Cookie 尽力走一次 enter 流程补；
    // 被风控/未开播等失败一律静默，不影响旁听；空值不覆盖已读到的值。
    void fetchLiveInfo(currentUrl, currentCookie)
      .then((meta) => {
        if (mode !== 'cdp') return;
        cdpMeta = {
          title: String(meta.title || '').trim() || cdpMeta.title,
          anchor: String(meta.anchor || '').trim() || cdpMeta.anchor,
        };
      })
      .catch(() => {
        /* 元数据是加分项，enter 失败保留页面读到的结果 */
      });
    mode = 'cdp';
    listening = true;
    lastError = '';
    if (!startedAt) startedAt = Date.now();
    log.info?.(
      `[blue-fish][douyin] cdp window room=${currentUrl} replyChat=${replyChat} thankGift=${thankGift} loggedIn=${cdpLoggedIn}`,
    );
  }

  function noteError(err: unknown): void {
    lastError = err instanceof Error ? err.message : String(err);
    log.warn?.(`[blue-fish][douyin] ${lastError}`);
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
          `[blue-fish][douyin] chat queue full, drop oldest kind=${dropped.kind} pending=${pendingChats.length}`,
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
          log.info?.(`[blue-fish][douyin] skip queued kind=${job.kind}: switch off`);
          continue;
        }
        const petId = (resolvePetId() || 'main').trim() || 'main';
        currentJobKind = job.kind;
        try {
          log.info?.(`[blue-fish][douyin] → chat pet=${petId} kind=${job.kind} pending=${pendingChats.length}`);
          const r = await chatWithPet(petId, job.prompt, job.kind);
          if (!r.ok) {
            log.warn?.(`[blue-fish][douyin] chat failed kind=${job.kind}: ${r.message || 'unknown'}`);
          }
        } catch (e) {
          log.warn?.(
            `[blue-fish][douyin] chat exception kind=${job.kind}: ${e instanceof Error ? e.message : String(e)}`,
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
        `[blue-fish][douyin] connect room=${info.roomId} title=${info.title || '-'} anchor=${info.anchor || '-'} replyChat=${replyChat} thankGift=${thankGift}`,
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
      mode = 'direct';
      lastError = '';
      reconnectAttempts = 0;
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
    log.info?.(`[blue-fish][douyin] chat nick=${nick} text=${content}`);
    if (replyChat) {
      enqueueChat(`[直播弹幕] 观众「${nick}」说：${content}\n请用你的人设简短回复这条弹幕（一两句即可）。`, 'chat');
    }
  }

  function handleGiftPayload(m: { method?: string; payload?: Uint8Array; msgId?: unknown }): void {
    if (!m.payload) return;
    const item = parseGiftMessage(m.payload);
    const giftName = item.giftName;
    // 同一条连击要能合并：有 groupId 用组号；没有的连击按「昵称+礼物名+8s 窗口」归并，
    // 非连击礼物一条消息一行，避免中间帧刷屏。
    const bucket = `${item.nick}|${giftName}|${Math.floor(Date.now() / 8000)}`;
    const key = item.groupId
      ? `gift:g:${item.groupId}`
      : item.combo
        ? `gift:c:${bucket}`
        : `gift:m:${String(m.msgId ?? '') || bucket}`;
    const session = giftSessions.get(key);

    // 首帧就落地：抖音的 repeat_end=1 定稿帧不保证会到（隐藏窗 / 丢帧 / 服务端不发），
    // 等定稿会把整场礼物等丢，线上表现就是「一条礼物都没有」。
    if (!session) {
      giftCount += 1;
      const feedItem = pushFeed('gift', item.nick, giftName, item.count);
      giftSessions.set(key, { item: feedItem, at: Date.now() });
      pruneGiftSessions();
      log.info?.(`[blue-fish][douyin] gift nick=${item.nick} gift=${giftName} x${feedItem.count}`);
      if (thankGift) {
        enqueueChat(
          `[直播礼物] 观众「${item.nick}」送出了「${giftName}」×${feedItem.count}。\n请用你的人设简短感谢对方（一两句即可）。`,
          'gift',
        );
      }
      return;
    }

    // 同组后续帧（连击升高 / 定稿）：只把这一条的件数往上抬，不重复计数、不重复答谢。
    const finalCount = Math.max(item.count, session.item.count);
    session.at = Date.now();
    if (finalCount > session.item.count) {
      session.item.count = finalCount;
      log.debug?.(`[blue-fish][douyin] gift combo update nick=${item.nick} gift=${giftName} x${finalCount}`);
    }
    if (item.repeatEnd === 1) {
      log.debug?.(`[blue-fish][douyin] gift settled nick=${item.nick} gift=${giftName} x${finalCount}`);
    }
  }

  /**
   * 轻礼物（免费动画 / 点赞类）：结构里没有送礼人、没有连击会话，
   * 只进互动消息区，不计数到礼物感谢队列（也没有对象可感谢）。
   */
  function handleLightGiftPayload(m: { method?: string; payload?: Uint8Array; msgId?: unknown }): void {
    if (!m.payload) return;
    const item = parseLightGiftMessage(m.payload);
    const key = `light-gift:${String(m.msgId ?? '') || `${item.giftId}|${item.count}`}`;
    if (isDup(key)) return;
    giftCount += 1;
    pushFeed('gift', item.nick, item.giftName, item.count);
    log.info?.(`[blue-fish][douyin] light gift gift=${item.giftName} x${item.count}`);
  }

  /** 在线人数统计帧：total(3)=当前在线观众，totalUser(7)=本场累计观看；只取当前在线。 */
  function handleRoomUserSeqPayload(m: { method?: string; payload?: Uint8Array }): void {
    if (!m.payload) return;
    const seq = RoomUserSeqMessage.decode(m.payload) as { total?: unknown; totalUser?: unknown };
    const online = numish(seq.total, -1);
    const totalUser = numish(seq.totalUser, 0);
    // 只有 online>0 才认：total=0 的帧（空房 / 降级 / 只带累计观看）不覆盖已有在线人数。
    if (online <= 0) return;
    if (online === viewerCount) return;
    viewerCount = online;
    log.debug?.(`[blue-fish][douyin] online viewers=${viewerCount} totalUser=${totalUser}`);
  }

  /**
   * 点赞帧（`WebcastLikeMessage`）：total(3)=本场累计总赞，count(2)=本帧新增点赞量。
   * 只更新内存里的累计数供 status() 读取，不进弹幕流、不参与礼物感谢、不写任何状态叶子。
   * 取 max 而非直接赋值：帧可能乱序到达，旧帧不许把已攒的总数往回抹。
   */
  function handleLikePayload(m: { payload?: Uint8Array }): void {
    if (!m.payload) return;
    const like = LikeMessage.decode(m.payload) as { total?: unknown };
    const next = numish(like.total, -1);
    if (next > likeTotal) likeTotal = next;
  }

  /**
   * 控制帧（`WebcastControlMessage`）：status=3 即直播结束。
   * 抖音下播时先发这条再断 WS，所以它是比 close 更早、也更确定的下播信号。
   */
  function handleControlPayload(m: { payload?: Uint8Array }): void {
    if (!m.payload) return;
    const ctl = ControlMessage.decode(m.payload) as { status?: unknown };
    const code = numish(ctl.status, 0);
    if (code === 3) markEnded('主播已下播（直播结束）');
    else log.debug?.(`[blue-fish][douyin] control status=${code}`);
  }

  async function onBinary(data: WebSocket.RawData): Promise<void> {
    lastFrameAt = Date.now();
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
        else if (m.method === 'WebcastLightGiftMessage') handleLightGiftPayload(m);
        else if (m.method === 'WebcastLikeMessage') handleLikePayload(m);
        else if (m.method === 'WebcastRoomUserSeqMessage') handleRoomUserSeqPayload(m);
        else if (m.method === 'WebcastControlMessage') handleControlPayload(m);
        else if (m.method) {
          // 进场 / 在线榜排行 / 关注分享等：不入库，但每个 method 首次出现打 info。
          // 默认日志级别下也能确认「礼物到底有没有来、来的是哪个 method」。
          if (!seenMethods.has(m.method)) {
            seenMethods.add(m.method);
            log.info?.(`[blue-fish][douyin] first skip method=${m.method}（同类型后续不再记录）`);
          } else {
            log.debug?.(`[blue-fish][douyin] skip method=${m.method}`);
          }
        }
      } catch (e) {
        const method = String(m.method || '');
        const detail = e instanceof Error ? e.message : String(e);
        // 首次失败提到 warn：礼物解不出来时，默认级别也能看到，不必先开 debug。
        if (!decodeFailures.has(method)) {
          decodeFailures.add(method);
          log.warn?.(`[blue-fish][douyin] decode failed method=${method}: ${detail}`);
        } else {
          log.debug?.(`[blue-fish][douyin] decode failed method=${method}: ${detail}`);
        }
      }
    }
  }

  /** 开关 true→false：清掉该类排队任务；正在处理的那条同类时通知宿主掐断语音。 */
  function dropPendingKind(kind: 'chat' | 'gift'): void {
    const before = pendingChats.length;
    for (let i = pendingChats.length - 1; i >= 0; i -= 1) {
      if (pendingChats[i]?.kind === kind) pendingChats.splice(i, 1);
    }
    if (before !== pendingChats.length) {
      log.info?.(`[blue-fish][douyin] switch off kind=${kind}: drop queued=${before - pendingChats.length}`);
    }
    if (currentJobKind === kind) {
      log.info?.(`[blue-fish][douyin] switch off kind=${kind}: cancel in-flight voice`);
      cancelVoice?.(kind);
    }
  }

  function applyOptions(input: Partial<DouyinMonitorOptions>): DouyinMonitorOptions {
    const prevReplyChat = replyChat;
    const prevThankGift = thankGift;
    if (typeof input.replyChat === 'boolean') replyChat = input.replyChat;
    if (typeof input.thankGift === 'boolean') thankGift = input.thankGift;
    if (prevReplyChat && !replyChat) dropPendingKind('chat');
    if (prevThankGift && !thankGift) dropPendingKind('gift');
    return { replyChat, thankGift };
  }

  /**
   * 开始监听前的探活：房间已经下播就不必起内嵌浏览器、更不必让前端干等 12 秒报「连接超时」。
   * - 拿到「主播未开播」：落成 ended 状态并抛出明确文案（前端状态行直接显示「已下播」）；
   * - 超时 / 风控 / 网络错误：状态未知，放行，按原链路继续启动。
   */
  async function assertRoomLiving(url: string, cookie: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = fetchLiveInfo(url, cookie);
    // 超时后探活仍可能在后台失败，挂个 catch 免得变成未处理的 rejection。
    probe.catch(() => undefined);
    const timeout = new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error('__preflight_timeout__')), PREFLIGHT_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      await Promise.race([probe, timeout]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === '__preflight_timeout__') {
        log.debug?.('[blue-fish][douyin] preflight timeout, continue start');
        return;
      }
      if (/未开播|直播已结束|已结束|下播/.test(msg)) {
        currentUrl = url;
        currentCookie = cookie;
        const reason = '主播已下播（直播结束）';
        markEnded(reason);
        throw new Error(`${reason}，等开播后再点开始监听`, { cause: e });
      }
      log.debug?.(`[blue-fish][douyin] preflight unknown: ${msg}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function start(input: DouyinMonitorStartInput): Promise<DouyinMonitorStatus> {
    const url = String(input.url || '').trim();
    if (!url) throw new Error('缺少直播间 url');
    // 先确认房间在播，已下播直接给结论，不走后面的起窗/连 WS 流程。
    await assertRoomLiving(url, String(input.cookie || ''));
    wantListen = true;
    currentUrl = url;
    currentCookie = String(input.cookie || '');
    applyOptions({
      replyChat: input.replyChat === true,
      thankGift: input.thankGift === true,
    });
    clearReconnect();
    clearIdleProbe();
    clearCdp();
    chatCount = 0;
    giftCount = 0;
    // 本场累计点赞只在 start() 清零；断线重连（scheduleReconnect）不清，否则数字会归零。
    likeTotal = 0;
    viewerCount = -1;
    feedSeq = 0;
    recentFeed.length = 0;
    clearGiftSessions();
    startedAt = null;
    lastError = '';
    ended = false;
    reconnectAttempts = 0;
    lastFrameAt = Date.now();
    const bridge = getCdpBridge?.();
    if (bridge) {
      await startCdp(bridge);
    } else {
      await connect();
    }
    startIdleProbe();
    return status();
  }

  function stop(): DouyinMonitorStatus {
    wantListen = false;
    ended = false;
    reconnectAttempts = 0;
    clearReconnect();
    clearIdleProbe();
    clearCdp();
    teardownSocket();
    listening = false;
    mode = 'idle';
    if (pendingChats.length) {
      log.info?.(`[blue-fish][douyin] stop: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    clearGiftSessions();
    return status();
  }

  function setOptions(input: Partial<DouyinMonitorOptions>): DouyinMonitorStatus {
    applyOptions(input);
    log.info?.(`[blue-fish][douyin] options replyChat=${replyChat} thankGift=${thankGift}`);
    return status();
  }

  function status(): DouyinMonitorStatus {
    return {
      listening: listening && wantListen,
      url: currentUrl,
      roomId: info?.roomId || '',
      title: info?.title || cdpMeta.title || '',
      anchor: info?.anchor || cdpMeta.anchor || '',
      chatCount,
      giftCount,
      likeCount: likeTotal,
      viewerCount,
      lastError,
      startedAt,
      replyChat,
      thankGift,
      mode,
      cdpVisible,
      cdpLoggedIn,
      ended,
      recent: recentFeed.slice(),
    };
  }

  return { start, stop, status, setOptions };
}

/** 抖音弹幕监听器实例。 */
export type DouyinMonitor = ReturnType<typeof createDouyinMonitor>;
