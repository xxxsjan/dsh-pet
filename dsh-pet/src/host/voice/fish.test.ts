/**
 * Fish Audio 合成与语速映射的行为测试（src/host/voice/fish.ts）。
 * 不联网：用全局 fetch 替身断言请求形状与失败分支。
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { VoiceSynthError } from './edge.ts';
import { edgeRateToFishSpeed, synthesizeFish } from './fish.ts';
import { isKnownFishVoice, normalizeFishCustomVoices, normalizeFishTtsModel } from './fish-voices.ts';

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

test('edgeRateToFishSpeed：+0% → 1，夹到 0.5–2.0', () => {
  assert.equal(edgeRateToFishSpeed('+0%'), 1);
  assert.equal(edgeRateToFishSpeed('+50%'), 1.5);
  assert.equal(edgeRateToFishSpeed('-50%'), 0.5);
  assert.equal(edgeRateToFishSpeed('+100%'), 2);
  assert.equal(edgeRateToFishSpeed('-100%'), 0.5);
});

test('normalizeFishTtsModel：非法回落免费档', () => {
  assert.equal(normalizeFishTtsModel('s2.1-pro'), 's2.1-pro');
  assert.equal(normalizeFishTtsModel('nope'), 's2.1-pro-free');
  assert.equal(normalizeFishTtsModel(''), 's2.1-pro-free');
});

test('normalizeFishCustomVoices：去重、拦非法、跳过内置', () => {
  const list = normalizeFishCustomVoices([
    { id: '55b28b196e1c4fff9a55cd32a46eff25', label: '内置撞车' },
    { id: 'abc_custom-1', label: '我的' },
    { id: 'bad id!', label: '非法' },
    { id: 'abc_custom-1', label: '重复' },
  ]);
  assert.deepEqual(list, [{ id: 'abc_custom-1', label: '我的' }]);
  assert.equal(isKnownFishVoice('abc_custom-1', list), true);
  assert.equal(isKnownFishVoice('nope', list), false);
});

test('synthesizeFish：缺 Key 直接失败，不发请求', async () => {
  await assert.rejects(
    () =>
      synthesizeFish({
        text: '你好',
        voice: '55b28b196e1c4fff9a55cd32a46eff25',
        speed: 1,
        model: 's2.1-pro-free',
        apiKey: '  ',
        target: join(tmpdir(), 'fish-no-key.mp3'),
      }),
    (error: unknown) => error instanceof VoiceSynthError && /API Key/.test(error.message),
  );
});

test('synthesizeFish：请求头与正文形状正确，mp3 落盘', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-fish-'));
  const target = join(root, 'out.mp3');
  const original = globalThis.fetch;
  let seen: { url: string; init: RequestInit } | undefined;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), init: init ?? {} };
    const audio = Buffer.alloc(64, 0xff);
    return new Response(audio, { status: 200, headers: { 'content-type': 'audio/mpeg' } });
  }) as typeof fetch;
  try {
    await synthesizeFish({
      text: '今天也好',
      voice: '55b28b196e1c4fff9a55cd32a46eff25',
      speed: 1.2,
      model: 's2.1-pro-free',
      apiKey: 'sk-test',
      target,
    });
    assert.ok(seen);
    assert.equal(seen?.url, 'https://api.fish.audio/v1/tts');
    const headers = seen?.init.headers as Record<string, string>;
    assert.equal(headers.Authorization, 'Bearer sk-test');
    assert.equal(headers.model, 's2.1-pro-free');
    const body = JSON.parse(String(seen?.init.body)) as Record<string, unknown>;
    assert.equal(body.reference_id, '55b28b196e1c4fff9a55cd32a46eff25');
    assert.equal(body.format, 'mp3');
    assert.equal((body.prosody as { speed: number }).speed, 1.2);
    const bytes = await readFile(target);
    assert.ok(bytes.length >= 32);
  } finally {
    globalThis.fetch = original;
    await rm(root, { recursive: true, force: true });
  }
});

test('synthesizeFish：HTTP 非 2xx → VoiceSynthError', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: 'quota' }), {
      status: 402,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        synthesizeFish({
          text: 'hi',
          voice: '55b28b196e1c4fff9a55cd32a46eff25',
          speed: 1,
          model: 's2.1-pro-free',
          apiKey: 'sk',
          target: join(tmpdir(), 'fish-fail.mp3'),
        }),
      (error: unknown) => error instanceof VoiceSynthError && /402/.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
  }
});
