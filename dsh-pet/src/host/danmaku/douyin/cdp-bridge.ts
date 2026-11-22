/**
 * 抖音 CDP 旁听桥的宿主侧接缝。
 *
 * 同进程应用模式下，Helper 在 globalThis 上挂控制器（见 runtime/electron-helper/main/douyin-cdp.js）。
 * 其它运行形态暂未接入回传通道，返回 undefined；monitor 会明确拒绝启动而不尝试后端直连。
 * @module dsh-pet/src/host/danmaku/douyin/cdp-bridge
 */

/** 一条入站弹幕帧（CDP 已 base64 解码，未 protobuf 解码）。 */
export type DouyinCdpFrame = Uint8Array;

/** Helper 侧 CDP 桥控制器形状（与 douyin-cdp.js 返回值对齐）。 */
export type DouyinCdpBridge = {
  /** 开窗加载直播间并开始旁听；有 Cookie 则先注入分区。 */
  start(input: { url: string; cookie?: string }): Promise<void>;
  /** 摘 debugger、销毁内嵌窗、清轮询。 */
  stop(): void;
  /** 显示内嵌窗（扫码登录用）。 */
  show(): void;
  /** 隐藏内嵌窗并暂停页面播放。 */
  hide(): void;
  /** 旁听状态快照。 */
  status(): {
    running: boolean;
    visible: boolean;
    url: string;
    loggedIn: boolean;
    lastError: string;
    title: string;
    anchor: string;
  };
  /** 订阅入站帧；返回取消订阅函数。 */
  onFrame(fn: (frame: DouyinCdpFrame) => void): () => void;
  /** 订阅「检测到登录态」事件。 */
  onLogin(fn: () => void): () => void;
  /** 订阅内嵌窗被关闭（旁听中断）事件。 */
  onClosed(fn: () => void): () => void;
  /** 订阅「读到房间标题 / 主播」事件（内嵌页 RENDER_DATA）。 */
  onMeta(fn: (meta: { title: string; anchor: string }) => void): () => void;
  /** 订阅弹幕推送 WS 被关闭；只上报 `/webcast/im/push/` 连接。 */
  onWsClosed(fn: (url: string) => void): () => void;
};

/** globalThis 上挂 CDP 控制器的键（与 Helper 装配一致）。 */
export const DOUYIN_CDP_GLOBAL_KEY = '__dshPetDouyinCdp';

/** 取当前进程内的 CDP 桥控制器；不在 Electron 同进程环境时返回 undefined。 */
export function getDouyinCdpBridge(): DouyinCdpBridge | undefined {
  const g = globalThis as Record<string, unknown>;
  const v = g[DOUYIN_CDP_GLOBAL_KEY];
  if (!v || typeof v !== 'object') return undefined;
  const candidate = v as Partial<DouyinCdpBridge>;
  return typeof candidate.start === 'function' && typeof candidate.stop === 'function'
    ? (candidate as DouyinCdpBridge)
    : undefined;
}
