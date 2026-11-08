/**
 * 设置页三份静态资源的独立构建入口：打成 `lib/settings-shell.js`，供运行时按 mtime 热读。
 *
 * 与 `lib/app.js` / `lib/standalone.js` 解耦——开发期 `tsdown --watch` 只更新本文件时，
 * 本机服务下次请求就能拿到新 HTML/CSS/JS，不必重启 Electron。
 * 开发期始终露出「高级」Tab（配置文件路径、同步按钮等），生产环境由 ./settings-page 的回落版本隐藏。
 * @module dsh-pet/src/standalone/settings-shell
 */
import { settingsPage as settingsPageFn } from './settings-page/chrome.ts';
export { settingsScript, settingsStyle } from './settings-page.ts';

/** 开发期 shell：露出「高级」Tab。 */
export const settingsPage = settingsPageFn(true);
