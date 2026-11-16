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
  for (const key of ['g-notify', 'g-click', 'g-confine', 'g-tray', 'g-obs', 'g-whisper-image', 'g-chat-image', 'g-chat-anim', 'ph-ceiling', 'ph-collide', 'ph-haptic', 'ph-tilt', 'ph-shake', 'font-follow']) {
    assert.match(html, new RegExp(`data-switch="${key}"`), `开关 ${key} 应存在于静态壳`);
  }
  // 这些分区提交的都是宿主真实字段名，写错一个就会整包失败
  for (const field of ['notificationsEnabled', 'clickSoundEnabled', 'clickSoundVolume', 'confineToScreen', 'trayEnabled', 'obsCaptureEnabled', 'whisperImageEnabled', 'chatImageEnabled', 'chatAnimationEnabled', 'physics', 'font']) {
    assert.match(consoleScript, new RegExp(`${field}:`), `保存体应回传 ${field}`);
  }
  for (const sub of ['gravity', 'restitution', 'groundFriction', 'throwPower', 'ceilingBounce', 'petCollision', 'hapticEnabled', 'tiltGravity', 'shakeThrow']) {
    assert.match(consoleScript, new RegExp(`${sub}:`), `physics 段必须写全，缺子键会整段非法：${sub}`);
  }
  assert.match(consoleScript, /followPet:/, 'font 段需带上 followPet');
  assert.match(consoleScript, /family:/, 'font 段需带上 family');
  // 每个开关都必须有点击映射：漏一个就会出现「拨了开关但保存没变」的假功能
  const switchKeys = new Set<string>();
  for (const m of html.matchAll(/data-switch="([^"]+)"/g)) switchKeys.add(m[1] as string);
  for (const key of switchKeys) {
    assert.match(consoleScript, new RegExp(`'${key}':`), `开关 ${key} 缺少点击映射，改动不会进入草稿`);
  }
  // 底部两个动作与「重置」的真实端点
  assert.match(html, /id="console-save"/, '底部应有保存全部');
  assert.match(html, /id="console-sync"/, '底部应有重置');
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
  // 点上传时仍给出原因，不留一个闷声无反应的按钮
  assert.match(consoleScript, /内置条目的头像固定用包里的 logo/, '内置条目点上传时应给出原因');
  assert.match(consoleScript, /loadAvatar\(byId\('pet-avatar-img'\), root\)/, '头像预览应按当前素材根加载');
});

test('下方卡片为两列瀑布流：单卡变高不再拉齐邻卡', () => {
  const css = consoleStyles();
  // 多列布局：每列各自向下堆叠，卡片高度互不影响
  assert.match(css, /\.grid\{display:block;column-count:2;column-gap:18px\}/, '卡片容器应为两列瀑布流');
  assert.doesNotMatch(css, /\.grid\{display:grid;grid-template-columns:1fr 1fr\}/, '不应退回两列等高网格');
  // 卡片不允许被切断到下一列，且列内纵向间距由 margin 承担
  assert.match(css, /\.card\{[^}]*break-inside:avoid/, '卡片需 break-inside:avoid，否则会被切到下一列');
  assert.match(css, /\.card\{[^}]*margin-bottom:18px/, '卡片需自带下边距，瀑布流的纵向间距靠它');
  // 宠物列表与宠物配置两张宽卡仍通栏
  assert.match(css, /\.petConfig\{column-span:all\}/, '宠物配置卡应跨两列');
  assert.doesNotMatch(css, /\.petConfig\{grid-column:1 \/ -1\}/, '不应再残留网格跨列写法');
  // 窄屏回落单列
  assert.match(css, /@media \(max-width:880px\)\{\.grid\{column-count:1\}\}/, '窄屏应回落到单列');
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
});

test('板块与旧设置页对齐：宠物、全局开关、字体、物理、模型、语音、高级', () => {
  const html = consolePage();
  const titles = [...html.matchAll(/class="cardTitle">([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(titles, ['宠物', '全局开关', '字体', '物理', '模型', '语音', '高级'], '七个板块的顺序与名称要与旧页配置 Tab 一一对应');
  // 旧页没有「移动端效果」板块：三开关并入物理，独立卡与它的保存按钮都不该再有
  assert.doesNotMatch(html, /移动端效果/, '不应再有独立「移动端效果」板块');
  assert.doesNotMatch(html, /id="mobile-save"/, '移动端卡的保存按钮应已移除');
  assert.doesNotMatch(consoleScript, /saveMobile/, '脚本不应再有移动端分段保存');
  const physicsSection = html.slice(html.indexOf('class="cardTitle">物理<'), html.indexOf('class="cardTitle">模型<'));
  for (const key of ['ph-ceiling', 'ph-collide', 'ph-haptic', 'ph-tilt', 'ph-shake']) {
    assert.ok(physicsSection.includes(`data-switch="${key}"`), `物理板块应包含开关 ${key}`);
  }
  // 全局开关补齐旧页的九个开关（三个配图 / 动作联动开关原先落在模型卡）
  const globalSection = html.slice(html.indexOf('class="cardTitle">全局开关<'), html.indexOf('class="cardTitle">字体<'));
  for (const key of ['g-notify', 'g-click', 'g-whisper-image', 'g-chat-image', 'g-chat-anim', 'g-confine', 'g-tray', 'g-obs']) {
    assert.ok(globalSection.includes(`data-switch="${key}"`), `全局开关板块应包含 ${key}`);
  }
  const modelSection = html.slice(html.indexOf('class="cardTitle">模型<'), html.indexOf('class="cardTitle">语音<'));
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
    // 静态资源只接受 GET/HEAD：鉴权先于方法判定，未带令牌的写方法一律 403（与旧设置壳口径一致）。
    for (const path of ['/standalone-console/', '/standalone-console/console.js', '/standalone-console/console.css']) {
      const rejected = await fetch(base + path, { method: 'POST' });
      assert.equal(rejected.status, 403, path);
      await rejected.text();
    }
  } finally {
    await server.close();
  }
});

test('对话入口：头像下的图标按钮 + 弹窗即对话窗口，复用旧页那份面板产物', () => {
  const html = consolePage();
  const styles = consoleStyles();
  // 入口挂在宠物卡的头像区里（头像下方），不是别处
  const avatarBox = html.slice(html.indexOf('<div class="avatarBox">'), html.indexOf('</div>', html.indexOf('id="pet-avatar-file"')));
  assert.match(avatarBox, /id="chat-open"/, '对话入口应在头像区');
  assert.match(avatarBox, /class="chatEntry"/, '对话入口应是圆形图标按钮');
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
});
