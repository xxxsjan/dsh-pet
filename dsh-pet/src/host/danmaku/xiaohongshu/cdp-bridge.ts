/**
 * 小红书中控台 CDP 旁听桥的宿主侧接缝。
 *
 * 同进程应用模式下，Helper 在 globalThis 上挂控制器（见 runtime/electron-helper/main/xhs-cdp.js）；
 * 子进程（插件 / CLI）形态的回传通道暂未接，此时返回 undefined，monitor 记为桥不可用。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/cdp-bridge
 */

/** 一条入站 WS 帧（CDP 已 base64 解码，未做业务解析）。 */
export type XhsCdpFrame = Uint8Array;

/** Helper 侧 CDP 桥控制器形状（与 xhs-cdp.js 返回值对齐）。 */
export type XhsCdpBridge = {
  /** 开窗进入中控台并开始旁听；有 Cookie 则先注入分区。 */
  start(input: { cookie?: string }): Promise<void>;
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
    loggedIn: boolean;
    lastError: string;
  };
  /** 订阅入站帧；返回取消订阅函数。 */
  onFrame(fn: (frame: XhsCdpFrame) => void): () => void;
  /** 订阅「检测到登录态」事件。 */
  onLogin(fn: () => void): () => void;
  /** 订阅内嵌窗被关闭（旁听中断）事件。 */
  onClosed(fn: () => void): () => void;
  /**
   * 探测中控台页面是否已进入「直播结束」态（true=明确下播）；
   * 旧 Helper 可能没有此方法，monitor 需先判断是否为函数。
   */
  probeEnded?: () => Promise<boolean>;
};

/** globalThis 上挂 CDP 控制器的键（与 Helper 装配一致）。 */
export const XHS_CDP_GLOBAL_KEY = '__dshPetXhsCdp';

/** 取当前进程内的 CDP 桥控制器；不在 Electron 同进程环境时返回 undefined。 */
export function getXhsCdpBridge(): XhsCdpBridge | undefined {
  const g = globalThis as Record<string, unknown>;
  const v = g[XHS_CDP_GLOBAL_KEY];
  if (!v || typeof v !== 'object') return undefined;
  const candidate = v as Partial<XhsCdpBridge>;
  return typeof candidate.start === 'function' && typeof candidate.stop === 'function'
    ? (candidate as XhsCdpBridge)
    : undefined;
}
