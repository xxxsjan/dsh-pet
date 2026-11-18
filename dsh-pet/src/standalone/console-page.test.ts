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
  for (const id of ['voice-fish-key', 'voice-breeze-key', 'voice-fish-clear', 'voice-breeze-clear']) {
    assert.match(html, new RegExp(`id="${id}"`), `Key 控件 ${id} 应存在于静态壳`);
  }
  assert.match(html, /type="password"[^>]*id="voice-fish-key"/, 'Fish Key 应为密码框，不回显明文');
  assert.match(html, /type="password"[^>]*id="voice-breeze-key"/, 'Breeze Key 应为密码框，不回显明文');
  for (const field of ['fishApiKey', 'clearFishApiKey', 'breezeApiKey', 'clearBreezeApiKey']) {
    assert.match(consoleScript, new RegExp(field), `保存体应支持 ${field} 的写入 / 清除口径`);
  }
  assert.match(consoleScript, /hasFishApiKey/, '读取侧应按脱敏布尔判断 Fish 是否已存 Key');
  assert.match(consoleScript, /hasBreezeApiKey/, '读取侧应按脱敏布尔判断 Breeze 是否已存 Key');
  // 语音板块全量：Fish 合成模型、自定义音色目录、音量 >1 的真实增益
  for (const id of ['voice-fish-model', 'voice-fish-custom-id', 'voice-fish-custom-label', 'voice-fish-custom-add', 'voice-fish-custom-list', 'voice-breeze-custom-id', 'voice-breeze-custom-add', 'voice-breeze-custom-list']) {
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
  for (const id of ['pet-avatars', 'pet-save', 'pet-delete', 'pet-name', 'pet-size', 'pet-size-percent', 'pet-corner-row', 'pet-margin-x', 'pet-margin-y', 'pet-persona', 'pet-avatar-img', 'pet-avatar-upload']) {
    assert.match(html, new RegExp(`id="${id}"`), `宠物控件 ${id} 应存在于静态壳`);
  }
  // 用户要求删除「显示位置」下拉：界面不再出现该控件，保存时沿用条目原有 display
  assert.doesNotMatch(html, /id="pet-display"/, '「显示位置」控件不应再出现在界面');
  assert.doesNotMatch(consoleScript, /pet-display/, '脚本不应再绑定已删除的控件');
  for (const key of ['pet-balance', 'pet-whisper', 'pet-work', 'pet-fixed']) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `宠物开关 ${key} 应存在于静态壳`);
  }
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    assert.match(html, new RegExp(`data-corner="${corner}"`), `角落按钮 ${corner} 应存在`);
  }
  assert.match(html, /class="fields petFields"/, '宠物字段区应带紧凑作用域类，不影响其他卡片');
  // 全局开关 / 物理 / 外观字体（对话上下文卡已按旧页删除）
  for (const id of ['g-click-volume', 'global-save', 'ph-gravity', 'ph-restitution', 'ph-friction', 'ph-power', 'physics-save', 'font-family', 'font-size', 'font-save']) {
    assert.match(html, new RegExp(`id="${id}"`), `分区控件 ${id} 应存在于静态壳`);
  }
  // 旧页没有「对话上下文」这张卡（modelCard 从未接线），这六个字段一并对齐移除
  for (const gone of ['chat-memory', 'chat-image-limit', 'whisper-provider', 'whisper-model', 'chat-provider', 'chat-model', 'dialog-save']) {
    assert.doesNotMatch(html, new RegExp(`id="${gone}"`), `旧页没有该控件，不应出现：${gone}`);
  }
  for (const gone of ['chatMemoryRounds', 'chatImageLimit', 'whisperModel', 'chatModel']) {
    assert.doesNotMatch(consoleScript, new RegExp(gone), `旧页不暴露该字段，脚本不应再写：${gone}`);
  }
  for (const key of ['g-notify', 'g-click', 'g-confine', 'g-tray', 'g-obs', 'g-whisper-image', 'g-chat-image', 'g-chat-anim', 'ph-ceiling', 'ph-collide', 'font-follow']) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `开关 ${key} 应存在于静态壳`);
  }
  // 三个手机端体感开关（碰撞震动 / 倾斜控制重力 / 摇一摇抛出）旧页没有 UI，控制台一并对齐移除
  for (const gone of ['ph-haptic', 'ph-tilt', 'ph-shake']) {
    assert.doesNotMatch(html, new RegExp(`data-switch="${gone}"`), `旧页物理卡没有该开关，不应出现：${gone}`);
  }
  for (const gone of ['碰撞震动', '倾斜控制重力', '摇一摇抛出']) {
    assert.ok(!html.includes(gone), `旧页没有这行开关，文案也不应残留：${gone}`);
  }
  // 这些分区提交的都是宿主真实字段名，写错一个就会整包失败
  for (const field of ['notificationsEnabled', 'clickSoundEnabled', 'clickSoundVolume', 'confineToScreen', 'trayEnabled', 'obsCaptureEnabled', 'whisperImageEnabled', 'chatImageEnabled', 'chatAnimationEnabled', 'physics', 'font']) {
    assert.match(consoleScript, new RegExp(`${field}:`), `保存体应回传 ${field}`);
  }
  for (const sub of ['gravity', 'restitution', 'groundFriction', 'throwPower', 'ceilingBounce', 'petCollision']) {
    assert.match(consoleScript, new RegExp(`${sub}:`), `physics 段必须写全，缺子键会整段非法：${sub}`);
  }
  // 三个可选体感键：界面不编辑，但要「原配置写过才原值带回」，避免保存物理时凭空补键或抹掉手改值
  assert.match(consoleScript, /PHYSICS_OPTIONAL_KEYS = \['hapticEnabled', 'tiltGravity', 'shakeThrow'\]/, '可选体感键清单应显式列出');
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
  // 七个设置入口各自绑定一个面板
  const panels = ['pet-panel', 'global-panel', 'physics-panel', 'font-panel', 'voice-panel', 'ai-panel', 'advanced-panel'];
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
  assert.match(consoleStyles(), /html\[data-theme=dark\] \.themeToggle \.iconSun\{display:none\}/, '深色下太阳图标应隐藏');
  assert.match(consoleStyles(), /console-bg\.webp/, '浅色 body 应引用控制台背景图');
  assert.match(consoleStyles(), /html\[data-theme=dark\] body\{background-image:none\}/, '暗色下应移除浅色背景图');
});

test('板块与旧设置页对齐：宠物、全局开关、字体、物理、模型、语音、高级', () => {
  const html = consolePage();
  const titles = [...html.matchAll(/class="cardTitle"[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(titles, ['宠物', '全局开关', '字体', '物理', '模型', '语音', '高级'], '七个板块的顺序与名称要与旧页配置 Tab 一一对应');
  // 旧页没有「移动端效果」板块：那张卡与它的保存按钮都不该再有；它的三个体感开关旧页物理卡也没做，一并不放
  assert.doesNotMatch(html, /移动端效果/, '不应再有独立「移动端效果」板块');
  assert.doesNotMatch(html, /id="mobile-save"/, '移动端卡的保存按钮应已移除');
  assert.doesNotMatch(consoleScript, /saveMobile/, '脚本不应再有移动端分段保存');
  const physicsSection = html.slice(html.indexOf('id="physics-panel-title">物理<'), html.indexOf('id="ai-panel-title">模型<'));
  for (const key of ['ph-ceiling', 'ph-collide']) {
    assert.ok(physicsSection.includes(`data-switch="${key}"`), `物理板块应包含开关 ${key}`);
  }
  assert.equal((physicsSection.match(/data-switch="ph-/g) ?? []).length, 2, '物理卡只保留旧页那两个开关');
  // 全局开关补齐旧页的九个开关（三个配图 / 动作联动开关原先落在模型卡）
  const globalSection = html.slice(html.indexOf('id="global-panel-title">全局开关<'), html.indexOf('id="font-panel-title">字体<'));
  for (const key of ['g-notify', 'g-click', 'g-whisper-image', 'g-chat-image', 'g-chat-anim', 'g-confine', 'g-tray', 'g-obs']) {
    assert.ok(globalSection.includes(`data-switch="${key}"`), `全局开关板块应包含 ${key}`);
  }
  const modelSection = html.slice(html.indexOf('id="ai-panel-title">模型<'), html.indexOf('id="voice-panel-title">语音<'));
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
  for (const id of ['ai-protocol', 'ai-base-url', 'ai-model', 'ai-model-fetch', 'ai-model-picked', 'ai-api-key', 'ai-key-delete', 'ai-balance-provider', 'ai-test-btn', 'ai-balance-btn', 'ai-save']) {
    assert.match(html, new RegExp(`id="${id}"`), `模型连接表单缺少控件 ${id}`);
  }
  // 协议与余额服务商的选项集合必须与旧页一致，多一个少一个都会写进非法枚举
  for (const value of ['openai-compatible', 'anthropic']) assert.ok(html.includes(`value="${value}"`), `协议缺少 ${value}`);
  for (const value of ['', 'deepseek-official', 'opencode-go', 'commandcode']) assert.ok(html.includes(`<option value="${value}"`), `余额服务商缺少 ${value}`);
  // 密钥不回显：输入框是 password 且初始为空、删除按钮默认隐藏
  assert.match(html, /id="ai-api-key" type="password" autocomplete="new-password" placeholder="留空保留已保存的密钥"/, '密钥输入框应为 password 且提示留空保留');
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
  assert.match(html, /id="pet-size-percent" type="number" min="1" step="1" placeholder="留空 = 按 px 显示"/, '占屏宽度缺「留空按 px」占位符');
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
  assert.match(consoleScript, /area\.placeholder = entryPrompt \|\| '留空则没有系统提示词'/, '人设占位符应取条目人设全文');
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
    // 静态资源只接受 GET/HEAD：鉴权先于方法判定，未带令牌的写方法一律 403（与旧设置壳口径一致）。
    for (const path of [
      '/standalone-console/',
      '/standalone-console/console.js',
      '/standalone-console/console.css',
      '/standalone-console/console-bg.webp',
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
  assert.match(styles, /\.chatDialog\{width:min\(880px,100%\);height:min\(90vh,900px\)/, '弹窗尺寸应放大到 880×900 上限');
  assert.match(styles, /@media \(max-width:880px\)\{\.chatMask\{padding:12px\}/, '窄屏应让弹窗吃满遮罩');
  assert.match(styles, /\.chatDialog\{[^}]*--dsw-alias-label-primary:var\(--label-primary\)/, '面板 token 应映射到控制台色板');
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

test('统一直播间弹窗：单一入口、弹幕铺满主区、右上角四 logo、右侧配置抽屉；各平台面板与接口齐备', () => {
  const html = consolePage();
  const styles = consoleStyles();
  const script = consoleScript;

  // 入口：底部 Dock 里排在对话 icon 右侧，只有一个直播间入口
  const dockBar = html.slice(html.indexOf('<nav class="dockBar"'), html.indexOf('</nav>'));
  assert.match(dockBar, /id="live-open"/, '直播间入口应在底部 Dock');
  assert.ok(
    dockBar.indexOf('id="chat-open"') < dockBar.indexOf('id="live-open"'),
    '直播间入口应排在对话 icon 右侧',
  );

  // 弹窗骨架：遮罩、标题「直播间」、右上角 logo 行、关闭按钮、内联配置区、底部操作条
  assert.match(html, /id="live-dialog"/, '缺少直播间弹窗遮罩');
  assert.match(html, /id="live-dialog-title"[^>]*>[\s\S]*?直播间/, '弹窗标题应是「直播间」');
  assert.match(html, /id="live-close"/, '弹窗应有关闭按钮');
  assert.match(html, /id="live-logos"/, '右上角应有平台 logo 行');
  assert.match(html, /id="live-config-pane"/, '配置区应内联在弹窗主区');
  assert.doesNotMatch(html, /id="live-config-mask"/, '配置不该再是从右侧滑出的抽屉');
  assert.doesNotMatch(html, /id="live-config-close"/, '配置区不再是独立模态，没有自己的关闭钮');
  assert.match(
    html,
    /id="live-start"[^>]*>开始监听</,
    '底部应有唯一的「开始监听」按钮',
  );

  // 右上角四枚平台 logo 当 Tab：可点选、配置面板随平台切换、监听徽标；弹幕面板留给小窗
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(html, new RegExp(`data-platform="${p}"`), `应有平台项 ${p}`);
    assert.match(html, new RegExp(`data-select="${p}"`), `平台 logo 应可点选 ${p}`);
    assert.match(html, new RegExp(`data-panel="${p}"`), `配置区内应含设置面板 ${p}`);
    assert.match(html, new RegExp(`data-pill="${p}"`), `平台 logo 应有监听徽标 ${p}`);
    assert.match(html, new RegExp(`data-feed="${p}"`), `弹幕面板仍需保留给弹幕小窗 ${p}`);
  }
  // 头部平台 Tab 顺序按用户要求：抖音 → 快手 → 小红书 → B站
  assert.match(
    html,
    /data-select="dm"[\s\S]*?data-select="ks"[\s\S]*?data-select="xs"[\s\S]*?data-select="bl"/,
    '平台 Tab 顺序应为 抖音/快手/小红书/B站',
  );

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
  // 「打开直播间」：抖音/快手/B站有直播间地址；按用户要求改为状态行左下方的纯文本动作，不再是输入框旁的蓝色按钮
  for (const id of ['dm-open-live', 'ks-open-live', 'bl-open-live']) {
    assert.match(html, new RegExp(`id="${id}"`), `应有「打开直播间」动作：${id}`);
  }
  assert.doesNotMatch(html, /class="linkBtn"/, '不应再有蓝色「打开直播间」按钮');
  for (const p of ['dm', 'ks', 'bl']) {
    assert.match(
      html,
      new RegExp(`id="${p}-refresh">刷新状态</button></div>\\s*<div class="liveOpenLiveRow"><button[^>]*class="liveOpenLiveText"[^>]*id="${p}-open-live"[^>]*>打开直播间</button>`),
      `「打开直播间」应为状态行下方纯文本：${p}`,
    );
  }
  assert.match(styles, /\.liveOpenLiveText\{[^}]*background:none/, '打开直播间应为纯文本样式');
  assert.doesNotMatch(html, /id="xs-open-live"/, '小红书没有直播间地址，不该有「打开直播间」按钮');
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
  assert.match(html, /id="live-open-mini"/, '底部应能重新打开弹幕小窗');
  // 「刷新状态」不再是底栏按钮，改为状态行右侧的纯文本动作（四平台各一）
  assert.doesNotMatch(html, /id="live-refresh"/, '底栏不应再有刷新状态按钮');
  for (const p of ['dm', 'xs', 'ks', 'bl']) {
    assert.match(html, new RegExp(`class="liveStatusRow"><p class="liveStatus" id="${p}-status"[\\s\\S]*?id="${p}-refresh">刷新状态</button>`), `状态行右侧应有纯文本刷新：${p}`);
  }
  assert.match(styles, /\.liveStatusRefresh\{[^}]*background:none/, '刷新状态应为纯文本样式');
  // 底栏布局：左侧当前平台的回复/感谢开关，右侧按钮且「开始监听」在最右
  assert.match(
    html,
    /class="liveFootLeft"[\s\S]*?data-foot-switches="dm"[\s\S]*?data-foot-switches="bl"[\s\S]*?class="liveFootRight"><button[^>]*id="live-open-mini"[\s\S]*?id="live-start">开始监听</,
    '底栏应为左开关右按钮，开始监听在最右',
  );
  assert.doesNotMatch(html, /class="dmSwitches"/, '开关不应再留在配置卡里');
  assert.match(script, /data-foot-switches="' \+ p/, '切平台应同步切换底栏开关组');
  assert.match(html, /id="dm-url"[\s\S]*?placeholder="粘贴直播间链接，或直接填纯数字房间号"/, '直播间输入框占位符应与旧页一致');
  assert.match(html, /id="dm-cookie"[\s\S]*?placeholder="不填将弹出窗口扫码登录；有登录 Cookie 可粘贴到这里"/, 'Cookie 占位符应说明不填走弹窗扫码');
  assert.doesNotMatch(html, /id="panel-danmaku"/, '控制台里不该出现旧页的面板容器');

  // 旧四枚平台入口与旧四套遮罩已拆除，统一进 #live-dialog
  for (const gone of ['dm-open', 'xs-open', 'ks-open', 'bl-open', 'dm-dialog', 'xs-dialog', 'ks-dialog', 'bl-dialog', 'dm-close', 'xs-close', 'ks-close', 'bl-close']) {
    assert.doesNotMatch(html, new RegExp(`id="${gone}"`), `旧入口 / 遮罩不应再出现：${gone}`);
  }

  // 样式：配置内联在主区、弹幕区只在小窗出现、非当前平台配置面板隐藏、底部操作条、停止监听红色按钮
  assert.match(styles, /\.liveConfigPane\{[^}]*overflow-y:auto/, '配置区应自己滚动，不撑破弹窗');
  assert.match(styles, /body:not\(\.live-mini\) \.liveMain\{display:none\}/, '大窗不再显示弹幕区');
  assert.match(styles, /body\.live-mini \.liveConfigPane\{display:none!important\}/, '小窗不显示配置区');
  assert.match(styles, /body\.live-mini \.liveLogoRow\{display:none!important\}/, '小窗内不能切平台');
  assert.match(styles, /\.liveConfigPanel\{display:none/, '非当前平台配置面板隐藏');
  assert.match(styles, /\.liveConfigPanel\.is-active\{display:flex\}/, '只有当前平台配置面板显示');
  assert.match(styles, /\.liveFoot\{[^}]*border-top/, '底部应有独立操作条');
  assert.match(styles, /\.liveFeedPanel\.is-active\{display:flex/, '只有当前选中平台的弹幕面板显示');
  assert.match(styles, /\.dmFeedItem\.gift\{/, '礼物弹幕应有单独配色');
  assert.match(styles, /\.btn\.danger\{background:color-mix/, '停止监听需要红色按钮');
  assert.match(styles, /\.petFields\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:10px 16px\}/, '宠物字段区应为可收缩的两列网格');
  assert.match(styles, /\.petFields \.fieldInput\{height:32px\}/, '宠物区输入框应收窄高度');
  assert.match(styles, /\.petFields \.corner\{height:30px\}/, '宠物区角落按钮应收窄高度');

  // 缓存 key 与四组接口沿用旧页，四个平台各自的接线函数保留
  assert.match(script, /blue_fish_douyin_danmaku_form_v1/, '抖音表单缓存 key 应与旧页一致');
  assert.match(script, /blue_fish_xhs_danmaku_form_v1/, '小红书表单缓存 key');
  assert.match(script, /blue_fish_ks_danmaku_form_v1/, '快手表单缓存 key');
  assert.match(script, /blue_fish_bili_danmaku_form_v1/, 'B站表单缓存 key');
  for (const [prefix, seg] of [['douyin', 'douyin'], ['xiaohongshu', 'xiaohongshu'], ['kuaishou', 'kuaishou'], ['bilibili', 'bilibili']]) {
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
  // 页内弹窗尺寸按用户要求小幅收窄收矮，且定高：切平台时高度不随内容跳动（独立大窗/小窗的铺满覆盖不受影响）
  assert.match(
    styles,
    /\.liveDialog\{width:min\(900px,100%\);height:min\(88vh,860px\)/,
    '页内直播间弹窗应为 900px 宽、定高 88vh/860px',
  );
  assert.doesNotMatch(styles, /\.liveDialog\{[^}]*height:auto/, '页内弹窗不应再按内容自适应高度');
  assert.match(script, /function selectLive\(/, '平台 Tab 切换应换当前平台');
  assert.match(script, /function setLiveDialog\(open\)/, '统一弹窗开关应是单一入口函数');
  assert.match(script, /function liveToggleCurrent\(\)/, '底部开始监听应是单一收口函数');
  assert.match(script, /liveStarters = \{ dm: dmStart, xs: xsStart, ks: ksStart, bl: blStart \}/, '四平台启动函数应统一登记');
  assert.match(script, /liveStoppers = \{ dm: dmStop, xs: xsStop, ks: ksStop, bl: blStop \}/, '四平台停止函数应统一登记');
  assert.match(script, /function liveOpenMini\(platform\)/, '开小窗应带上当前平台');
  assert.match(script, /window\.petBridge\.openLiveMini\(target\)/, '开小窗走主进程桥');
  assert.match(script, /if \(liveReadingPlatform\(platform\)\) liveOpenMini\(platform\)/, '只有真起来才开小窗（失败不假装开窗）');
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
  assert.match(script, /LIVE_STANDALONE = new URLSearchParams\(location\.search\)\.get\('live'\) === '1'/, '应从 query 读取 live 独立模式标志');
  assert.doesNotMatch(script, /hasLiveBridge/, '入口不应再探测开窗桥');
  assert.doesNotMatch(script, /window\.petBridge\.openLive\(\)/, '入口不应再通知主进程开独立窗口');
  assert.match(
    script,
    /if \(dialog\.hasAttribute\('hidden'\)\) setLiveDialog\(true\);\s*else setLiveDialog\(false\);/,
    '入口应直接开合页内弹窗（有桥无桥同一路径）',
  );
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
  assert.ok(
    miniFlagAt < script.indexOf('history.replaceState'),
    'mini 标志应在清 query 之前读取',
  );
  const miniPlatformAt = script.indexOf("get('p') || ''");
  assert.ok(miniPlatformAt > 0, '小窗应读开窗时传进来的平台参数 p');
  assert.ok(
    miniPlatformAt < script.indexOf('history.replaceState'),
    '平台参数也应在清 query 之前读取',
  );

  // 入口：控制台底部「开始监听」成功后自动开小窗，Dock 上不再另放一个重复入口
  assert.doesNotMatch(html, /id="live-mini-open"/, 'Dock 不该再有小窗按钮（入口是底部开始监听）');
  assert.match(script, /window\.petBridge\.openLiveMini\(target\)/, '有桥时带平台开小窗');
  assert.match(script, /弹幕小窗要在桌面端（独立模式）里才能开/, '无桥时应提示只能在桌面端开小窗');

  // 小窗形态：固定暗色、body 打模式类、标题改成「弹幕」、按传入平台选中、不显示配置也不能切平台
  assert.match(script, /document\.body\.classList\.add\('live-mini'\)/, '小窗模式应给 body 打模式类');
  assert.match(script, /if \(!LIVE_MINI\) wireTheme\(\)/, '小窗不读不写主题，避免把控制台主题带跑');
  assert.match(script, /if \(LIVE_PLATFORMS\.indexOf\(LIVE_MINI_PLATFORM\) >= 0\) liveCurrent = LIVE_MINI_PLATFORM/, '小窗应直接锁定传入的平台');
  assert.match(styles, /body\.live-mini \.liveConfigPane\{display:none!important\}/, '小窗不显示配置区');
  assert.match(styles, /body\.live-mini \.liveLogoRow\{display:none!important\}/, '小窗内不能切平台');
  assert.match(styles, /body\.live-mini \.liveFoot\{display:none!important\}/, '小窗不显示底部操作条');
  assert.match(styles, /body\.live-mini \.dmFeedTime\{display:none\}/, '小窗窄，弹幕行不显示时间');
  assert.match(styles, /body\.live-mini \.dmFeedAva\{width:24px/, '小窗应压缩头像与字号');
  assert.match(styles, /body\.live-mini #live-dialog\{padding:0;align-items:stretch;justify-content:stretch;background:#070d18\}/, '小窗整窗铺满、固定深蓝底');
  assert.match(styles, /body\.live-mini \.liveDialog\{width:100%;height:100%/, '小窗内容铺满整个窗口，不再内嵌卡片');
  // 独立模式 align-items:center 会把 .liveMain 缩成内容宽并居中；小窗必须显式补满整窗宽度
  assert.match(
    styles,
    /body\.live-mini \.liveDialog \.liveMain\{width:100%;max-width:none\}/,
    '小窗礼物/弹幕区应占满整窗宽度，不被独立模式居中收缩',
  );
});

test('保存结果气泡：保存成功 / 失败都弹出底部气泡，统一收口与 AI 保存都接入', () => {
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
  // 样式：浮层固定居中、成功 / 失败配色点
  assert.match(styles, /\.toastRoot\{/, '气泡浮层应有定位容器');
  assert.match(styles, /\.toastOk::before\{background:var\(--primary\)\}/, '成功气泡用主色点');
  assert.match(styles, /\.toastError::before\{background:var\(--danger\)\}/, '失败气泡用红色点');
});
