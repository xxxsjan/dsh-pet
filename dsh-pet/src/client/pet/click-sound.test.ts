/**
 * 点击音效（src/client/pet/click-sound.ts）的契约测试：开关关闭时不构造不播放；
 * 打开后播放一次、节流窗口内连点只响一次；音频构造或播放失败都不外抛。
 * 用假的 Audio 与假时钟，不碰真实设备。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { playClickSound, setClickSoundEnabled } from './click-sound.ts';

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

/** 换掉 Audio 与 Date.now，跑一段用例后还原（包括把开关关回去）。 */
function withFakeAudio(run: (clock: Clock) => void): void {
  const previousAudio = globalThis.Audio;
  const previousNow = Date.now;
  const clock: Clock = { now: 10_000 };
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
    setClickSoundEnabled(false);
  }
}

describe('playClickSound —— 点击音效', () => {
  test('开关关闭：不构造、不播放', () => {
    withFakeAudio(() => {
      setClickSoundEnabled(false);
      playClickSound();
      assert.equal(FakeAudio.constructed, 0);
      assert.equal(FakeAudio.plays, 0);
    });
  });

  test('开关打开：播放一次，节流窗口内连点只响一次，audio 实例复用', () => {
    withFakeAudio((clock) => {
      setClickSoundEnabled(true);
      playClickSound();
      assert.equal(FakeAudio.plays, 1, '第一次要响');
      clock.now += 50;
      playClickSound();
      assert.equal(FakeAudio.plays, 1, '节流窗口内连点不重复响');
      clock.now += 200;
      playClickSound();
      assert.equal(FakeAudio.plays, 2, '超过节流窗口后恢复');
      assert.equal(FakeAudio.constructed, 1, 'audio 实例复用，不重复构造');
    });
  });

  test('音量走配置：缺省 0.5，配置值原样生效，越界截断到 0–1', () => {
    withFakeAudio((clock) => {
      // 模块级节流时间戳跨用例残留：先拨快时钟越过上一次播放的节流窗口
      clock.now += 1000;
      setClickSoundEnabled(true);
      playClickSound();
      assert.equal(FakeAudio.playedVolumes[0], 0.5, '未传音量时回退缺省 0.5');
      clock.now += 200;
      setClickSoundEnabled(true, 0.2);
      playClickSound();
      assert.equal(FakeAudio.playedVolumes[1], 0.2, '配置音量原样生效');
      clock.now += 200;
      setClickSoundEnabled(true, 9);
      playClickSound();
      assert.equal(FakeAudio.playedVolumes[2], 1, '超过 1 截断到 1');
    });
  });

  test('音频不可用：不抛（没有声音不该变成报错）', () => {
    const previousAudio = globalThis.Audio;
    const previousNow = Date.now;
    const clock: Clock = { now: 30_000 };
    (globalThis as { Audio?: unknown }).Audio = class {
      volume = 0;
      currentTime = 0;

      play(): Promise<void> {
        throw new Error('设备不可用');
      }
    };
    Date.now = () => clock.now;
    try {
      setClickSoundEnabled(true);
      assert.doesNotThrow(() => playClickSound());
    } finally {
      (globalThis as { Audio?: unknown }).Audio = previousAudio;
      Date.now = previousNow;
      setClickSoundEnabled(false);
    }
  });
});
