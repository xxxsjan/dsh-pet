/**
 * 小红书中控台弹幕监听器：内嵌隐藏窗进中控台扫码登录 → CDP 抓 longlink 帧 → JSON 解码分发。
 *
 * 只听自己主播中控台这场直播；不填他人直播间链接。入库弹幕 + 礼物 + 在线观看人数，
 * 进场 / 关注 / 礼物托/结算先留样本不展示。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/monitor
 */
import type { LoggerLike } from '../../log-file.ts';
import type { XhsCdpBridge } from './cdp-bridge.ts';
import { classifyXhsItem, parseXhsWsPayload, type XhsParsedItem } from './xhs-danmaku.ts';

/** 启动参数。 */
export type XhsMonitorStartInput = {
  /** 可选登录 Cookie；不填则开窗扫码。 */
  cookie?: string;
  /** 是否把弹幕交给宠物 /chat。 */
  replyChat?: boolean;
  /** 是否把礼物感谢交给宠物 /chat。 */
  thankGift?: boolean;
};

/** 运行中可热更新的开关。 */
export type XhsMonitorOptions = {
  replyChat: boolean;
  thankGift: boolean;
};

/** 控制页轮询展示的一条消息。 */
export type XhsFeedItem = {
  id: number;
  at: number;
  kind: 'chat' | 'gift';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0。 */
  count: number;
};

/** 对外状态快照。 */
export type XhsMonitorStatus = {
  listening: boolean;
  url: string;
  roomId: string;
  title: string;
  anchor: string;
  chatCount: number;
  giftCount: number;
  /** 在线观看人数（中控台在线统计帧）；-1 = 本场还没收到统计帧。 */
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
  recent: XhsFeedItem[];
};

/** 对话入口（与路由层 chatWithPet 同形；kind 用于宿主侧区分弹幕/礼物语音的取消）。 */
export type XhsChatFn = (
  petId: string,
  text: string,
  kind: 'chat' | 'gift',
) => Promise<{ ok: boolean; message?: string }>;

/** createXhsMonitor 依赖。 */
export type XhsMonitorDeps = {
  log: LoggerLike;
  /** 取进程内 CDP 旁听桥控制器；返回 undefined 时记为桥不可用。 */
  getCdpBridge?: () => XhsCdpBridge | undefined;
  /** 活跃宠物；空串时回落 main。 */
  resolvePetId: () => string;
  /** 把一条用户文本交给宠物对话。 */
  chatWithPet: XhsChatFn;
  /** 开关关闭时掐断该类正在生成/朗读的回复（宿主侧取消 utterance 并通知渲染端停播）；缺省不掐。 */
  cancelVoice?: (kind: 'chat' | 'gift') => void;
};

/** 中控台固定地址（与参照 XHS_LIVE_CENTER_URL 对齐）。 */
const CENTER_URL = 'https://redlive.xiaohongshu.com/live_center_control';

/**
 * 创建小红书中控台弹幕监听器（进程内单例语义由调用方保证）。
 */
export function createXhsMonitor(deps: XhsMonitorDeps) {
  const { log, getCdpBridge, resolvePetId, chatWithPet, cancelVoice } = deps;

  let listening = false;
  let wantListen = false;
  let chatCount = 0;
  let giftCount = 0;
  /** 在线观看人数；-1 表示本场还没收到统计帧。 */
  let viewerCount = -1;
  let feedSeq = 0;
  let lastError = '';
  let startedAt: number | null = null;
  let currentCookie = '';
  let replyChat = false;
  let thankGift = false;
  let mode: 'cdp' | 'idle' = 'idle';
  let cdp: XhsCdpBridge | null = null;
  let cdpUnsubs: Array<() => void> = [];
  let cdpVisible = false;
  let cdpLoggedIn = false;
  /** WS 消息去重集合。 */
  const seenIds = new Set<string>();
  /** 控制页展示：最多保留 50 条（旧→新）。 */
  const recentFeed: XhsFeedItem[] = [];
  const FEED_MAX = 50;
  /** 待发给宠物的对话；不含正在执行的那一条。超出则丢最旧。 */
  const pendingChats: Array<{ prompt: string; kind: 'chat' | 'gift' }> = [];
  const CHAT_QUEUE_MAX = 3;
  let chatPumpRunning = false;
  /** 正在交给宠物处理的那一条的类型；开关关闭时据此决定要不要掐断在播语音。 */
  let currentJobKind: 'chat' | 'gift' | null = null;

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
    log.warn?.(`[blue-fish][xiaohongshu] ${lastError}`);
  }

  function enqueueChat(prompt: string, kind: 'chat' | 'gift'): void {
    pendingChats.push({ prompt, kind });
    while (pendingChats.length > CHAT_QUEUE_MAX) {
      const dropped = pendingChats.shift();
      if (dropped) {
        log.info?.(
          `[blue-fish][xiaohongshu] chat queue full, drop oldest kind=${dropped.kind} pending=${pendingChats.length}`,
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
          log.info?.(`[blue-fish][xiaohongshu] skip queued kind=${job.kind}: switch off`);
          continue;
        }
        const petId = (resolvePetId() || 'main').trim() || 'main';
        currentJobKind = job.kind;
        try {
          log.info?.(
            `[blue-fish][xiaohongshu] → chat pet=${petId} kind=${job.kind} pending=${pendingChats.length}`,
          );
          const r = await chatWithPet(petId, job.prompt, job.kind);
          if (!r.ok) {
            log.warn?.(`[blue-fish][xiaohongshu] chat failed kind=${job.kind}: ${r.message || 'unknown'}`);
          }
        } catch (e) {
          log.warn?.(
            `[blue-fish][xiaohongshu] chat exception kind=${job.kind}: ${e instanceof Error ? e.message : String(e)}`,
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

  function handleItem(item: XhsParsedItem): void {
    if (item.kind === 'online') {
      viewerCount = Math.max(0, item.count);
      log.debug?.(`[blue-fish][xiaohongshu] online viewers=${viewerCount}`);
      return;
    }
    if (item.kind === 'chat') {
      chatCount += 1;
      pushFeed('chat', item.nick, item.text);
      log.info?.(`[blue-fish][xiaohongshu] chat nick=${item.nick} text=${item.text}`);
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
    log.info?.(`[blue-fish][xiaohongshu] gift nick=${item.nick} gift=${item.giftName} x${item.count}`);
    if (thankGift) {
      enqueueChat(
        `[直播礼物] 观众「${item.nick}」送出了「${item.giftName}」×${item.count}。\n请用你的人设简短感谢对方（一两句即可）。`,
        'gift',
      );
    }
  }

  function onFrame(frame: Uint8Array): void {
    let items: ReturnType<typeof parseXhsWsPayload>;
    try {
      items = parseXhsWsPayload(frame, seenIds);
    } catch (e) {
      noteError(e);
      return;
    }
    for (const cd of items) {
      try {
        const item = classifyXhsItem(cd);
        if (item) handleItem(item);
        else log.debug?.(`[blue-fish][xiaohongshu] skip type=${cd.type}`);
      } catch (e) {
        log.debug?.(`[blue-fish][xiaohongshu] decode failed type=${cd.type}: ${e instanceof Error ? e.message : String(e)}`);
      }
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
  }

  async function start(bridge: XhsCdpBridge): Promise<void> {
    clearCdp();
    cdp = bridge;
    cdpUnsubs.push(
      bridge.onFrame((frame) => onFrame(frame)),
      bridge.onLogin(() => {
        cdpLoggedIn = true;
        cdpVisible = false;
      }),
      bridge.onClosed(() => {
        if (!wantListen) return;
        listening = false;
        noteError('内嵌窗口已关闭，弹幕旁听中断');
      }),
    );
    await bridge.start({ cookie: currentCookie });
    const snap = bridge.status();
    cdpVisible = snap.visible;
    cdpLoggedIn = snap.loggedIn;
    mode = 'cdp';
    listening = true;
    lastError = '';
    if (!startedAt) startedAt = Date.now();
    log.info?.(
      `[blue-fish][xiaohongshu] cdp center=${CENTER_URL} replyChat=${replyChat} thankGift=${thankGift} loggedIn=${cdpLoggedIn}`,
    );
  }

  /** 开关 true→false：清掉该类排队任务；正在处理的那条同类时通知宿主掐断语音。 */
  function dropPendingKind(kind: 'chat' | 'gift'): void {
    const before = pendingChats.length;
    for (let i = pendingChats.length - 1; i >= 0; i -= 1) {
      if (pendingChats[i]?.kind === kind) pendingChats.splice(i, 1);
    }
    if (before !== pendingChats.length) {
      log.info?.(
        `[blue-fish][xiaohongshu] switch off kind=${kind}: drop queued=${before - pendingChats.length}`,
      );
    }
    if (currentJobKind === kind) {
      log.info?.(`[blue-fish][xiaohongshu] switch off kind=${kind}: cancel in-flight voice`);
      cancelVoice?.(kind);
    }
  }

  function applyOptions(input: Partial<XhsMonitorOptions>): XhsMonitorOptions {
    const prevReplyChat = replyChat;
    const prevThankGift = thankGift;
    if (typeof input.replyChat === 'boolean') replyChat = input.replyChat;
    if (typeof input.thankGift === 'boolean') thankGift = input.thankGift;
    if (prevReplyChat && !replyChat) dropPendingKind('chat');
    if (prevThankGift && !thankGift) dropPendingKind('gift');
    return { replyChat, thankGift };
  }

  async function startMonitor(input: XhsMonitorStartInput): Promise<XhsMonitorStatus> {
    wantListen = true;
    currentCookie = String(input.cookie || '');
    applyOptions({
      replyChat: input.replyChat === true,
      thankGift: input.thankGift === true,
    });
    seenIds.clear();
    chatCount = 0;
    giftCount = 0;
    viewerCount = -1;
    feedSeq = 0;
    recentFeed.length = 0;
    startedAt = null;
    lastError = '';

    const bridge = getCdpBridge?.();
    if (!bridge) {
      throw new Error('小红书 CDP 旁听桥未就绪：需要桌面 Helper 在跑（应用模式或桌面宠物已启动）');
    }
    await start(bridge);
    return status();
  }

  function stop(): XhsMonitorStatus {
    wantListen = false;
    clearCdp();
    listening = false;
    mode = 'idle';
    if (pendingChats.length) {
      log.info?.(`[blue-fish][xiaohongshu] stop: clear chat queue dropped=${pendingChats.length}`);
      pendingChats.length = 0;
    }
    return status();
  }

  function setOptions(input: Partial<XhsMonitorOptions>): XhsMonitorStatus {
    applyOptions(input);
    log.info?.(`[blue-fish][xiaohongshu] options replyChat=${replyChat} thankGift=${thankGift}`);
    return status();
  }

  /** 把隐藏的内嵌中控台窗口重新弹到前台（登录后默认隐藏省流，需要回看中控台时调用）。 */
  function showCenter(): XhsMonitorStatus {
    if (!cdp) {
      noteError('尚未开始监听：没有可弹出的中控台窗口');
      return status();
    }
    try {
      cdp.show();
      const snap = cdp.status();
      cdpVisible = snap.visible;
      cdpLoggedIn = snap.loggedIn;
    } catch (e) {
      noteError(e);
    }
    return status();
  }

  function status(): XhsMonitorStatus {
    return {
      listening: listening && wantListen,
      url: CENTER_URL,
      roomId: '',
      title: '',
      anchor: '',
      chatCount,
      giftCount,
      viewerCount,
      lastError,
      startedAt,
      replyChat,
      thankGift,
      mode,
      cdpVisible,
      cdpLoggedIn,
      recent: recentFeed.slice(),
    };
  }

  return { start: startMonitor, stop, status, setOptions, showCenter };
}

/** 小红书中控台弹幕监听器实例。 */
export type XhsMonitor = ReturnType<typeof createXhsMonitor>;
