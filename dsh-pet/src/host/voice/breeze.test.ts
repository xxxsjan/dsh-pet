/**
 * Breeze Blue 合成、语速换算与音色目录的行为测试（src/host/voice/breeze.ts、breeze-voices.ts）。
 * 不联网：用全局 fetch 替身断言请求形状与失败分支。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { VoiceSynthError } from './edge.ts';
import { breezeRateToSpeed, synthesizeBreeze } from './breeze.ts';
import { isKnownBreezeVoice, listBreezeVoices, normalizeBreezeCustomVoices } from './breeze-voices.ts';

/** 单测走直连 + mock fetch，不读本机系统代理。 */
const savedProxyEnv = {
  disable: process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY,
  https: process.env.HTTPS_PROXY,
  http: process.env.HTTP_PROXY,
  all: process.env.ALL_PROXY,
};
before(() => {
  process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY = '1';
  delete process.env.HTTPS_PROXY;
  delete process.env.https_proxy;
  delete process.env.HTTP_PROXY;
  delete process.env.http_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;
});
after(() => {
  if (savedProxyEnv.disable === undefined) delete process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY;
  else process.env.BLUE_FISH_DISABLE_SYSTEM_PROXY = savedProxyEnv.disable;
  if (savedProxyEnv.https === undefined) delete process.env.HTTPS_PROXY;
  else process.env.HTTPS_PROXY = savedProxyEnv.https;
  if (savedProxyEnv.http === undefined) delete process.env.HTTP_PROXY;
  else process.env.HTTP_PROXY = savedProxyEnv.http;
  if (savedProxyEnv.all === undefined) delete process.env.ALL_PROXY;
  else process.env.ALL_PROXY = savedProxyEnv.all;
});

test('breezeRateToSpeed：+0% → 1，夹到 0.5–2.0', () => {
  assert.equal(breezeRateToSpeed('+0%'), 1);
  assert.equal(breezeRateToSpeed('+20%'), 1.2);
  assert.equal(breezeRateToSpeed('-50%'), 0.5);
  assert.equal(breezeRateToSpeed('+100%'), 2);
  assert.equal(breezeRateToSpeed('-100%'), 0.5);
});

test('listBreezeVoices：内置两条大肥鱼在前，自定义追加在后', () => {
  const builtin = listBreezeVoices();
  assert.equal(builtin.length, 2);
  assert.deepEqual(
    builtin.map((voice) => voice.id),
    ['voc_u3nxkd5578wc', 'voc_8yud7hz7c9q2'],
  );
  assert.equal(builtin[0]?.default, true);
  const withCustom = listBreezeVoices([{ id: 'voc_mine123', label: '我的鱼' }]);
  assert.equal(withCustom.length, 3);
  assert.equal(withCustom[2]?.id, 'voc_mine123');
  assert.equal(withCustom[2]?.tag, 'Breeze · 自定义');
});

test('normalizeBreezeCustomVoices：去重、拦非法、跳过内置', () => {
  const list = normalizeBreezeCustomVoices([
    { id: 'voc_u3nxkd5578wc', label: '内置撞车' },
    { id: 'voc_mine123', label: '我的鱼' },
    { id: 'bad id!', label: '非法' },
    { id: 'voc_mine123', label: '重复' },
    { id: 'voc_nolabel' },
  ]);
  assert.deepEqual(list, [
    { id: 'voc_mine123', label: '我的鱼' },
    { id: 'voc_nolabel', label: 'voc_nolabel' },
  ]);
  assert.equal(isKnownBreezeVoice('voc_mine123', list), true);
  assert.equal(isKnownBreezeVoice('voc_u3nxkd5578wc', list), true);
  assert.equal(isKnownBreezeVoice('voc_nope', list), false);
});

test('synthesizeBreeze：缺 Key 直接失败，不发请求', async () => {
  await assert.rejects(
    () =>
      synthesizeBreeze({
        text: '你好',
        voice: 'voc_u3nxkd5578wc',
        speed: 1,
        apiKey: '  ',
        target: join(tmpdir(), 'breeze-no-key.mp3'),
      }),
    (error: unknown) => error instanceof VoiceSynthError && /API Key/.test(error.message),
  );
});

test('synthesizeBreeze：URL / 请求头 / 正文形状正确，mp3 落盘', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-breeze-'));
  const target = join(root, 'out.mp3');
  const original = globalThis.fetch;
  let seen: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    const audio = Buffer.alloc(64, 0xff);
    return new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;
  try {
    await synthesizeBreeze({
      text: '今天也好',
      voice: 'voc_8yud7hz7c9q2',
      speed: 1.2,
      apiKey: 'bz-test',
      target,
    });
    assert.ok(seen);
    assert.equal(
      seen?.url,
      'https://api.breeze.blue/v1/text-to-speech/voc_8yud7hz7c9q2/stream?output_format=mp3',
    );
    const headers = seen?.init.headers as Record<string, string>;
    assert.equal(headers['xi-api-key'], 'bz-test');
    assert.equal(headers['Content-Type'], 'application/json');
    const body = JSON.parse(String(seen?.init.body)) as Record<string, unknown>;
    assert.equal(body.text, '今天也好');
    assert.equal((body.voice_settings as { speed: number }).speed, 1.2);
    const bytes = await readFile(target);
    assert.ok(bytes.length >= 32);
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});

test('synthesizeBreeze：HTTP 非 2xx → VoiceSynthError', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: 'invalid api key' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        synthesizeBreeze({
          text: 'hi',
          voice: 'voc_u3nxkd5578wc',
          speed: 1,
          apiKey: 'bz',
          target: join(tmpdir(), 'breeze-fail.mp3'),
        }),
      (error: unknown) => error instanceof VoiceSynthError && /401/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('synthesizeBreeze：返回 JSON 而不是音频 → VoiceSynthError', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response('{"detail":"quota exceeded"}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        synthesizeBreeze({
          text: 'hi',
          voice: 'voc_u3nxkd5578wc',
          speed: 1,
          apiKey: 'bz',
          target: join(tmpdir(), 'breeze-json.mp3'),
        }),
      (error: unknown) => error instanceof VoiceSynthError && /未返回音频/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test('synthesizeBreeze：Voice ID 非法直接拒绝', async () => {
  await assert.rejects(
    () =>
      synthesizeBreeze({
        text: 'hi',
        voice: '../etc/passwd',
        speed: 1,
        apiKey: 'bz',
        target: join(tmpdir(), 'breeze-bad-voice.mp3'),
      }),
    (error: unknown) => error instanceof VoiceSynthError && /Voice ID/.test(error.message),
  );
});
