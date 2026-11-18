/**
 * Windows 遮挡检测开关的源码守卫。
 *
 * 背景：别的窗口拖过来盖住桌宠窗（或桌宠置顶窗盖住被拖动的本应用窗口）时，Chromium 的
 * CalculateNativeWinOcclusion 逐帧改判遮挡状态，合成器随之挂起/恢复；本进程是软件合成的
 * 分层窗，恢复帧的 layered 位图被贴到错误位置——整窗内容瞬移到屏幕左下角再弹回，反复覆盖反复闪。
 * 关掉该特性后覆盖不再触发挂起（VS Code 同类问题同法修复，microsoft/vscode#116615）。
 *
 * 钉两件事：① win32 分支必须带上 CalculateNativeWinOcclusion（音频的 AudioServiceOutOfProcess
 * 不得被挤掉）；② disable-features 全文件只许 appendSwitch 一次——Chromium 对重复开关只取最后
 * 一个值，拆成两条写会让先写的那条静默失效。
 *
 * 用 Node 内置 test runner（node:test），不引入任何 npm 依赖。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const main = readFileSync(
  fileURLToPath(new URL('../../runtime/electron-helper/main.js', import.meta.url)),
  'utf8',
);

describe('win32 遮挡检测开关', () => {
  test('disable-features 必须合并成一条，且同时包含音频与遮挡两个特性', () => {
    const calls = main.match(/appendSwitch\('disable-features',\s*'([^']+)'\)/g) ?? [];
    assert.equal(calls.length, 1, 'disable-features 只许一条（重复 appendSwitch 只有最后一个生效）');
    const value = /appendSwitch\('disable-features',\s*'([^']+)'\)/.exec(main)?.[1] ?? '';
    const features = value.split(',').map((s) => s.trim());
    assert.ok(features.includes('AudioServiceOutOfProcess'), '音频进程内合成不得被挤掉');
    assert.ok(features.includes('CalculateNativeWinOcclusion'), '遮挡检测必须关闭（覆盖闪烁的根因）');
  });

  test('开关必须在 win32 分支内、ready 之前（模块顶层）', () => {
    const at = main.indexOf("appendSwitch('disable-features'");
    assert.ok(at > 0, '找不到开关');
    assert.ok(at < main.indexOf('app.whenReady()'), '必须在 whenReady 之前加，之后再加不生效');
    const before = main.slice(0, at);
    const lastIf = before.lastIndexOf("if (process.platform === 'win32')");
    assert.ok(lastIf > 0 && before.indexOf('app.whenReady()', lastIf) < 0, '开关必须落在 win32 分支里');
  });
});