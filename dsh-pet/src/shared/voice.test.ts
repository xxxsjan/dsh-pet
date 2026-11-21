/**
 * 端侧语音播报（src/shared/voice.ts）的判定行为测试：这一句到底该不该念。
 *
 * 六条契约：
 *   1. 只有叶子点名本端才念——`voiceTo` 缺省或是另一端，都只弹气泡；
 *   2. 点名了还要总开关开着，否则一样静音；
 *   3. 网页端页面不可见时不念（没人在看就不出声）；
 *   4. 合成失败落到 `failed`，界面留一个静音喇叭而不是什么都没有；
 *   5. 超长正文只念开头一段（气泡仍显示全文）；
 *   6. 每句都报一次 `start` 与一次 `end`，气泡靠它决定何时收起。
 *
 * 播放本身（Audio / blob）在浏览器里才有意义，这里只钉住「有没有发合成请求」与状态。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  VOICE_SPEECH_MAX_CHARS,
  getVoiceState,
  playSayVoice,
  setSurface,
  setVoiceBase,
  setVoiceConfig,
  speechSlice,
  splitSpeech,
  stopSayVoice,
  subscribeVoiceUtterance,
  type VoiceUtteranceEvent,
} from './voice.ts';

/** 假的合成端点：记录每次请求，响应默认是一个假音频；`ok: false` 模拟宿主返回失败。 */
function stubFetch(options: { ok?: boolean } = {}): { calls: Array<{ text: string }>; restore: () => void } {
  const ok = options.ok ?? true;
  const calls: Array<{ text: string }> = [];
  const previous = globalThis.fetch;
  (globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
    calls.push({ text: String((JSON.parse(init?.body ?? '{}') as { text?: unknown }).text ?? '') });
    return {
      ok,
      headers: { get: () => (ok ? 'audio/mpeg' : 'application/json') },
      blob: async () => ({ size: 1 }),
    };
  };
  return {
    calls,
    restore: () => {
      (globalThis as { fetch: unknown }).fetch = previous;
    },
  };
}

/**
 * 补上浏览器才有的两个对象：音频元素与 blob 地址。
 *
 * @param sink - 可选：每段音频开始播放时把它的 `volume` 记进来，用来断言音量。
 * @returns 还原函数。
 */
function stubBrowser(sink?: { volumes: number[] }): () => void {
  const previousAudio = (globalThis as { Audio?: unknown }).Audio;
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  (globalThis as { Audio?: unknown }).Audio = class {
    /** 与真实 Audio 同名的音量字段：被测代码写它，这里在 play 时取出。 */
    volume = 1;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play(): Promise<void> {
      sink?.volumes.push(this.volume);
      // speak() 现在要等 onended 才返回；测试桩在下一拍模拟播完，否则用例会挂死。
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    }
  };
  URL.createObjectURL = () => 'blob:blue-fish-test';
  URL.revokeObjectURL = () => undefined;
  return () => {
    (globalThis as { Audio?: unknown }).Audio = previousAudio;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  };
}

/** 让排在后面的异步旁路跑完（播放是 void 出去的，不 await）。 */
async function flush(): Promise<void> {
  for (let round = 0; round < 20; round++) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('playSayVoice —— 这一句该不该念', () => {
  test('叶子没点名（voiceTo 缺省）→ 不发请求，气泡照旧', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    try {
      setSurface('web');
      setVoiceConfig('', true);
      playSayVoice({ text: '随便一句' });
      await flush();
      assert.equal(fetchStub.calls.length, 0, '没人点名就不该合成，更不该出声');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('叶子点名另一端 → 本端不发请求', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    try {
      setSurface('web');
      setVoiceConfig('', true);
      playSayVoice({ text: '这一句归桌面端', voiceTo: 'desktop' });
      await flush();
      assert.equal(fetchStub.calls.length, 0, '两端不重复播报靠的就是这一条');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('点名本端 + 总开关开 → 发一次合成请求，正文原样', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '该喝水了', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(fetchStub.calls, [{ text: '该喝水了' }]);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('点名本端但总开关关 → 不发请求', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    try {
      setSurface('desktop');
      setVoiceConfig('', false);
      playSayVoice({ text: '关了就别念', voiceTo: 'desktop' });
      await flush();
      assert.equal(fetchStub.calls.length, 0, '总开关是最后一道门');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('网页端页面不可见 → 不发请求（桌面端不看可见性）', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    const previousDocument = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = { hidden: true };
    try {
      setSurface('web');
      setVoiceConfig('', true);
      playSayVoice({ text: '后台标签页', voiceTo: 'web' });
      await flush();
      assert.equal(fetchStub.calls.length, 0, '没人在看的页面不该出声');

      // 同一台机器上桌面端不受影响：它没有 document.hidden 这一说
      setSurface('desktop');
      playSayVoice({ text: '桌面端照念', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(fetchStub.calls, [{ text: '桌面端照念' }]);
    } finally {
      (globalThis as { document?: unknown }).document = previousDocument;
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('合成失败 → 状态落到 failed（留一个静音喇叭，而不是干脆没图标）', async () => {
    const fetchStub = stubFetch({ ok: false });
    const restoreBrowser = stubBrowser();
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '这句合成不出来', voiceTo: 'desktop' });
      await flush();
      assert.equal(fetchStub.calls.length, 1, '该请求的合成请求照发');
      assert.equal(getVoiceState(), 'failed', '失败要看得见，不能静默回 idle');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });
});

describe('speechSlice —— 念的部分只取开头一段', () => {
  test('够短就原样返回', () => {
    assert.equal(speechSlice('该喝水了'), '该喝水了');
  });

  test('超长且没有句读：硬切到上限', () => {
    const text = '啊'.repeat(VOICE_SPEECH_MAX_CHARS + 40);
    assert.equal(speechSlice(text).length, VOICE_SPEECH_MAX_CHARS);
  });

  test('超长但有句读：截在最后一个句读上，不念半句话', () => {
    const text = '第一句话在这里。'.repeat(10);
    const sliced = speechSlice(text);
    assert.ok(sliced.length <= VOICE_SPEECH_MAX_CHARS, `截断后不能超上限，实得 ${sliced.length}`);
    assert.ok(sliced.endsWith('。'), '截在句号上才不像被掐断');
  });

  test('句读太靠前：宁可直接硬切，也不只念出半句', () => {
    const text = '。' + '啊'.repeat(VOICE_SPEECH_MAX_CHARS + 40);
    assert.equal(speechSlice(text).length, VOICE_SPEECH_MAX_CHARS);
  });
});

describe('播放事件 —— 气泡靠它决定何时收起', () => {
  test('念一句：报一次 start、一次 end，正文是气泡原文而不是截断文本', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    try {
      const text = '很长的一句话。'.repeat(20);
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text, voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(
        events.map((event) => event.kind),
        ['start', 'end'],
      );
      assert.equal(events[0].text, text, '事件带原文：气泡要按它认句');
      assert.equal(events[0].seq, events[1].seq, '成对的同一句必须同序号');
    } finally {
      off();
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('合成失败也报 end：气泡不能因为失败就永远挂着', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetch({ ok: false });
    const restoreBrowser = stubBrowser();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '这句合成不出来', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(
        events.map((event) => event.kind),
        ['end'],
        '始终没出声就只报 end，气泡靠兜底显示，不必假装开始',
      );
    } finally {
      off();
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('不该念的句子不报任何事件：没语音就别拖长气泡', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    try {
      setSurface('web');
      setVoiceConfig('', false);
      playSayVoice({ text: '关了就别念', voiceTo: 'web' });
      await flush();
      assert.equal(events.length, 0);
    } finally {
      off();
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('退订之后不再收到事件', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    off();
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '没人听了', voiceTo: 'desktop' });
      await flush();
      assert.equal(events.length, 0);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });
});

describe('setVoiceConfig —— 音量系数', () => {
  test('0.35 原样落到播放：audio.volume 就是 0.35', async () => {
    const sink = { volumes: [] as number[] };
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser(sink);
    try {
      setSurface('web');
      setVoiceConfig('', true, 0.35);
      playSayVoice({ text: '小声说', voiceTo: 'web' });
      await flush();
      assert.deepEqual(sink.volumes, [0.35], '音量要落到真正播放的那段音频上');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('越界与脏值：>1 无 AudioContext 时 element.volume 封顶 1；负数归 0', async () => {
    const sink = { volumes: [] as number[] };
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser(sink);
    try {
      setSurface('web');
      // 测试桩没有 AudioContext：>1 只能把 element.volume 放到 1（增益路径走不了）
      const cases: ReadonlyArray<readonly [unknown, number]> = [
        [2, 1],
        [1.5, 1],
        [-1, 0],
        ['不是数字', 1],
        [0, 0],
      ];
      for (const [input, wanted] of cases) {
        setVoiceConfig('', true, input);
        playSayVoice({ text: '说一句', voiceTo: 'web' });
        await flush();
        assert.equal(sink.volumes[sink.volumes.length - 1], wanted, `音量 ${String(input)} 应落到 ${wanted}`);
      }
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });
});

describe('stopSayVoice —— 打断自动播报', () => {
  /** 不自动播完的音频桩：模拟一句正在朗读的长语音，pause 记次数。 */
  function stubLongAudio(): { pauses: number[]; restore: () => void } {
    const pauses: number[] = [];
    const previousAudio = (globalThis as { Audio?: unknown }).Audio;
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    (globalThis as { Audio?: unknown }).Audio = class {
      volume = 1;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play(): Promise<void> {
        return Promise.resolve(); // 不触发 onended：一直念到被打断
      }
      pause(): void {
        pauses.push(1);
      }
    };
    URL.createObjectURL = () => 'blob:blue-fish-test';
    URL.revokeObjectURL = () => undefined;
    return {
      pauses,
      restore: () => {
        (globalThis as { Audio?: unknown }).Audio = previousAudio;
        URL.createObjectURL = previousCreate;
        URL.revokeObjectURL = previousRevoke;
      },
    };
  }

  /** 记录全部请求（含回执上报）的合成端点桩。 */
  function stubFetchWithUrls(): { requests: Array<{ url: string; body: string }>; restore: () => void } {
    const requests: Array<{ url: string; body: string }> = [];
    const previous = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (url: string, init?: { body?: string }) => {
      requests.push({ url: String(url), body: String(init?.body ?? '') });
      return {
        ok: true,
        headers: { get: () => 'audio/mpeg' },
        blob: async () => ({ size: 1 }),
      };
    };
    return {
      requests,
      restore: () => {
        (globalThis as { fetch: unknown }).fetch = previous;
      },
    };
  }

  test('播放中打断：音频被 pause、状态回 idle、回执报 skipped/cancelled、事件成对收尾', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetchWithUrls();
    const audioStub = stubLongAudio();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '一条很长的弹幕回复', voiceTo: 'desktop', voiceUtteranceId: 'vu-test' });
      await flush();
      assert.equal(getVoiceState(), 'ready', '打断前应处于播放就绪态');
      stopSayVoice();
      await flush();
      assert.ok(audioStub.pauses.length >= 1, '在播音频应被暂停');
      assert.equal(getVoiceState(), 'idle', '打断后状态应归回 idle 而不是 failed');
      assert.deepEqual(
        events.map((event) => event.kind),
        ['start', 'end'],
        '被打断也要报 end，气泡不能永远挂着',
      );
      const report = fetchStub.requests.find((r) => r.url.includes('/voice/utterance/vu-test/report'));
      assert.ok(report, '应向宿主上报回执');
      assert.deepEqual(JSON.parse(report.body), { status: 'skipped', reason: 'cancelled' });
    } finally {
      off();
      audioStub.restore();
      fetchStub.restore();
    }
  });

  test('没在念时调用无副作用；打断后下一句照常播', async () => {
    const fetchStub = stubFetchWithUrls();
    const audioStub = stubLongAudio();
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      stopSayVoice(); // 空放一枪：不应抛错也不应影响后续
      await flush();
      assert.equal(fetchStub.requests.length, 0);
      playSayVoice({ text: '打断后的新一句', voiceTo: 'desktop' });
      await flush();
      assert.equal(getVoiceState(), 'ready', '上一句的取消不能波及下一句');
      stopSayVoice();
      await flush();
      assert.equal(getVoiceState(), 'idle');
    } finally {
      audioStub.restore();
      fetchStub.restore();
    }
  });

  test('多段播放中打断：在播段被暂停、预取被中止，回执 skipped、事件成对', async () => {
    const events: VoiceUtteranceEvent[] = [];
    const fetchStub = stubFetchWithUrls();
    const audioStub = stubLongAudio();
    const off = subscribeVoiceUtterance((event) => events.push(event));
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '第一句。第二句。', voiceTo: 'desktop', voiceUtteranceId: 'vu-multi' });
      await flush();
      assert.equal(getVoiceState(), 'ready', '打断前第一段已在播');
      stopSayVoice();
      await flush();
      assert.ok(audioStub.pauses.length >= 1, '在播段应被暂停');
      assert.equal(getVoiceState(), 'idle', '打断后归 idle 而非 failed');
      assert.deepEqual(
        events.map((event) => event.kind),
        ['start', 'end'],
      );
      const report = fetchStub.requests.find((r) => r.url.includes('/voice/utterance/vu-multi/report'));
      assert.ok(report, '应向宿主上报回执');
      assert.deepEqual(JSON.parse(report.body), { status: 'skipped', reason: 'cancelled' });
    } finally {
      off();
      audioStub.restore();
      fetchStub.restore();
    }
  });
});

describe('splitSpeech —— 按句读切分', () => {
  test('无标点：单段原样返回', () => {
    assert.deepEqual(splitSpeech('该喝水了'), ['该喝水了']);
  });

  test('按标点切分且标点保留在段末', () => {
    assert.deepEqual(splitSpeech('你好，世界。'), ['你好，', '世界。']);
  });

  test('换行视为分隔，空白段剔除', () => {
    assert.deepEqual(splitSpeech('第一行\n第二行'), ['第一行', '第二行']);
  });

  test('纯标点输入返回空数组', () => {
    assert.deepEqual(splitSpeech('，。！'), []);
  });
});

describe('分句串播 —— 首句即播、边播边预取', () => {
  test('含标点的回复：按句发多次合成请求，首段就是正文开头', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '你好呀，我是桌宠。', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(fetchStub.calls, [{ text: '你好呀，' }, { text: '我是桌宠。' }]);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('多段全部播放：播放次数等于段数且顺序一致', async () => {
    const sink = { volumes: [] as number[] };
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser(sink);
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '第一句。第二句。第三句。', voiceTo: 'desktop' });
      await flush();
      assert.equal(sink.volumes.length, 3, '每段都应真正起播一次');
      assert.deepEqual(
        fetchStub.calls.map((c) => c.text),
        ['第一句。', '第二句。', '第三句。'],
      );
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  /** 可按文本决定成败的端点：含「坏」的那一段返回非音频，模拟单段合成失败。 */
  function stubPartialFail(): { calls: string[]; restore: () => void } {
    const calls: string[] = [];
    const previous = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
      const text = String((JSON.parse(init?.body ?? '{}') as { text?: unknown }).text ?? '');
      calls.push(text);
      const ok = !text.includes('坏');
      return {
        ok,
        headers: { get: () => (ok ? 'audio/mpeg' : 'application/json') },
        blob: async () => ({ size: 1 }),
      };
    };
    return {
      calls,
      restore: () => {
        (globalThis as { fetch: unknown }).fetch = previous;
      },
    };
  }

  test('中间段合成失败：跳过该段继续播其余，最终状态 failed', async () => {
    const sink = { volumes: [] as number[] };
    const fetchStub = stubPartialFail();
    const restoreBrowser = stubBrowser(sink);
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '好的。坏的。也好。', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(fetchStub.calls, ['好的。', '坏的。', '也好。'], '失败段的请求照发，不影响后面继续合成');
      assert.equal(sink.volumes.length, 2, '失败段不起播，其余两段照常播放');
      assert.equal(getVoiceState(), 'failed', '出现过失败就要留静音喇叭');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });
});

describe('真流式播报（PCM + Web Audio）', () => {
  // boostCtx 是模块级单例，一旦创建就跨用例复用：调度记录只能放模块级，每次建桩时清空。
  const audioStarts: number[] = [];
  const audioDurations: number[] = [];

  /** 补上 window.AudioContext：Node 里没有 window，audioContextConstructor 会直接早退。 */
  function stubAudioContext(): { starts: number[]; durations: number[]; restore: () => void } {
    audioStarts.length = 0;
    audioDurations.length = 0;
    const starts = audioStarts;
    const durations = audioDurations;
    const previousWindow = (globalThis as { window?: unknown }).window;
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      sampleRate = 48_000;
      destination = {};
      async resume(): Promise<void> {}
      async close(): Promise<void> {}
      createGain(): unknown {
        return { gain: { value: 1 }, connect(): void {}, disconnect(): void {} };
      }
      createBuffer(_channels: number, length: number, rate: number): unknown {
        const duration = length / rate;
        durations.push(duration);
        return { duration, copyToChannel(): void {} };
      }
      createBufferSource(): unknown {
        return {
          buffer: null,
          connect(): void {},
          start(at: number): void {
            starts.push(at);
          },
          stop(): void {},
        };
      }
    }
    (globalThis as { window?: unknown }).window = { AudioContext: FakeCtx };
    return {
      starts,
      durations,
      restore: () => {
        (globalThis as { window?: unknown }).window = previousWindow;
      },
    };
  }

  /** 流式端点命中：返回一段 PCM；记录请求体。 */
  function stubPcmFetch(samples: number): {
    calls: Array<{ text: string; stream?: boolean }>;
    restore: () => void;
  } {
    const calls: Array<{ text: string; stream?: boolean }> = [];
    const previous = globalThis.fetch;
    (globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { text?: unknown; stream?: unknown };
      calls.push({ text: String(body.text ?? ''), stream: body.stream === true });
      const pcm = new Uint8Array(samples * 2);
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(pcm);
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'audio/pcm; rate=24000; channels=1; format=s16le' } },
      );
    };
    return {
      calls,
      restore: () => {
        (globalThis as { fetch: unknown }).fetch = previous;
      },
    };
  }

  test('PCM 小块多批到达：预缓冲不能吞掉音频，全部排程播放', async () => {
    // 必须放在本组第一个：boostCtx 是模块级单例，后来的桩拿不到它的调度记录
    const audio = stubAudioContext();
    const restoreBrowser = stubBrowser();
    const previous = globalThis.fetch;
    const totalBytes = 20_000;
    (globalThis as { fetch: unknown }).fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            // 每块 1000 字节（远小于 120ms 预缓冲），模拟 Breeze 的小块推送
            for (let offset = 0; offset < totalBytes; offset += 1_000) {
              controller.enqueue(new Uint8Array(Math.min(1_000, totalBytes - offset)));
            }
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'audio/pcm; rate=24000; channels=1; format=s16le' } },
      );
    try {
      setVoiceBase('http://127.0.0.1:1/blue-fish');
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '分块到达也要完整念完', voiceTo: 'desktop' });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const total = audio.durations.reduce((sum, item) => sum + item, 0);
      const expected = totalBytes / 2 / 24_000;
      assert.ok(audio.starts.length >= 2, '应分批排程，而不是只播一块');
      assert.ok(Math.abs(total - expected) < 0.01, `排程总时长应约等于音频时长（实际 ${total}，期望 ${expected}）`);
    } finally {
      stopSayVoice();
      // 等被打断的那句收尾：它会在下一个等待拍里把全局状态置回 idle，不能漏给下一条用例。
      await new Promise((resolve) => setTimeout(resolve, 100));
      setVoiceBase('/blue-fish');
      globalThis.fetch = previous;
      restoreBrowser();
      audio.restore();
    }
  });

  test('基址是 http：带 stream:true 请求整段 PCM，并排程播放', async () => {
    const audio = stubAudioContext();
    const fetchStub = stubPcmFetch(4_800);
    const restoreBrowser = stubBrowser();
    try {
      setVoiceBase('http://127.0.0.1:1/blue-fish');
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '第一句。第二句。', voiceTo: 'desktop' });
      await new Promise((resolve) => setTimeout(resolve, 500));
      assert.equal(fetchStub.calls.length, 1, '流式模式整段一次请求，不再分句');
      assert.equal(fetchStub.calls[0]?.stream, true);
      assert.equal(fetchStub.calls[0]?.text, '第一句。第二句。');
      assert.ok(audio.starts.length >= 1, '应至少排程一段音频');
      assert.equal(getVoiceState(), 'ready');
    } finally {
      setVoiceBase('/blue-fish');
      restoreBrowser();
      fetchStub.restore();
      audio.restore();
    }
  });

  test('宿主回退 mp3：仍走整包 blob 播放', async () => {
    const audio = stubAudioContext();
    const restoreBrowser = stubBrowser();
    const previous = globalThis.fetch;
    const calls: Array<{ stream?: boolean }> = [];
    (globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { stream?: unknown };
      calls.push({ stream: body.stream === true });
      return new Response(new Uint8Array(64).fill(0xff), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    };
    try {
      setVoiceBase('http://127.0.0.1:1/blue-fish');
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '回退整包', voiceTo: 'desktop' });
      await flush();
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.stream, true, '能力具备时仍会先尝试流式');
      assert.equal(getVoiceState(), 'ready');
    } finally {
      setVoiceBase('/blue-fish');
      globalThis.fetch = previous;
      restoreBrowser();
      audio.restore();
    }
  });

  test('bridge 基址：不发 stream，继续按句整包合成', async () => {
    const audio = stubAudioContext();
    const restoreBrowser = stubBrowser();
    const previous = globalThis.fetch;
    const calls: Array<{ text: string; stream?: boolean }> = [];
    (globalThis as { fetch: unknown }).fetch = async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { text?: unknown; stream?: unknown };
      calls.push({ text: String(body.text ?? ''), stream: body.stream === true });
      return {
        ok: true,
        headers: { get: () => 'audio/mpeg' },
        blob: async () => ({ size: 1 }),
      };
    };
    try {
      setVoiceBase('blue-fish-bridge://dsh-pet/blue-fish');
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '第一句。第二句。', voiceTo: 'desktop' });
      await flush();
      assert.deepEqual(
        calls.map((call) => call.text),
        ['第一句。', '第二句。'],
      );
      assert.equal(
        calls.some((call) => call.stream === true),
        false,
        'bridge 协议承载不了流式，不应带 stream',
      );
    } finally {
      setVoiceBase('/blue-fish');
      globalThis.fetch = previous;
      restoreBrowser();
      audio.restore();
    }
  });
});

describe('气泡随声音出现（playSayVoice 的 onAudible）', () => {
  test('要点的一句：首段可播之后才回调', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    let audible = 0;
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '等等再弹', voiceTo: 'desktop' }, () => {
        audible += 1;
      });
      assert.equal(audible, 0, '合成还没就绪，不能先弹气泡');
      await flush();
      assert.equal(audible, 1);
      assert.equal(fetchStub.calls.length, 1);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('不归本端念：气泡立即显示，且不发合成请求', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    let audible = 0;
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '只弹气泡', voiceTo: 'web' }, () => {
        audible += 1;
      });
      assert.equal(audible, 1, '不归本端念时不能压着气泡');
      assert.equal(fetchStub.calls.length, 0);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('总开关关闭：气泡照弹', async () => {
    const fetchStub = stubFetch();
    const restoreBrowser = stubBrowser();
    let audible = 0;
    try {
      setSurface('desktop');
      setVoiceConfig('', false);
      playSayVoice({ text: '关了也要显示文字', voiceTo: 'desktop' }, () => {
        audible += 1;
      });
      await flush();
      assert.equal(audible, 1);
      assert.equal(fetchStub.calls.length, 0);
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });

  test('合成失败：气泡由兜底显示，不会丢文字', async () => {
    const fetchStub = stubFetch({ ok: false });
    const restoreBrowser = stubBrowser();
    let audible = 0;
    try {
      setSurface('desktop');
      setVoiceConfig('', true);
      playSayVoice({ text: '这句合成不出来', voiceTo: 'desktop' }, () => {
        audible += 1;
      });
      await flush();
      assert.equal(audible, 1);
      assert.equal(getVoiceState(), 'failed');
    } finally {
      restoreBrowser();
      fetchStub.restore();
    }
  });
});
