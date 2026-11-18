/**
 * 全局鼠标按键监视（win32-buttons）的判定与接线守卫。
 *
 * 背景：外部窗口拖动循环持有捕获时渲染端按键上报断链，拖拽沉降窗只覆盖 500ms；
 * 按住窗口在宠物身上静止超过沉降窗后，兜底泵翻转 WS_EX_TRANSPARENT 会把被拖窗口
 * 瞬移一个宠物窗原点（哨兵实测的左下角闪烁）。GetAsyncKeyState 全局按键状态封死该缺口。
 *
 * 钉住三件事：① 掩码解析纯函数；② 异步常驻子进程（绝不 sync 调 PowerShell）；
 * ③ 接线：泵合并全局按键、装配根启动/退出停止。
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

const require = createRequire(import.meta.url);
const helper = '../../runtime/electron-helper/';
const { startGlobalButtonWatch, parseButtonMask, BUTTON_POLL_MS } = require(helper + 'main/win32-buttons.js');
const { BODY_CONFIRM_TICKS, POINTER_POLL_MS } = require(helper + 'pointer-target.js');

const readSource = (rel: string): string => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** 假子进程：stdout/stderr 是 EventEmitter，kill 记录调用。 */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };
  return child;
}

describe('parseButtonMask —— 子进程输出解析', () => {
  test('合法掩码 0..7（含前后空白/回车）', () => {
    assert.equal(parseButtonMask('0'), 0);
    assert.equal(parseButtonMask('1'), 1);
    assert.equal(parseButtonMask('7\r'), 7);
    assert.equal(parseButtonMask(' 3 '), 3);
  });
  test('非法行一律 null（空串/非数字/越界/小数）', () => {
    assert.equal(parseButtonMask(''), null);
    assert.equal(parseButtonMask('abc'), null);
    assert.equal(parseButtonMask('8'), null);
    assert.equal(parseButtonMask('-1'), null);
    assert.equal(parseButtonMask('1.5'), null);
  });
});

describe('startGlobalButtonWatch —— 异步常驻与容错', () => {
  test('非 win32 不启动子进程，返回空操作句柄', () => {
    let spawned = 0;
    const watch = startGlobalButtonWatch({
      onButtons: () => {},
      platform: 'linux',
      spawn: () => {
        spawned++;
        return fakeChild();
      },
    });
    assert.equal(spawned, 0);
    watch.stop();
  });
  test('stdout 按行解析（含跨 chunk 断行），掩码变化才回调', () => {
    const child = fakeChild();
    const seen: number[] = [];
    const watch = startGlobalButtonWatch({
      onButtons: (m: number) => seen.push(m),
      platform: 'win32',
      spawn: () => child,
    });
    child.stdout.emit('data', '1\n');
    child.stdout.emit('data', '0\r\n3');
    child.stdout.emit('data', '\n');
    assert.deepEqual(seen, [1, 0, 3]);
    watch.stop();
    assert.equal(child.killed, true);
  });
  test('子进程退出 → 按键归零（退回沉降窗兜底）', () => {
    const child = fakeChild();
    const seen: number[] = [];
    startGlobalButtonWatch({ onButtons: (m: number) => seen.push(m), platform: 'win32', spawn: () => child });
    child.emit('exit');
    assert.deepEqual(seen, [0]);
  });
  test('spawn 抛异常不炸主进程，返回空操作句柄', () => {
    const watch = startGlobalButtonWatch({
      onButtons: () => {},
      platform: 'win32',
      spawn: () => {
        throw new Error('no powershell');
      },
      log: { error: () => {} },
    });
    watch.stop();
  });
  test('轮询间隔早于泵的确认窗（按下→感知 < 3 拍确认）', () => {
    assert.ok(BUTTON_POLL_MS + POINTER_POLL_MS < BODY_CONFIRM_TICKS * POINTER_POLL_MS);
  });
});

describe('源码守卫 —— 全局按键链路必须接线且异步', () => {
  const buttons = readSource(helper + 'main/win32-buttons.js');
  const windows = readSource(helper + 'main/windows.js');
  const main = readSource(helper + 'main.js');

  test('win32-buttons 用 GetAsyncKeyState，且绝不 sync 调 PowerShell', () => {
    assert.ok(/GetAsyncKeyState/.test(buttons), '必须读全局按键状态');
    assert.ok(!/execFileSync\(|spawnSync\(/.test(buttons), 'sync 调 PowerShell 会堵死主进程（整机光标假死）');
    assert.ok(/spawnFn\('powershell\.exe'/.test(buttons), '必须异步 spawn 常驻子进程');
    assert.ok(/Get-Process -Id/.test(buttons), '子进程必须检查宿主存活，宿主被硬杀时自退不留孤儿');
  });
  test('泵把全局按键与渲染端按键合并进抑制判定', () => {
    assert.ok(/let globalButtons = 0/.test(windows), '必须有全局按键状态');
    assert.ok(/setGlobalButtons: \(mask\)/.test(windows), '必须暴露 setter 给装配根');
    const poll = /setInterval\(\(\) => \{([\s\S]*?)\}, POINTER_POLL_MS\);/.exec(windows);
    assert.ok(poll, '找不到兜底轮询体');
    assert.ok(
      /buttons: Math\.max\(pointerButtons\.get\(win\.id\) \?\? 0, globalButtons\)/.test(poll[1]),
      '两条按键来源取并集（渲染端断链时全局兜底）',
    );
  });
  test('装配根启动监视并在退出前停止', () => {
    assert.ok(/require\('\.\/main\/win32-buttons\.js'\)/.test(main), '必须引入模块');
    assert.ok(/onButtons: petWindows\.setGlobalButtons/.test(main), '掩码必须接进 windows 模块');
    assert.ok(/globalButtonWatch\.stop\(\)/.test(main), 'before-quit 必须停子进程');
  });
});