/**
 * 点击穿透兜底通道的纯判定（不 require electron，可被 node:test 直接加载）。
 * 窗口默认整窗穿透，常规链路只有 Electron 的 forward 鼠标钩子一个入口，而该钩子在 Windows 上会静默失效
 * ——失效后悬浮、拖拽、点击与右键全无反应。本模块只算「该不该可交互」，主进程负责取光标并翻转窗口；
 * 坐标一律 DIP（窗口矩形与光标同单位）。
 * @module dsh-pet/runtime/electron-helper/pointer-target
 */

'use strict';

/** 宠物身体命中区（画布坐标，与 src/shared/constants.ts 的 HIT_BOX 一致；守卫测试钉住二者同步） */
const HIT_BOX = { x0: 200, y0: 50, x1: 440, y1: 335 };
/** 动画画布尺寸：高取 shared 的 CANVAS_H，宽与 sprite.js / shared 一样用字面量 640（shared 未导出宽） */
const CANVAS_H = 360;
const STAGE_W = 640;
const FEET_Y = 330;

/**
 * 窗口矩形 → 宠物身体命中区的屏幕矩形（DIP）。
 *
 * 窗口 = 宠物包围盒 + 四周余量，而余量不再四边相等（上边距按气泡最大高度加高），所以不能按
 * 「窗口宽/4」反推，否则命中区整体偏移。余量由渲染端随 setBounds 上报，缺失时回退旧口径。
 *
 * @param bounds - 窗口矩形（DIP）。
 * @param margins - 渲染端上报的窗口余量（DIP）。
 */
function spriteHitRect(bounds, margins) {
  const legacy = Math.round(bounds.width / 4);
  const ml = Number.isFinite(margins?.l) ? margins.l : legacy;
  const mt = Number.isFinite(margins?.t) ? margins.t : legacy;
  const stageW = bounds.width - ml * 2;
  const stageH = (stageW * CANVAS_H) / STAGE_W;
  const bottomPad = (stageH * (CANVAS_H - FEET_Y)) / CANVAS_H;
  return {
    left: bounds.x + ml + (HIT_BOX.x0 / STAGE_W) * stageW,
    top: bounds.y + mt + bottomPad + (HIT_BOX.y0 / CANVAS_H) * stageH,
    right: bounds.x + ml + (HIT_BOX.x1 / STAGE_W) * stageW,
    bottom: bounds.y + mt + bottomPad + (HIT_BOX.y1 / CANVAS_H) * stageH,
  };
}

/** 判定轮询间隔（ms） */
const POINTER_POLL_MS = 60;

/** 光标停在窗口余量区（非 busy）的最长保持时间（ms）：超过即恢复穿透 */
const OFF_BODY_RELEASE_MS = 400;

/**
 * body 迟滞确认拍数：穿透 → 可交互方向必须连续这么多拍「落在 body 且光标基本静止」才放行。
 * 拖别的窗口经过宠物时光标一直在动，凑不满连续静止拍数；真实悬停时光标静止，轻松满足。
 * 只数「在 body 的拍数」不够：慢速拖窗经过身体同样能凑满，分层窗口照样被反复翻转而闪烁。
 */
const BODY_CONFIRM_TICKS = 3;

/** 光标「基本静止」的相邻两拍最大位移（DIP）：超过即视为在移动（拖窗/划过），静止确认清零 */
const BODY_STILL_MAX_PX = 2;

/**
 * 相邻两拍光标是否基本静止（位移 ≤ BODY_STILL_MAX_PX）。
 * 缺上一拍点（首拍/刚恢复）按移动处理：宁可晚一拍确认，不可把移动误判成静止。
 *
 * @param prev - 上一拍光标位置（DIP），可为 null/undefined。
 * @param point - 本拍光标位置（DIP）。
 * @returns 是否静止。
 */
function pointerStill(prev, point) {
  if (!prev || !point) return false;
  if (![prev.x, prev.y, point.x, point.y].every(Number.isFinite)) return false;
  return (
    Math.abs(point.x - prev.x) <= BODY_STILL_MAX_PX &&
    Math.abs(point.y - prev.y) <= BODY_STILL_MAX_PX
  );
}

/**
 * 拖拽沉降窗（ms）：任一应用窗口 move/will-move 之后的这段时间内视为「外部拖拽进行中」。
 * 系统拖动循环里窗口每拍都发 move；中途短暂停顿（光标静止但按键仍按住）也落在沉降窗内。
 * 实测：拖控制台经过宠物时若泵在停顿拍翻转 WS_EX_TRANSPARENT，被拖窗口会瞬移一个
 * 宠物窗原点的位移（左下角闪烁）。沉降窗内一律禁止翻转，不依赖渲染端按键上报。
 */
const WINDOW_DRAG_SETTLE_MS = 500;

/**
 * 是否处于拖拽沉降窗内。lastMoveMs=0 表示从未记录到窗口移动（不抑制）。
 *
 * @param lastMoveMs - 最近一次任一应用窗口 move/will-move 的时间戳（ms）。
 * @param nowMs - 当前时间戳（ms）。
 * @param settleMs - 沉降窗长度，默认 WINDOW_DRAG_SETTLE_MS。
 * @returns 是否抑制本拍翻转。
 */
function isWindowDragSettling(lastMoveMs, nowMs, settleMs = WINDOW_DRAG_SETTLE_MS) {
  return Number(lastMoveMs) > 0 && nowMs - lastMoveMs < settleMs;
}

/**
 * 外部拖拽抑制：非 busy 期间，渲染端上报鼠标按键处于按住状态（buttons 位掩码非 0）
 * 且本窗口没有焦点——用户正在拖别的窗口（或框选）经过，几何位置翻转必须闭嘴，
 * 否则分层窗口会被反复改 WS_EX_TRANSPARENT 而闪烁。busy 永远不抑制（拖拽租约优先）。
 * dragSettling（任一应用窗口刚移动过）同样抑制：外部拖动循环持有捕获时渲染端按键
 * 上报链路是断的，静止闸门也拦不住「拖动中短暂停顿」，沉降窗补上这个缺口。
 *
 * @param state.busy - 渲染端是否正在使用本窗口的鼠标输入。
 * @param state.buttons - 渲染端上报的鼠标按键位掩码（0 = 无按键）。
 * @param state.focused - 本窗口当前是否持有焦点。
 * @param state.dragSettling - 是否处于应用窗口拖拽沉降窗内。
 * @returns 是否抑制本拍翻转。
 */
function shouldSuppressFlip(state) {
  const s = state || {};
  if (s.busy) return false;
  if (s.dragSettling) return true;
  return Number(s.buttons) > 0 && s.focused !== true;
}

/**
 * body 迟滞闸门：只拦「穿透 → 可交互」这一个方向，且只拦 body 分区。
 * 可交互 → 穿透（离开/超时）立即放行，避免窗口粘在可交互状态。
 *
 * @param ignoring - 当前是否穿透。
 * @param zone - 当前光标分区（outside/body/margin）。
 * @param consecutiveBodyTicks - 光标连续落在 body 的拍数。
 * @returns 本拍是否允许翻转。
 */
function bodyFlipConfirmed(ignoring, zone, consecutiveBodyTicks) {
  if (!ignoring) return true;
  if (zone !== 'body') return true;
  return Number(consecutiveBodyTicks) >= BODY_CONFIRM_TICKS;
}

/**
 * 光标相对窗口的分区：'outside' | 'body' | 'margin'。
 *
 * 主进程除判定外还要按分区累计余量区停留时长；分区规则只在此处维护，避免两条通道漂移。
 *
 * @param bounds - 窗口矩形（DIP）。
 * @param point - 真实光标位置（DIP）。
 * @param margins - 渲染端上报的窗口余量（DIP），见 spriteHitRect。
 * @returns 分区。
 */
function pointerZone(bounds, point, margins) {
  const inWindow =
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height;
  if (!inWindow) return 'outside';
  const r = spriteHitRect(bounds, margins);
  const inSprite = point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
  return inSprite ? 'body' : 'margin';
}

/**
 * 该不该让窗口保持穿透（setIgnoreMouseEvents 的第一个参数）。
 * busy 期间位置完全不参与：拖拽时宠物滞后于光标，位置判定会断掉正在用的 pointermove/pointerup。
 *
 * @param ignoring - 当前是否穿透（取自主进程镜像，避免与渲染端通道失步）。
 * @param busy - 渲染端是否正在使用本窗口的鼠标输入。
 * @param offBodyMs - 余量区（非 busy）的连续停留时长。
 * @param input - 渲染端上报的控件矩形与拖拽标记。
 * @param margins - 渲染端上报的窗口余量（DIP）。
 * @returns 新的穿透状态。
 */
function decideWindowIgnore(bounds, point, ignoring, busy, offBodyMs = 0, input, margins) {
  if (busy) {
    if (!input || input.dragging) return false; // 兼容旧渲染端；拖拽租约绝不被位置判定打断
    const inControl = input.rects.some(
      (r) =>
        point.x >= bounds.x + r.x &&
        point.x < bounds.x + r.x + r.width &&
        point.y >= bounds.y + r.y &&
        point.y < bounds.y + r.y + r.height,
    );
    return !inControl && pointerZone(bounds, point, margins) !== 'body';
  }
  const zone = pointerZone(bounds, point, margins);
  if (zone === 'outside') return true; // 窗外：恢复穿透
  if (zone === 'body') return false; // 宠物身上：可交互
  if (offBodyMs >= OFF_BODY_RELEASE_MS) return true; // 余量区停留超时：恢复穿透
  return ignoring; // 余量区：保持（菜单/弹窗由 busy 覆盖）
}

module.exports = {
  HIT_BOX,
  CANVAS_H,
  STAGE_W,
  FEET_Y,
  POINTER_POLL_MS,
  OFF_BODY_RELEASE_MS,
  BODY_CONFIRM_TICKS,
  BODY_STILL_MAX_PX,
  WINDOW_DRAG_SETTLE_MS,
  spriteHitRect,
  pointerZone,
  decideWindowIgnore,
  shouldSuppressFlip,
  bodyFlipConfirmed,
  pointerStill,
  isWindowDragSettling,
};
