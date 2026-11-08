/**
 * 设置页三份静态资源的独立构建入口：打成 `lib/settings-shell.js`，供运行时按 mtime 热读。
 *
 * 与 `lib/app.js` / `lib/standalone.js` 解耦——开发期 `tsdown --watch` 只更新本文件时，
 * 本机服务下次请求就能拿到新 HTML/CSS/JS，不必重启 Electron。
 * @module dsh-pet/src/standalone/settings-shell
 */
import { settingsPage as settingsPageFn } from './settings-page/chrome.ts';
export { settingsScript, settingsStyle } from './settings-page.ts';

/** 开发期 shell：与生产同一份 HTML（「高级」Tab 始终露出）。 */
export const settingsPage = settingsPageFn();
