'use strict';
/**
 * Windows 全局鼠标按键状态：常驻 PowerShell 子进程轮询 GetAsyncKeyState，状态变化才写一行 stdout。
 *
 * 为什么需要它：外部窗口拖动循环持有捕获时，渲染端的按键上报链路是断的（forward 只转发 move），
 * 拖拽沉降窗（move/will-move + 500ms）也只能覆盖拖动与短暂停顿；按住窗口在宠物身上静止超过
 * 沉降窗后，兜底泵仍会把「光标静止」误判成「想摸宠物」而翻转 WS_EX_TRANSPARENT——哨兵实测
 * 该翻转会把被拖窗口瞬移一个宠物窗原点（左下角闪烁）。GetAsyncKeyState 是读操作，不受
 * UIPI 完整性级别限制，按住键期间恒为真，彻底封死这条触发链。
 *
 * 与 win32-exstyle 同一套路：不引入 ffi 依赖，用 PowerShell Add-Type 调 user32。
 * **绝不能 sync 调 PowerShell**（execFileSync 会堵死主进程、整机光标假死）——这里只走异步常驻。
 * 子进程自带父进程存活检查：宿主被硬杀时自行退出，不留孤儿。
 * @module dsh-pet/runtime/electron-helper/main/win32-buttons
 */

/** 子进程轮询间隔（ms）：按下→主进程感知 < 110ms，早于泵的 3 拍确认（180ms）。 */
const BUTTON_POLL_MS = 50;

/**
 * 解析子进程输出的一行按键位掩码（1=左 2=右 4=中，0=全松）。
 * 非法行（空串/非数字/越界）返回 null，调用方忽略。
 *
 * @param {string} line - stdout 的一行。
 * @returns {number|null} 0..7 的掩码，或 null。
 */
function parseButtonMask(line) {
  const text = String(line).trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > 7) return null;
  return n;
}

/**
 * 启动全局按键监视（仅 win32）。失败只打日志、返回空操作句柄——沉降窗与静止闸门仍在，
 * 监视缺席时行为退回上一版，不会更糟。
 *
 * @param deps.onButtons - 掩码变化回调（0..7）。
 * @param deps.platform - 平台判定（默认 process.platform）。
 * @param deps.spawn - child_process.spawn 注入（测试用）。
 * @param deps.pid - 宿主进程 pid（子进程存活检查用，默认 process.pid）。
 * @param deps.log - 日志器（默认 console）。
 * @returns {{ stop: () => void }}
 */
function startGlobalButtonWatch({ onButtons, platform = process.platform, spawn, pid = process.pid, log = console }) {
  const noop = { stop() {} };
  if (platform !== 'win32' || typeof onButtons !== 'function') return noop;
  const spawnFn = spawn || require('node:child_process').spawn;
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DshPetButtons {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vkey);
  public static int Mask() {
    int m = 0;
    if ((GetAsyncKeyState(0x01) & 0x8000) != 0) m |= 1;
    if ((GetAsyncKeyState(0x02) & 0x8000) != 0) m |= 2;
    if ((GetAsyncKeyState(0x04) & 0x8000) != 0) m |= 4;
    return m;
  }
}
"@
$last = -1
$tick = 0
while ($true) {
  $m = [DshPetButtons]::Mask()
  if ($m -ne $last) { [Console]::Out.WriteLine($m); $last = $m }
  $tick++
  if ($tick -ge 20) {
    $tick = 0
    if (-not (Get-Process -Id ${pid} -ErrorAction SilentlyContinue)) { exit }
  }
  Start-Sleep -Milliseconds ${BUTTON_POLL_MS}
}
`;
  let child;
  try {
    child = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    log.error('[blue-fish-desktop-helper] global button watch spawn failed:', String(e && e.message ? e.message : e));
    return noop;
  }
  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += String(chunk);
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const mask = parseButtonMask(line);
      if (mask !== null) onButtons(mask);
    }
  });
  child.stderr.on('data', (chunk) => {
    log.error('[blue-fish-desktop-helper] global button watch stderr:', String(chunk).trim());
  });
  child.on('error', (e) => {
    log.error('[blue-fish-desktop-helper] global button watch error:', String(e && e.message ? e.message : e));
  });
  child.on('exit', () => {
    // 子进程退出（含宿主先死后的自退）：按键状态归零，行为退回沉降窗兜底。
    onButtons(0);
  });
  return {
    stop() {
      try {
        child.kill();
      } catch {
        /* 已退出 */
      }
    },
  };
}

module.exports = { startGlobalButtonWatch, parseButtonMask, BUTTON_POLL_MS };