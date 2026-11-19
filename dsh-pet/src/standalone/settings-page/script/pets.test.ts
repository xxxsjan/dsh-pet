/**
 * 配置 Tab 的分段提交：每个 Tab 只把自己那一段放进请求体。
 *
 * 共用保存时任何一个字段非法都会让整包被宿主拒掉（400），用户看到的是「点了保存没生效」；
 * 分段后未传字段由宿主按磁盘旧值透传保留，别的 Tab 的草稿再坏也拦不住这一段的保存。
 * 这里直接跑片段源码里的 {@link tabBody}——它只读 state，不碰 DOM。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { petsScript } from './pets.ts';

/** 一份填满的草稿：字段齐全，只为了看清各 Tab 各自带走哪些键。 */
function globalsDraft() {
  return {
    notificationsEnabled: true,
    whisperImageEnabled: true,
    chatImageEnabled: false,
    chatAnimationEnabled: true,
    confineToScreen: false,
    trayEnabled: true,
    obsCaptureEnabled: true,
    voiceEnabled: true,
    voiceProvider: 'breeze',
    voiceName: 'voc_u3nxkd5578wc',
    voiceVolume: 0.8,
    voiceRate: 1.2,
    voiceWhisperEnabled: false,
    voiceTodoEnabled: true,
    fishTtsModel: 's2.1-pro',
    fishVoices: [{ id: 'fish-one', label: '一号' }],
    hasFishApiKey: true,
    fishApiKeyDraft: '',
    clearFishApiKey: false,
    breezeVoices: [{ id: 'voc_mine123', label: '我的鱼' }],
    hasBreezeApiKey: false,
    breezeApiKeyDraft: 'bz-new-key',
    clearBreezeApiKey: false,
    physics: {
      gravity: 1400,
      groundFriction: 2.5,
      restitution: 0.78,
      throwPower: 1,
      ceilingBounce: true,
      petCollision: true,
    },
    font: { family: 'sans', size: 21, followPet: true },
    chatMemoryRounds: 5,
    chatImageLimit: 3,
  };
}

/** 在最小上下文里跑一遍片段，拿到里面的 tabBody / voiceBody / applySavedTab。 */
function loadFixtures(physicsSource: Record<string, unknown> | null = null) {
  const context: Record<string, unknown> = {
    state: {
      globals: globalsDraft(),
      pets: { main: [{ id: 'main', size: 462 }] },
      entry: 'main',
      petIndex: 0,
      prompts: {},
    },
    physicsSource,
    clampNumber: (value: number, min: number, max: number, fallback: number) =>
      Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback)),
    FALLBACK_FONT: { family: 'sans', size: 21, followPet: true },
    FALLBACK_PHYSICS: { gravity: 1400 },
    cloneJson: (value: unknown) => JSON.parse(JSON.stringify(value)),
    console,
  };
  runInNewContext(petsScript(), context);
  return context as unknown as {
    tabBody: (tab: string) => Record<string, unknown>;
    voiceBody: () => Record<string, unknown>;
    applySavedTab: (tab: string, merged: unknown) => void;
    state: { globals: Record<string, unknown>; pets: Record<string, unknown[]> };
  };
}

test('语音 Tab 只带语音段：引擎、音色、两家 Key 与自定义目录', () => {
  const body = loadFixtures().tabBody('voice');
  assert.equal(body.voiceProvider, 'breeze');
  assert.equal(body.voiceName, 'voc_u3nxkd5578wc');
  assert.equal(body.voiceRate, 1.2);
  // Key 只在这一个 Tab 提交：草稿非空 → 写成明文由宿主落盘；没草稿的 fish 段不带 key 字段。
  assert.equal(body.breezeApiKey, 'bz-new-key');
  assert.equal('fishApiKey' in body, false, '没有 Fish 草稿时不提交空的 fishApiKey');
  assert.deepEqual(body.breezeVoices, [{ id: 'voc_mine123', label: '我的鱼' }]);
  // 与语音无关的分区一律不带，任何一段有问题都拦不住这次保存。
  for (const key of ['font', 'physics', 'notificationsEnabled', 'trayEnabled', 'pets']) {
    if (key === 'pets') continue;
    assert.equal(key in body, false, `${key} 不该出现在语音段的请求体里`);
  }
  assert.deepEqual(body.pets, [{ id: 'main', size: 462 }], 'pets 是请求体独占字段，任何一段都要原样带上草稿');
});

test('清空 Key 优先于草稿：勾了清除只提交 clear 标记', () => {
  const context = loadFixtures() as unknown as {
    state: { globals: Record<string, unknown> };
    voiceBody: () => Record<string, unknown>;
  };
  context.state.globals.clearBreezeApiKey = true;
  const body = context.voiceBody();
  assert.equal(body.clearBreezeApiKey, true);
  assert.equal('breezeApiKey' in body, false, '勾了清除时不该同时提交明文');
});

test('字体 / 物理 / 全局 Tab 各带各的段', () => {
  const fixtures = loadFixtures();
  const font = fixtures.tabBody('font');
  // 片段在 vm 上下文里跑，对象原型不同，按 JSON 比。
  assert.equal(JSON.stringify(font.font), JSON.stringify(globalsDraft().font));
  assert.equal('physics' in font, false);
  assert.equal('voiceProvider' in font, false);

  const physics = fixtures.tabBody('physics');
  assert.equal(JSON.stringify(physics.physics), JSON.stringify(globalsDraft().physics));
  assert.equal('font' in physics, false);
  assert.equal('voiceProvider' in physics, false);

  const global = fixtures.tabBody('global');
  assert.equal(global.notificationsEnabled, true);
  assert.equal(global.trayEnabled, true);
  assert.equal(global.obsCaptureEnabled, true);
  assert.equal('voiceProvider' in global, false, '全局开关段不带语音字段');
  assert.equal('font' in global, false);
  // 点击音效已下沉实例级：全局段不再带这两个键，它们随 pets 提交。
  assert.equal('clickSoundEnabled' in global, false);
  assert.equal('clickSoundVolume' in global, false);
});

test('物理段不凭空补出原配置没有的可选键', () => {
  const body = loadFixtures({ gravity: 900 }).tabBody('physics');
  const physics = body.physics as Record<string, unknown>;
  assert.equal(physics.gravity, 1400, '草稿值仍以设置页为准');
  for (const key of ['tiltGravity', 'shakeThrow', 'hapticEnabled']) {
    assert.equal(key in physics, false, `${key} 原配置没有时不该被补出来`);
  }
});

test('宠物 Tab 只提交实例列表', () => {
  const body = loadFixtures().tabBody('pet');
  assert.deepEqual(Object.keys(body), ['pets']);
  assert.deepEqual(body.pets, [{ id: 'main', size: 462 }]);
});

test('保存只回写本 Tab：别的 Tab 里没保存的草稿原样留着', () => {
  const fixtures = loadFixtures();
  const g = fixtures.state.globals as Record<string, unknown>;
  // 先在「字体」页改了一处但没保存，再去保存「语音」。
  g.font = { family: 'serif', size: 30, followPet: false };
  g.notificationsEnabled = false;

  fixtures.applySavedTab('voice', {
    main: {
      voiceProvider: 'breeze',
      voiceName: 'voc_8yud7hz7c9q2',
      voiceVolume: 0.6,
      breezeVoices: [{ id: 'voc_mine123', label: '我的鱼' }],
      hasBreezeApiKey: true,
      font: { family: 'sans', size: 21, followPet: true },
      notificationsEnabled: true,
    },
  });

  // 语音段按返回值刷新，且刚提交的 Key 草稿被清掉（改成「已保存」状态）。
  assert.equal(g.voiceName, 'voc_8yud7hz7c9q2');
  assert.equal(g.voiceVolume, 0.6);
  assert.equal(g.hasBreezeApiKey, true);
  assert.equal(g.breezeApiKeyDraft, '');
  assert.equal(g.clearBreezeApiKey, false);
  // 字体与全局开关这两笔草稿没提交过，不能被这次保存抹成磁盘值。
  assert.equal(JSON.stringify(g.font), JSON.stringify({ family: 'serif', size: 30, followPet: false }));
  assert.equal(g.notificationsEnabled, false);
});

test('宠物 Tab 保存后只回写该条目', () => {
  const fixtures = loadFixtures();
  const ctxState = fixtures.state as unknown as { pets: Record<string, unknown[]>; prompts: Record<string, string> };
  fixtures.applySavedTab('pet', { main: { pets: [{ id: 'main', size: 500 }] } });
  assert.equal(JSON.stringify(ctxState.pets.main), JSON.stringify([{ id: 'main', size: 500 }]));
});
