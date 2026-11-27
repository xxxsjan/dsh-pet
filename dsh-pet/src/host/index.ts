/**
 * 插件入口：Cordis 插件，把 host 半侧的配置、路由、斜杠命令、轮询与桌面 Helper 装配到 ctx。
 * 装配顺序不能改：`getHandlePetRoute` 惰性取用（`httpRoute` 在本函数后段才创建），`startHelper` 必须最后调用。
 * @module dsh-pet/src/host/index
 */
import { createHostSetup } from './plugin/setup.ts';
import { AnimLoop } from './anim-loop.ts';
import { readAllConfig } from './config.ts';
import { createHttpRoute, registerHttpRoute } from './plugin/http-route.ts';
import { registerLifecycle } from './plugin/lifecycle.ts';
import { registerChatCommand } from './plugin/command-chat.ts';
import { registerPetCommand } from './plugin/command-pet.ts';
import { registerLoops } from './plugin/loops.ts';
import { registerBalanceCommand } from './plugin/command-balance.ts';
import { registerSessionWatch } from './plugin/session-watch.ts';
import { createDesktopHelper } from './plugin/desktop-helper.ts';
import { createBalancePoll } from './plugin/balance-poll.ts';
import { createChatMemory } from './plugin/chat-memory.ts';
import { createSessionNotify } from './plugin/session-notify.ts';
import { createPetLookup } from './plugin/pet-lookup.ts';
import { createDownloadReport } from './plugin/download-report.ts';
import { createWorkStatusBridge } from './plugin/work-status-bridge.ts';
import { registerTodoReminders } from './plugin/todo-reminders.ts';
import { createVoiceService, voiceRuntimeFromMain } from './voice/speak.ts';
import { createHearService } from './voice/hear.ts';
import { createDouyinMonitor } from './danmaku/douyin/monitor.ts';
import { getDouyinCdpBridge } from './danmaku/douyin/cdp-bridge.ts';
import { createXhsMonitor } from './danmaku/xiaohongshu/monitor.ts';
import { getXhsCdpBridge } from './danmaku/xiaohongshu/cdp-bridge.ts';
import { createKsMonitor } from './danmaku/kuaishou/monitor.ts';
import { createBiliMonitor } from './danmaku/bilibili/monitor.ts';
import { VOICE_UTTERANCE_WAIT_MS } from './voice/utterance.ts';
import { TODO_FILE_NAME, TodoStore } from './todo/store.ts';
import { join } from 'node:path';
import type { PetRouteDeps } from './routes/types.ts';

/** 插件行 id（与 cordis.patch.yml 一致） */
export const name = 'pet';
/** 需要注入的服务：webServer（路由）+ agentDefaultModel（当前服务商）+ credentials（凭证）+ llm（对话模型调用）+ commands（/balance 斜杠命令）+ connection（桌面 Helper「打开软件 / 打开网站」用的已鉴权站点 URL） */
export const inject = ['webServer', 'agentDefaultModel', 'credentials', 'llm', 'commands', 'connection'];

/** 宿主插件主体：注册 `/blue-fish` 前缀路由与斜杠命令（/balance /pet /chat）；ctx 暂用 any（peer 类型包本地不可解析）。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH 注入的 ctx（webServer/locale 等 service 无静态类型）
export function apply(ctx: any): void {
  const setup = createHostSetup(ctx);
  const {
    userRoot,
    log,
    configPaths,
    thumbUserRoot,
    memeDirsFor,
    standaloneAiPolicy,
    standaloneAiBalance,
    state,
    playback,
    voiceUtterances,
    workStatus,
    EXTERNAL_WORK_SESSION,
    nextExternalWorkSeq,
  } = setup;
  const workStatusBridge = createWorkStatusBridge({ state, workStatus, EXTERNAL_WORK_SESSION });
  const { publishWorkStatus, stopWorkStatusFlush } = workStatusBridge;
  const downloadReport = createDownloadReport({
    EXTERNAL_WORK_SESSION,
    nextExternalWorkSeq,
    publishWorkStatus,
    workStatus,
  });
  const { reportDownload, stopDownloadSlotTimer } = downloadReport;
  const petLookup = createPetLookup({ state, configPaths });
  const { lock, sleep, sleepRefusalText } = petLookup;
  const sessionNotify = createSessionNotify({ ctx, publishWorkStatus, state, workStatus });
  const {
    pushNotifyFrame,
    turnFlags,
    terminalTimers,
    lastTodoText,
    lastReplyText,
    toolsInFlight,
    cancelTerminalCleanup,
    scheduleTerminalCleanup,
    notifyActivityTimers,
    scheduleCompletionNotify,
  } = sessionNotify;
  const chatMemory = createChatMemory({
    ctx,
    configPaths,
    log,
    memeDirsFor,
    playback,
    voiceUtterances,
    state,
    userRoot,
  });
  const { lastWhisperAt, publishWhisper, publishSleepTalk, chatWithPet, getActivePetId, setActivePetId } = chatMemory;

  const balancePoll = createBalancePoll({ ctx, configPaths, getActivePetId, log, state, standaloneAiBalance });
  const { effectivePetList, balancePeriodSec, whisperPeriodSec, refreshBalance, resolveActivePetId, petDisplayName } =
    balancePoll;

  // 待办清单：一份用户级数据（不分宠物），落盘在插件数据根；提醒循环与 /todos 路由共用同一个实例。
  const todos = new TodoStore({ file: join(userRoot, TODO_FILE_NAME), log });

  // 自播链调度器：集中掷骰选下一个自播动画，两端（桌面/OBS）据此同步空闲动作。
  // 所有显示在桌面的宠物都会被 start；渲染端播完后 POST /anim/next 继续循环。
  const animLoop = new AnimLoop({ configPaths, state, log });

  const desktopHelper = createDesktopHelper({
    ctx,
    configPaths,
    effectivePetList,
    log,
    reportDownload,
    thumbUserRoot,
    // 惰性取用：handlePetRoute 在下方装配，Helper 只在启动/收请求时才真正调用它
    getHandlePetRoute: () => httpRoute.handlePetRoute,
  });
  const { startHelper, stopHelper, markDisposed } = desktopHelper;

  // 弹幕回复专用超时：短于普通对话（60s）与独立模式默认（30s），超时即失败跳过，不堵串行队列
  const DANMAKU_CHAT_TIMEOUT_MS = 12_000;

  /** 弹幕对话包装（每平台一份）：等回复写完、且朗读真正结束（或跳过/失败/超时）后再放行队列下一条；
   *  开关关闭时经 cancelVoice 掐断该类回复——取消朗读回执并写 say `{ clear: true, stopVoice: true }`
   *  通知渲染端收起气泡、停掉在播音频；还在生成中的那条只置标记，生成完再取消（那时 say 叶子才写上）。 */
  const createDanmakuChat = () => {
    type DanmakuJob = { petId: string; kind: 'chat' | 'gift'; utteranceId?: string; cancelled: boolean };
    let current: DanmakuJob | null = null;
    const stopVoice = (petId: string, utteranceId?: string): void => {
      if (utteranceId) voiceUtterances.cancel(utteranceId, 'reply-disabled');
      state.writePet(petId, 'say', { clear: true, stopVoice: true });
    };
    return {
      chatWithPet: async (petId: string, text: string, kind: 'chat' | 'gift') => {
        const job: DanmakuJob = { petId, kind, cancelled: false };
        current = job;
        try {
          const r = await chatWithPet(petId, text, undefined, { timeoutMs: DANMAKU_CHAT_TIMEOUT_MS });
          if (!r.ok) return { ok: false, message: r.message || r.reason };
          // 生成期间开关被关掉：刚写出的回复不再朗读，立即取消回执并收起气泡。
          if (job.cancelled) {
            stopVoice(petId, r.voiceUtteranceId);
            return { ok: true };
          }
          if (r.voiceUtteranceId) {
            job.utteranceId = r.voiceUtteranceId;
            await voiceUtterances.waitUntilDone(r.voiceUtteranceId, VOICE_UTTERANCE_WAIT_MS);
          }
          return { ok: true };
        } finally {
          if (current === job) current = null;
        }
      },
      cancelVoice: (kind: 'chat' | 'gift'): void => {
        if (!current || current.kind !== kind) return;
        current.cancelled = true;
        // 已在朗读：立即掐断；还在生成：只置标记，交给生成后的分支处理。
        if (current.utteranceId) stopVoice(current.petId, current.utteranceId);
      },
    };
  };

  const douyinChat = createDanmakuChat();
  const douyinDanmaku = createDouyinMonitor({
    log,
    getCdpBridge: () => getDouyinCdpBridge(),
    resolvePetId: () => {
      const id = String(resolveActivePetId() || '').trim();
      return id || 'main';
    },
    chatWithPet: douyinChat.chatWithPet,
    cancelVoice: douyinChat.cancelVoice,
    // 主播下播自动停听：宿主侧补一次 state 回写，右键菜单/状态卡读的是这份快照。
    onEnded: (status) => {
      try {
        state.writeSection('danmaku', status);
      } catch (e) {
        log.warn?.(`[blue-fish] write danmaku state failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

  const xhsChat = createDanmakuChat();
  const xiaohongshuDanmaku = createXhsMonitor({
    log,
    getCdpBridge: () => getXhsCdpBridge(),
    resolvePetId: () => {
      const id = String(resolveActivePetId() || '').trim();
      return id || 'main';
    },
    chatWithPet: xhsChat.chatWithPet,
    cancelVoice: xhsChat.cancelVoice,
    // 主播下播自动停听：宿主侧补一次 state 回写，状态卡/右键菜单读的是这份快照。
    onEnded: (status) => {
      try {
        state.writeSection('xhs-danmaku', status);
      } catch (e) {
        log.warn?.(`[blue-fish] write xhs-danmaku state failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

  const ksChat = createDanmakuChat();
  const kuaishouDanmaku = createKsMonitor({
    log,
    resolvePetId: () => {
      const id = String(resolveActivePetId() || '').trim();
      return id || 'main';
    },
    chatWithPet: ksChat.chatWithPet,
    cancelVoice: ksChat.cancelVoice,
    // 主播下播自动停听：宿主侧补一次 state 回写，状态卡/右键菜单读的是这份快照。
    onEnded: (status) => {
      try {
        state.writeSection('ks-danmaku', status);
      } catch (e) {
        log.warn?.(`[blue-fish] write ks-danmaku state failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

  const biliChat = createDanmakuChat();
  const bilibiliDanmaku = createBiliMonitor({
    log,
    resolvePetId: () => {
      const id = String(resolveActivePetId() || '').trim();
      return id || 'main';
    },
    chatWithPet: biliChat.chatWithPet,
    cancelVoice: biliChat.cancelVoice,
    // 主播下播自动停听：宿主侧补一次 state 回写，状态卡/右键菜单读的是这份快照。
    onEnded: (status) => {
      try {
        state.writeSection('bili-danmaku', status);
      } catch (e) {
        log.warn?.(`[blue-fish] write bili-danmaku state failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  });

  const deps: PetRouteDeps = {
    ...setup,
    ...petLookup,
    ...workStatusBridge,
    ...chatMemory,
    ...balancePoll,
    ...desktopHelper,
    ...sessionNotify,
    ctx,
    todos,
    animLoop,
    douyinDanmaku,
    xiaohongshuDanmaku,
    kuaishouDanmaku,
    bilibiliDanmaku,
    // 语音合成：缓存落 userRoot；引擎 / Key / 模型每次现读成品 main（保存后立刻生效）
    voice: createVoiceService({
      userRoot,
      log,
      readRuntime: () => voiceRuntimeFromMain(readAllConfig(configPaths).main),
    }),
    // 语音识别：能力来自宿主（DSH 的 speechToText），没启用时服务自己在调用时回 unsupported
    speech: createHearService({ speechToText: () => setup.optionalService('speechToText') }),
  };
  const httpRoute = createHttpRoute(deps);
  registerHttpRoute(ctx, httpRoute.handlePetRoute);

  registerSessionWatch({
    ctx,
    cancelTerminalCleanup,
    lastTodoText,
    lastReplyText,
    notifyActivityTimers,
    publishWorkStatus,
    pushNotifyFrame,
    scheduleCompletionNotify,
    scheduleTerminalCleanup,
    terminalTimers,
    toolsInFlight,
    turnFlags,
    workStatus,
  });

  registerBalanceCommand({ ctx, effectivePetList, refreshBalance, sleep, sleepRefusalText });

  registerLoops({
    ctx,
    balancePeriodSec,
    configPaths,
    lastWhisperAt,
    lock,
    log,
    publishWhisper,
    publishSleepTalk,
    refreshBalance,
    sleep,
    standaloneAiPolicy,
    whisperPeriodSec,
  });

  registerPetCommand({ ctx, effectivePetList, petDisplayName, resolveActivePetId, setActivePetId });

  registerChatCommand({ ctx, chatWithPet, log, publishWhisper, resolveActivePetId, sleep, sleepRefusalText });

  // 待办提醒：随插件生命周期起停；锁被第三方持有时由 pickReminderSpeaker 跳过该宠物。
  // 播报开关现读现用：改配置后下一次提醒即生效，不必重启。
  registerTodoReminders({
    ctx,
    effectivePetList,
    isVoiceTodoEnabled: () => readAllConfig(configPaths).main?.voiceTodoEnabled === true,
    lock,
    log,
    sleep,
    state,
    todos,
    waiterCount: () => state.waiterCount(),
  });

  registerLifecycle({
    ctx,
    lock,
    markDisposed,
    playback,
    voiceUtterances,
    state,
    stopDownloadSlotTimer,
    stopHelper,
    stopWorkStatusFlush,
    stop: () => {
      kuaishouDanmaku.stop();
      xiaohongshuDanmaku.stop();
      bilibiliDanmaku.stop();
      return douyinDanmaku.stop();
    },
  });

  // 路由就绪后拉起桌面 Helper（Electron 缺失时仅告警，不影响 DSH 与浏览器 overlay）
  startHelper();

  // 为所有显示在桌面的宠物启动自播链：宿主先写一个初始自播 anim，
  // 渲染端加载后消费这个叶子开始播；播完 POST /anim/next 继续循环。
  // 异步启动（下一拍）：startHelper 是同步返回的，Helper 的子进程可能还没起来，
  // 但这不影响——anim 叶子写进 S 后，Helper 的长轮询一拍就能拿到。
  try {
    const allCfg = readAllConfig(configPaths);
    // allCfg.pets 是扁平数组（flattenConfigPets），过滤 display 包含桌面语义的
    for (const pet of Object.values(allCfg)) {
      if (!pet || typeof pet !== 'object') continue;
      const display = String((pet as { display?: unknown }).display ?? '');
      // display 含 'desktop' 或 'all'（兼容两种口径）→ 启动自播链
      if (display === 'none') continue;
      const petId = String((pet as { id?: unknown }).id ?? '').trim();
      if (!petId) continue;
      animLoop.start(petId);
    }
  } catch (e) {
    log.warn?.(`[blue-fish] 自播链启动失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}
