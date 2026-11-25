/**
 * 抖音弹幕监听器：通过桌面 Helper 的 CDP 旁听接收帧；可选把弹幕/礼物交给活跃宠物 /chat。
 *
 * @module dsh-pet/src/host/danmaku/douyin/monitor
 */
import { inflate } from 'pako';
import { brotliDecompressSync } from 'node:zlib';

import type { LoggerLike } from '../../log-file.ts';
import {
  DyLivenessUnknownError,
  DyRoomOfflineError,
  checkDyCookie,
  checkDyCookieShape,
  fetchDyLiveInfo,
  type DyCookieCheckReason,
  type DyLiveInfo,
} from './live-info.ts';
import { ChatMessage, ControlMessage, DyResponse, LikeMessage, PushFrame, RoomUserSeqMessage } from './proto.ts';
import { numish, parseGiftMessage, parseLightGiftMessage } from './gift-parse.ts';
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
  /**
   * 开发调试：保持内嵌窗可见，仅周期暂停视频播放省流（不拦直播流、不删播放器），
   * 用于观察窗口可见时弹幕连接断开后页面能否自己重连。只由开发环境控制台露出。
   */
  debugVisible?: boolean;
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
  /** 抖音礼物官方图地址；仅供本机白名单图片代理使用。 */
  giftImageUrl?: string;
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
  /** 本场累计礼物价值（平台货币）：按单价×件数累加；免费礼物不计。 */
  giftValue: number;
  /** 礼物价值单位（抖音固定「钻石」；快手未接单价时为空串，页面回落到条数）。 */
  giftValueUnit: string;
  /** 本场累计点赞总数（WebcastLikeMessage.total）；0 = 本场还没收到点赞帧。 */
  likeCount: number;
  /** 在线观众人数（WebcastRoomUserSeqMessage.total）；-1 = 本场还没收到统计帧。 */
  viewerCount: number;
  lastError: string;
  startedAt: number | null;
  replyChat: boolean;
  thankGift: boolean;
  /** 当前链路：cdp = 内嵌窗旁听；idle = 未启动。 */
  mode: 'cdp' | 'idle';
  /** CDP 内嵌窗当前是否可见（扫码登录时为 true）。 */
  cdpVisible: boolean;
  /** CDP 分区内是否已检测到登录态。 */
  cdpLoggedIn: boolean;
  /** 本次监听是否因「主播已下播」而自动结束（true 时 listening 恒为 false，需用户手动重连）。 */
  ended: boolean;
  /** 疑似被其他设备挤下线：弹幕 WS 已断、恢复窗口内没新帧、房间仍在播；收到新帧或重新 start 后清空。 */
  interrupted: boolean;
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
  /** 取进程内 CDP 旁听桥控制器；缺失时 start() 明确失败，不回退后端直连。 */
  getCdpBridge: () => DouyinCdpBridge | undefined;
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
  /** 疑似被挤下线的恢复窗口：断线后这么久仍没新帧且房间在播才判定；缺省 30s（测试可调小）。 */
  interruptGraceMs?: number;
};

/** 静默探活：多久没有业务帧才去查房间是否还在播（CDP 旁听收不到页面内 WS 的 close）。 */
const IDLE_PROBE_SILENT_MS = 180_000;
/** 静默探活的检查间隔。 */
const IDLE_PROBE_TICK_MS = 90_000;
/** 开始监听前的探活超时：超过就当作「状态未知」放行，不拖住启动流程。 */
const PREFLIGHT_TIMEOUT_MS = 8000;
/** 带 Cookie 启动时的登录态校验超时：需在前端请求超时（12s）内给出明确结论。 */
const COOKIE_VERIFY_TIMEOUT_MS = 10_000;
/** 下播可能只是瞬时状态（切流 / reflow）：首次判下播后等这么久再确认一次。 */
const OFFLINE_RETRY_DELAY_MS = 700;
/** 弹幕 WS 断开后的恢复窗口；期间恢复出帧就撤销「疑似被挤下线」判定。 */
const INTERRUPT_GRACE_MS = 30_000;
/** 弹幕连接中断的提示文案；收到新帧后自动清空。 */
const INTERRUPT_MESSAGE = '弹幕连接已中断：自动重连未成功，可能该账号已在其他设备进入别的直播间';

/**
 * 创建抖音弹幕监听器（进程内单例语义由调用方保证）。
 */
export function createDouyinMonitor(deps: DouyinMonitorDeps) {
  const { log, getCdpBridge, resolvePetId, chatWithPet, cancelVoice, onEnded } = deps;
  const fetchLiveInfo = deps.fetchLiveInfo ?? fetchDyLiveInfo;

  let listening = false;
  let wantListen = false;
  let chatCount = 0;
  let giftCount = 0;
  /** 本场累计礼物价值（钻石）。 */
  let giftValue = 0;
  /**
   * 本场累计点赞总数：取 `WebcastLikeMessage.total`，只增不减。
   * 点赞帧高频（每秒多帧、每帧批量）且取 max 天然幂等，所以只维护这一个内存变量：
   * 不 pushFeed、不写状态叶子、不发任何通知，避免 /status 与事件总线被打爆。
   */
  let likeTotal = 0;
  /** 在线观众人数；-1 表示本场还没收到统计帧。 */
  let viewerCount = -1;
  let feedSeq = 0;
  let giftFallbackSeq = 0;
  let lastError = '';
  let startedAt: number | null = null;
  let currentUrl = '';
  let currentCookie = '';
  let replyChat = false;
  let thankGift = false;
  let info: DyLiveInfo | null = null;
  /** 当前链路模式。 */
  let mode: 'cdp' | 'idle' = 'idle';
  /** CDP 桥实例与订阅清理集合。 */
  let cdp: DouyinCdpBridge | null = null;
  let cdpUnsubs: Array<() => void> = [];
  let cdpVisible = false;
  let cdpLoggedIn = false;
  /** 开发调试：内嵌窗保持可见且不拦播放（见 start 入参）。 */
  let debugVisible = false;
  /** 标题/主播优先由内嵌页 RENDER_DATA 补，接口探活结果作为兜底。 */
  let cdpMeta = { title: '', anchor: '' };
  const recentKeys = new Map<string, number>();
  /**
   * 礼物连击：key → 已落地的 feed 条目。同组后续帧只抬高这里的件数（只增不减），
   * 不再等 `repeat_end=1` 定稿——定稿帧不保证会到，等它会把整场礼物等丢。
   */
  const giftSessions = new Map<string, { item: DouyinFeedItem; at: number; unitValue: number }>();
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
  /** 疑似被挤下线（见 INTERRUPT_MESSAGE）；start / 收到新帧 / 下播时清零。 */
  let interrupted = false;
  /** 断线后的恢复窗口定时器；收到新帧或停听时清掉。 */
  let interruptTimer: ReturnType<typeof setTimeout> | null = null;
  /** 最近一帧业务帧的时间；用于长时间静默后的探活。 */
  let lastFrameAt = 0;
  /** 静默探活定时器（每个监听周期最多一个）。 */
  let idleProbeTimer: ReturnType<typeof setInterval> | null = null;

  /** 追加一条互动消息；返回落地的条目，礼物连击后续帧据此原地抬高件数。 */
  function pushFeed(kind: 'chat' | 'gift', nick: string, text: string, count = 0, giftImageUrl = ''): DouyinFeedItem {
    feedSeq += 1;
    const item: DouyinFeedItem = {
      id: feedSeq,
      at: Date.now(),
      kind,
      nick,
      text,
      count: kind === 'gift' ? Math.max(1, count) : 0,
      ...(giftImageUrl ? { giftImageUrl } : {}),
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
    giftFallbackSeq = 0;
    seenMethods.clear();
    decodeFailures.clear();
  }

  function clearIdleProbe(): void {
    if (idleProbeTimer) clearInterval(idleProbeTimer);
    idleProbeTimer = null;
  }

  function clearInterruptTimer(): void {
    if (interruptTimer) clearTimeout(interruptTimer);
    interruptTimer = null;
  }

  /** 链路恢复（收到新帧 / 重新 start / 下播）：撤掉恢复窗口与疑似被挤提示。 */
  function clearInterrupt(): void {
    clearInterruptTimer();
    if (!interrupted) return;
    interrupted = false;
    if (lastError === INTERRUPT_MESSAGE) lastError = '';
  }

  /**
   * 弹幕推送 WS 断开后开一个恢复窗口：窗口内没新帧、且进房探活仍在播，才判定疑似被挤下线。
   * 抖音对「同账号在其他设备进入别的直播间」没有独立错误帧，只能靠「断线后长时间无帧 + 房间在播」
   * 推断；网络抖动 / 切流恢复出帧后由 clearInterrupt 撤销。
   */
  function scheduleInterruptProbe(): void {
    if (!wantListen || ended || interruptTimer) return;
    const grace = deps.interruptGraceMs ?? INTERRUPT_GRACE_MS;
    interruptTimer = setTimeout(() => {
      interruptTimer = null;
      if (!wantListen || ended) return;
      void (async () => {
        if (!(await probeRoomLiving())) return;
        if (!wantListen || ended || interrupted) return;
        interrupted = true;
        lastError = INTERRUPT_MESSAGE;
        log.warn?.(`[blue-fish][douyin] interrupted: no frames ${grace}ms after push ws closed, room living`);
      })().catch((e) => noteError(e));
    }, grace);
    interruptTimer.unref?.();
  }

  /**
   * 主播下播：停听 + 标记 ended。
   * 两个触发点：控制帧 status=3、静默探活拿到「主播未开播」。
   */
  function markEnded(reason: string): void {
    // 同一次收听里重复的下播帧 / 再次探活：状态照旧刷新，但不重复回调宿主。
    const already = ended && !wantListen;
    wantListen = false;
    ended = true;
    listening = false;
    mode = 'idle';
    clearIdleProbe();
    clearInterrupt();
    clearCdp();
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
   * 探活：能进房 = 在播；抛「主播未开播」= 已下播（直接 markEnded）；其它错误（风控 / 网络）当未知。
   * 返回 false 表示监听应结束。
   */
  async function probeRoomLiving(): Promise<boolean> {
    if (!wantListen || ended) return false;
    try {
      await probeLive(currentUrl, currentCookie);
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
      if (!wantListen || ended) return;
      if (Date.now() - lastFrameAt < IDLE_PROBE_SILENT_MS) return;
      void (async () => {
        // 探到还在播：重置静默窗口，避免每隔 90s 就请求一次房间接口。
        if (await probeRoomLiving()) lastFrameAt = Date.now();
      })().catch((e) => noteError(e));
    }, IDLE_PROBE_TICK_MS);
    idleProbeTimer.unref?.();
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
      bridge.onWsClosed(() => scheduleInterruptProbe()),
    );
    await bridge.start({ url: currentUrl, cookie: currentCookie, debugVisible });
    const snap = bridge.status();
    cdpVisible = snap.visible;
    cdpLoggedIn = snap.loggedIn;
    cdpMeta = { title: String(snap.title || '').trim(), anchor: String(snap.anchor || '').trim() };
    // 元数据双保险：内嵌页 SSR 状态读不到时，带用户 Cookie 尽力走一次 enter 流程补；
    // 被风控/未开播等失败一律静默，不影响旁听；空值不覆盖已读到的值。
    void fetchLiveInfo(currentUrl, currentCookie)
      .then((meta) => {
        if (mode !== 'cdp') return;
        info = meta;
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
    const bucket = `${item.nick}|${item.giftId}|${giftName}|${Math.floor(Date.now() / 8000)}`;
    const msgId = String(m.msgId ?? '').trim();
    const hasValidMsgId = msgId !== '' && msgId !== '0';
    const key = item.groupId
      ? `gift:g:${item.groupId}|${item.nick}|${item.giftId}`
      : item.combo
        ? `gift:c:${bucket}`
        : `gift:m:${hasValidMsgId ? `${item.nick}|${item.giftId}|${msgId}` : `${item.nick}|${item.giftId}|fallback:${++giftFallbackSeq}`}`;
    const session = giftSessions.get(key);

    // 首帧就落地：抖音的 repeat_end=1 定稿帧不保证会到（隐藏窗 / 丢帧 / 服务端不发），
    // 等定稿会把整场礼物等丢，线上表现就是「一条礼物都没有」。
    if (!session) {
      giftCount += 1;
      giftValue += item.unitValue * item.count;
      const feedItem = pushFeed('gift', item.nick, giftName, item.count, item.giftImageUrl);
      giftSessions.set(key, { item: feedItem, at: Date.now(), unitValue: item.unitValue });
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
    const delta = finalCount - session.item.count;
    if (delta > 0) giftValue += session.unitValue * delta;
    session.at = Date.now();
    if (!session.item.giftImageUrl && item.giftImageUrl) session.item.giftImageUrl = item.giftImageUrl;
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
    const msgId = String(m.msgId ?? '').trim();
    const hasValidMsgId = msgId !== '' && msgId !== '0';
    const key = hasValidMsgId
      ? `light-gift:${item.giftId}|${msgId}`
      : `light-gift:fallback:${++giftFallbackSeq}|${item.giftId}`;
    if (hasValidMsgId && isDup(key)) return;
    giftCount += 1;
    giftValue += item.unitValue * item.count;
    pushFeed('gift', item.nick, item.giftName, item.count, item.giftImageUrl);
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

  async function onBinary(data: Uint8Array): Promise<void> {
    const buf = data;
    const frame = PushFrame.decode(buf) as {
      payload?: Uint8Array;
      payloadType?: string;
      payloadEncoding?: string;
    };
    let payload = frame.payload && frame.payload.length ? frame.payload : buf;
    let decompressed = false;
    let decompressError = '';
    if (frame.payload && frame.payload.length) {
      const enc = (frame.payloadEncoding || '').toLowerCase();
      try {
        if (enc === 'br' || enc === 'brotli') {
          payload = new Uint8Array(brotliDecompressSync(Buffer.from(frame.payload)));
          decompressed = true;
        } else if (enc === 'zstd') {
          // zstd：不支持，跳过
          decompressError = 'zstd-not-supported';
          payload = frame.payload;
        } else {
          // 默认 gzip / deflate / 空
          payload = inflate(frame.payload);
          decompressed = true;
        }
      } catch (e) {
        decompressError = e instanceof Error ? e.message : String(e);
        payload = frame.payload;
      }
    }
    const resp = DyResponse.decode(payload) as {
      messagesList?: Array<{ method?: string; payload?: Uint8Array; msgId?: unknown }>;
    };
    // 只有解出合法推送帧（含心跳帧）才算链路恢复：桥会把所有 WS 的 payload 都喂进来，
    // 其它通道的杂帧解不出 PushFrame，不能拿来重置「疑似被挤下线」的恢复窗口。
    clearInterrupt();
    lastFrameAt = Date.now();
    // 每帧都打 payloadEncoding / 解压状态 / messagesList 数量——info 级别确保进日志。
    const methods = (resp.messagesList || []).flatMap((message) =>
      typeof message.method === 'string' && message.method ? [message.method] : [],
    );
    const methodCounter: Record<string, number> = {};
    for (const n of methods) methodCounter[n] = (methodCounter[n] || 0) + 1;
    const methodSummary = Object.entries(methodCounter)
      .map(([n, c]) => (c > 1 ? `${n}×${c}` : n))
      .join(',');
    // info 级别：每帧都打一次，方便确认 payloadEncoding 和 messagesList 数量
    log.info?.(
      `[blue-fish][douyin] frame enc=${frame.payloadEncoding || '-'} dec=${decompressed} pType=${frame.payloadType || '-'} count=${methods.length} [${methodSummary}]`,
    );
    if (decompressError) {
      log.warn?.(`[blue-fish][douyin] decompress failed err=${decompressError}`);
    }
    for (const m of resp.messagesList || []) {
      try {
        // 每帧包含的所有 method 首次打出来（30s 限频），方便确认 GiftMessage 是否真到了。
        if (m.method && !seenMethods.has(m.method)) {
          seenMethods.add(m.method);
          log.info?.(`[blue-fish][douyin] first method=${m.method}`);
        }
        if (m.method === 'WebcastChatMessage') handleChatPayload(m);
        else if (m.method === 'WebcastGiftMessage') handleGiftPayload(m);
        else if (m.method === 'WebcastLightGiftMessage') handleLightGiftPayload(m);
        else if (m.method === 'WebcastLikeMessage') handleLikePayload(m);
        else if (m.method === 'WebcastRoomUserSeqMessage') handleRoomUserSeqPayload(m);
        else if (m.method === 'WebcastControlMessage') handleControlPayload(m);
        else if (m.method) {
          // 进场 / 在线榜排行 / 关注分享等：不入库，但每个 method 首次出现打 info。
          // 默认日志级别下也能确认「礼物到底有没有来、来的是哪个 method」。
          log.debug?.(`[blue-fish][douyin] skip method=${m.method}`);
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

  /** 是否「明确未开播」：只有这种错误值得二次确认，超时/风控/网络错误按原语义处理。 */
  function isOfflineError(e: unknown): boolean {
    if (e instanceof DyRoomOfflineError) return true;
    const msg = e instanceof Error ? e.message : String(e);
    return /未开播|直播已结束|已结束|下播/.test(msg);
  }

  /** 进房结果不可用（空 body / 风控）：状态未知，绝不能当未开播。 */
  function isUnknownLiveness(e: unknown): boolean {
    return e instanceof DyLivenessUnknownError;
  }

  /** 把下播判定的字段快照压成一行 debug 日志，便于区分真下播与瞬时抖动。 */
  function offlineLogText(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(e instanceof DyRoomOfflineError) || !e.detail) return msg;
    const d = e.detail;
    return (
      `${msg} reason=${d.reason} room=${d.roomId || '-'} status=${d.status ?? '-'}` +
      ` finish=${d.finishTime ?? '-'} reflow=${d.reflow} enterRoomStatus=${d.enterRoomStatus ?? '-'}`
    );
  }

  /**
   * 探活（开始监听前与运行中静默探活共用，带一次确认）：
   * 抖音在切流 / 重算房间信息时会短暂回「未开播」，进房接口也可能偶发空响应；
   * 两种都等一拍再进一次，只有第二次仍是「明确未开播」才算下播。
   */
  async function probeLive(url: string, cookie: string): Promise<DyLiveInfo> {
    try {
      return await fetchLiveInfo(url, cookie);
    } catch (e) {
      const unknown = isUnknownLiveness(e);
      if (!unknown && !isOfflineError(e)) throw e;
      log.debug?.(`[blue-fish][douyin] liveness ${unknown ? 'unknown' : 'offline'} #1: ${offlineLogText(e)}`);
      await new Promise((resolve) => setTimeout(resolve, OFFLINE_RETRY_DELAY_MS));
      try {
        const info = await fetchLiveInfo(url, cookie);
        log.debug?.(`[blue-fish][douyin] liveness retry live: room=${info.roomId || '-'}`);
        return info;
      } catch (retryError) {
        if (isUnknownLiveness(retryError)) {
          // 空响应/风控属于「状态未知」，要让人在日志里看得到，而不是静默当成下播。
          const detail = retryError instanceof Error ? retryError.message : String(retryError);
          log.info?.(`[blue-fish][douyin] liveness unavailable after retry: ${detail}`);
        } else if (isOfflineError(retryError)) {
          log.debug?.(`[blue-fish][douyin] liveness offline #2 (confirmed): ${offlineLogText(retryError)}`);
        }
        throw retryError;
      }
    }
  }

  /** 下播结论的统一出口：先落 ended 状态再抛文案，两条前置校验共用。 */
  function failRoomEnded(url: string, cookie: string, cause?: unknown): never {
    currentUrl = url;
    currentCookie = cookie;
    const reason = '主播已下播（直播结束）';
    markEnded(reason);
    throw new Error(`${reason}，等开播后再点开始监听`, { cause });
  }

  /**
   * 开始监听前的探活：房间已经下播就不必起内嵌浏览器、更不必让前端干等 12 秒报「连接超时」。
   * - 拿到「主播未开播」：落成 ended 状态并抛出明确文案（前端状态行直接显示「已下播」）；
   * - 超时 / 风控 / 网络错误：状态未知，放行，按原链路继续启动。
   */
  async function assertRoomLiving(url: string, cookie: string): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = probeLive(url, cookie);
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
      if (/未开播|直播已结束|已结束|下播/.test(msg)) failRoomEnded(url, cookie, e);
      log.debug?.(`[blue-fish][douyin] preflight unknown: ${msg}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 带 Cookie 启动时，校验失败原因 → 给用户看的中文文案。 */
  const COOKIE_REASON_TEXT: Record<DyCookieCheckReason, string> = {
    'no-session': 'Cookie 缺少登录凭证（sessionid），这不是登录态 Cookie，请重新从已登录浏览器复制完整 Cookie',
    'no-server-uid': '抖音未确认登录态（进房未回显用户），请稍后重试或检查 Cookie 是否完整',
    'guest-placeholder': 'Cookie 登录态已失效（被抖音打回游客），请重新登录后复制新的 Cookie',
  };

  /** Cookie 校验失败的统一出口：先记到 lastError（状态行会显示「最近问题」），再抛给前端 toast。 */
  function failCookie(message: string, cause?: unknown): never {
    lastError = message;
    throw new Error(message, { cause });
  }

  /**
   * 带登录 Cookie 启动时的严格前置校验，顺序固定为「先 Cookie、后房间」：
   * 1. 本地结构预检（不发请求）：缺会话键 / 缺 uid 直接拦下；
   * 2. 进房一趟（fetchLiveInfo）：下播时服务端照样回显当前用户 uid，先拿它比对 Cookie；
   * 3. Cookie 无效 → 报 Cookie 错误（优先于下播）；Cookie 有效且房间未开播 → 再报下播。
   * 与 assertRoomLiving 的「超时放行」不同，这里校验不通过就直接抛错、绝不进入监听——
   * 否则用户以为填了登录态，实际礼物帧仍拿不到。
   *
   * CDP 内嵌窗可用（degradeUnknown）时例外：登录态由内嵌页确认，进房接口的
   * 风控 / 超时 / 网络错误只记警告照常启动，只有 Cookie 明确失效才拦。
   */
  async function assertCookieValid(
    url: string,
    cookie: string,
    opts: { degradeUnknown?: boolean } = {},
  ): Promise<void> {
    const degradeUnknown = opts.degradeUnknown === true;
    const shape = checkDyCookieShape(cookie);
    if (!shape.ok) failCookie(COOKIE_REASON_TEXT[shape.reason]);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const probe = probeLive(url, cookie);
    // 超时后校验仍可能在后台失败，挂个 catch 免得变成未处理的 rejection。
    probe.catch(() => undefined);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('__cookie_verify_timeout__')), COOKIE_VERIFY_TIMEOUT_MS);
      timer.unref?.();
    });
    let info: DyLiveInfo;
    try {
      info = await Promise.race([probe, timeout]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === '__cookie_verify_timeout__') {
        if (degradeUnknown) {
          log.warn?.('[blue-fish][douyin] cookie preflight timeout, continue via cdp');
          return;
        }
        failCookie('Cookie 校验超时，请检查网络后重试', e);
      }
      // 下播错误里带着服务端回显的 uid：先给 Cookie 定性，无效就报 Cookie，有效才报下播。
      if (e instanceof DyRoomOfflineError) {
        if (e.loginUid) {
          const verdict = checkDyCookie(cookie, e.loginUid);
          if (!verdict.ok) failCookie(COOKIE_REASON_TEXT[verdict.reason], e);
        }
        failRoomEnded(url, cookie, e);
      }
      if (isUnknownLiveness(e)) {
        if (degradeUnknown) {
          // 登录态由内嵌页确认：进房风控不该拦死整条 CDP 旁听链路。
          log.warn?.(`[blue-fish][douyin] cookie preflight unavailable, continue via cdp: ${msg}`);
          return;
        }
        failCookie('抖音进房接口暂时不可用（可能触发风控），请稍后重试', e);
      }
      if (/未开播|直播已结束|已结束|下播/.test(msg)) failRoomEnded(url, cookie, e);
      if (degradeUnknown) {
        log.warn?.(`[blue-fish][douyin] cookie preflight failed, continue via cdp: ${msg}`);
        return;
      }
      failCookie(`Cookie 校验失败：${msg}`, e);
    } finally {
      if (timer) clearTimeout(timer);
    }
    const verdict = checkDyCookie(cookie, info.loginUid);
    if (!verdict.ok) failCookie(COOKIE_REASON_TEXT[verdict.reason]);
  }

  async function start(input: DouyinMonitorStartInput): Promise<DouyinMonitorStatus> {
    const url = String(input.url || '').trim();
    if (!url) throw new Error('缺少直播间 url');
    const bridge = getCdpBridge();
    if (!bridge) {
      throw new Error('抖音监听需要桌面 Helper 的 CDP 桥；当前运行环境不支持监听');
    }
    const cookie = String(input.cookie || '');
    // 填了 Cookie：先严格校验登录态（进房同时确认在播），无效直接拦下；
    // 没填 Cookie：保持原有「在播探活、超时放行」的宽松行为（游客也能看纯聊天）。
    // 登录态由内嵌页确认；进房接口不可用时只告警，不因风控拦死 CDP 旁听。
    if (cookie.trim()) {
      await assertCookieValid(url, cookie, { degradeUnknown: true });
    } else {
      await assertRoomLiving(url, cookie);
    }
    wantListen = true;
    currentUrl = url;
    currentCookie = cookie;
    debugVisible = input.debugVisible === true;
    applyOptions({
      replyChat: input.replyChat === true,
      thankGift: input.thankGift === true,
    });
    clearIdleProbe();
    clearCdp();
    info = null;
    chatCount = 0;
    giftCount = 0;
    giftValue = 0;
    // 本场累计点赞只在 start() 清零，静默探活不影响累计值。
    likeTotal = 0;
    viewerCount = -1;
    feedSeq = 0;
    recentFeed.length = 0;
    clearGiftSessions();
    startedAt = null;
    lastError = '';
    ended = false;
    clearInterrupt();
    lastFrameAt = Date.now();
    try {
      await startCdp(bridge);
    } catch (e) {
      wantListen = false;
      listening = false;
      mode = 'idle';
      clearCdp();
      noteError(e);
      throw e;
    }
    startIdleProbe();
    return status();
  }

  function stop(): DouyinMonitorStatus {
    wantListen = false;
    ended = false;
    clearIdleProbe();
    clearInterruptTimer();
    // 保留 lastError：用户选择「暂不重新开始」后，状态行仍能看到被挤下线的原因。
    interrupted = false;
    clearCdp();
    listening = false;
    mode = 'idle';
    if (pendingChats.length) {
      log.info?.(`[blue-fish][douyin] stop: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    clearGiftSessions();
    return status();
  }

  /**
   * 开发调试：立即显隐内嵌窗。只动可见性，不重连、不改播放/省流状态；
   * 未在 CDP 旁听时无动作（勾选状态留给下次 start 作为 debugVisible）。
   */
  function setWindowVisible(visible: boolean): DouyinMonitorStatus {
    if (mode === 'cdp' && cdp) {
      try {
        cdp.setVisible(visible === true);
        cdpVisible = visible === true;
        log.info?.(`[blue-fish][douyin] debug window visible=${cdpVisible}`);
      } catch (e) {
        noteError(e);
      }
    }
    return status();
  }

  function setOptions(input: Partial<DouyinMonitorOptions>): DouyinMonitorStatus {
    applyOptions(input);
    log.info?.(`[blue-fish][douyin] options replyChat=${replyChat} thankGift=${thankGift}`);
    return status();
  }

  /** 内嵌窗当前可见性：以桥的实时状态为准，用户手动关窗（转隐藏）也能立刻反映到轮询里。 */
  function liveCdpVisible(): boolean {
    if (mode === 'cdp' && cdp) {
      try {
        return cdp.status().visible === true;
      } catch {
        /* 读不到就回落到最近一次快照 */
      }
    }
    return cdpVisible;
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
      giftValue,
      giftValueUnit: '钻石',
      likeCount: likeTotal,
      viewerCount,
      lastError,
      startedAt,
      replyChat,
      thankGift,
      mode,
      cdpVisible: liveCdpVisible(),
      cdpLoggedIn,
      ended,
      interrupted,
      recent: recentFeed.slice(),
    };
  }

  return { start, stop, status, setOptions, setWindowVisible };
}

/** 抖音弹幕监听器实例。 */
export type DouyinMonitor = ReturnType<typeof createDouyinMonitor>;
