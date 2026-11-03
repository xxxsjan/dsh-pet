'use strict';
/**
 * Windows 扩展样式：对齐蓝色大肥鱼的「窗口模式」——保持透明分层，只改任务栏可枚举性。
 *
 * OBS / WGC 需要能枚举到普通顶层窗：去掉 WS_EX_TOOLWINDOW，并保证有 WS_EX_APPWINDOW。
 * 不引入 ffi 依赖：用一次性 PowerShell Add-Type 调 user32（仅在切换到捕获模式时调用）。
 * @module dsh-pet/runtime/electron-helper/main/win32-exstyle
 */
const { execFileSync } = require('node:child_process');

const GWL_EXSTYLE = -20;
const WS_EX_APPWINDOW = 0x00040000;
const WS_EX_TOOLWINDOW = 0x00000080;

/**
 * 读 HWND（BigUint64），对 32 位 Electron 仍可读前 4 字节为小端。
 * @param {Buffer} handleBuf - BrowserWindow.getNativeWindowHandle()
 * @returns {string} 十进制 HWND 字符串
 */
function hwndDecimal(handleBuf) {
  if (!handleBuf || handleBuf.length < 4) return '0';
  if (handleBuf.length >= 8) return handleBuf.readBigUInt64LE(0).toString();
  return handleBuf.readUInt32LE(0).toString();
}

/**
 * 捕获模式：清 TOOLWINDOW、置 APPWINDOW（仍保持 LAYERED / NOACTIVATE 等既有位）。
 * 普通模式：不主动改样式，交给 Electron 的 skipTaskbar 路径。
 *
 * @param {import('electron').BrowserWindow} win
 * @param {boolean} captureListed - true = OBS 可枚举
 */
function applyLiveCaptureExStyle(win, captureListed) {
  if (process.platform !== 'win32' || !win || win.isDestroyed() || !captureListed) return;
  let hwnd;
  try {
    hwnd = hwndDecimal(win.getNativeWindowHandle());
  } catch {
    return;
  }
  if (!hwnd || hwnd === '0') return;
  const script = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class DshPetExStyle {
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  public static void Apply(long hwnd) {
    IntPtr h = new IntPtr(hwnd);
    int style = GetWindowLong(h, ${GWL_EXSTYLE});
    style = (style | ${WS_EX_APPWINDOW}) & ~${WS_EX_TOOLWINDOW};
    SetWindowLong(h, ${GWL_EXSTYLE}, style);
  }
}
"@
[DshPetExStyle]::Apply(${hwnd})
`;
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      timeout: 5000,
      stdio: 'ignore',
    });
  } catch (e) {
    console.error(
      '[dsh-pet-desktop-helper] win32 exstyle apply failed:',
      String(e && e.message ? e.message : e),
    );
  }
}

module.exports = { applyLiveCaptureExStyle, hwndDecimal, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW };
