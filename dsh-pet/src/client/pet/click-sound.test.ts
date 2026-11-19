/**
 * 点击音效（src/client/pet/click-sound.ts）的契约测试：开关关闭时不构造不播放；
 * 打开后播放一次、节流窗口内连点只响一次；音频构造或播放失败都不外抛。
 * 开关与音量按宠物逐次传入（实例级配置），audio 与节流仍是模块级单例。
 * 用假的 Audio 与假时钟，不碰真实设备。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { playClickSound } from './click-sound.ts';

/** 假 Audio：记录构造与播放次数。 */
class FakeAudio {
  static constructed = 0;
  static plays = 0;
  static playedVolumes: number[] = [];
  volume = 0;
  currentTime = 0;

  constructor() {
    FakeAudio.constructed += 1;
  }

  play(): Promise<void> {
    FakeAudio.plays += 1;
    FakeAudio.playedVolumes.push(this.volume);
    return Promise.resolve();
  }
}

/** 假时钟；用例直接改 `now` 推进时间。 */
interface Clock {
  now: number;
}

/** 换掉 Audio 与 Date.now，跑一段用例后还原。
 *  模块级节流时间戳跨用例残留：每个用例的起始时钟递增一大截，保证永远越过上一次播放。 */
let fakeClockBase = 10_000;
function withFakeAudio(run: (clock: Clock) => void): void {
  const previousAudio = globalThis.Audio;
  const previousNow = Date.now;
  fakeClockBase += 1_000_000;
  const clock: Clock = { now: fakeClockBase };
  FakeAudio.constructed = 0;
  FakeAudio.plays = 0;
  FakeAudio.playedVolumes = [];
  (globalThis as { Audio?: unknown }).Audio = FakeAudio;
  Date.now = () => clock.now;
  try {
    run(clock);
  } finally {
    (globalThis as { Audio?: unknown }).Audio = previousAudio;
    Date.now = previousNow;
  }
}

describe('playClickSound —— 点击音效（实例级开关与音量）', () => {
  test('开关关闭或缺失：不构造、不播放', () => {
    withFakeAudio(() => {
      playClickSound(false);
      playClickSound(undefined as unknown as boolean);
      assert.equal(FakeAudio.constructed, 0);
      assert.equal(FakeAudio.plays, 0);
    });
  });

  test('开关打开：播放一次，节流窗口内连点只响一次，audio 实例复用', () => {
    withFakeAudio((clock) => {
      playClickSound(true);
      assert.equal(FakeAudio.plays, 1, '第一次要响');
      clock.now += 50;
      playClickSound(true);
      assert.equal(FakeAudio.plays, 1, '节流窗口内连点不重复响');
      clock.now += 200;
      playClickSound(true);
      assert.equal(FakeAudio.plays, 2, '超过节流窗口后恢复');
      assert.equal(FakeAudio.constructed, 1, 'audio 实例复用，不重复构造');
    });
  });

  test('节流跨宠物共享：另一只开着音效的宠物在窗口内也不叠音', () => {
    withFakeAudio((clock) => {
      playClickSound(true);
      clock.now += 50;
      playClickSound(true); // 另一只宠物（不同实例、同一模块单例）
      assert.equal(FakeAudio.plays, 1);
    });
  });

  test('音量按传入值生效：缺省 0.5，配置值原样生效，越界截断到 0–1', () => {
    withFakeAudio((clock) => {
      playClickSound(true);
      assert.equal(FakeAudio.playedVolumes[0], 0.5, '未传音量时回退缺省 0.5');
      clock.now += 200;
      playClickSound(true, 0.2);
      assert.equal(FakeAudio.playedVolumes[1], 0.2, '配置音量原样生效');
      clock.now += 200;
      playClickSound(true, 9);
      assert.equal(FakeAudio.playedVolumes[2], 1, '超过 1 截断到 1');
    });
  });

  test('音频不可用：不抛（没有声音不该变成报错）', () => {
    const previousAudio = globalThis.Audio;
    const previousNow = Date.now;
    // 时钟拨到远超前面所有用例的节流时间戳，确保这次真的走到音频构造。
    const clock: Clock = { now: 100_000_000 };
    (globalThis as { Audio?: unknown }).Audio = class {
      volume = 0;
      currentTime = 0;

      play(): Promise<void> {
        throw new Error('设备不可用');
      }
    };
    Date.now = () => clock.now;
    try {
      assert.doesNotThrow(() => playClickSound(true));
    } finally {
      (globalThis as { Audio?: unknown }).Audio = previousAudio;
      Date.now = previousNow;
    }
  });
});
