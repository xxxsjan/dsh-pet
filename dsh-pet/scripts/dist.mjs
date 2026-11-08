#!/usr/bin/env node
/**
 * 打包双击可运行的桌宠应用，是 electron-builder 的薄封装，产物只有「解包目录」一种形态。
 * 只出解包目录：portable 是 NSIS 自解压壳，每次启动都要把整个应用目录解压到 %TEMP%，对 Electron 体量得不偿失；
 * nsis 安装包对自用与绿色分发没有增量价值，故不提供。
 * 不下载 Electron：默认只认本机已解压目录，找不到就明确失败，避免本地开发被静默拉走一百多兆；
 * 只有设了 BLUE_FISH_ALLOW_ELECTRON_DOWNLOAD=1 才交回 electron-builder 自行下载（CI 用）。
 * 打包二进制统一走 npmmirror 镜像，因为本机 github.com 不通。
 * 版本号在构建前定死：控制台询问是否递增 patch，递增则先写 package.json 再构建，
 * 构建失败滚回递增前；package.json 在 files 白名单里会进 asar，构建后再改包内仍是旧号。
 * 打包成功后链式调用 pack-win-zip.mjs 压出分发 zip；压缩失败即整体失败。
 * @module dsh-pet/scripts/dist
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** Electron 可执行文件相对解压目录的路径（按平台）。 */
const ELECTRON_REL =
  process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
      : 'electron';

/**
 * 控制台同步提问（PowerShell Read-Host）：stdin 透传终端，stdout 捕获答案。
 * @returns 去掉 BOM 与首尾空白后的输入。
 */
function ask(question) {
  const prompt = String(question).replace(/'/g, "''");
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', `$v = Read-Host -Prompt '${prompt}'; Write-Output $v`],
    { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], windowsHide: false },
  );
  if (result.error || result.status) {
    console.error('[dist] 无法读取输入');
    process.exit(result.status || 1);
  }
  return String(result.stdout || '').replace(/^\uFEFF/, '').trim();
}

/** patch 段 +1；末段非数字时按 1 处理。 */
function bumpPatch(version) {
  const parts = String(version || '0.0.0').trim().split('.');
  const n = Number(parts[parts.length - 1]);
  parts[parts.length - 1] = String(Number.isFinite(n) ? n + 1 : 1);
  return parts.join('.');
}

/**
 * 解析本机 Electron 解压目录，一个字节都不下载。
 *
 * 候选依次是 BLUE_FISH_ELECTRON_DIST、BLUE_FISH_ELECTRON_PATH 所在目录、$DSH_HOME/electron；
 * 本机都没有时：开了允许下载就返回 undefined（不传 electronDist），否则直接退出进程。
 *
 * @returns 解压目录，或 undefined（交给 electron-builder 下载）。
 */
function resolveElectronDist() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.blue-fish');
  const candidates = [
    process.env.BLUE_FISH_ELECTRON_DIST,
    process.env.BLUE_FISH_ELECTRON_PATH ? dirname(process.env.BLUE_FISH_ELECTRON_PATH) : undefined,
    join(dshHome, 'electron'),
  ].filter((value) => Boolean(value));
  for (const dir of candidates) {
    if (existsSync(join(dir, ELECTRON_REL))) return dir;
  }
  if (process.env.BLUE_FISH_ALLOW_ELECTRON_DOWNLOAD === '1') {
    console.warn('[dist] 本机没有 Electron 解压目录，交给 electron-builder 下载（CI 模式）。');
    return undefined;
  }
  console.error(
    '[dist] 找不到本机 Electron 解压目录。先跑 `npm run ensure:electron`，' +
      '或设置 BLUE_FISH_ELECTRON_DIST 指向解压目录。',
  );
  process.exit(1);
}

const target = process.argv[2] ?? 'dir';
if (target !== 'dir') {
  console.error(`[dist] 未知目标：${target}（只出解包目录，直接运行 node scripts/dist.mjs）`);
  process.exit(2);
}

const electronDist = resolveElectronDist();
/** mirror 默认 npmmirror：本机 github.com 不通；CI 上可用环境变量覆盖成官方源 */
const env = {
  ...process.env,
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  // 不自动发现代码签名身份：本机没有证书，跳过签名探测，免得打包末尾才失败
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
};
// 有本地解压目录时才禁止 Electron 下载；CI 的回退路径反过来必须允许下载
if (electronDist) {
  env.BLUE_FISH_ELECTRON_DIST = electronDist;
  env.ELECTRON_SKIP_BINARY_DOWNLOAD = '1';
} else {
  delete env.BLUE_FISH_ELECTRON_DIST;
  delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
}

console.log(`[dist] electron dist: ${electronDist ?? '(无 → 由 electron-builder 下载)'}`);
console.log(`[dist] target:        win:${target}`);

// 版本询问放在 Electron 解析之后、构建之前：Electron 缺失时先失败，不留半吊子的版本写入；
// 递增则在构建前写入，保证 asar 里的 package.json 就是新版本。
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const prevVersion = typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0';
const nextVersion = bumpPatch(prevVersion);
const bump = /^y(es)?$/i.test(ask(`[dist] 当前版本 ${prevVersion}，是否递增为 ${nextVersion}？(y/N) `));
const version = bump ? nextVersion : prevVersion;

/** 把版本写进 package.json（两空格缩进 + 末尾换行，与仓库现状一致）。 */
function writeVersion(ver) {
  pkg.version = ver;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

if (bump) {
  writeVersion(version);
  console.log(`[dist] 已写入版本 ${version}（包内将内嵌该版本号）`);
} else {
  console.log(`[dist] 保持版本 ${version}`);
}
// 直接调用 electron-builder 的 CLI 文件而不经 `pnpm exec`：安装路径可能含单引号，
// 走 shell 传参会被切碎；node 直接 spawn 没有这层转义问题。
const cli = join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const args = [cli, '--win', target];
if (electronDist) args.push(`--config.electronDist=${electronDist}`);
const child = spawn(process.execPath, args, {
  cwd: root,
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => {
  if (code !== 0) {
    if (bump) {
      writeVersion(prevVersion);
      console.error(`[dist] 构建失败，已回滚版本 ${version} -> ${prevVersion}`);
    }
    process.exit(code ?? 1);
  }
  const pack = spawn(process.execPath, [join(here, 'pack-win-zip.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
  pack.on('exit', (packCode) => process.exit(packCode ?? 0));
});
