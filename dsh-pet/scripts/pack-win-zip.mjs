#!/usr/bin/env node
/**
 * 把 electron-builder 产出的 `dist-app/win-unpacked` 压成可分发 zip。
 * 外层文件名与内层目录均为：`<name>-<version>-win-x64`（name/version 来自 package.json）。
 * 打包前会弹窗询问是否升级版本号（patch 版本 +1）。
 * @module dsh-pet/scripts/pack-win-zip
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const name = typeof pkg.name === 'string' && pkg.name ? pkg.name : 'blue-fish';
const currentVersion = typeof pkg.version === 'string' && pkg.version ? pkg.version : '0.0.0';

// 计算下一个 patch 版本号
const [major, minor, patch] = currentVersion.split('.').map(Number);
const nextVersion = `${major}.${minor}.${patch + 1}`;

// 弹窗询问是否升级版本号（PowerShell）
const psConfirm = `
Add-Type -AssemblyName System.Windows.Forms
$result = [System.Windows.Forms.MessageBox]::Show(
  "当前版本号: ${currentVersion}\n\n是否升级到 ${nextVersion}？\n\n点击"取消"保持当前版本号不变。",
  "打包确认",
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Question
)
if ($result -eq [System.Windows.Forms.DialogResult]::Yes) { exit 0 } else { exit 1 }
`;
const psResult = spawnSync('powershell.exe', ['-NoProfile', '-Command', psConfirm], {
  stdio: 'ignore',
});
const shouldUpgrade = psResult.status === 0;
const version = shouldUpgrade ? nextVersion : currentVersion;

// 如果升级了，更新 package.json
if (shouldUpgrade) {
  pkg.version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[pack:win] 版本号已升级到 ${version}`);
} else {
  console.log(`[pack:win] 保持版本号 ${version}`);
}

const unpacked = join(root, 'dist-app', 'win-unpacked');
const inner = `${name}-${version}-win-x64`;
const zipPath = join(root, 'dist-app', `${inner}.zip`);

if (!existsSync(unpacked)) {
  console.error(
    `[pack:win] 找不到 ${unpacked}。先跑 \`npm run dist\` 再压缩。`,
  );
  process.exit(1);
}

const stageRoot = join(tmpdir(), `blue-fish-pack-win-${process.pid}`);
const stageInner = join(stageRoot, inner);

try {
  rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stageInner, { recursive: true });
  cpSync(unpacked, stageInner, { recursive: true });

  if (existsSync(zipPath)) rmSync(zipPath);

  const seven = spawnSync('7z', ['a', '-tzip', '-mx=5', zipPath, inner], {
    cwd: stageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (seven.error || seven.status !== 0) {
    if (process.platform === 'win32') {
      // Compress-Archive 吃的是容器目录本身，解压后得到 inner/
      const ps = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          `Compress-Archive -Path '${stageInner.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -CompressionLevel Optimal -Force`,
        ],
        { stdio: 'inherit' },
      );
      if (ps.status !== 0) {
        console.error('[pack:win] 压缩失败（7z 与 Compress-Archive 都不可用/失败）。');
        process.exit(ps.status ?? 1);
      }
    } else {
      // 非 Windows：用系统 python3 zipfile（与仓库其它 workflow 一致）
      const py = join(stageRoot, '_zip.py');
      writeFileSync(
        py,
        [
          'import sys, zipfile, os',
          'zp, root, inner = sys.argv[1], sys.argv[2], sys.argv[3]',
          'with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:',
          '  base = os.path.join(root, inner)',
          '  for dirpath, _, files in os.walk(base):',
          '    for f in files:',
          '      full = os.path.join(dirpath, f)',
          '      z.write(full, os.path.relpath(full, root))',
        ].join('\n'),
        'utf8',
      );
      const r = spawnSync('python3', [py, zipPath, stageRoot, inner], { stdio: 'inherit' });
      if (r.status !== 0) {
        console.error('[pack:win] 压缩失败（需要 7z 或 python3）。');
        process.exit(r.status ?? 1);
      }
    }
  }

  const mb = statSync(zipPath).size / (1024 * 1024);
  console.log(`[pack:win] ${zipPath}（${mb.toFixed(1)} MB）`);
  console.log(`[pack:win] 解压后目录：${inner}/`);
  if (mb < 50) {
    console.warn('[pack:win] 体积异常偏小，请确认 win-unpacked 是否完整。');
  }
} finally {
  rmSync(stageRoot, { recursive: true, force: true });
}
