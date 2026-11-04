/**
 * 语音播报回执表单测：受理、上报、等待与超时。
 * @module dsh-pet/src/host/voice/utterance.test
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceUtteranceStore } from './utterance.ts';

describe('VoiceUtteranceStore', () => {
  test('report ended 唤醒 waitUntilDone', async () => {
    const store = new VoiceUtteranceStore();
    const rec = store.create('main');
    const waiting = store.waitUntilDone(rec.utteranceId, 5_000);
    assert.equal(store.report(rec.utteranceId, 'ended'), 'ok');
    const r = await waiting;
    assert.equal(r.matched, true);
    assert.equal(r.record?.status, 'ended');
  });

  test('skipped / failed 同样是终态', async () => {
    const store = new VoiceUtteranceStore();
    const a = store.create('main');
    assert.equal(store.report(a.utteranceId, 'skipped', 'disabled'), 'ok');
    assert.equal((await store.waitUntilDone(a.utteranceId, 100)).record?.status, 'skipped');

    const b = store.create('main');
    assert.equal(store.report(b.utteranceId, 'failed', 'speak-failed'), 'ok');
    assert.equal((await store.waitUntilDone(b.utteranceId, 100)).record?.status, 'failed');
  });

  test('超时 matched:false，仍可稍后上报（幂等 ignored）', async () => {
    const store = new VoiceUtteranceStore();
    const rec = store.create('main');
    const r = await store.waitUntilDone(rec.utteranceId, 20);
    assert.equal(r.matched, false);
    assert.equal(r.record?.status, 'pending');
    assert.equal(store.report(rec.utteranceId, 'ended'), 'ok');
  });

  test('同宠新一句把上一句标成 skipped/superseded', () => {
    const store = new VoiceUtteranceStore();
    const first = store.create('main');
    const second = store.create('main');
    assert.equal(store.get(first.utteranceId)?.status, 'skipped');
    assert.equal(store.get(first.utteranceId)?.reason, 'superseded');
    assert.equal(second.status, 'pending');
  });

  test('非法 status / 未知编号', () => {
    const store = new VoiceUtteranceStore();
    const rec = store.create('main');
    assert.equal(store.report(rec.utteranceId, 'playing'), 'invalid');
    assert.equal(store.report('vu-nope', 'ended'), 'unknown');
  });
});
