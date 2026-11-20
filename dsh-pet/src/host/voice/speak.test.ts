/**
 * 语音服务的行为测试（src/host/voice/speak.ts）。
 * 合成实现由用例注入：默认套件不联网，只有边界与编排逻辑被钉住。
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { VoiceSynthError, type SynthInput } from './edge.ts';
import { registerVoiceProvider } from './registry.ts';
import { MAX_TEXT_CHARS, createVoiceService, isQueueStale, type VoiceService } from './speak.ts';

/** 可过 looksLikeMpegAudio 的假 mp3（帧同步头）。 */
function fakeMp3(fill = 0x11): Buffer {
  const buf = Buffer.alloc(64, fill);
  buf[0] = 0xff;
  buf[1] = 0xfb;
  return buf;
}

/** 造一个隔离的语音服务；`synthesize` 缺省写一个假 mp3。 */
async function withService(
  run: (voice: VoiceService, root: string) => Promise<void>,
  synthesize?: (input: SynthInput) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-svc-'));
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesize: synthesize ?? ((input) => writeFile(input.target, fakeMp3())),
    });
    await run(voice, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** 轮询直到条件成立；用 setImmediate 推进，不依赖固定睡眠时长。 */
async function waitFor(check: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('等待条件超时');
}

test('text 为空或全空白：判 bad-request 且不调用合成', () =>
  withService(async (voice) => {
    const result = await voice.speak({ text: '   ' });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.reason : '', 'bad-request');
  }));

test('text 超过上限：判 bad-request，不做截断', () =>
  withService(async (voice) => {
    const result = await voice.speak({ text: '中'.repeat(MAX_TEXT_CHARS + 1) });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.reason : '', 'bad-request');
    assert.match(result.ok === false ? result.message : '', /too long/);
  }));

test('voice 不在白名单：判 bad-request 并列出合法值', () =>
  withService(async (voice) => {
    const result = await voice.speak({ text: '你好', voice: 'zh-CN-NopeNeural' });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : '', /zh-CN-XiaoxiaoNeural/);
  }));

test('rate 格式不合法：判 bad-request', () =>
  withService(async (voice) => {
    const result = await voice.speak({ text: '你好', rate: '10%' });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.message : '', /rate/);
  }));

test('合法请求：返回 mp3 路径，文件确实落盘', () =>
  withService(async (voice, root) => {
    const result = await voice.speak({ text: '今天也要加油哦' });
    assert.equal(result.ok, true);
    const file = result.ok ? result.file : '';
    assert.ok(file.startsWith(join(root, 'voice-cache')), '必须落在 voice-cache 下');
    assert.ok(file.endsWith('.mp3'));
  }));

test('同一输入第二次：命中缓存，不再调用合成', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-hit-'));
  try {
    let calls = 0;
    const voice = createVoiceService({
      userRoot: root,
      synthesize: async (input) => {
        calls += 1;
        await writeFile(input.target, fakeMp3());
      },
    });
    await voice.speak({ text: '同一句话' });
    const second = await voice.speak({ text: '同一句话' });
    assert.equal(second.ok, true);
    assert.equal(calls, 1, '第二次必须命中缓存');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fresh：跳过缓存命中，强制重新合成（结果仍写入缓存）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-fresh-'));
  try {
    let calls = 0;
    const voice = createVoiceService({
      userRoot: root,
      synthesize: async (input) => {
        calls += 1;
        await writeFile(input.target, fakeMp3());
      },
    });
    await voice.speak({ text: '同一句话' });
    const second = await voice.speak({ text: '同一句话', fresh: true });
    assert.equal(second.ok, true);
    assert.equal(calls, 2, 'fresh 不读旧缓存，必须重新合成');
    const third = await voice.speak({ text: '同一句话' });
    assert.equal(third.ok, true);
    assert.equal(calls, 2, 'fresh 的结果仍要落盘，后续请求继续命中缓存');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('合成失败：判 generate-error，不把上游细节回给调用方', () =>
  withService(
    async (voice) => {
      const result = await voice.speak({ text: '你好' });
      assert.equal(result.ok, false);
      assert.equal(result.ok === false ? result.reason : '', 'generate-error');
      assert.doesNotMatch(result.ok === false ? result.message : '', /https?:/, '不许回显上游地址');
    },
    async () => {
      throw new VoiceSynthError('upstream 403 from https://example.invalid');
    },
  ));

test('队列已满：后续请求判 voice-busy，而不是无限排队', () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return withService(
    async (voice) => {
      let settled = 0;
      const calls = ['a', 'b', 'c', 'd', 'e'].map((text) =>
        voice.speak({ text }).then((result) => {
          settled += 1;
          return result;
        }),
      );
      await waitFor(() => settled >= 2);
      release();
      const results = await Promise.all(calls);
      const busy = results.filter((result) => !result.ok && result.reason === 'voice-busy');
      assert.ok(busy.length >= 1, '至少有一个请求应被判为 voice-busy');
    },
    () => gate,
  );
});

test('isQueueStale —— 排队久了就丢弃', () => {
  // 默认容许排队时长跟最慢内置引擎（Fish 90s）对齐
  const limitMs = 90_000;
  assert.equal(isQueueStale(1_000, 1_000), false, '刚轮到自己不算久');
  assert.equal(isQueueStale(1_000, 1_000 + limitMs), false, '正好到上限仍在容许范围内');
  assert.equal(isQueueStale(1_000, 1_000 + limitMs + 1), true, '超过上限就该丢');
});

test('排队等到客户端早已放弃：直接丢弃，不再白合成一次', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-stale-'));
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const voice = createVoiceService({
    userRoot: root,
    staleWaitMs: 0,
    synthesize: async (input) => {
      calls += 1;
      if (calls === 1) await gate; // 第一句占住串行链，第二句才排得上队
      await writeFile(input.target, Buffer.from('mp3'));
    },
  });
  try {
    const first = voice.speak({ text: '第一句' }); // 拿着队列不放
    await waitFor(() => calls === 1);
    const second = voice.speak({ text: '第二句' }); // 排在它后面
    await new Promise((resolve) => setTimeout(resolve, 10)); // 让排队时间真的过去一点
    release();
    const [kept, dropped] = await Promise.all([first, second]);
    assert.equal(kept.ok, true, '排在第一的照常合成');
    assert.equal(dropped.ok === false ? dropped.reason : '', 'voice-busy');
    assert.match(dropped.ok === false ? dropped.message : '', /queued too long/);
    assert.equal(calls, 1, '被丢弃的那句不能再调合成');
  } finally {
    release();
    await rm(root, { recursive: true, force: true });
  }
});

test('Fish 引擎：走 synthesizeFish，缓存键含模型', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-fish-'));
  let fishCalls = 0;
  let edgeCalls = 0;
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesize: async (input) => {
        edgeCalls += 1;
        await writeFile(input.target, fakeMp3(0x22));
      },
      synthesizeFish: async (input) => {
        fishCalls += 1;
        assert.equal(input.apiKey, 'sk-fish');
        assert.equal(input.model, 's2.1-pro-free');
        await writeFile(input.target, fakeMp3(0x33));
      },
      readRuntime: () => ({
        provider: 'fish',
        fishApiKey: 'sk-fish',
        fishTtsModel: 's2.1-pro-free',
        fishVoices: [],
        breezeApiKey: '',
        breezeVoices: [],
        voiceRate: 1,
      }),
    });
    const result = await voice.speak({ text: 'Fish 你好', voice: '55b28b196e1c4fff9a55cd32a46eff25' });
    assert.equal(result.ok, true);
    assert.equal(fishCalls, 1);
    assert.equal(edgeCalls, 0);
    const catalog = voice.listVoices();
    assert.equal(catalog.voiceProvider, 'fish');
    assert.ok(catalog.fishVoices.some((item) => item.id === '55b28b196e1c4fff9a55cd32a46eff25'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Breeze 引擎：走 synthesizeBreeze、默认大肥鱼、语音白名单拒绝野 id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-breeze-'));
  let breezeCalls = 0;
  let edgeCalls = 0;
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesize: async (input) => {
        edgeCalls += 1;
        await writeFile(input.target, fakeMp3(0x22));
      },
      synthesizeBreeze: async (input) => {
        breezeCalls += 1;
        assert.equal(input.apiKey, 'bz-breeze');
        assert.ok(input.voice === 'voc_u3nxkd5578wc' || input.voice === 'voc_mine123');
        assert.equal(input.speed, 1);
        await writeFile(input.target, fakeMp3(0x44));
      },
      readRuntime: () => ({
        provider: 'breeze',
        fishApiKey: '',
        fishTtsModel: 's2.1-pro-free',
        fishVoices: [],
        breezeApiKey: 'bz-breeze',
        breezeVoices: [{ id: 'voc_mine123', label: '我的鱼' }],
        voiceRate: 1,
      }),
    });
    // 不带 voice：回落第一条大肥鱼
    const ok = await voice.speak({ text: 'Breeze 你好' });
    assert.equal(ok.ok, true);
    assert.equal(breezeCalls, 1);
    assert.equal(edgeCalls, 0);
    // 自定义音色在白名单内
    const custom = await voice.speak({ text: '自定义音色', voice: 'voc_mine123' });
    assert.equal(custom.ok, true);
    // 野 id 直接 bad-request，不合成
    const rejected = await voice.speak({ text: '野音色', voice: 'voc_not_al_lowed' });
    assert.equal(rejected.ok === false ? rejected.reason : '', 'bad-request');
    assert.equal(breezeCalls, 2);
    const catalog = voice.listVoices();
    assert.equal(catalog.voiceProvider, 'breeze');
    assert.equal(catalog.voices.length, 3, '两条内置 + 一条自定义');
    assert.ok(catalog.breezeVoices.some((item) => item.id === 'voc_mine123'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('试听一次性 Key：这一条用它合成，磁盘上的 Key 原样不动', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-oneshot-'));
  const seen: string[] = [];
  let runtimeReads = 0;
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesizeBreeze: async (input) => {
        seen.push(input.apiKey);
        await writeFile(input.target, fakeMp3(0x45));
      },
      readRuntime: () => {
        runtimeReads += 1;
        return {
          provider: 'breeze',
          fishApiKey: '',
          fishTtsModel: 's2.1-pro-free',
          fishVoices: [],
          breezeApiKey: 'bz-saved',
          breezeVoices: [],
          voiceRate: 1,
        };
      },
    });
    // ① 不带 apiKey：用磁盘上的已保存 Key
    const saved = await voice.speak({ text: '试听一下' });
    assert.equal(saved.ok, true);
    assert.deepEqual(seen, ['bz-saved']);
    // ② 同一句话带 apiKey：即使已经存在同样的缓存，也必须真的用这把 Key 合成一次
    //   （命中旧缓存会让「Key 无效」看起来像成功）
    const draft = await voice.speak({ text: '试听一下', apiKey: '  bz-draft  ' });
    assert.equal(draft.ok, true);
    assert.deepEqual(seen, ['bz-saved', 'bz-draft'], '请求体里的 Key 要去空白后生效，且跳过缓存命中');
    assert.equal(runtimeReads >= 2, true, '运行时配置每次现读，没有被请求体改写');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('试听一次性 Key：空串回落已保存 Key，非字符串 / 带空白 / 超长一律 bad-request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-oneshot-bad-'));
  const seen: string[] = [];
  let synthCalls = 0;
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesizeFish: async (input) => {
        synthCalls += 1;
        seen.push(input.apiKey);
        await writeFile(input.target, fakeMp3(0x46));
      },
      readRuntime: () => ({
        provider: 'fish',
        fishApiKey: 'sk-saved',
        fishTtsModel: 's2.1-pro-free',
        fishVoices: [],
        breezeApiKey: '',
        breezeVoices: [],
        voiceRate: 1,
      }),
    });
    const ok = await voice.speak({ text: '空串', apiKey: '   ' });
    assert.equal(ok.ok, true);
    assert.deepEqual(seen, ['sk-saved'], '空串等于没传，回落磁盘 Key');
    for (const bad of [123, { key: 'x' }, ['a'], 'has space', 'k'.repeat(600)]) {
      const result = await voice.speak({ text: '非法 Key', apiKey: bad });
      assert.equal(result.ok === false ? result.reason : '', 'bad-request', `应拒绝：${JSON.stringify(bad)}`);
    }
    assert.equal(synthCalls, 1, '非法 Key 一次都不该触发合成');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('注册了第三方实现：合成走它，内置一次都不调', async () => {  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-provider-'));
  let edgeCalls = 0;
  let providerCalls = 0;
  const dispose = registerVoiceProvider({
    id: 'my-tts',
    name: '我的语音',
    synthesize: async () => {
      providerCalls += 1;
      return new Uint8Array([1, 2, 3]);
    },
  });
  try {
    const voice = createVoiceService({
      userRoot: root,
      synthesize: async () => {
        edgeCalls += 1;
      },
    });
    const result = await voice.speak({ text: '你好' });
    assert.equal(result.ok, true);
    assert.equal(providerCalls, 1, '应该走第三方实现');
    assert.equal(edgeCalls, 0, '注册之后不该再调内置');
  } finally {
    dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('第三方返回空字节：判 generate-error，不留下 0 字节文件', async () => {
  const root = await mkdtemp(join(tmpdir(), 'blue-fish-voice-empty-'));
  const dispose = registerVoiceProvider({ id: 'my-tts', name: '我的语音', synthesize: async () => new Uint8Array() });
  try {
    const voice = createVoiceService({ userRoot: root, synthesize: async () => undefined });
    const result = await voice.speak({ text: '你好' });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.reason : '', 'generate-error');
  } finally {
    dispose();
    await rm(root, { recursive: true, force: true });
  }
});
