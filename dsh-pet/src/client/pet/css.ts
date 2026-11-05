/**
 * 宠物页面的内联样式与注入：只有伪类、过渡、指针手势与光标这类行内 style 表达不了的东西。
 * 菜单与悬浮提示的样式与桌面端共用同一份（`shared/menu`、`shared/tooltip`），不在这里抄第二份。
 * 注入按 `data-plugin-css` 去重：同一页面重复挂载不会长第二份样式。
 * @module dsh-pet/src/client/pet/css
 */
import { ROUTE_PATH } from '../../shared/constants.ts';
import { MENU_CSS } from '../../shared/menu.ts';
import { TOOLTIP_CSS } from '../../shared/tooltip.ts';

/** 宠物页面样式表。 */
const PET_CSS = [
  '.blue-fish-root{position:fixed;z-index:40;pointer-events:none;user-select:none}',
  '.blue-fish-root[data-corner="bottom-right"]{right:var(--blue-fish-mx,24px);bottom:var(--blue-fish-my,0)}',
  '.blue-fish-root[data-corner="bottom-left"]{left:var(--blue-fish-mx,24px);bottom:var(--blue-fish-my,0)}',
  '.blue-fish-root[data-corner="top-right"]{right:var(--blue-fish-mx,24px);top:var(--blue-fish-my,0)}',
  '.blue-fish-root[data-corner="top-left"]{left:var(--blue-fish-mx,24px);top:var(--blue-fish-my,0)}',
  '.blue-fish-stage{position:relative;width:var(--blue-fish-size,462px);height:calc(var(--blue-fish-size,462px)*9/16);pointer-events:none}',
  '.blue-fish-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:0;transition:opacity .18s ease;transform-origin:center}',
  '.blue-fish-video.is-front{opacity:1}',
  // 触屏拖拽必需：缺 touch-action:none 时浏览器会把手势判成滚动并触发 pointercancel；
  // 两条 -webkit-* 抑制长按选中与 iOS 长按系统菜单。
  `.blue-fish-hit{position:absolute;pointer-events:auto;cursor:url("${ROUTE_PATH}/pic/cursor-grab.png") 16 16, grab;z-index:1;touch-action:none;-webkit-user-select:none;-webkit-touch-callout:none}`,
  `.blue-fish-hit.dragging{cursor:url("${ROUTE_PATH}/pic/cursor-grabbing.png") 16 16, grabbing}`,
  '@media (prefers-reduced-motion: reduce){.blue-fish-video{transition:none}}',
  // 统一右键菜单样式，与桌面注入同一份。
  MENU_CSS,
  // 悬浮提示样式，与桌面注入同一份。
  TOOLTIP_CSS,
].join('\n');

/** 注入去重用的标记值，写在 `<style>` 的 `data-plugin-css` 上。 */
const cssTag = 'blue-fish/style.css';

/** 注入宠物页面样式，每页只注入一次；没有 document 时静默返回。 */
export function injectPetCss(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector('style[data-plugin-css="' + cssTag + '"]') !== null) return;
  const tag = document.createElement('style');
  tag.dataset.plugin = 'blue-fish';
  tag.dataset.pluginCss = cssTag;
  tag.textContent = PET_CSS;
  document.head.appendChild(tag);
}
