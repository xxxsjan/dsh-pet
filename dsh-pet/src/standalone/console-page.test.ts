/**
 * 「桌宠控制台」独立页面的契约测试。
 *
 * 与旧 `/standalone-ai/` 设置页并行：新三件套（页面/脚本/样式）走 `/standalone-console/` 路由，
 * 公开只读、不带进程令牌；旧设置页路由与入口保持不动。
 * @module dsh-pet/src/standalone/console-page.test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createRequestSecurity } from './request-security.ts';
import { listenStandaloneServer } from './server.ts';
import { consolePage, consoleScript, consoleStyle } from './console-page.ts';
import { xhsEmojiUrlMapJson } from './xhs-emoji.ts';
import type { StandaloneLogger } from './context.ts';

/** 测试里多处要按样式文本断言，收一个短别名。 */
function consoleStyles(): string {
  return consoleStyle;
}

const silent: StandaloneLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

test('控制台页面静态导出：标题、外挂脚本/样式与图标引用齐备', () => {
  const html = consolePage();
  assert.match(html, /<h1[^>]*>桌宠控制台<\/h1>/);
  assert.match(html, /href="\/standalone-console\/console\.css"/);
  assert.match(html, /src="\/standalone-console\/console\.js"/);
  assert.match(html, /src="\/standalone-ai\/icon\.png"/);
  assert.ok(consoleScript.length > 0, '脚本不应为空');
  assert.ok(consoleStyle.length > 0, '样式不应为空');
});

test('语音分区控件与本机端点接线齐备；保存体带回 pets', () => {
  const html = consolePage();
  for (const id of ['voice-provider', 'voice-name', 'voice-rate', 'voice-volume', 'voice-save', 'voice-preview-btn']) {
    assert.match(html, new RegExp(`id="${id}"`), `语音控件 ${id} 应存在于静态壳`);
  }
  for (const key of ['voice-enabled', 'voice-whisper', 'voice-todo']) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `语音开关 ${key} 应存在于静态壳`);
  }
  for (const id of ['voice-fish-key', 'voice-breeze-key', 'voice-fish-link', 'voice-breeze-link']) {
    assert.match(html, new RegExp(`id="${id}"`), `Key 控件 ${id} 应存在于静态壳`);
  }
  // Key 首次填写即保存、留空保留，不需要单独的清除入口
  assert.doesNotMatch(html, /voice-fish-clear|voice-breeze-clear/, 'FISH / Breeze Key 不应有清除按钮');
  assert.match(html, /type="password"[^>]*id="voice-fish-key"/, 'Fish Key 应为密码框，不回显明文');
  assert.match(html, /type="password"[^>]*id="voice-breeze-key"/, 'Breeze Key 应为密码框，不回显明文');
  for (const field of ['fishApiKey', 'breezeApiKey']) {
    assert.match(consoleScript, new RegExp(field), `保存体应支持 ${field} 的写入`);
  }
  assert.match(consoleScript, /hasFishApiKey/, '读取侧应按脱敏布尔判断 Fish 是否已存 Key');
  assert.match(consoleScript, /hasBreezeApiKey/, '读取侧应按脱敏布尔判断 Breeze 是否已存 Key');
  // 语音板块全量：Fish 合成模型、自定义音色目录、音量 >1 的真实增益
  for (const id of [
    'voice-fish-model',
    'voice-fish-custom-id',
    'voice-fish-custom-label',
    'voice-fish-custom-add',
    'voice-fish-custom-list',
    'voice-breeze-custom-id',
    'voice-breeze-custom-add',
    'voice-breeze-custom-list',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `语音控件 ${id} 应存在于静态壳`);
  }
  for (const field of ['fishTtsModel', 'fishVoices', 'breezeVoices']) {
    assert.match(consoleScript, new RegExp(field), `保存体应回传 ${field}，改完自定义音色才会生效`);
  }
  assert.match(consoleScript, /AudioContext/, '音量 0–3 需用 Web Audio 增益，HTMLAudio 上限只有 1');
  assert.match(consoleScript, /createGain/, '应通过 GainNode 施加真实增益');
  assert.match(consoleScript, /voiceName:\s*d\.voiceName/, '保存体应显式写入 voiceName');
  assert.match(consoleScript, /\/config/, '脚本应读取 / 写入本机配置');
  assert.match(consoleScript, /\/voice\/voices/, '脚本应拉取音色目录');
  assert.match(consoleScript, /\/voice\/speak/, '脚本应发起试听合成');
  assert.match(consoleScript, /pets:/, '保存体必须回传 pets，否则宿主整包拒绝');
});

test('其余分区全部接真控件：宠物、全局、物理、字体、模型', () => {
  const html = consolePage();
  // 宠物列表与宠物配置
  for (const id of [
    'pet-avatars',
    'pet-save',
    'pet-delete',
    'pet-name',
    'pet-size',
    'pet-size-percent',
    'pet-corner-row',
    'pet-margin-x',
    'pet-margin-y',
    'pet-persona',
    'pet-avatar-img',
    'pet-avatar-upload',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `宠物控件 ${id} 应存在于静态壳`);
  }
  // 用户要求删除「显示位置」下拉：界面不再出现该控件，保存时沿用条目原有 display
  assert.doesNotMatch(html, /id="pet-display"/, '「显示位置」控件不应再出现在界面');
  assert.doesNotMatch(consoleScript, /pet-display/, '脚本不应再绑定已删除的控件');
  for (const key of ['pet-balance', 'pet-whisper', 'pet-work', 'pet-fixed', 'pet-click']) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `宠物开关 ${key} 应存在于静态壳`);
  }
  assert.match(html, /id="pet-click-volume"/, '点击音效音量（实例级）应在宠物面板');
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    assert.match(html, new RegExp(`data-corner="${corner}"`), `角落按钮 ${corner} 应存在`);
  }
  assert.match(html, /class="fields petFields"/, '宠物字段区应带紧凑作用域类，不影响其他卡片');
  // 全局开关 / 物理 / 外观字体（对话上下文卡已按旧页删除）
  for (const id of [
    'global-save',
    'ph-gravity',
    'ph-restitution',
    'ph-friction',
    'ph-power',
    'physics-save',
    'font-family',
    'font-size',
    'font-save',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `分区控件 ${id} 应存在于静态壳`);
  }
  // 旧页没有「对话上下文」这张卡（modelCard 从未接线），这六个字段一并对齐移除
  for (const gone of [
    'chat-memory',
    'chat-image-limit',
    'whisper-provider',
    'whisper-model',
    'chat-provider',
    'chat-model',
    'dialog-save',
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${gone}"`), `旧页没有该控件，不应出现：${gone}`);
  }
  for (const gone of ['chatMemoryRounds', 'chatImageLimit', 'whisperModel', 'chatModel']) {
    assert.doesNotMatch(consoleScript, new RegExp(gone), `旧页不暴露该字段，脚本不应再写：${gone}`);
  }
  for (const key of [
    'g-notify',
    'g-confine',
    'g-tray',
    'g-obs',
    'g-whisper-image',
    'g-chat-image',
    'g-chat-anim',
    'ph-ceiling',
    'ph-collide',
    'font-follow',
  ]) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `开关 ${key} 应存在于静态壳`);
  }
  // 点击音效已下沉宠物面板：全局开关里不再有它的开关与音量。
  assert.doesNotMatch(html, /data-switch="g-click"/, '全局开关不应再有点击音效');
  assert.doesNotMatch(html, /id="g-click-volume"/, '全局开关不应再有点击音效音量');
  // 三个手机端体感开关（碰撞震动 / 倾斜控制重力 / 摇一摇抛出）旧页没有 UI，控制台一并对齐移除
  for (const gone of ['ph-haptic', 'ph-tilt', 'ph-shake']) {
    assert.doesNotMatch(html, new RegExp(`data-switch="${gone}"`), `旧页物理卡没有该开关，不应出现：${gone}`);
  }
  for (const gone of ['碰撞震动', '倾斜控制重力', '摇一摇抛出']) {
    assert.ok(!html.includes(gone), `旧页没有这行开关，文案也不应残留：${gone}`);
  }
  // 这些分区提交的都是宿主真实字段名，写错一个就会整包失败（点击音效两字段已下沉 pets，见下方宠物段断言）
  for (const field of [
    'notificationsEnabled',
    'confineToScreen',
    'trayEnabled',
    'obsCaptureEnabled',
    'whisperImageEnabled',
    'chatImageEnabled',
    'chatAnimationEnabled',
    'physics',
    'font',
  ]) {
    assert.match(consoleScript, new RegExp(`${field}:`), `保存体应回传 ${field}`);
  }
  // 点击音效开关与音量走实例级：开关有 pet 映射，音量写进当前宠物草稿。
  assert.match(consoleScript, /'pet-click': 'clickSoundEnabled'/, '点击音效开关应映射到宠物实例字段');
  assert.match(
    consoleScript,
    /'pet-click-volume': function \(pet, value\) \{ pet\.clickSoundVolume/,
    '点击音效音量应写进宠物实例',
  );
  for (const sub of ['gravity', 'restitution', 'groundFriction', 'throwPower', 'ceilingBounce', 'petCollision']) {
    assert.match(consoleScript, new RegExp(`${sub}:`), `physics 段必须写全，缺子键会整段非法：${sub}`);
  }
  // 三个可选体感键：界面不编辑，但要「原配置写过才原值带回」，避免保存物理时凭空补键或抹掉手改值
  assert.match(
    consoleScript,
    /PHYSICS_OPTIONAL_KEYS = \['hapticEnabled', 'tiltGravity', 'shakeThrow'\]/,
    '可选体感键清单应显式列出',
  );
  assert.match(consoleScript, /function physicsOptionalOf\(main\)/, '应记录原配置里写过的可选键');
  assert.match(consoleScript, /if \(key in optional\) out\[key\] = optional\[key\]/, '保存物理时只透传原配置写过的键');
  assert.match(consoleScript, /followPet:/, 'font 段需带上 followPet');
  assert.match(consoleScript, /family:/, 'font 段需带上 family');
  // 每个开关都必须有点击映射：漏一个就会出现「拨了开关但保存没变」的假功能
  const switchKeys = new Set<string>();
  for (const m of html.matchAll(/data-switch="([^"]+)"/g)) switchKeys.add(m[1] as string);
  for (const key of switchKeys) {
    assert.match(consoleScript, new RegExp(`'${key}':`), `开关 ${key} 缺少点击映射，改动不会进入草稿`);
  }
  // 右侧格区的恢复默认入口走同一重置端点
  assert.match(html, /id="console-sync"/, '右侧格区应有恢复默认入口');
  assert.match(consoleScript, /api\('POST', '\/config'\)/, '重置走 POST /config（内置默认覆盖）');
});

test('内置条目不显示上传入口：静态按钮默认隐藏，渲染时按素材根显隐', () => {
  const html = consolePage();
  // 静态壳默认 hidden：配置加载完成前也不会闪现一个点不动的按钮。
  assert.match(html, /id="pet-avatar-upload" hidden/, '内置条目下上传按钮应默认隐藏');
  // 用户要求移除头像区那行说明，节点与文案都不该再出现
  assert.doesNotMatch(html, /id="pet-avatar-hint"/, '头像提示行应已移除');
  assert.doesNotMatch(html, /内置条目固定用包里的 logo/, '这行头像说明应已移除');
  // 素材根判断只有一处口径：缺省 assetRoot 一律按内置 main。
  assert.match(consoleScript, /function petRoot\(pet\)[\s\S]*?'main'/, 'petRoot 应把缺省素材根回落为 main');
  assert.match(consoleScript, /var editable = root !== 'main'/, '只有非 main 条目才可换头像');
  assert.match(consoleScript, /uploadBtn\.hidden = !editable/, '渲染表单时应按可编辑性控制上传按钮显隐');
  assert.match(consoleScript, /deleteBtn\.hidden = !editable/, '内置主宠物不显示删除按钮');
  // 点上传时仍给出原因，不留一个闷声无反应的按钮
  assert.match(consoleScript, /内置条目的头像固定用包里的 logo/, '内置条目点上传时应给出原因');
  assert.match(consoleScript, /loadAvatar\(byId\('pet-avatar-img'\), root\)/, '头像预览应按当前素材根加载');
});

test('桌面式布局：左侧宠物头像区、右侧设置入口格，配置收进居中面板浮层', () => {
  const html = consolePage();
  const css = consoleStyles();
  // 桌面主区左右分栏：宠物头像 + 设置入口图标格
  assert.match(html, /<section class="desktop">/, '主区应为桌面容器');
  assert.match(html, /class="petDesk"/, '左侧为宠物头像区');
  assert.match(html, /class="settingsGrid"/, '右侧为设置入口格');
  // 直播平台入口列：纵向四张卡片，位于宠物区与设置格之间，与设置格逐行对齐
  assert.match(html, /class="liveEntryGrid"/, '应有直播平台入口列');
  assert.ok(
    html.indexOf('class="liveEntryGrid"') < html.indexOf('class="settingsGrid"'),
    '平台入口列应排在设置入口格左侧',
  );
  assert.match(css, /\.desktop\{display:grid;grid-template-columns:1fr auto auto/, '桌面主区应为三栏');
  assert.match(
    css,
    /\.liveEntryGrid\{display:grid;grid-template-columns:minmax\(118px,1fr\)/,
    '平台入口列应为纵向单列网格',
  );
  assert.match(css, /\.liveDeskEntry\.is-active\{border-color:var\(--primary\)/, '当前平台入口应有选中高亮');
  assert.match(
    css,
    /\.liveEntryGrid\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/,
    '窄屏平台入口列应回落为一行四个',
  );
  // 七个设置入口各自绑定一个面板
  const panels = [
    'pet-panel',
    'global-panel',
    'physics-panel',
    'font-panel',
    'voice-panel',
    'ai-panel',
    'advanced-panel',
  ];
  for (const p of panels) {
    assert.match(html, new RegExp(`data-panel="${p}"`), `设置入口应指向 ${p}`);
    assert.match(html, new RegExp(`id="${p}"`), `应存在对应面板浮层 ${p}`);
  }
  // 面板为居中模态浮层
  assert.match(css, /\.panelMask\{position:fixed/, '面板遮罩应铺满视口');
  assert.match(css, /\.panelDialog\{width:min\(720px,100%\)/, '面板宽度应有上限');
  assert.match(css, /\.panelBody\{[^}]*overflow-y:auto/, '面板内容区应可滚动');
  // 瀑布流已拆除：不再保留多列堆叠规则
  assert.doesNotMatch(css, /\.grid\{display:block;column-count:2/, '不应再有两列瀑布流');
  assert.doesNotMatch(css, /column-span:all/, '不应再残留通栏跨列写法');
  // 窄屏桌面回落到单列
  assert.match(css, /@media \(max-width:880px\)\{\.desktop\{grid-template-columns:1fr\}/, '窄屏桌面应回落到单列');
});

test('主题切换按钮可用：读写 /ui-theme、按磁盘值纠正、深色变量齐备', () => {
  const html = consolePage();
  assert.match(html, /id="theme-toggle"/, '顶部应有主题切换按钮');
  assert.match(html, /class="sloganBadge themeToggle"/, '按钮应带 themeToggle 类，否则没有点击样式');
  assert.doesNotMatch(html, /<span class="sloganBadge" aria-hidden="true">/, '原装饰性图标不应再挡住主题按钮');
  assert.match(consoleScript, /'\/ui-theme'/, '主题需写入 /ui-theme，控制台与旧设置页共用同一份偏好');
  assert.match(consoleScript, /result\.saved === false/, '磁盘无记录时应把浏览器本地选择迁过去');
  assert.match(consoleScript, /aria-pressed/, '按钮需反映当前是否深色');
  assert.match(consoleScript, /colorScheme/, '深色下需同步 colorScheme，滚动条与原生控件才会跟随');
  assert.match(consoleStyles(), /html\[data-theme=dark\]/, '缺少深色变量块，切到 dark 会没有配色');
  assert.match(
    consoleStyles(),
    /html\[data-theme=dark\] \.themeToggle \.iconSun\{display:none\}/,
    '深色下太阳图标应隐藏',
  );
  assert.match(consoleStyles(), /console-bg\.webp/, '浅色 body 应引用控制台背景图');
  assert.match(
    consoleStyles(),
    /html\[data-theme=dark\] body\{background-image:url\('\/standalone-console\/console-bg-dark\.webp'\)\}/,
    '暗色下应引用暗色背景图',
  );
});

test('板块与旧设置页对齐：宠物、全局开关、字体、物理、模型、语音、高级', () => {
  const html = consolePage();
  const titles = [...html.matchAll(/class="cardTitle"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(
    titles,
    ['宠物', '全局开关', '字体', '物理', '模型', '语音', '高级'],
    '七个板块的顺序与名称要与旧页配置 Tab 一一对应',
  );
  // 旧页没有「移动端效果」板块：那张卡与它的保存按钮都不该再有；它的三个体感开关旧页物理卡也没做，一并不放
  assert.doesNotMatch(html, /移动端效果/, '不应再有独立「移动端效果」板块');
  assert.doesNotMatch(html, /id="mobile-save"/, '移动端卡的保存按钮应已移除');
  assert.doesNotMatch(consoleScript, /saveMobile/, '脚本不应再有移动端分段保存');
  const physicsSection = html.slice(
    html.indexOf('id="physics-panel-title">物理<'),
    html.indexOf('id="ai-panel-title">模型<'),
  );
  for (const key of ['ph-ceiling', 'ph-collide']) {
    assert.ok(physicsSection.includes(`data-switch="${key}"`), `物理板块应包含开关 ${key}`);
  }
  assert.equal((physicsSection.match(/data-switch="ph-/g) ?? []).length, 2, '物理卡只保留旧页那两个开关');
  // 全局开关对齐旧页（点击音效已下沉宠物卡；三个配图 / 动作联动开关原先落在模型卡）
  const globalSection = html.slice(
    html.indexOf('id="global-panel-title">全局开关<'),
    html.indexOf('id="font-panel-title">字体<'),
  );
  for (const key of ['g-notify', 'g-whisper-image', 'g-chat-image', 'g-chat-anim', 'g-confine', 'g-tray', 'g-obs']) {
    assert.ok(globalSection.includes(`data-switch="${key}"`), `全局开关板块应包含 ${key}`);
  }
  assert.ok(!globalSection.includes('点击音效'), '点击音效不应再出现在全局开关板块');
  const petSection = html.slice(
    html.indexOf('id="pet-panel-title">宠物<'),
    html.indexOf('id="global-panel-title">全局开关<'),
  );
  assert.ok(petSection.includes('data-switch="pet-click"'), '点击音效开关应在宠物板块');
  assert.ok(petSection.includes('id="pet-click-volume"'), '点击音效音量应在宠物板块');
  const modelSection = html.slice(
    html.indexOf('id="ai-panel-title">模型<'),
    html.indexOf('id="voice-panel-title">语音<'),
  );
  assert.ok(!modelSection.includes('g-chat-image'), '模型板块不应再放配图开关');
  // 高级卡：落盘位置只读清单 + 覆盖按钮，与旧页 advancedCard 同源
  assert.match(html, /id="advanced-paths"/, '高级卡应有路径清单容器');
  assert.match(html, /id="advanced-sync"/, '高级卡应有「用内置默认覆盖用户配置」按钮');
  assert.match(consoleScript, /\/config\/meta/, '路径清单应来自 GET /config/meta');
  assert.match(consoleScript, /syncDefault\('advanced-status', 'advanced-sync'\)/, '高级卡按钮应复用同一重置动作');
  assert.match(consoleScript, /function renderAdvanced/, '脚本应渲染路径清单');
});

test('模型连接表单与旧页「模型」Tab 对等：协议、地址、模型拉取、密钥、余额、测试与保存', () => {
  const html = consolePage();
  for (const id of [
    'ai-protocol',
    'ai-base-url',
    'ai-model',
    'ai-model-fetch',
    'ai-model-picked',
    'ai-api-key',
    'ai-key-delete',
    'ai-balance-provider',
    'ai-test-btn',
    'ai-balance-btn',
    'ai-save',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`), `模型连接表单缺少控件 ${id}`);
  }
  // 协议与余额服务商的选项集合必须与旧页一致，多一个少一个都会写进非法枚举
  for (const value of ['openai-compatible', 'anthropic'])
    assert.ok(html.includes(`value="${value}"`), `协议缺少 ${value}`);
  for (const value of ['', 'deepseek-official', 'opencode-go', 'commandcode'])
    assert.ok(html.includes(`<option value="${value}"`), `余额服务商缺少 ${value}`);
  // 密钥不回显：输入框是 password 且初始为空、删除按钮默认隐藏
  assert.match(
    html,
    /id="ai-api-key" type="password" autocomplete="new-password" placeholder="留空保留已保存的密钥"/,
    '密钥输入框应为 password 且提示留空保留',
  );
  assert.match(html, /id="ai-key-delete" hidden/, '删除密钥按钮应默认隐藏，按 hasKey 显隐');
  // 四个端点都要走独立模式自己的前缀
  for (const path of ['/standalone-ai', "'/settings'", "'/test'", "'/balance'", "'/models'"]) {
    assert.ok(consoleScript.includes(path), `脚本应使用 ${path}`);
  }
  assert.match(consoleScript, /clearApiKey: true/, '删除密钥要发 clearApiKey');
  assert.match(consoleScript, /hasKey/, '密钥状态只能按 hasKey 显示');
});

test('说明文字与占位符对齐旧页口径：卡片说明、开关解释、人设全文占位与字数', () => {
  const html = consolePage();
  // 卡片说明：宠物 / 全局 / 物理三处保留；语音卡按用户要求去掉标题下的说明
  for (const sentence of [
    '这里编辑的是默认条目的实例；改动在点保存后写盘。',
    '对所有宠物生效；保存后立即写盘。',
    '所有宠物共用；数值改动保存后生效。',
  ]) {
    assert.match(html, new RegExp(`class="cardHint">${sentence}`), `缺少卡片说明：${sentence}`);
  }
  assert.ok(!html.includes('桌宠开口说话用的引擎、音色与音量'), '语音卡不应再有标题下说明');
  assert.ok(!html.includes('关闭后所有语音都静音'), '语音卡不应再有总开关说明段落');
  // 开关解释：按用户要求所有开关只留标题，不再带一行小字
  const switchHints = html.match(/class="switchHint"/g) ?? [];
  assert.equal(switchHints.length, 0, `开关解释应全部移除，实际还有 ${switchHints.length} 条`);
  for (const removed of [
    '开启后这只宠物会在余额变化时播动画并显示气泡。',
    '对话完成、生成失败、权限申请等事件弹出系统通知。',
    '抛掷与自主漫游只在当前所在的这块屏幕里活动。',
    '关掉只影响周期碎碎念，手动对话照常发声。',
    '关掉后上方没有边界，抛掷可以飞出屏幕顶部。',
    '飞行中的宠物撞到其它宠物时按动量弹开。',
    '关掉后恒为上面的字号，不随窗口尺寸变化。',
    '体感与震动只在手机浏览器（HTTPS / localhost）生效',
    '服务商与模型必须成对填写',
  ]) {
    assert.ok(!html.includes(removed), `这些说明应已移除：${removed}`);
  }
  // 字段级说明与占位符
  // 占屏宽度的「留空按 px 显示」改由 placeholder 承载，不再占一行说明
  assert.match(
    html,
    /id="pet-size-percent" type="number" min="1" step="1" placeholder="留空 = 按 px 显示"/,
    '占屏宽度缺「留空按 px」占位符',
  );
  assert.ok(!html.includes('留空表示按 px 显示。'), '这条说明应已并入占位符');
  assert.match(html, /1 = 100%；短提示音不做增益放大。/, '点击音效音量缺说明');
  assert.ok(!html.includes('1 为原速；试听按当前值直接合成'), '语速说明应已移除');
  assert.ok(!html.includes('超过 1 用增益放大'), '音量说明也应已移除');
  assert.ok(!html.includes('换音色可直接试听'), '音色说明应已移除');
  assert.ok(!html.includes('0 表示不带历史。'), '记忆轮数说明应已移除');
  assert.ok(!html.includes('0 表示不限制。'), '配图上限说明应已移除');
  assert.ok(!html.includes('只影响气泡与悬浮提示，对话窗字号不变'), '字号说明应已移除');
  assert.ok(html.includes('Fish 音色库里的 Voice ID（字母数字与 _-）'), 'Fish 音色占位符应给 ID 格式');
  assert.match(html, /大肥鱼（自定义）/, '显示名占位符应给示例而不是标签重复');
  // 人设：占位符放条目人设全文 + 字数统计（旧页 personaWrap 口径）
  assert.match(html, /id="pet-persona-hint"/, '人设应有动态说明位');
  assert.match(html, /id="pet-persona-count"/, '人设应有字数统计');
  assert.match(html, /发给模型的 system = 这段 \+ 自动追加的名字与时间背景/, '人设缺 system 拼装说明');
  assert.match(
    consoleScript,
    /area\.placeholder = entryPrompt \|\| '留空则没有系统提示词'/,
    '人设占位符应取条目人设全文',
  );
  assert.match(consoleScript, /输入框里的灰色文字就是那份内容/, '人设说明应点明灰色文字即条目人设');
  // 头像那行说明已按用户要求移除，长边上限口径仍留在后端的缩放实现里
  assert.ok(!consoleScript.includes('超过长边 512 会自动缩小'), '头像说明应已移除');
});

test('控制台三件套经本机服务公开只读可访问；页面不回显令牌；旧设置页路由不受影响', async () => {
  const security = createRequestSecurity();
  const server = await listenStandaloneServer({ port: 0, security, logger: silent, routes: [] });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const cases: Array<[string, RegExp]> = [
      ['/standalone-console/', /^text\/html/],
      ['/standalone-console/console.js', /^text\/javascript/],
      ['/standalone-console/console.css', /^text\/css/],
    ];
    for (const [path, type] of cases) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') ?? '', type, path);
      assert.match(response.headers.get('content-security-policy') ?? '', /script-src 'self'/, path);
      const body = await response.text();
      assert.ok(!body.includes(security.token), `控制台资源不得回显进程令牌：${path}`);
    }
    // 旧 AI 设置页外壳仍是公开只读，路由未被新控制台改动挤占。
    const legacy = await fetch(base + '/standalone-ai/');
    assert.equal(legacy.status, 200);
    assert.doesNotMatch(await legacy.text(), new RegExp(security.token));
    // 控制台背景图与 favicon 同口径：浏览器子资源不带令牌，必须公开只读；源码形态包内素材不可达时回 404。
    const background = await fetch(base + '/standalone-console/console-bg.webp');
    assert.notEqual(background.status, 403, '背景图不得要求令牌');
    assert.ok(
      background.status === 404 || background.headers.get('content-type') === 'image/webp',
      '背景图要么缺失 404，要么是 WebP',
    );
    await background.arrayBuffer();
    // 暗色背景图与浅色同口径：公开只读，缺失时回 404。
    const backgroundDark = await fetch(base + '/standalone-console/console-bg-dark.webp');
    assert.notEqual(backgroundDark.status, 403, '暗色背景图不得要求令牌');
    assert.ok(
      backgroundDark.status === 404 || backgroundDark.headers.get('content-type') === 'image/webp',
      '暗色背景图要么缺失 404，要么是 WebP',
    );
    await backgroundDark.arrayBuffer();
    // 静态资源只接受 GET/HEAD：鉴权先于方法判定，未带令牌的写方法一律 403（与旧设置壳口径一致）。
    for (const path of [
      '/standalone-console/',
      '/standalone-console/console.js',
      '/standalone-console/console.css',
      '/standalone-console/console-bg.webp',
      '/standalone-console/console-bg-dark.webp',
    ]) {
      const rejected = await fetch(base + path, { method: 'POST' });
      assert.equal(rejected.status, 403, path);
      await rejected.text();
    }
  } finally {
    await server.close();
  }
});

test('对话入口：底部 Dock 里的图标按钮 + 弹窗即对话窗口，复用旧页那份面板产物', () => {
  const html = consolePage();
  const styles = consoleStyles();
  // 入口挂在页面底部 Dock 功能区里，不是头像区
  const dockBar = html.slice(html.indexOf('<nav class="dockBar"'), html.indexOf('</nav>'));
  assert.match(dockBar, /id="chat-open"/, '对话入口应在底部 Dock');
  assert.match(dockBar, /class="chatEntry"/, '对话入口应是圆形图标按钮');
  assert.match(html, /id="chat-dialog"/, '缺少对话弹窗遮罩');
  assert.match(html, /id="chat-close"/, '弹窗应有关闭按钮');
  // 弹窗里的容器 id 必须与 chat-panel bundle 的挂载点一致，否则面板不会挂上
  assert.match(html, /id="pet-chat-root"/, '弹窗内必须是面板挂载点 #pet-chat-root');
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/, '弹窗应按模态对话框标注');
  // 面板脚本走控制台自己的路由，与旧页共用同一份产物
  assert.match(html, /src="\/standalone-console\/chat-panel\.js" defer/, '页面应引用控制台路径下的面板脚本');
  assert.ok(
    html.indexOf('/standalone-console/console.js') < html.indexOf('/standalone-console/chat-panel.js'),
    '控制台脚本必须先执行：它要在面板发请求之前装好令牌注入',
  );
  // 样式：面板只吃 --dsw-* token，控制台要把自己的色板映射进去，并整份拼进 PANEL_CSS
  assert.match(styles, /\.chatMask\{position:fixed/, '遮罩应铺满视口');
  assert.match(
    styles,
    /\.chatDialog\{width:min\(880px,100%\);height:min\(90vh,900px\)/,
    '弹窗尺寸应放大到 880×900 上限',
  );
  assert.match(styles, /@media \(max-width:880px\)\{\.chatMask\{padding:12px\}/, '窄屏应让弹窗吃满遮罩');
  assert.match(
    styles,
    /\.chatDialog\{[^}]*--dsw-alias-label-primary:var\(--label-primary\)/,
    '面板 token 应映射到控制台色板',
  );
  assert.match(styles, /\.chatDialog\{[^}]*--dsw-radius-md:10px/, '面板圆角也要给值，否则面板边框与气泡会塌成直角');
  assert.match(styles, /\.pet-chat \{[^}]*display: flex/, '面板样式（PANEL_CSS）应整份拼进控制台样式');
  assert.match(styles, /\.pet-chat-composer/, '输入区样式应随 PANEL_CSS 一起下发');
  // 脚本：令牌注入 + 弹窗开关（Esc / 点遮罩 / 关闭按钮）
  assert.match(consoleScript, /__blueFishChatFetch/, '应给同源 /blue-fish/ 请求补令牌，面板本身不带凭据');
  assert.match(consoleScript, /headers\.set\('X-Blue-Fish-Token', TOKEN\)/, '补齐的头必须是启动令牌');
  assert.match(consoleScript, /function setChatDialog\(open\)/, '弹窗开关应是单一入口函数');
  assert.match(consoleScript, /event\.key === 'Escape'/, 'Esc 应能关闭弹窗');
  assert.match(consoleScript, /event\.target === chatDialog/, '点遮罩空白处应能关闭弹窗');
  assert.match(consoleScript, /\.pet-chat-input/, '打开弹窗应把焦点交给输入框');
  // Dock 悬浮底部居中；独立直播间窗口里不显示这套入口
  assert.match(styles, /\.dockBar\{position:fixed/, 'Dock 应固定悬浮在视口底部');
  assert.match(styles, /body\.live-standalone \.dockBar\{display:none/, '独立直播间模式应隐藏 Dock');
});

test('统一直播间弹窗：控制台平台入口按平台打开、窗内不切平台、弹幕铺满主区；各平台面板与接口齐备', () => {
  const html = consolePage();
  const styles = consoleStyles();
  const script = consoleScript;

  // 入口：底部 Dock 只保留对话入口，不再放直播间 icon（直播间由平台入口卡打开）
  const dockBar = html.slice(html.indexOf('<nav class="dockBar"'), html.indexOf('</nav>'));
  assert.doesNotMatch(dockBar, /id="live-open"/, '底部 Dock 不应再有直播间入口 icon');

  // 弹窗骨架：遮罩、标题「直播间 · 平台」、关闭按钮、内联配置区、底部操作条；头部不再有平台 Tab
  assert.match(html, /id="live-dialog"/, '缺少直播间弹窗遮罩');
  assert.match(html, /id="live-dialog-title"[^>]*>[\s\S]*?直播间/, '弹窗标题应是「直播间」');
  assert.match(html, /id="live-title-plat"/, '标题应带当前平台名占位');
  assert.match(html, /id="live-close"/, '弹窗应有关闭按钮');
  assert.doesNotMatch(html, /id="live-logos"|liveLogoRow|data-select=/, '弹窗头部不应再有平台 logo Tab 行');
  assert.match(html, /id="live-config-pane"/, '配置区应内联在弹窗主区');
  assert.doesNotMatch(html, /id="live-config-mask"/, '配置不该再是从右侧滑出的抽屉');
  assert.doesNotMatch(html, /id="live-config-close"/, '配置区不再是独立模态，没有自己的关闭钮');
  assert.match(html, /id="live-start"[^>]*>开始监听</, '底部应有唯一的「开始监听」按钮');

  // 控制台四张平台入口卡：可点开对应平台配置、监听徽标挂在入口卡上；弹幕面板留给小窗
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(html, new RegExp(`data-platform="${p}"`), `应有平台项 ${p}`);
    assert.match(html, new RegExp(`data-live="${p}"`), `平台入口应可点开 ${p}`);
    assert.match(html, new RegExp(`data-panel="${p}"`), `配置区内应含设置面板 ${p}`);
    assert.match(html, new RegExp(`data-pill="${p}"`), `平台入口应有监听徽标 ${p}`);
    assert.match(html, new RegExp(`data-feed="${p}"`), `弹幕面板仍需保留给弹幕小窗 ${p}`);
  }
  // 入口顺序按用户要求：抖音 → 快手 → 小红书 → B站
  assert.match(
    html,
    /data-live="dm"[\s\S]*?data-live="ks"[\s\S]*?data-live="xs"[\s\S]*?data-live="bl"/,
    '平台入口顺序应为 抖音/快手/小红书/B站',
  );
  // 抖音 logo 按用户选定改为官方黑底方块样式：黑圆角方块 + 白音符青红错位，与其余平台方块图标同规格
  assert.match(
    html,
    /data-live="dm"[\s\S]*?<rect width="24" height="24" rx="6" fill="#161823"\/>[\s\S]*?fill="#25F4EE"[\s\S]*?fill="#FE2C55"[\s\S]*?fill="#FFFFFF"/,
    '抖音 logo 应为黑底方块 + 白音符青红错位',
  );
  assert.doesNotMatch(html, /dmIcon/, '旧的白底抖音图标类应移除');
  assert.doesNotMatch(styles, /\.dmIcon/, '旧的白底抖音图标样式应移除');

  // 各平台原面板字段仍保留在配置区里；启动/停止改由底部统一按钮驱动，卡片里不再各放一套
  const dmIds = ['dm-url', 'dm-cookie', 'dm-reply-chat', 'dm-thank-gift', 'dm-msg', 'dm-status', 'dm-feed'];
  const xsIds = ['xs-reply-chat', 'xs-thank-gift', 'xs-msg', 'xs-status', 'xs-feed'];
  const ksIds = ['ks-url', 'ks-cookie', 'ks-reply-chat', 'ks-thank-gift', 'ks-msg', 'ks-status', 'ks-feed'];
  const blIds = ['bl-url', 'bl-cookie', 'bl-reply-chat', 'bl-thank-gift', 'bl-msg', 'bl-status', 'bl-feed'];
  for (const id of [...dmIds, ...xsIds, ...ksIds, ...blIds]) {
    assert.match(html, new RegExp(`id="${id}"`), `弹窗内缺少原面板控件：${id}`);
  }
  for (const id of ['dm-toggle', 'xs-toggle', 'ks-toggle', 'bl-toggle']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `平台卡片里不该再各自放一套按钮：${id}`);
  }
  // 「跳转直播间」：抖音/快手/B站有直播间地址；状态行下方的纯文本动作，和「刷新状态」同一行、刷新在左
  for (const id of ['dm-open-live', 'ks-open-live', 'bl-open-live']) {
    assert.match(html, new RegExp(`id="${id}"`), `应有「跳转直播间」动作：${id}`);
  }
  assert.doesNotMatch(html, /class="linkBtn"/, '不应再有蓝色「跳转直播间」按钮');
  for (const p of ['dm', 'ks', 'bl']) {
    assert.match(
      html,
      new RegExp(
        `class="liveOpenLiveRow"><button[^>]*class="liveStatusRefresh"[^>]*id="${p}-refresh">刷新状态</button><button[^>]*class="liveOpenLiveText"[^>]*id="${p}-open-live"[^>]*>跳转直播间</button>`,
      ),
      `「刷新状态」应排在「跳转直播间」左侧：${p}`,
    );
  }
  assert.match(styles, /\.liveOpenLiveText\{[^}]*background:none/, '跳转直播间应为纯文本样式');
  assert.match(styles, /\.liveOpenLiveRow\{[^}]*display:flex/, '刷新与跳转应并排');
  assert.doesNotMatch(html, /id="xs-open-live"/, '小红书没有直播间地址，不该有「跳转直播间」按钮');
  // 小红书走中控台扫码登录，按用户要求不再提供 Cookie 输入框（后端 cookie 参数仍可选，前端不传）
  assert.doesNotMatch(html, /id="xs-cookie"/, '小红书配置卡不应再有 Cookie 输入框');
  assert.match(html, /class="liveLoginNote">小红书需要扫码登录后使用。<\/p>/, '小红书面板登录说明应为一句话短提示');
  assert.doesNotMatch(script, /xs-cookie/, '脚本不应再读写小红书 Cookie 输入框');
  // 头部「弹幕监听 · 平台」副标题小字按用户要求移除
  assert.doesNotMatch(html, /live-dialog-sub|liveSub|弹幕监听 ·/, '头部不应再有副标题小字');
  assert.doesNotMatch(styles, /\.liveSub/, '副标题样式应一并移除');
  // 弹幕区「0 / 50」计数徽章按用户要求移除（礼物计数徽章保留）
  assert.doesNotMatch(html, /feed-meta/, '弹幕区不应再有计数徽章');
  assert.doesNotMatch(script, /feed-meta/, '脚本不应再更新弹幕计数徽章');
  assert.match(html, /id="dm-gift-meta"/, '礼物计数徽章保留');
  // 「打开弹幕小窗」底栏按钮按用户要求移除：入口改为主页监听状态卡的「弹幕小窗」文字链接
  assert.doesNotMatch(html, /id="live-open-mini"/, '底栏不应再有打开弹幕小窗按钮');
  assert.doesNotMatch(script, /live-open-mini/, '脚本不应再绑定底栏弹幕小窗按钮');
  // 「刷新状态」不再是底栏按钮，也不再占用状态行右侧：与「跳转直播间」同一行，排在其左侧（小红书只有它自己）
  assert.doesNotMatch(html, /id="live-refresh"/, '底栏不应再有刷新状态按钮');
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(
      html,
      new RegExp(`class="liveStatusRow"><p class="liveStatus" id="${p}-status">[^<]*</p></div>`),
      `状态行只保留状态文案：${p}`,
    );
  }
  assert.match(
    html,
    /class="liveOpenLiveRow"><button[^>]*class="liveStatusRefresh" id="xs-refresh">刷新状态<\/button><\/div>/,
    '小红书动作行只有刷新状态',
  );
  assert.match(styles, /\.liveStatusRefresh\{[^}]*background:none/, '刷新状态应为纯文本样式');
  // 底栏布局：左侧当前平台的回复/感谢开关，右侧按钮且「开始监听」在最右
  assert.match(
    html,
    /class="liveFootLeft"[\s\S]*?data-foot-switches="dm"[\s\S]*?data-foot-switches="bl"[\s\S]*?class="liveFootRight"><button[^>]*id="live-start">开始监听</,
    '底栏应为左开关右按钮，开始监听在最右',
  );
  assert.doesNotMatch(html, /class="dmSwitches"/, '开关不应再留在配置卡里');
  assert.match(script, /data-foot-switches="' \+ p/, '切平台应同步切换底栏开关组');
  assert.match(
    html,
    /id="dm-url"[\s\S]*?placeholder="粘贴直播间链接，或直接填纯数字房间号"/,
    '直播间输入框占位符应与旧页一致',
  );
  assert.match(
    html,
    /id="dm-cookie"[\s\S]*?placeholder="不填将弹出窗口扫码登录；有登录 Cookie 可粘贴到这里"/,
    'Cookie 占位符应说明不填走弹窗扫码',
  );
  assert.doesNotMatch(html, /id="panel-danmaku"/, '控制台里不该出现旧页的面板容器');

  // 主页监听状态卡：监听中显示，无监听整块隐藏
  assert.match(html, /id="live-monitor-card"[^>]*hidden/, '主页应有默认隐藏的监听状态卡容器');
  assert.match(html, /id="lm-stop"[^>]*>停止监听/, '状态卡应有停止监听快捷按钮');
  assert.match(html, /id="lm-mini"[^>]*>弹幕小窗/, '状态卡应有弹幕小窗文字链接');
  assert.match(html, /id="lm-mini"[\s\S]*?id="lm-open"[^>]*>跳转直播间/, '弹幕小窗应排在跳转直播间左侧');
  assert.match(html, /id="lm-open"[^>]*>跳转直播间/, '状态卡默认应有跳转直播间链接');
  assert.match(
    html,
    /id="lm-title"[\s\S]*?id="lm-anchor"[\s\S]*?id="lm-room"[\s\S]*?id="lm-chat"[\s\S]*?id="lm-gift"[\s\S]*?id="lm-url"/,
    '状态卡应含标题/主播/房间/计数/地址字段',
  );
  assert.match(script, /function renderLiveMonitorCard\(\)/, '应有状态卡渲染收口');
  assert.match(script, /liveMonitorSnapshots/, '状态卡应读取各平台最近状态快照');
  assert.match(script, /card\.hidden = true/, '无监听时状态卡整块隐藏');
  assert.match(script, /liveStoppers\[liveMonitorPlatform\]/, '停止按钮应停掉当前监听平台');
  assert.match(script, /liveOpenRoom\(liveMonitorPlatform\)/, '普通直播间链接应复用现有直播间跳转');
  assert.match(script, /liveOpenMini\(liveMonitorPlatform\)/, '弹幕小窗链接应打开当前监听平台的小窗');
  assert.match(
    script,
    /!LIVE_MINI && !LIVE_STANDALONE[\s\S]*?setInterval\(function \(\) \{ void refreshLiveMonitorCard\(\); \}, 5000\)/,
    '控制台主页应有兜底轮询，小窗里停止监听后不残留「监听中」',
  );
  // 中控台快照（如小红书 live_center_control）：右下角改为「打开中控台」，弹回内嵌窗，不再跳外部浏览器直播间
  assert.match(script, /function isCenterControlUrl\(/, '应有中控台地址判定函数');
  assert.match(script, /liveMonitorIsCenter/, '状态卡应记录当前快照是否为中控台');
  assert.match(script, /打开中控台 ›/, '中控台时按钮文案应切换为打开中控台');
  assert.match(script, /\/danmaku\/xiaohongshu\/show-center/, '打开中控台应请求后端唤起内嵌窗');
  assert.match(
    script,
    /if \(liveMonitorIsCenter\) xsShowCenter\(\);\s*else liveOpenRoom\(liveMonitorPlatform\)/,
    '中控台走唤起内嵌窗，普通直播间走外部浏览器跳转',
  );
  assert.match(styles, /\.liveMonitorCard\{/, '状态卡应有独立卡片样式');

  // 旧四枚平台入口与旧四套遮罩已拆除，统一进 #live-dialog
  for (const gone of [
    'dm-open',
    'xs-open',
    'ks-open',
    'bl-open',
    'dm-dialog',
    'xs-dialog',
    'ks-dialog',
    'bl-dialog',
    'dm-close',
    'xs-close',
    'ks-close',
    'bl-close',
  ]) {
    assert.doesNotMatch(html, new RegExp(`id="${gone}"`), `旧入口 / 遮罩不应再出现：${gone}`);
  }

  // 样式：配置内联在主区、弹幕区只在小窗出现、非当前平台配置面板隐藏、底部操作条、停止监听红色按钮
  assert.match(styles, /\.liveConfigPane\{[^}]*overflow-y:auto/, '配置区应自己滚动，不撑破弹窗');
  assert.match(styles, /body:not\(\.live-mini\) \.liveMain\{display:none\}/, '大窗不再显示弹幕区');
  assert.match(styles, /body\.live-mini \.liveConfigPane\{display:none!important\}/, '小窗不显示配置区');
  assert.doesNotMatch(html, /liveLogoRow|data-select=/, '平台 Tab 已移除，窗内不能切平台');
  assert.match(styles, /\.liveConfigPanel\{display:none/, '非当前平台配置面板隐藏');
  assert.match(styles, /\.liveConfigPanel\.is-active\{display:flex\}/, '只有当前平台配置面板显示');
  assert.match(styles, /\.liveFoot\{[^}]*border-top/, '底部应有独立操作条');
  assert.match(styles, /\.liveFeedPanel\.is-active\{display:flex/, '只有当前选中平台的弹幕面板显示');
  assert.match(styles, /\.dmFeedItem\.gift\{/, '礼物弹幕应有单独配色');
  assert.match(styles, /\.btn\.danger\{background:color-mix/, '停止监听需要红色按钮');
  assert.match(
    styles,
    /\.status\[data-error="true"\]\{[^}]*color:var\(--danger\)/,
    '报错提示应为红色并带红底/边框，不能与普通提示同灰度',
  );
  assert.match(
    styles,
    /\.petFields\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px 16px\}/,
    '宠物字段区应为可收缩的两列网格',
  );
  assert.match(styles, /\.petFields \.fieldInput\{height:32px\}/, '宠物区输入框应收窄高度');
  assert.match(styles, /\.petFields \.corner\{height:30px\}/, '宠物区角落按钮应收窄高度');

  // 缓存 key 与四组接口沿用旧页，四个平台各自的接线函数保留
  assert.match(script, /blue_fish_douyin_danmaku_form_v1/, '抖音表单缓存 key 应与旧页一致');
  assert.match(script, /blue_fish_xhs_danmaku_form_v1/, '小红书表单缓存 key');
  assert.match(script, /blue_fish_ks_danmaku_form_v1/, '快手表单缓存 key');
  assert.match(script, /blue_fish_bili_danmaku_form_v1/, 'B站表单缓存 key');
  for (const [prefix, seg] of [
    ['douyin', 'douyin'],
    ['xiaohongshu', 'xiaohongshu'],
    ['kuaishou', 'kuaishou'],
    ['bilibili', 'bilibili'],
  ]) {
    for (const route of ['status', 'options', 'start', 'stop']) {
      assert.match(script, new RegExp(`/danmaku/${seg}/${route}`), `${prefix} 应接入 ${route} 接口`);
    }
  }
  for (const wire of ['wireDanmakuDialog', 'wireXhsDialog', 'wireKsDialog', 'wireBiliDialog']) {
    assert.match(script, new RegExp(`function ${wire}\\(\\)`), `平台弹窗接线入口应保留：${wire}`);
  }

  // 统一调度层：单一接线入口、平台 Tab 切换、底部一键开始监听并在成功后开小窗、轮询只在弹窗打开且选中该平台时发请求
  assert.match(script, /function wireLiveDialog\(\)/, '直播间窗口应有单一接线入口');
  // 配置卡顶部提示条按用户要求移除（四个平台都不再出现）
  assert.doesNotMatch(html, /关闭本窗口不影响监听/, '直播间配置卡不应再有「关闭本窗口不影响监听」提示条');
  assert.doesNotMatch(html, /直连 WSS 拉取弹幕/, '快手/B站配置卡不应再有直连说明提示条');
  assert.doesNotMatch(html, /仅监听自己中控台这场直播/, '小红书配置卡不应再有中控台说明提示条');
  assert.doesNotMatch(styles, /\.liveConfigPanel \.dmCard \.cardHint/, '提示条专属样式应一并移除');
  // 顶部「选平台 → 填好配置 → 点开始监听」操作提示也按用户要求移除
  assert.doesNotMatch(html, /选平台 → 填好配置/, '配置区顶部不应再有操作引导提示');
  assert.doesNotMatch(html, /liveConfigHint|liveHintKbd/, '操作提示元素应移除');
  assert.doesNotMatch(styles, /\.liveConfigHint|\.liveHintKbd|\.liveConfigHead/, '操作提示专属样式应一并移除');
  assert.match(html, /id="live-config-title"/, '隐藏标题保留（无障碍 labeling 与脚本更新仍引用）');
  // 页内弹窗尺寸按用户要求收矮：定高 70vh/540px，切平台时高度不随内容跳动（独立大窗/小窗的铺满覆盖不受影响）
  assert.match(
    styles,
    /\.liveDialog\{width:min\(900px,100%\);height:min\(70vh,540px\)/,
    '页内直播间弹窗应为 900px 宽、定高 70vh/540px',
  );
  assert.doesNotMatch(styles, /\.liveDialog\{[^}]*height:auto/, '页内弹窗不应再按内容自适应高度');
  // 垂直节奏收紧 + 去掉同色嵌套卡：内容在定高内放得下，不靠滚动
  assert.match(
    styles,
    /\.liveConfigPanel \.dmCard\{border:0;background:transparent;border-radius:0;padding:0\}/,
    '配置区不应再套带边框的同色嵌套卡片',
  );
  assert.match(styles, /\.liveConfigPanel \.fieldInput\{height:44px/, '配置输入框应收矮到 44px');
  assert.match(
    styles,
    /\.liveConfigPanel \.fieldInput\.area\{height:auto;min-height:88px/,
    'Cookie 文本域应收矮到 88px',
  );
  assert.match(
    styles,
    /\.liveConfigPanel \.fieldInput\{[^}]*background:color-mix\(in srgb,var\(--label-primary\) 4%,var\(--bg-card\)\)/,
    '平铺后输入框靠内凹底色识别',
  );
  assert.match(styles, /\.liveFoot \.btn\{height:44px/, '底栏按钮应收矮到 44px');
  assert.match(styles, /\.liveDialog \.chatHead\{padding:16px 26px 14px/, '头部上下间隔应收紧');
  assert.match(styles, /\.liveBody\{[^}]*padding:16px 26px 14px/, '内容区上下间隔应收紧');
  assert.match(script, /function openLiveFor\(platform\)/, '平台入口应先切平台再开弹窗');
  assert.match(
    script,
    /entry\.addEventListener\('click', function \(\) \{ openLiveFor\(p\); \}\)/,
    '四张入口卡应各自接线打开对应平台',
  );
  assert.match(script, /\[data-live="' \+ p \+ '"\]/, '选中态应同步到控制台平台入口卡');
  assert.match(script, /titlePlat\.textContent = ' · ' \+ liveNames\[liveCurrent\]/, '弹窗标题应跟随当前平台名');
  assert.doesNotMatch(script, /function selectLive\(/, '窗内切平台函数应随 Tab 一起拆除');
  assert.doesNotMatch(styles, /\.liveLogo/, '平台 Tab 样式应一并移除');
  assert.match(script, /function setLiveDialog\(open\)/, '统一弹窗开关应是单一入口函数');
  assert.match(script, /function liveRefreshAll\(\)/, '应有全量刷新四平台状态的函数');
  assert.match(script, /LIVE_PLATFORMS\.forEach\(function \(p\) \{/, '全量刷新应遍历四个平台');
  assert.match(script, /liveRefreshAll\(\)/, '打开弹窗时应全量刷新四平台状态，重开后绿点不丢');
  assert.match(script, /function liveToggleCurrent\(\)/, '底部开始监听应是单一收口函数');
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(
      script,
      new RegExp(`liveStarters = \\{[\\s\\S]*?${p}: liveNotifying\\(${p}Start\\)`),
      `四平台启动函数应统一登记并广播（${p}）`,
    );
    assert.match(
      script,
      new RegExp(`liveStoppers = \\{[\\s\\S]*?${p}: liveNotifying\\(${p}Stop\\)`),
      `四平台停止函数应统一登记并广播（${p}）`,
    );
  }
  assert.match(script, /new BroadcastChannel\('blue-fish-live-monitor'\)/, '跨窗口监听状态变更走同源广播');
  assert.match(
    script,
    /liveChannel\.onmessage = function \(\) \{ void refreshLiveMonitorCard\(\); \}/,
    '控制台收到广播后应立即刷新监听状态卡',
  );
  assert.match(
    script,
    /visibilitychange[\s\S]*?refreshLiveMonitorCard\(\)/,
    '窗口重新可见时应兜底刷新监听状态卡',
  );
  assert.match(script, /function liveOpenMini\(platform\)/, '开小窗应带上当前平台');
  assert.match(script, /window\.petBridge\.openLiveMini\(target\)/, '开小窗走主进程桥');
  assert.match(script, /function liveOpenMiniAfterStart\(platform, attempts\)/, '启动后应等状态确认在监听再开小窗');
  assert.match(script, /liveOpenMiniAfterStart\(platform\);/, '启动回包后统一走开小窗收口');
  assert.match(
    script,
    /if \(liveReadingPlatform\(platform\)\) \{\s*if \(liveOpenMini\(platform\)\)/,
    '只有真起来才开小窗（失败不假装开窗）',
  );
  assert.match(script, /function liveCloseMini\(platform\)/, '停止监听后应有同步关小窗的收口函数');
  assert.match(script, /window\.petBridge\.closeLiveMini\(platform\)/, '关小窗走主进程桥');
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(script, new RegExp("liveCloseMini\\('" + p + "'\\)"), `停止 ${p} 监听成功后应同步关该平台小窗`);
  }
  assert.match(
    script,
    /showToast\('已开始监听', 'ok'\);\s*\/\/ 平台互斥：启动本平台会顶掉其余平台的监听；全量拉一遍，纠正它们的绿点与主页状态卡。\s*void refreshLiveMonitorCard\(\);/,
    '启动成功后应全量刷新，纠正被顶掉平台的绿点与状态卡',
  );
  assert.match(
    script,
    /if \(liveOpenMini\(platform\)\) \{\s*if \(LIVE_STANDALONE\) closeLiveWindow\(\);\s*else setLiveDialog\(false\);/,
    '小窗开出来后应自动关掉直播间弹窗（独立窗口模式关窗）',
  );
  assert.doesNotMatch(script, /function setLiveConfig\(open\)/, '配置不再是模态，开关函数应删除');
  assert.doesNotMatch(script, /liveConfigOpen/, '不再记录配置模态显隐状态');
  assert.match(script, /liveIsOpen\(\) \|\| liveCurrent !== 'dm'/, '抖音轮询只在弹窗打开且选中抖音时发请求');
  for (const gone of ['setDmDialog', 'setXsDialog', 'setKsDialog', 'setBlDialog']) {
    assert.doesNotMatch(script, new RegExp(gone), `旧弹窗开关函数应已拆除：${gone}`);
  }
  assert.match(script, /function dmNode\(tag, cls, text\)/, '弹幕内容应走 dmNode 建文本节点');
  assert.match(script, /node\.textContent = String\(text\)/, 'dmNode 只写 textContent，不拼 HTML');
  assert.match(script, /feedBox\.textContent = '';/, '弹幕区清空应清文本节点');

  // Cookie 只手动输入：不再有自动读浏览器入口、状态行、说明弹窗与探针接口
  assert.doesNotMatch(html, /id="dm-cookie-help"/, '不应再有「从浏览器读取」按钮');
  assert.doesNotMatch(html, /id="dm-cookie-state"/, '不应再有 Cookie 状态行');
  assert.doesNotMatch(html, /id="dm-cookie-dialog"/, '不应再有 Cookie 说明弹窗');
  assert.doesNotMatch(script, /dmReadBrowserCookie/, '不应再有自动读取函数');
  assert.doesNotMatch(script, /\/danmaku\/douyin\/cookie/, '不应再调用 Cookie 探针接口');
  assert.doesNotMatch(styles, /\.dmCookieState/, '不应再有 Cookie 状态行样式');
  assert.doesNotMatch(html, /id="dm-save-cookie"/, '不应再有「保存到本地」勾选开关，Cookie 默认存本地');

  // 直播间统一页内 HTML 弹窗：入口不再走桥开独立 Windows 窗口；?live=1 独立页模式保留（弹幕小窗仍用），关闭按钮关窗
  assert.match(
    script,
    /LIVE_STANDALONE = new URLSearchParams\(location\.search\)\.get\('live'\) === '1'/,
    '应从 query 读取 live 独立模式标志',
  );
  assert.doesNotMatch(script, /hasLiveBridge/, '入口不应再探测开窗桥');
  assert.doesNotMatch(script, /window\.petBridge\.openLive\(\)/, '入口不应再通知主进程开独立窗口');
  assert.match(script, /window\.petBridge\.closeLive\(\)/, '独立窗口内关闭按钮应走桥关窗');
  assert.match(script, /function closeLiveWindow\(\)/, '关闭动作应有独立收口函数');
  assert.match(script, /body\.classList\.add\('live-standalone'\)/, '独立模式应给 body 打模式类');
  assert.match(styles, /body\.live-standalone \.console/, '独立模式应隐藏控制台主体');
  assert.match(styles, /body\.live-standalone #live-dialog/, '独立模式直播间应铺满整窗');
  assert.match(styles, /-webkit-app-region:drag/, '独立无边框窗口头部应可拖动');
});

test('弹幕小窗：?mini=1 只显示弹幕、平台由开窗时传入、窗内不能切平台、无桥给提示', () => {
  const html = consolePage();
  const styles = consoleStyles();
  const script = consoleScript;

  // 模式标志与平台参数必须在 history.replaceState 清 query 之前读出来
  const miniFlagAt = script.indexOf("get('mini') === '1'");
  assert.ok(miniFlagAt > 0, '应从 query 读取 mini 小窗标志');
  assert.ok(miniFlagAt < script.indexOf('history.replaceState'), 'mini 标志应在清 query 之前读取');
  const miniPlatformAt = script.indexOf("get('p') || ''");
  assert.ok(miniPlatformAt > 0, '小窗应读开窗时传进来的平台参数 p');
  assert.ok(miniPlatformAt < script.indexOf('history.replaceState'), '平台参数也应在清 query 之前读取');

  // 入口：控制台底部「开始监听」成功后自动开小窗，Dock 上不再另放一个重复入口
  assert.doesNotMatch(html, /id="live-mini-open"/, 'Dock 不该再有小窗按钮（入口是底部开始监听）');
  assert.match(script, /window\.petBridge\.openLiveMini\(target\)/, '有桥时带平台开小窗');
  assert.match(script, /弹幕小窗要在桌面端（独立模式）里才能开/, '无桥时应提示只能在桌面端开小窗');

  // 小窗形态：固定暗色、body 打模式类、标题对齐参考图「互动消息区」、按传入平台选中、不显示配置也不能切平台
  assert.match(script, /document\.body\.classList\.add\('live-mini'\)/, '小窗模式应给 body 打模式类');
  assert.match(script, /miniTitle\.textContent = '互动消息区'/, '小窗标题对齐参考图「互动消息区」');
  assert.match(script, /function dmIsEntryText\(text\)/, '进场消息应有判定函数，用于小窗进场行区分');
  assert.ok(script.includes("dmIsEntryText(item.text) ? ' entry' : ''"), '弹幕行应按进场判定挂 entry 类');
  assert.match(script, /if \(!LIVE_MINI\) wireTheme\(\)/, '小窗不读不写主题，避免把控制台主题带跑');
  assert.match(
    script,
    /if \(LIVE_PLATFORMS\.indexOf\(LIVE_MINI_PLATFORM\) >= 0\) liveCurrent = LIVE_MINI_PLATFORM/,
    '小窗应直接锁定传入的平台',
  );
  assert.match(styles, /body\.live-mini \.liveConfigPane\{display:none!important\}/, '小窗不显示配置区');
  assert.doesNotMatch(html, /liveLogoRow|data-select=/, '平台 Tab 已移除，窗内不能切平台');
  assert.match(styles, /body\.live-mini \.liveFoot\{display:none!important\}/, '小窗不显示底部操作条');
  assert.match(
    styles,
    /body\.live-mini \.liveMain\{min-height:0\}/,
    '小窗最小高度下弹幕区必须能压扁，否则底部被窗口裁掉',
  );
  assert.match(script, /\+ 'W'/, '小窗统计万位应缩写为 W（28000 → 2.8W）');
  assert.match(
    script,
    /viewerNode\.textContent = viewers >= 0 \? miniFormatCount\(viewers\) : '—'/,
    '在线观众人数也要走缩略格式化',
  );
  assert.match(script, /likeNode\.title = String\(likes\)/, '点赞数保留原始值到 title');
  assert.match(styles, /body\.live-mini \.dmFeedTime\{display:none\}/, '小窗窄，弹幕行不显示时间');
  assert.match(
    styles,
    /body\.live-mini \.dmFeedItem\{[^}]*border:0;background:transparent/,
    '小窗消息行扁平，不带卡片边框/底色',
  );
  assert.match(styles, /body\.live-mini \.dmFeedAva\{display:none\}/, '小窗弹幕行对齐设计稿：无左侧头像');
  assert.match(
    styles,
    /body\.live-mini \.dmFeedItem\.chat \.dmFeedNick\{[^}]*color:#4fc3f7/,
    '小窗弹幕昵称统一设计稿青色',
  );
  assert.match(
    styles,
    /body\.live-mini \.dmFeedItem\.entry \.dmFeedNick\{color:#4fc3f7\}/,
    '进场行昵称与弹幕行同青色，不再置灰',
  );
  assert.doesNotMatch(html, /说点什么|composer|reply-box/, '小窗不带底部输入框');
  assert.doesNotMatch(html, /延迟:|码率|推流帧率/, '小窗不带延迟/码率/帧率状态条');
  assert.match(styles, /body\.live-mini\{background:transparent/, '小窗 body 本身透明，不铺底色');
  assert.match(
    styles,
    /body\.live-mini,html\[data-theme=dark\] body\.live-mini\{background-image:none\}/,
    '小窗必须关掉控制台背景图，只留暗色半透明图层',
  );
  assert.match(
    styles,
    /body\.live-mini #live-dialog\{[^}]*background-color:rgba\(41,41,41,var\(--mini-panel-alpha,1\)\)[^}]*border:1px solid rgba\(255,255,255,\.24\)[^}]*border-radius:10px;overflow:hidden/,
    '小窗底色对齐抖音：淡白半透明底 + 淡白灰描边 + 圆角裁剪',
  );
  assert.match(styles, /body\.live-mini \.liveDialog\{width:100%;height:100%/, '小窗内容铺满整个窗口，不再内嵌卡片');
  // 对齐设计稿：真实统计行 + 礼物行解剖 + 空态文案 + 发丝分隔 + 细灰滚动条
  assert.match(
    html,
    /id="mini-stats"[\s\S]*?id="mini-stat-viewer"[\s\S]*?id="mini-stat-gift"[\s\S]*?id="mini-stat-like"/,
    '小窗统计行只放真实口径：在线观众人数 / 礼物数 / 本场累计点赞',
  );
  assert.doesNotMatch(html, /id="mini-stat-chat"/, '小窗统计行不再放弹幕数');
  assert.match(styles, /\.miniStats\{display:none\}/, '统计行在大窗默认隐藏');
  assert.match(styles, /body\.live-mini \.miniStats\{display:flex/, '统计行仅小窗显示');
  assert.match(script, /function miniSyncStats\(platform, status\)/, '统计行应有真实口径同步函数');
  assert.match(script, /miniSyncStats\('dm', status\)/, '抖音状态回包应同步小窗统计');
  assert.match(script, /miniSyncStats\('bl', status\)/, 'B站状态回包应同步小窗统计');
  assert.match(script, /status\.viewerCount/, '小窗观众人数应消费状态里的 viewerCount');
  assert.match(script, /status\.likeCount/, '小窗累计点赞应消费状态里的 likeCount');
  assert.match(
    script,
    /viewerNode\.textContent = viewers >= 0 \? miniFormatCount\(viewers\) : '—'/,
    '拿不到统计帧时显示占位符而不是 0；拿到时按 W 缩略',
  );
  assert.match(script, /dmNode\('span', 'dmFeedVerb', '送了'\)/, '小窗礼物行对齐设计稿：昵称+送了+礼物名+数量');
  assert.match(
    script,
    /dmNode\('span', 'dmFeedCount', '×' \+ Math\.max\(1, Number\(item\.count\) \|\| 1\)\)/,
    '礼物数量胶囊消费真实 count',
  );
  assert.match(
    styles,
    /body\.live-mini \.dmFeedItem\.gift\{[^}]*border:1px solid rgba\(255,179,64,\.45\)/,
    '小窗礼物行为金色描边暖底卡片',
  );
  assert.match(
    styles,
    /body\.live-mini \.dmGift:empty::before\{content:"展示本场直播的礼物消息"/,
    '礼物空态对齐设计稿文案',
  );
  assert.match(
    styles,
    /body\.live-mini \.liveFeedPanel \.dmFeedCard\{border-top:1px solid rgba\(255,255,255,\.08\)/,
    '礼物区与弹幕区发丝分隔线',
  );
  assert.match(
    styles,
    /body\.live-mini \.dmFeed::-webkit-scrollbar-thumb,body\.live-mini \.dmGift::-webkit-scrollbar-thumb\{background:#5a5f66/,
    '小窗细灰滚动条',
  );
  // 独立模式 align-items:center 会把 .liveMain 缩成内容宽并居中；小窗必须显式补满整窗宽度
  assert.match(
    styles,
    /body\.live-mini \.liveDialog \.liveMain\{width:100%;max-width:none\}/,
    '小窗礼物/弹幕区应占满整窗宽度，不被独立模式居中收缩',
  );

  // 透明度入口：图标在关闭按钮左边，只在小窗出现；滑块浮层挂在整页上，窗口调淡后仍可操作
  const opacityBtnAt = html.indexOf('id="live-opacity"');
  const closeBtnAt = html.indexOf('id="live-close"');
  assert.ok(opacityBtnAt > 0 && closeBtnAt > opacityBtnAt, '透明度图标应排在关闭图标左边');
  assert.match(styles, /\.miniOpacityBtn\{display:none\}/, '大窗不显示透明度图标');
  assert.match(styles, /body\.live-mini \.miniOpacityBtn\{display:inline-flex/, '小窗才显示透明度图标');
  assert.match(
    styles,
    /background-color:rgba\(41,41,41,var\(--mini-panel-alpha,1\)\)/,
    '小窗底色应为 rgb(41,41,41)，滑块只改这层底色的 alpha（须用 background-color 长写，简写里 var() 不生效）',
  );
  assert.match(script, /setProperty\('--mini-panel-alpha'/, '滑块应写入底色 alpha 变量');
  assert.doesNotMatch(
    styles,
    /body\.live-mini #live-dialog\{[^}]*opacity:var/,
    '不能用元素级 opacity，否则文字/图标会跟背景一起变淡',
  );
  assert.match(html, /id="mini-opacity-range" type="range" min="20" max="100"/, '滑块取值范围 20%–100%');
  assert.match(
    html,
    /<div class="miniOpacityPop" id="mini-opacity-pop"[\s\S]*<\/div>\s*<noscript>/,
    '滑块浮层挂在页面顶层，不在会被调淡的面板里',
  );
  assert.match(script, /function applyMiniAlpha\(percent\)/, '应有透明度落地函数');
  assert.match(script, /setProperty\('--mini-panel-alpha'/, '透明度写到底色 alpha 变量而不是整窗 opacity');
  assert.match(script, /localStorage\.setItem\(MINI_ALPHA_KEY/, '透明度应持久化到本机');
  assert.match(script, /wireMiniOpacity\(\);/, '初始化时应接线透明度控件');

  // 头部拖动：光标必须是抓手（抓握），走页内拖拽通道——系统拖动区的光标由非客户区接管，只能是箭头
  assert.match(
    styles,
    /body\.live-mini \.liveDialog \.chatHead\{cursor:grab;user-select:none\}/,
    '小窗头部应显示抓手光标',
  );
  assert.match(
    styles,
    /body\.live-mini \.liveDialog \.chatHead\.is-dragging\{cursor:grabbing\}/,
    '按住拖动时头部光标应切成抓握',
  );
  assert.match(styles, /body\.live-mini \.liveDialog \.chatHead button\{cursor:pointer\}/, '头部按钮保持小手');
  assert.doesNotMatch(
    styles,
    /body\.live-mini \.liveDialog \.chatHead\{[^}]*app-region:drag/,
    '小窗头部不能挂系统拖动区，否则光标被系统接管回箭头',
  );
  assert.match(script, /function wireMiniDrag\(\)/, '应有小窗头部拖动函数');
  assert.match(script, /typeof bridge\.windowDrag !== 'function'/, '无窗口拖动桥时应静默跳过');
  assert.match(script, /bridge\.windowDrag\(phase, x, y\)/, '拖动应走窗口拖动桥（阶段 + 屏幕坐标）');
  assert.match(script, /head\.setPointerCapture\(event\.pointerId\)/, '拖动应捕获指针，窗口跟手后仍收得住');
  assert.match(script, /wireMiniDrag\(\);/, '初始化时应接线小窗头部拖动');

  // 折叠入口：图标在透明度左边，点一下收成一行标题栏，再点展开；窗口高度由主进程同步缩
  const collapseBtnAt = html.indexOf('id="live-collapse"');
  assert.ok(collapseBtnAt > 0 && collapseBtnAt < opacityBtnAt, '折叠图标应排在透明度图标左边');
  assert.match(
    html,
    /id="live-collapse" aria-label="折叠为标题栏" aria-expanded="true"/,
    '折叠图标带展开/收起状态语义',
  );
  assert.match(styles, /\.miniCollapseBtn\{display:none\}/, '大窗不显示折叠图标');
  assert.match(styles, /body\.live-mini \.miniCollapseBtn\{display:inline-flex/, '小窗才显示折叠图标');
  assert.match(
    styles,
    /body\.live-mini\.mini-collapsed \.miniStats,\s*body\.live-mini\.mini-collapsed \.liveMain\{display:none!important\}/,
    '折叠后统计行与消息区一起收起',
  );
  assert.match(
    styles,
    /body\.live-mini\.mini-collapsed \.miniOpacityBtn\{display:none\}/,
    '折叠态应隐藏透明度图标，把宽度让给最新消息',
  );
  assert.match(
    styles,
    /body\.live-mini\.mini-collapsed #live-dialog\{bottom:auto;height:auto\}/,
    '折叠后面板收到标题栏高度，不留空窗',
  );
  assert.match(script, /function setMiniCollapsed\(collapsed\)/, '应有折叠落地函数');
  assert.match(script, /document\.body\.classList\.toggle\('mini-collapsed', on\)/, '折叠态挂在 body 的模式类上');
  assert.match(script, /function wireMiniCollapse\(\)/, '应有折叠接线函数');
  assert.match(
    script,
    /bridge\.setLiveMiniCollapsed\(on, on \? cssHeight : 0\)/,
    '折叠时把标题栏高度报给主进程，由主进程同步缩窗',
  );
  assert.match(script, /wireMiniCollapse\(\);/, '初始化时应接线小窗折叠');

  // 折叠态：左侧标题让位给最新一条消息
  assert.match(
    html,
    /id="mini-latest"[\s\S]*id="mini-latest-nick"[\s\S]*id="mini-latest-text"/,
    '标题栏要有折叠态最新消息行',
  );
  assert.match(styles, /body\.live-mini\.mini-collapsed \.chatTitle\{display:none\}/, '折叠态隐藏左侧标题');
  assert.match(styles, /body\.live-mini\.mini-collapsed \.miniLatest\{display:flex\}/, '折叠态显示最新消息');
  assert.match(styles, /\.miniLatestText\{[^}]*text-overflow:ellipsis/, '最新消息单行展示，超出省略');
  assert.match(script, /function miniSyncLatest\(recent\)/, '应有最新消息同步函数');
  assert.match(script, /function miniLatestItem\(recent\)/, '应按 id 取最新一条');
  assert.match(script, /textNode\.textContent = '暂无新消息'/, '没有消息时给占位文案');
  assert.match(script, /body = '送了 ' \+ body \+ ' ×'/, '礼物消息按「送了 xx ×n」展示');
  assert.equal(
    (script.match(/miniSyncLatest\(recent\);/g) || []).length,
    4,
    '四个平台的弹幕渲染都要同步折叠态最新消息',
  );

  // 关闭小窗：监听中先弹气泡确认——停止监听并关闭 / 只关窗继续听
  assert.match(
    html,
    /id="mini-close-pop"[\s\S]*id="mini-close-title"[\s\S]*id="mini-close-stop"[\s\S]*id="mini-close-only"/,
    '小窗应有关闭确认气泡与两个选择',
  );
  assert.match(html, /关闭小窗时，是否停止监听？/, '气泡标题要问清是否停止监听');
  assert.match(html, /停止监听并关闭/, '「是」按钮文案应说明会停止监听');
  assert.match(html, /只关闭小窗/, '「否」按钮文案应说明只关窗');
  assert.match(styles, /\.miniClosePop\{position:fixed;top:52px;right:12px/, '气泡锚在标题栏右侧、关闭按钮下方');
  assert.match(styles, /\.miniClosePop\[hidden\]\{display:none\}/, '气泡未打开时不占位');
  assert.match(styles, /\.miniCloseBtn\.is-stop\{color:#ff8a8a/, '停止监听按钮用危险色区分');
  assert.match(script, /function requestMiniClose\(\)/, '关闭动作应有独立收口函数');
  assert.match(script, /if \(LIVE_MINI\) \{ requestMiniClose\(\); return; \}/, '小窗关闭按钮应先走询问，不直接关窗');
  assert.match(
    script,
    /if \(!liveReadingPlatform\(liveCurrent\)\) \{ closeLiveWindow\(\); return; \}/,
    '本来就没在监听时不该弹气泡，直接关窗',
  );
  assert.match(
    script,
    /if \(document\.body\.classList\.contains\('mini-collapsed'\)\) setMiniCollapsed\(false\)/,
    '折叠态先展开窗口，否则气泡会被标题栏高度裁掉',
  );
  assert.match(script, /function setMiniClosePop\(open\)/, '气泡应有显隐收口函数');
  assert.match(script, /function wireMiniClosePop\(\)/, '应有气泡接线函数');
  assert.match(script, /wireMiniClosePop\(\);/, '初始化时应接线关闭确认气泡');
  assert.match(script, /var stopper = liveStoppers\[platform\]/, '「停止监听并关闭」应调用当前平台的停止监听');
  assert.match(
    script,
    /if \(onlyBtn\) onlyBtn\.addEventListener\('click', function \(\) \{\s*setMiniClosePop\(false\);\s*closeLiveWindow\(\);/,
    '「只关闭小窗」只关窗，不碰监听',
  );
  assert.match(script, /showToast\('停止监听失败，小窗保持打开', 'error'\)/, '停止失败要留窗并提示');
});

test('保存结果气泡：保存成功 / 失败都弹出顶部气泡，统一收口与 AI 保存都接入', () => {
  const html = consolePage();
  const styles = consoleStyles();
  const script = consoleScript;

  assert.match(html, /id="toast-root"/, '页面应挂气泡浮层容器');
  assert.match(script, /function showToast\(text, kind\)/, '应有统一气泡函数');
  assert.match(script, /textContent = text/, '气泡只写文本节点，不拼 HTML');
  // 统一收口（宠物/全局/物理/字体/语音）成功与失败都弹气泡
  assert.match(script, /showToast\(doneText, 'ok'\)/, '统一保存成功应弹成功气泡');
  assert.match(script, /showToast\(errMsg, 'error'\)/, '统一保存失败应弹失败气泡');
  // AI 保存独立收口同样接入
  assert.match(script, /showToast\('AI 设置已保存。', 'ok'\)/, 'AI 保存成功应弹气泡');
  assert.match(script, /showToast\(aiErr, 'error'\)/, 'AI 保存失败应弹气泡');
  // 前置校验拦截（未发请求）也要弹失败气泡
  assert.match(script, /showToast\(message, 'error'\)/, '宠物表单校验失败应弹气泡');
  // 样式：浮层固定居中在窗口顶部（不再压住底部按钮），成功 / 失败配色点
  assert.match(styles, /\.toastRoot\{/, '气泡浮层应有定位容器');
  assert.match(styles, /\.toastRoot\{[^}]*top:24px[^}]*\}/, '气泡浮层应贴在顶部');
  assert.doesNotMatch(styles, /\.toastRoot\{[^}]*bottom:[^}]*\}/, '气泡浮层不应再落到底部');
  assert.match(styles, /\.toastOk::before\{background:var\(--primary\)\}/, '成功气泡用主色点');
  assert.match(styles, /\.toastError::before\{background:var\(--danger\)\}/, '失败气泡用红色点');
});

test('直播间 ID 历史：三平台输入框下有快捷行，开始监听成功才缓存，最多 3 条点击填入', () => {
  const html = consolePage();
  const styles = consoleStyles();
  const script = consoleScript;

  // 容器：抖音/快手/B站输入框之后各挂一个历史行；小红书没有链接输入，不该有
  for (const p of ['dm', 'ks', 'bl']) {
    assert.match(html, new RegExp(`id="${p}-url"[\\s\\S]*?id="${p}-url-history"`), `${p} 输入框后应有历史快捷行容器`);
  }
  assert.doesNotMatch(html, /id="xs-url-history"/, '小红书不该有历史快捷行');

  // 样式：空行隐藏、chip 可点、键盘焦点可见
  assert.match(styles, /\.liveIdHistory:empty\{display:none\}/, '没有历史时快捷行应隐藏');
  assert.match(styles, /\.liveIdHistoryBtn\{[^}]*cursor:pointer/, '历史 chip 应是可点按钮');
  assert.match(styles, /\.liveIdHistoryBtn:focus-visible\{/, '历史 chip 应有可见键盘焦点');

  // 存储与上限：独立 key、每平台最多 3 条
  assert.match(script, /LIVE_ID_HISTORY_KEY = 'blue_fish_live_id_history_v1'/, '历史应存独立 localStorage key');
  assert.match(script, /LIVE_ID_HISTORY_MAX = 3/, '每平台最多缓存 3 条');
  assert.match(script, /liveIdHistoryLoad\(\);\s*liveIdHistoryRenderAll\(\);/, '初始化应读缓存并渲染三平台快捷行');

  // 缓存时机：三个 start 的成功路径与「超时但已提交」路径各记一次；错误路径不记
  for (const [fn, p] of [
    ['dmStart', 'dm'],
    ['ksStart', 'ks'],
    ['blStart', 'bl'],
  ] as const) {
    const body = script.match(new RegExp(`async function ${fn}\\(\\) \\{([\\s\\S]*?)\\n  \\}`));
    assert.ok(body, `应能取到 ${fn} 函数体`);
    const hits = (body![1].match(new RegExp(`liveIdHistoryRemember\\('${p}'`, 'g')) || []).length;
    assert.equal(hits, 2, `${fn} 应在成功与超时已提交两条路径缓存，错误路径不缓存`);
  }
  const xsBody = script.match(/async function xsStart\(\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(xsBody && !/liveIdHistoryRemember/.test(xsBody[1]), '小红书启动不该写 ID 历史');

  // 点击填入：chip 点击把「完整直播间地址」写回输入框并聚焦，同时刷新激活态
  assert.match(
    script,
    /input\.value = liveIdHistoryUrl\(platform, id\) \|\| id;/,
    '点击历史 chip 应填入完整直播间地址（不是裸 ID）',
  );
  assert.match(script, /input\.focus\(\);/, '点击历史 chip 应聚焦输入框');
  assert.match(script, /liveIdHistorySyncActive\(platform\);/, '点击后应同步 chip 激活态');
  assert.match(script, /btn\.textContent = id/, 'chip 只展示房间 ID 文本');

  // 激活态：输入框里的房间号命中哪条就给哪条蓝边（只加边框，不铺底色）；锁定条目排在最前
  assert.match(styles, /\.liveIdHistoryItem\.active\{border-color:var\(--primary\)\}/, '选中条目只用蓝色边框');
  assert.doesNotMatch(styles, /\.liveIdHistoryItem\.active\{[^}]*background/, '选中条目不应铺蓝色底色');
  assert.match(script, /liveIdHistoryOrdered\(liveIdHistory\[platform\]\)/, '渲染时锁定条目应排在最前');
  assert.match(script, /input\.addEventListener\('input', sync\)/, '输入框变化应同步激活态');
  assert.match(script, /liveIdHistorySyncActive\(liveCurrent\)/, '打开/切换平台时应同步激活态');

  // 锁定：每条历史带一把锁，锁定态不靠颜色区分（aria-pressed + 形状不同的图标），重绘后焦点留在同一把锁
  assert.match(script, /function liveIdHistoryToggleLock\(platform, id, keepFocus\)/, '应有锁定/解锁入口');
  assert.match(
    script,
    /lock\.setAttribute\('aria-pressed', entry\.locked \? 'true' : 'false'\)/,
    '锁按钮应暴露 aria-pressed',
  );
  assert.match(script, /lock\.setAttribute\('aria-label'/, '锁按钮应有可读名称');
  assert.match(script, /liveIdHistoryLockIcon\(entry\.locked\)/, '锁图标应随锁定态换形状');
  assert.doesNotMatch(styles, /\.liveIdHistoryItem\.locked\{/, '锁定不靠边框高亮，只换锁图标');
  assert.match(
    script,
    /querySelector\('\.liveIdHistoryLock\[data-history-lock="' \+ id \+ '"\]'\)/,
    '重绘后应把焦点还给同一把锁',
  );
  assert.match(styles, /\.liveIdHistoryLock\{[^}]*cursor:pointer/, '锁按钮应是可点控件');
  assert.match(styles, /\.liveIdHistoryLock:focus-visible\{/, '锁按钮应有可见键盘焦点');
  assert.match(styles, /\.liveIdHistoryLock\{[^}]*opacity:0/, '未锁定时默认不显示锁图标');
  assert.match(
    styles,
    /\.liveIdHistoryItem:hover \.liveIdHistoryLock,\.liveIdHistoryItem:focus-within \.liveIdHistoryLock\{opacity:1\}/,
    '悬停 / 键盘聚焦时应露出可锁定入口',
  );
  assert.match(
    styles,
    /\.liveIdHistoryItem\.locked \.liveIdHistoryLock\{opacity:1;color:var\(--primary\)\}/,
    '锁定态应常显锁图标',
  );
});

test('直播间 ID 历史纯函数：MRU 去重截断、锁定不淘汰与三平台 ID 提取', () => {
  const script = consoleScript;
  const pick = (name: string, args: string): string => {
    const m = script.match(new RegExp(`function ${name}\\(${args}\\) \\{[\\s\\S]*?\\n  \\}`));
    assert.ok(m, `应能取到纯函数 ${name}`);
    return m![0];
  };
  const factory = new Function(
    pick('dmExtractWebRid', 'raw') +
      '\n' +
      pick('liveIdHistoryEntry', 'item') +
      '\n' +
      pick('liveIdHistoryList', 'list') +
      '\n' +
      pick('liveIdHistoryMerge', 'list, id, max') +
      '\n' +
      pick('liveIdHistoryExtract', 'platform, raw') +
      '\n' +
      pick('liveIdHistoryUrl', 'platform, id') +
      '\n' +
      pick('liveIdHistoryOrdered', 'list') +
      '\n' +
      'return { liveIdHistoryMerge: liveIdHistoryMerge, liveIdHistoryExtract: liveIdHistoryExtract, liveIdHistoryUrl: liveIdHistoryUrl, liveIdHistoryOrdered: liveIdHistoryOrdered };',
  );
  const { liveIdHistoryMerge, liveIdHistoryExtract, liveIdHistoryUrl, liveIdHistoryOrdered } = factory() as {
    liveIdHistoryMerge: (list: unknown, id: unknown, max: number) => Array<{ id: string; locked: boolean }>;
    liveIdHistoryExtract: (platform: string, raw: string) => string;
    liveIdHistoryUrl: (platform: string, id: string) => string;
    liveIdHistoryOrdered: (list: unknown) => Array<{ id: string; locked: boolean }>;
  };
  const ids = (list: Array<{ id: string; locked: boolean }>): string[] => list.map((item) => item.id);

  // MRU：新 ID 提最前、重复去重、超出 3 条丢最旧、空 ID 不写
  assert.deepEqual(ids(liveIdHistoryMerge([], '12345', 3)), ['12345']);
  assert.deepEqual(ids(liveIdHistoryMerge(['a', 'b', 'c'], 'd', 3)), ['d', 'a', 'b']);
  assert.deepEqual(ids(liveIdHistoryMerge(['a', 'b', 'c'], 'b', 3)), ['b', 'a', 'c']);
  assert.deepEqual(ids(liveIdHistoryMerge(['a'], '   ', 3)), ['a']);
  assert.deepEqual(ids(liveIdHistoryMerge(null, 'x', 3)), ['x']);

  // 旧缓存（纯字符串）升级成 { id, locked: false }，不会被当成坏数据丢掉
  assert.deepEqual(liveIdHistoryMerge(['a'], '', 3), [{ id: 'a', locked: false }]);

  // 锁定：被锁的条目在淘汰时跳过，只丢最旧的未锁定项；再次被提到最前也不丢锁定态
  assert.deepEqual(liveIdHistoryMerge([{ id: 'a', locked: true }, 'b', 'c'], 'd', 3), [
    { id: 'd', locked: false },
    { id: 'a', locked: true },
    { id: 'b', locked: false },
  ]);
  assert.deepEqual(liveIdHistoryMerge([{ id: 'a', locked: true }, 'b'], 'a', 3), [
    { id: 'a', locked: true },
    { id: 'b', locked: false },
  ]);
  // 三条全锁：新 ID 挤不进来，锁定的原样保留（不会被覆盖、也不会被移除）
  assert.deepEqual(
    liveIdHistoryMerge(
      [
        { id: 'a', locked: true },
        { id: 'b', locked: true },
        { id: 'c', locked: true },
      ],
      'd',
      3,
    ),
    [
      { id: 'a', locked: true },
      { id: 'b', locked: true },
      { id: 'c', locked: true },
    ],
  );
  // 锁一条 + 两条未锁：新 ID 进来只淘汰未锁的最旧那条
  assert.deepEqual(ids(liveIdHistoryMerge(['a', { id: 'b', locked: true }, 'c'], 'd', 3)), ['d', 'a', 'b']);

  // 提取：链接取房间号、纯数字原样、快手取短链尾段
  assert.equal(liveIdHistoryExtract('dm', 'https://live.douyin.com/123456?from=web'), '123456');
  assert.equal(liveIdHistoryExtract('dm', '741852963'), '741852963');
  assert.equal(liveIdHistoryExtract('bl', 'https://live.bilibili.com/23058?foo=1'), '23058');
  assert.equal(liveIdHistoryExtract('bl', '23058'), '23058');
  assert.equal(liveIdHistoryExtract('ks', 'https://live.kuaishou.com/u/abc123'), 'abc123');
  assert.equal(liveIdHistoryExtract('ks', 'abc123'), 'abc123');
  assert.equal(liveIdHistoryExtract('dm', ''), '');

  // 点击补全：历史里只存 ID，填回输入框时拼成完整直播间地址
  assert.equal(liveIdHistoryUrl('dm', '196369435910'), 'https://live.douyin.com/196369435910');
  assert.equal(liveIdHistoryUrl('bl', '23058'), 'https://live.bilibili.com/23058');
  assert.equal(liveIdHistoryUrl('ks', 'abc123'), 'https://live.kuaishou.com/u/abc123');
  assert.equal(liveIdHistoryUrl('dm', '  '), '');
  // 顺序：锁定的提到最前，组内保持原先后；未锁定的跟在后面
  assert.deepEqual(
    ids(
      liveIdHistoryOrdered([
        { id: 'a', locked: false },
        { id: 'b', locked: true },
        { id: 'c', locked: false },
        { id: 'd', locked: true },
      ]),
    ),
    ['b', 'd', 'a', 'c'],
  );
});

test('下播态：状态行第三态「已下播」+ 一次性气泡，轮询不会重复弹', () => {
  const script = consoleScript;

  // 状态行支持第三态（ended 优先于未监听），收播后仍带本场数据
  const render = script.match(/function renderLiveStatus\(([\s\S]*?)\n {2}\}/);
  assert.ok(render, '应能取到 renderLiveStatus');
  assert.match(render![0], /ended \? '已下播'/, '状态行应支持「已下播」第三态');
  const dmRender = script.match(/function dmRenderStatus\(data, syncToggles\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(dmRender, '应能取到 dmRenderStatus');
  assert.match(
    dmRender![1],
    /renderLiveStatus\(box, dmListening, bits\.join\(' · '\), dmStatusNote\(status\), dmEnded\)/,
    'ended 应传进状态行',
  );
  assert.match(dmRender![1], /else if \(dmEnded\)[\s\S]*?弹幕 ' \+ /, '收播后仍应带本场弹幕/礼物数');

  // 下播提示：第一次拿到 ended 弹一次，回到非 ended 才重置
  assert.match(dmRender![1], /if \(!dmEnded\) dmEndedNotified = false;/, '非下播态应重置提示闸门');
  assert.match(dmRender![1], /showToast\(/, '下播应弹提示');
  assert.match(dmRender![1], /主播已下播，已自动停止监听/, '收过播的下播提示文案');
  assert.match(dmRender![1], /主播已下播，等开播后再开始监听/, '没开起来的下播提示文案');
  assert.match(script, /var dmEndedNotified = false;/, '提示闸门应为模块级变量，避免轮询重复弹');

  // 状态旁注：下播直接给结论；没收到过帧（startedAt 为空）说明是没开播，不谎称「已停止监听」
  const note = script.match(/function dmStatusNote\(status\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(note, '应能取到 dmStatusNote');
  assert.match(note![1], /if \(status\.ended\)/, '下播应走独立分支');
  assert.match(note![1], /status\.startedAt/, '旁注应区分「收过播」与「没开起来」');
  assert.match(note![1], /主播已下播，已自动停止监听/);
  assert.match(note![1], /主播已下播（直播结束），等开播后再点开始监听/);

  // 小窗没有状态行：下播时统计行右侧挂一个胶囊
  const mini = script.match(/function miniSyncStats\(([\s\S]*?)\n {2}\}/);
  assert.ok(mini, '应能取到 miniSyncStats');
  assert.match(mini![1], /dmNode\('span', 'miniEndedTag', '已下播'\)/, '小窗下播应挂胶囊');
  assert.match(consoleStyles(), /\.miniEndedTag\{[^}]*border-radius:999px/, '胶囊样式应存在');
});

test('疑似被挤下线：状态行提示 + 确认框只弹一次，按钮分别接重连/停听', () => {
  const html = consolePage();
  const script = consoleScript;

  assert.match(html, /id="dm-kick-dialog"[^>]*hidden/, '确认框默认隐藏');
  assert.match(html, /id="dm-kick-retry">重连</, '应有重连按钮');
  assert.match(html, /id="dm-kick-later">暂不重连</, '应有暂不重连按钮');
  assert.match(consoleStyles(), /\.kickDialog\{[^}]*width:min/, '确认框样式应存在');

  const note = script.match(/function dmStatusNote\(status\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(note, '应能取到 dmStatusNote');
  assert.match(note![1], /status\.interrupted/, '状态行应读取 interrupted');
  assert.match(note![1], /疑似被其他设备挤下线/, '状态行提示文案');

  const dmRender = script.match(/function dmRenderStatus\(data, syncToggles\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(dmRender, '应能取到 dmRenderStatus');
  assert.match(dmRender![1], /if \(!status\.interrupted\) dmKickPrompted = false;/, '恢复后应重置弹窗闸门');
  assert.match(dmRender![1], /!dmKickPrompted && LIVE_MINI/, '确认框应只在弹幕小窗里弹');
  assert.match(dmRender![1], /showDmKickDialog\(\)/, '小窗疑似被挤时应弹确认框');
  assert.match(script, /var dmKickPrompted = false;/, '弹窗闸门应为模块级变量，避免轮询重复弹');

  assert.match(script, /kickRetryBtn[\s\S]*?void dmStart\(\)/, '重连按钮应重新开始监听');
  assert.match(script, /kickLaterBtn[\s\S]*?void dmStop\(\)/, '暂不重连应停止监听');
});

test('快手弹幕：正文里的 [表情名] 走表情图渲染，表情表随快手状态下发缓存', () => {
  const script = consoleScript;
  const styles = consoleStyles();

  assert.match(script, /function ksEmojiText\(text\)/, '快手应有表情 token 替换函数');
  assert.match(script, /function ksEmojiImg\(token, src\)/, '快手表情应走图片节点');
  assert.match(
    script,
    /if \(raw\.indexOf\('\['\) < 0\) return document\.createTextNode\(raw\)/,
    '无 token 时保持纯文本',
  );
  assert.match(
    script,
    /token\.length <= 10 \? KS_EMOJI_URLS\[token\] : ''/,
    '只替换表情表里收录的 token，其余原样保留',
  );
  assert.match(script, /KS_EMOJI_URLS = status\.emoji/, '表情表应随快手状态缓存');
  assert.match(script, /textBox\.appendChild\(ksEmojiText\(item\.text\)\)/, '快手弹幕正文应走表情链路');
  assert.match(script, /img\.className = 'dmEmoji'/, '表情图复用抖音同一套 .dmEmoji 尺寸');
  assert.match(script, /img\.referrerPolicy = 'no-referrer'/, '表情图不带 referer，避免 CDN 防盗链');
  assert.match(styles, /\.dmEmoji\{display:inline-block;width:1\.15em;height:1\.15em/, '表情图尺寸与抖音一致');
});

test('小红书弹幕：正文里的 [表情R] 走表情图渲染，表情表按官方码全量下发', () => {
  const script = consoleScript;
  assert.match(script, /function xsEmojiSrc\(token\)/, '小红书应有表情 token 查表函数');
  assert.match(script, /function xsRichText\(text\)/, '小红书应有正文替换函数');
  assert.match(script, /bodyBox\.appendChild\(xsRichText\(item\.text\)\)/, '小红书弹幕正文应走表情链路');
  assert.match(script, /name\.slice\(0, -1\)/, '查表要认站内 R/H 后缀');
  assert.match(script, /var XHS_EMOJI_URLS = \{/, '页面应内嵌小红书表情表');
  assert.ok(script.includes(xhsEmojiUrlMapJson()), '页面表情表必须与后端同一份');
  assert.match(script, /img\.dataset\.retried/, '表情图取图失败应先重试一次再退回文字');
});
