#!/usr/bin/env node
/**
 * 本地构建：跑 tsdown → lib、共享层 → shared-core.js。
 *
 * 类型声明（npm run types）在此跳过：开发期 build 不被 gen-types 卡住；需要声明时单独跑 `npm run types`。
 * 只构建单一 webm 格式（VP9-alpha），浏览器与桌面 Helper 共用；
 * Safari/HEVC 兼容由仓库保留的流水线支持、需 fork 后自行启用。
 * 依赖 package.json 里的 bundle / build:desktop-core 与本地 node_modules。
 * @module dsh-pet/scripts/prepare
 */
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// 用 cmd /c 跑整条 npm 命令：Windows 下 npm 是 npm.cmd，spawnSync 无法直接执行 .cmd
// （命令行固定、无用户输入，没有注入风险）。
console.log('[prepare] building (tsdown)...');
const npmRun = process.platform === 'win32' ? 'cmd /c npm run bundle' : 'npm run bundle';
const build = spawnSync(npmRun, { cwd: ROOT, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  console.error(`[prepare] 构建失败 (exit ${build.status})`);
  process.exit(1);
}

// 桌面应用产物必须自带全部运行依赖（electron-builder 的 files 不带 node_modules），
// 漏配 noExternal 只会到双击启动时才报 ERR_MODULE_NOT_FOUND，所以在打包前静态拦一道。
// 细节见 check-app-deps.mjs。
console.log('[prepare] checking desktop app dependencies...');
const depCheck = spawnSync(process.execPath, [join(ROOT, 'scripts', 'check-app-deps.mjs')], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (depCheck.status !== 0) {
  console.error(`[prepare] 依赖校验失败 (exit ${depCheck.status})`);
  process.exit(1);
}

// 桌面共享核心与浏览器 bundle 取自同一份 src/shared，产出 window.PetShared（详见 build-desktop-core.mjs）。
console.log('[prepare] building desktop shared-core...');
const coreRun = process.platform === 'win32' ? 'cmd /c npm run build:desktop-core' : 'npm run build:desktop-core';
const buildCore = spawnSync(coreRun, { cwd: ROOT, stdio: 'inherit', shell: true });
if (buildCore.status !== 0) {
  console.error(`[prepare] 桌面 shared-core 构建失败 (exit ${buildCore.status})`);
  process.exit(1);
}

// 跳过类型声明：避免开发期 build 被 gen-types 拦住；需要时手动 `npm run types`。
console.log('[prepare] skip types (run `npm run types` separately if needed)');
console.log('[prepare] build complete');
