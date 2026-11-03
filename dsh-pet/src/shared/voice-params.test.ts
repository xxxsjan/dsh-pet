/**
 * 语速 / 音量口径。
 * 跑法：node --experimental-strip-types --test src/shared/voice-params.test.ts
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { absoluteRateToEdge, clampVoiceRate, clampVoiceVolume } from './voice-params.ts';

test('clampVoiceRate / Volume', () => {
  assert.equal(clampVoiceRate(1.25), 1.25);
  assert.equal(clampVoiceRate(0.1), 0.5);
  assert.equal(clampVoiceRate(9), 2);
  assert.equal(clampVoiceVolume(1.5), 1.5);
  assert.equal(clampVoiceVolume(-1), 0);
  assert.equal(clampVoiceVolume(3), 3);
  assert.equal(clampVoiceVolume(5), 4);
});

test('absoluteRateToEdge', () => {
  assert.equal(absoluteRateToEdge(1), '+0%');
  assert.equal(absoluteRateToEdge(1.5), '+50%');
  assert.equal(absoluteRateToEdge(0.5), '-50%');
  assert.equal(absoluteRateToEdge(2), '+100%');
});
