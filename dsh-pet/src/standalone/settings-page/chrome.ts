/**
 * 设置页 HTML 外壳：左侧固定分区导航 + 右侧内容区。
 * 分区为对话 / 配置 / 模型 / 语音；侧栏另有外链「抖音弹幕」跳到 `/blue-fish/danmaku/`。
 * 配置页瀑布流只放桌宠与全局卡；模型、语音各占侧栏分区。语音与桌宠共用顶栏「保存」（/config）；
 * 模型「保存」也在顶栏（form=settings → `/standalone-ai/settings`）。
 *
 * 页面只在本机回环上由 ./server 提供；CSP 是 `style-src 'self'`，所以这里不许出现内联样式，
 * 也不许内联脚本。桌宠配置面板的内容依赖 GET /config，初始只有一句占位文案。
 * 图标走设置页自己的公开资源路径（/standalone-ai/icon.png），内容读自包内 assets/logo.png，
 * 不复制第二份图；不能用插件路由 /logo——浏览器取 favicon 不带 Origin 也不带令牌，会被判成文件来源而 403。
 * 导航项以 `data-tab` 声明，脚本按约定找 `panel-<tab>`，新增分区只需照此加一对按钮与面板。
 * @module dsh-pet/src/standalone/settings-page/chrome
 */

/** 设置页 HTML。 */
export const settingsPage = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>桌宠设置</title><link rel="icon" type="image/png" href="/standalone-ai/icon.png"><link rel="stylesheet" href="/standalone-ai/settings.css">
<script src="/standalone-ai/settings.js" defer></script><script src="/standalone-ai/chat-panel.js" defer></script></head><body>
<main class="shell">
<aside class="side">
<div class="brand"><img class="brandLogo" src="/standalone-ai/icon.png" alt=""><span>桌宠</span></div>
<nav class="nav" aria-label="设置分区"><div class="navList" role="tablist">
<button type="button" class="navCell" role="tab" id="tab-chat" data-tab="chat" data-title="对话" aria-controls="panel-chat" aria-selected="true"><svg class="navGlyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.4h10a1.1 1.1 0 0 1 1.1 1.1v5.6A1.1 1.1 0 0 1 13 11.2H8.2L5 13.6v-2.4H3a1.1 1.1 0 0 1-1.1-1.1V4.5A1.1 1.1 0 0 1 3 3.4Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg><span class="navLabel">对话</span></button>
<button type="button" class="navCell" role="tab" id="tab-config" data-tab="config" data-title="配置" aria-controls="panel-config" aria-selected="false"><svg class="navGlyph" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M2.6 4.6h10.8M2.6 11.4h10.8"/><circle cx="6.2" cy="4.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="9.8" cy="11.4" r="1.6" fill="currentColor" stroke="none"/></g></svg><span class="navLabel">配置</span></button>
<button type="button" class="navCell" role="tab" id="tab-model" data-tab="model" data-title="模型" aria-controls="panel-model" aria-selected="false"><svg class="navGlyph" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><rect x="2.6" y="3.2" width="10.8" height="9.6" rx="1.2"/><path d="M5.2 6.4h5.6M5.2 9.2h3.8" stroke-linecap="round"/></g></svg><span class="navLabel">模型</span></button>
<button type="button" class="navCell" role="tab" id="tab-voice" data-tab="voice" data-title="语音" aria-controls="panel-voice" aria-selected="false"><svg class="navGlyph" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.8v10.4"/><path d="M5.2 5.2v5.6M10.8 5.2v5.6"/><path d="M3.2 6.8v2.4M12.8 6.8v2.4"/></g></svg><span class="navLabel">语音</span></button>
<a class="navCell navExt" href="/blue-fish/danmaku/" id="link-danmaku" data-title="抖音弹幕" target="_blank" rel="noopener noreferrer"><svg class="navGlyph" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.8 3.2h10.4a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H9.2L6.4 13v-2.6H2.8a1 1 0 0 1-1-1V4.2a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.2 6.2h5.6M5.2 8.4h3.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg><span class="navLabel">抖音弹幕</span></a>
</div></nav>
<div class="sideFoot">独立模式</div>
</aside>
<div class="main">
<div class="topbar"><div class="topbarLead"><h1 class="pageTitle" id="page-title">对话</h1><button class="btn primary" id="pet-save" type="button" disabled hidden>保存</button><button class="btn primary" id="save" type="submit" form="settings" disabled hidden>保存</button><span class="saveHint" id="save-hint" role="status" aria-live="polite" hidden></span></div><div class="topbarTrail"><span class="dirty" id="dirty" hidden>有未保存的改动</span><button class="btn ghost themeBtn" id="theme-toggle" type="button" aria-label="切换到暗色"><svg class="themeIcon themeIcon--moon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.1 2.1a1 1 0 0 1 1.1 1.3A8 8 0 1 0 20.6 14a1 1 0 0 1 1.3-1.1A10 10 0 1 1 12.1 2.1Z"/></svg><svg class="themeIcon themeIcon--sun" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0-5a1 1 0 0 1 1 1V5a1 1 0 1 1-2 0V3.5a1 1 0 0 1 1-1Zm0 15a1 1 0 0 1 1 1V20.5a1 1 0 1 1-2 0V18.5a1 1 0 0 1 1-1ZM3.5 11a1 1 0 1 0 0 2H5a1 1 0 1 0 0-2H3.5Zm15 0a1 1 0 1 0 0 2H20.5a1 1 0 1 0 0-2H18.5ZM5.64 5.64a1 1 0 0 1 1.42 0L8.12 6.7A1 1 0 1 1 6.7 8.12L5.64 7.06a1 1 0 0 1 0-1.42Zm10.24 10.24a1 1 0 0 1 1.42 0l1.06 1.06a1 1 0 0 1-1.42 1.42l-1.06-1.06a1 1 0 0 1 0-1.42ZM18.36 5.64a1 1 0 0 1 0 1.42L17.3 8.12A1 1 0 1 1 15.88 6.7l1.06-1.06a1 1 0 0 1 1.42 0ZM8.12 15.88a1 1 0 0 1 0 1.42L7.06 18.36a1 1 0 1 1-1.42-1.42l1.06-1.06a1 1 0 0 1 1.42 0Z"/></svg></button></div></div>
<div class="options">
<section class="panel" id="panel-config" role="tabpanel" aria-labelledby="tab-config" hidden>
<div class="scroll">
<div id="pet-cards">
<p class="empty">正在读取本机配置…</p>
</div>
<div class="footer"><p class="status" id="pet-status" role="status" aria-live="polite"></p></div>
</div>
</section>
<section class="panel" id="panel-voice" role="tabpanel" aria-labelledby="tab-voice" hidden>
<div class="scroll">
<div id="voice-host">
<p class="empty">正在读取本机配置…</p>
</div>
</div>
</section>
<section class="panel" id="panel-model" role="tabpanel" aria-labelledby="tab-model" hidden>
<div class="scroll">
<form id="settings" aria-describedby="privacy">
<div class="card"><div class="cardHead"><h2 class="cardTitle">模型连接</h2></div>
<p class="cardHint">独立模式自己连服务商，不经过 DSH；所有配置只保存在当前机器。</p>
<div class="field"><span class="fieldLabel" id="protocol-label">接口协议</span><div id="protocol-host"></div></div>
<div class="field"><label for="baseUrl">接口地址（Base URL）</label><input id="baseUrl" name="baseUrl" type="url" placeholder="https://example.com/v1" maxlength="2048" spellcheck="false" aria-describedby="endpoint-note"><p class="fieldHint" id="endpoint-note">服务商提供的基础接口地址，支持 HTTP 与 HTTPS，通常以 /v1 结尾。不要把密钥放进地址。</p></div>
<div class="field"><label for="model">模型名称</label><div class="combo" id="model-combo"><input id="model" name="model" type="text" maxlength="200" placeholder="填写或拉取服务商的模型 ID，例如 deepseek-chat" spellcheck="false" aria-describedby="model-note"><button id="model-toggle" class="comboToggle" type="button" aria-label="拉取并选择模型" aria-haspopup="listbox" aria-expanded="false"></button></div><p class="fieldHint" id="model-note">可以直接手填；点右侧箭头向端点拉取可用列表后选择。拉取只用本次填写的地址与密钥，不会保存。</p><p class="status" id="model-result" role="status" aria-live="polite"></p></div>
<div class="field"><label for="apiKey">API 密钥 <span class="hintInline" id="key-state">尚未读取</span></label><input id="apiKey" name="apiKey" type="password" autocomplete="new-password" maxlength="8192" placeholder="留空保留已保存的密钥" aria-describedby="key-note"><div class="keyActions" id="key-actions" hidden><button id="key-delete" class="btn ghost" type="button">删除已保存的密钥</button></div><p id="key-note" class="fieldHint">密钥只写入本机配置，不会回显。留空会保留旧密钥，要彻底删除请点上面的按钮。</p></div>
<div class="field"><span class="fieldLabel" id="balance-provider-label">余额查询服务商</span><div id="balance-provider-host"></div><p class="fieldHint" id="balance-provider-note">可选：选定后可用上面保存的密钥查询余额，不选则不查询。余额接口只有 DeepSeek 官方、opencode Go 与 commandcode 提供，且密钥必须属于所选服务商。</p><div class="testRow"><button id="balance-btn" class="btn ghost" type="button" disabled>查询余额</button><span id="balance-result" class="status" role="status" aria-live="polite"></span></div></div>
<div class="testRow"><button id="test-btn" class="btn" type="button">测试连接</button><span id="test-result" class="status" role="status" aria-live="polite"></span></div>
</div>
<p id="privacy" class="fineprint">所有配置与密钥仅保存在当前机器。</p>
<div class="footer"><p class="status" id="status" role="status" aria-live="polite">正在读取本机设置…</p></div>
</form>
</div>
</section>
<section class="panel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
<div class="pet-chat-host" id="pet-chat-root"></div>
</section>
</div>
</div>
</main>
<noscript>需要启用 JavaScript 才能保存设置。请从桌宠右键菜单打开本页。</noscript>
</body></html>`;
