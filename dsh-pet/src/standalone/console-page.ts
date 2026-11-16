/**
 * 「桌宠控制台」独立页面：HTML 外壳、脚本与样式三件套。
 *
 * 与旧 `/standalone-ai/` 设置页完全并行：旧入口、旧路由、旧窗口链路一行不动。
 * 本页面走新的 `/standalone-console/` 路由，由右键菜单「桌宠控制台」在应用内窗口打开。
 *
 * 安全口径与旧设置页一致：只在本机回环提供；页面不内联脚本与样式（CSP default-src 'none'），
 * 脚本/样式均为同源外挂；图标复用旧设置页的公开资源路径 `/standalone-ai/icon.png`。
 *
 * 分区全部接入本机 `/config` 读写：宠物列表与宠物配置、全局开关、语音播报、物理、移动端效果、
 * 外观与字体、对话与模型，各自独立保存；底部「保存全部」一次提交全部段，「重置」走 POST /config。
 * @module dsh-pet/src/standalone/console-page
 */
import { ROUTE_SEGMENT } from '../shared/constants.ts';
import { BREEZE_API_KEY_URL } from '../shared/voice-links.ts';
import { PANEL_CSS } from '../client/chat/panel-css.ts';

/** 控制台页面 HTML。 */
export function consolePage(): string {
  return `<!doctype html>
<html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><base href="/"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>桌宠控制台</title><link rel="icon" type="image/png" href="/standalone-ai/icon.png"><link rel="stylesheet" href="/standalone-console/console.css">
<script src="/standalone-console/console.js" defer></script><script src="/standalone-console/chat-panel.js" defer></script></head><body>
<main class="console">
<header class="top">
<div class="brand">
<img class="brandLogo" src="/standalone-ai/icon.png" alt="">
<div class="brandText"><h1 class="title">桌宠控制台</h1><p class="subtitle">自定义你的桌面小伙伴，让陪伴更懂你</p></div>
</div>
<div class="slogan">
<button type="button" class="sloganBadge themeToggle" id="theme-toggle" aria-label="切换到暗色" aria-pressed="false" title="切换深色 / 浅色"><span class="iconSun" aria-hidden="true"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M12.4 3.6l-1.3 1.3M4.9 11.1l-1.3 1.3"/></svg></span><span class="iconMoon" aria-hidden="true"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 9.6A5.4 5.4 0 0 1 6.4 3a5.4 5.4 0 1 0 6.6 6.6z"/></svg></span></button>
<span class="sloganText">陪伴，<br>让桌面更温暖</span>
</div>
</header>

<section class="card petList">
<div class="cardHead"><span class="kind">种类</span><span class="chip">内置</span><span class="petListTitle">宠物列表</span></div>
<div class="avatars" id="pet-avatars"></div>
<span class="voiceStatus" id="pet-list-status" role="status" aria-live="polite"></span>
</section>

<section class="grid">
<div class="card petConfig">
<div class="cardHead"><h2 class="cardTitle">宠物</h2><div class="cardActions"><button type="button" class="btn primary" id="pet-save">保存</button><button type="button" class="btn ghost danger" id="pet-delete">删除</button></div></div>
<p class="cardHint">这里编辑的是默认条目的实例；改动在点保存后写盘。</p>
<div class="petConfigBody">
<div class="avatarBox">
<img id="pet-avatar-img" alt="">
<button type="button" class="btn ghost" id="pet-avatar-upload" hidden>上传头像</button>
<input type="file" id="pet-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
<button type="button" class="chatEntry" id="chat-open" aria-label="打开对话窗口" title="对话"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M3 3.4h10a1.1 1.1 0 0 1 1.1 1.1v5.6A1.1 1.1 0 0 1 13 11.2H8.2L5 13.6v-2.4H3a1.1 1.1 0 0 1-1.1-1.1V4.5A1.1 1.1 0 0 1 3 3.4Z"/></svg></button>
</div>
<div class="fields">
<div class="fieldRow"><label class="fieldLabel" for="pet-name">名字</label><input class="fieldInput" id="pet-name" type="text" autocomplete="off"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-id">标识（id）</label><input class="fieldInput" id="pet-id" type="text" disabled></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-size">大小（宽度 px）</label><input class="fieldInput" id="pet-size" type="number" min="1" step="1"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-size-percent">占屏宽度（%）</label><input class="fieldInput" id="pet-size-percent" type="number" min="1" step="1" placeholder="留空 = 按 px 显示"></div>
<div class="fieldRow"><span class="fieldLabel">停靠角落</span><div class="cornerRow" id="pet-corner-row">
<button type="button" class="corner" data-corner="top-left">左上角</button>
<button type="button" class="corner" data-corner="top-right">右上角</button>
<button type="button" class="corner" data-corner="bottom-left">左下角</button>
<button type="button" class="corner" data-corner="bottom-right">右下角</button>
</div></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-margin-x">水平偏移（px）</label><input class="fieldInput" id="pet-margin-x" type="number" step="1"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-margin-y">垂直偏移（px）</label><input class="fieldInput" id="pet-margin-y" type="number" step="1"></div>
<div class="fieldRow switchPair">
<div class="switchLine"><span>余额功能</span><button type="button" class="switch" data-switch="pet-balance" aria-checked="false"></button></div>
<div class="switchLine"><span>碎碎念</span><button type="button" class="switch" data-switch="pet-whisper" aria-checked="false"></button></div>
</div>
<div class="fieldRow switchPair">
<div class="switchLine"><span>工作状态联动</span><button type="button" class="switch" data-switch="pet-work" aria-checked="false"></button></div>
<div class="switchLine"><span>固定不动</span><button type="button" class="switch" data-switch="pet-fixed" aria-checked="false"></button></div>
</div>
<div class="fieldRow wide">
<label class="fieldLabel" for="pet-persona">这只的人设（可选）</label>
<textarea class="fieldInput area" id="pet-persona" rows="3" maxlength="4000"></textarea>
<div class="personaFoot"><span class="fieldHint" id="pet-persona-hint"></span><span class="personaCount" id="pet-persona-count">0 字</span></div>
<span class="fieldHint">发给模型的 system = 这段 + 自动追加的名字与时间背景，别在这里重复写。</span>
</div>
</div>
</div>
<div class="cardFoot"><span class="voiceStatus" id="pet-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card">
<div class="cardHead"><h2 class="cardTitle">全局开关</h2></div>
<p class="cardHint">对所有宠物生效；保存后立即写盘。</p>
<div class="switchGrid">
<div class="switchLine"><span>系统通知</span><button type="button" class="switch" data-switch="g-notify" aria-checked="false"></button></div>
<div class="switchLine"><span>点击音效</span><button type="button" class="switch" data-switch="g-click" aria-checked="false"></button></div>
<div class="switchLine"><span>碎碎念配图</span><button type="button" class="switch" data-switch="g-whisper-image" aria-checked="false"></button></div>
<div class="switchLine"><span>对话配图</span><button type="button" class="switch" data-switch="g-chat-image" aria-checked="false"></button></div>
<div class="switchLine"><span>对话动作联动</span><button type="button" class="switch" data-switch="g-chat-anim" aria-checked="false"></button></div>
<div class="switchLine"><span>锁定在当前屏幕</span><button type="button" class="switch" data-switch="g-confine" aria-checked="false"></button></div>
<div class="switchLine"><span>系统托盘图标</span><button type="button" class="switch" data-switch="g-tray" aria-checked="false"></button></div>
<div class="switchLine"><span>窗口模式</span><button type="button" class="switch" data-switch="g-obs" aria-checked="false"></button></div>
</div>
<div class="fields fieldGap">
<div class="fieldRow"><label class="fieldLabel" for="g-click-volume">点击音效音量（0–1）</label><input class="fieldInput" id="g-click-volume" type="number" min="0" max="1" step="0.05"><span class="fieldHint">1 = 100%；短提示音不做增益放大。</span></div>
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="global-save">保存</button><span class="voiceStatus" id="global-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card">
<div class="cardHead"><h2 class="cardTitle">字体</h2></div>
<p class="cardHint">气泡与悬浮提示用的字体；对话窗字号不受这里影响。</p>
<div class="fields">
<div class="fieldRow"><label class="fieldLabel" for="font-family">字体</label><select class="fieldInput" id="font-family">
<option value="candy">软糖体（内置）</option>
<option value="yahei">微软雅黑 / 苹方</option>
<option value="youyuan">幼圆</option>
<option value="kaiti">楷体</option>
<option value="simsun">宋体</option>
<option value="comic">漫画体</option>
<option value="system">系统默认</option>
</select></div>
<div class="fieldRow"><label class="fieldLabel" for="font-size">字号（px）</label><input class="fieldInput" id="font-size" type="number" min="4" max="200" step="1"></div>
</div>
<div class="switchGrid fieldGap">
<div class="switchLine"><span>字号随宠物大小缩放</span><button type="button" class="switch" data-switch="font-follow" aria-checked="false"></button></div>
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="font-save">保存</button><span class="voiceStatus" id="font-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card">
<div class="cardHead"><h2 class="cardTitle">物理</h2></div>
<p class="cardHint">所有宠物共用；数值改动保存后生效。</p>
<div class="fields">
<div class="fieldRow"><label class="fieldLabel" for="ph-gravity">重力（px/s²）</label><input class="fieldInput" id="ph-gravity" type="number" min="0" max="10000" step="10"></div>
<div class="fieldRow"><label class="fieldLabel" for="ph-restitution">碰壁弹性（0–1）</label><input class="fieldInput" id="ph-restitution" type="number" min="0" max="1" step="0.01"></div>
<div class="fieldRow"><label class="fieldLabel" for="ph-friction">接触面摩擦（/s）</label><input class="fieldInput" id="ph-friction" type="number" min="0" max="30" step="0.1"></div>
<div class="fieldRow"><label class="fieldLabel" for="ph-power">总力度（0.1–5）</label><input class="fieldInput" id="ph-power" type="number" min="0.1" max="5" step="0.1"></div>
</div>
<div class="switchGrid fieldGap">
<div class="switchLine"><span>顶部反弹</span><button type="button" class="switch" data-switch="ph-ceiling" aria-checked="false"></button></div>
<div class="switchLine"><span>宠物互相碰撞</span><button type="button" class="switch" data-switch="ph-collide" aria-checked="false"></button></div>
<div class="switchLine"><span>碰撞震动</span><button type="button" class="switch" data-switch="ph-haptic" aria-checked="false"></button></div>
<div class="switchLine"><span>倾斜控制重力</span><button type="button" class="switch" data-switch="ph-tilt" aria-checked="false"></button></div>
<div class="switchLine"><span>摇一摇抛出</span><button type="button" class="switch" data-switch="ph-shake" aria-checked="false"></button></div>
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="physics-save">保存</button><span class="voiceStatus" id="physics-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card">
<div class="cardHead"><h2 class="cardTitle">模型</h2></div>
<p class="cardHint">独立模式自己连服务商，不经过 DSH；所有配置只保存在当前机器。</p>
<div class="fields">
<div class="fieldRow"><label class="fieldLabel" for="ai-protocol">接口协议</label><select class="fieldInput" id="ai-protocol">
<option value="openai-compatible">OpenAI 兼容</option>
<option value="anthropic">Anthropic</option>
</select></div>
<div class="fieldRow"><label class="fieldLabel" for="ai-base-url">接口地址（Base URL）</label><input class="fieldInput" id="ai-base-url" type="url" autocomplete="off" placeholder="https://example.com/v1"></div>
<div class="fieldRow wide"><label class="fieldLabel" for="ai-model">模型名称</label><div class="keyInputRow"><input class="fieldInput" id="ai-model" type="text" autocomplete="off" placeholder="手填模型 ID，或先用右侧「拉取模型」"><button type="button" class="btn ghost" id="ai-model-fetch">拉取模型</button></div><select class="fieldInput fieldGap" id="ai-model-picked" hidden></select><span class="voiceStatus" id="ai-model-status" role="status" aria-live="polite"></span></div>
<div class="fieldRow wide"><label class="fieldLabel" for="ai-api-key">API 密钥</label><div class="keyInputRow"><input class="fieldInput" id="ai-api-key" type="password" autocomplete="new-password" placeholder="留空保留已保存的密钥"><button type="button" class="btn ghost danger" id="ai-key-delete" hidden>删除密钥</button></div><span class="fieldHint" id="ai-key-hint">密钥只写入本机配置，不会回显。</span></div>
<div class="fieldRow"><label class="fieldLabel" for="ai-balance-provider">余额查询服务商</label><select class="fieldInput" id="ai-balance-provider">
<option value="">不查询余额</option>
<option value="deepseek-official">DeepSeek 官方</option>
<option value="opencode-go">opencode Go</option>
<option value="commandcode">commandcode</option>
</select></div>
</div>
<div class="cardFoot"><button type="button" class="btn ghost" id="ai-test-btn">测试连接</button><button type="button" class="btn ghost" id="ai-balance-btn">查询余额</button><span class="voiceStatus" id="ai-result-status" role="status" aria-live="polite"></span></div>
<div class="cardFoot"><button type="button" class="btn primary" id="ai-save">保存模型设置</button><span class="voiceStatus" id="ai-save-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card voiceCard">
<div class="cardHead"><h2 class="cardTitle">语音</h2><button type="button" class="switch" data-switch="voice-enabled" aria-label="语音播报总开关" aria-checked="false"></button></div>
<div class="fields">
<div class="fieldRow"><label class="fieldLabel" for="voice-provider">语音引擎</label><select class="fieldInput" id="voice-provider">
<option value="edge">Edge（免费）</option>
<option value="fish">Fish Audio</option>
<option value="breeze">Breeze Blue（大肥鱼）</option>
</select></div>
<div class="fieldRow"><label class="fieldLabel" for="voice-name">音色</label><select class="fieldInput" id="voice-name"></select></div>
<div class="fieldRow wide keyRow" id="fish-key-row" hidden>
<label class="fieldLabel" for="voice-fish-key">Fish Audio API Key</label>
<div class="keyInputRow"><input class="fieldInput" type="password" id="voice-fish-key" autocomplete="off"><button type="button" class="btn ghost danger" id="voice-fish-clear" disabled>清除</button></div>
<span class="fieldHint">留空会保留已保存的密钥，不会回显；要彻底删除请点「清除」后再保存。</span>
<span class="voiceStatus" id="voice-fish-key-status" role="status"></span>
</div>
<div class="fieldRow wide keyRow" id="breeze-key-row" hidden>
<label class="fieldLabel" for="voice-breeze-key">Breeze Blue API Key（xi-api-key）</label>
<div class="keyInputRow"><input class="fieldInput" type="password" id="voice-breeze-key" autocomplete="off"><button type="button" class="btn ghost danger" id="voice-breeze-clear" disabled>清除</button><button type="button" class="btn ghost" id="voice-breeze-link">获取 API Key</button></div>
<span class="fieldHint">请求头用 xi-api-key；留空会保留已保存的密钥，要彻底删除请点「清除」后再保存。</span>
<span class="voiceStatus" id="voice-breeze-key-status" role="status"></span>
</div>
<div class="fieldRow wide" id="fish-model-row" hidden>
<label class="fieldLabel" for="voice-fish-model">Fish 合成模型</label>
<select class="fieldInput" id="voice-fish-model"></select>
<span class="voiceStatus" id="voice-fish-model-status" role="status"></span>
</div>
<div class="fieldRow wide customVoiceRow" id="fish-custom-row" hidden>
<span class="fieldLabel">自定义 Fish 音色</span>
<div class="customVoiceInputs">
<input class="fieldInput" type="text" id="voice-fish-custom-id" autocomplete="off" placeholder="Fish 音色库里的 Voice ID（字母数字与 _-）">
<input class="fieldInput" type="text" id="voice-fish-custom-label" autocomplete="off" placeholder="永雏塔菲（自定义）">
<button type="button" class="btn ghost" id="voice-fish-custom-add">添加音色</button>
</div>
<span class="fieldHint">输入后点「添加音色」加入音色池，并自动切到它。</span>
<div class="customVoiceList" id="voice-fish-custom-list"></div>
<span class="voiceStatus" id="voice-fish-custom-status" role="status"></span>
</div>
<div class="fieldRow wide customVoiceRow" id="breeze-custom-row" hidden>
<span class="fieldLabel">自定义 Breeze 音色</span>
<div class="customVoiceInputs">
<input class="fieldInput" type="text" id="voice-breeze-custom-id" autocomplete="off" placeholder="Breeze 音色库里的 Voice ID（字母数字与 _-）">
<input class="fieldInput" type="text" id="voice-breeze-custom-label" autocomplete="off" placeholder="大肥鱼（自定义）">
<button type="button" class="btn ghost" id="voice-breeze-custom-add">添加音色</button>
</div>
<span class="fieldHint">输入后点「添加音色」加入音色池，并自动切到它。</span>
<div class="customVoiceList" id="voice-breeze-custom-list"></div>
<span class="voiceStatus" id="voice-breeze-custom-status" role="status"></span>
</div>
<div class="fieldRow"><label class="fieldLabel" for="voice-rate">语速（0.5–2）</label><input class="fieldInput" type="number" id="voice-rate" min="0.5" max="2" step="0.05"></div>
<div class="fieldRow"><label class="fieldLabel" for="voice-volume">音量（0–3，最高 300%）</label><input class="fieldInput" type="number" id="voice-volume" min="0" max="3" step="0.05"></div>
<div class="fieldRow switchPair">
<div class="switchLine"><span>周期碎碎念也念出来</span><button type="button" class="switch" data-switch="voice-whisper" aria-checked="false"></button></div>
<div class="switchLine"><span>待办提醒也念出来</span><button type="button" class="switch" data-switch="voice-todo" aria-checked="false"></button></div>
</div>
<div class="fieldRow wide previewRow"><button type="button" class="btn ghost" id="voice-preview-btn">试听</button><span class="voiceStatus" id="voice-preview-status" role="status" aria-live="polite"></span></div>
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="voice-save">保存语音设置</button><span class="voiceStatus" id="voice-save-status" role="status" aria-live="polite"></span></div>
</div>

<div class="card">
<div class="cardHead"><h2 class="cardTitle">高级</h2></div>
<p class="cardHint">手改配置文件时可以从这里找到位置；「同步」会用内置默认覆盖用户配置。</p>
<div class="pathRows" id="advanced-paths"><span class="empty">正在读取落盘位置…</span></div>
<div class="cardFoot"><button type="button" class="btn primary" id="advanced-sync">用内置默认覆盖用户配置</button><span class="voiceStatus" id="advanced-status" role="status" aria-live="polite"></span></div>
</div>
</section>

<footer class="actions">
<p class="status" id="console-status" role="status" aria-live="polite"></p>
<div class="actionButtons"><button type="button" class="btn primary" id="console-save">保存全部</button><button type="button" class="btn ghost danger" id="console-sync">用内置默认重置</button></div>
</footer>
</main>
<div class="chatMask" id="chat-dialog" hidden>
<div class="chatDialog" role="dialog" aria-modal="true" aria-labelledby="chat-dialog-title">
<div class="chatHead"><h2 class="chatTitle" id="chat-dialog-title">对话</h2><button type="button" class="chatClose" id="chat-close" aria-label="关闭对话窗口"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
<div class="chatBody" id="pet-chat-root"></div>
</div>
</div>
<noscript>需要启用 JavaScript 才能使用控制台。请从桌宠右键菜单打开本页。</noscript>
</body></html>`;
}

/** 控制台页面脚本：各分区读写本机 `/config`，语音分区另接 `/voice/speak` 试听。 */
export const consoleScript = `
(function () {
  var API = ${JSON.stringify(ROUTE_SEGMENT)};
  var BREEZE_KEY_URL = ${JSON.stringify(BREEZE_API_KEY_URL)};
  var TOKEN = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  history.replaceState(null, '', location.pathname);

  // 对话面板是 package 里那份 chat-panel.js，它只按相对路径请求、不带本页凭据；
  // 这里统一给同源 /blue-fish/ 请求补上启动令牌（页面自己的 api() 已经显式带头，不受影响）。
  (function patchChatFetch() {
    if (window.__blueFishChatFetch) return;
    window.__blueFishChatFetch = true;
    var rawFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var href = typeof input === 'string' ? input : (input && input.url ? input.url : '');
        var url = new URL(href, location.href);
        if (!TOKEN || url.origin !== location.origin) return rawFetch.call(window, input, init);
        if (url.pathname !== API && url.pathname.indexOf(API + '/') !== 0) return rawFetch.call(window, input, init);
        var opts = {};
        if (init) {
          for (var key in init) {
            if (Object.prototype.hasOwnProperty.call(init, key)) opts[key] = init[key];
          }
        }
        var headers = new Headers(opts.headers || (input && input.headers) || undefined);
        if (!headers.has('X-Blue-Fish-Token')) headers.set('X-Blue-Fish-Token', TOKEN);
        opts.headers = headers;
        return rawFetch.call(window, input, opts);
      } catch (_) {}
      return rawFetch.call(window, input, init);
    };
  })();

  var THEME_KEY = 'blue_fish_ui_theme';
  function readThemeCookie() {
    try {
      var hit = document.cookie.split(';').map(function (p) { return p.trim(); })
        .filter(function (p) { return p.indexOf(THEME_KEY + '=') === 0; });
      return hit.length ? decodeURIComponent(hit[0].slice(THEME_KEY.length + 1)) : '';
    } catch (_) { return ''; }
  }
  function readTheme() {
    var stored = readThemeCookie();
    if (!stored) { try { stored = localStorage.getItem(THEME_KEY) || ''; } catch (_) {} }
    return stored === 'dark' ? 'dark' : 'light';
  }
  function applyTheme(theme) {
    var next = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', next);
    if (root.style) root.style.colorScheme = next;
    var toggle = byId('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', next === 'dark' ? '切换到亮色' : '切换到暗色');
      toggle.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
    }
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    try { document.cookie = THEME_KEY + '=' + next + '; path=/; max-age=31536000; SameSite=Lax'; } catch (_) {}
  }

  async function saveThemeRemote(theme) {
    try { await api('POST', '/ui-theme', { theme: theme }); } catch (_) {}
  }

  async function syncThemeRemote() {
    try {
      var result = await api('GET', '/ui-theme');
      if (!result) return;
      if (result.saved === false) {
        if (readTheme() === 'dark') void saveThemeRemote('dark');
        return;
      }
      var theme = result.theme === 'dark' || result.theme === 'light' ? result.theme : '';
      if (theme && theme !== readTheme()) applyTheme(theme);
    } catch (_) {}
  }

  function wireTheme() {
    applyTheme(readTheme());
    void syncThemeRemote();
    var toggle = byId('theme-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', function () {
      var next = readTheme() === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      void saveThemeRemote(next);
    });
  }
  wireTheme();

  function byId(id) { return document.getElementById(id); }
  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.dataset.error = kind === 'error' ? 'true' : 'false';
    node.dataset.ok = kind === 'ok' ? 'true' : 'false';
  }
  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }
  function normalizeProvider(value) {
    return value === 'fish' || value === 'breeze' ? value : 'edge';
  }
  /** 路径清单要拼进 innerHTML：用 split/join 转义，避免模板里出现反斜杠转义。 */
  function escapeText(value) {
    return String(value).split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;');
  }
  function clonePets(list) {
    return JSON.parse(JSON.stringify(Array.isArray(list) ? list : []));
  }
  /** 对话弹窗开关：打开时滚到最新一条并把焦点交给输入框；面板没挂上时给出可读的失败说明。 */
  function setChatDialog(open) {
    var dialog = byId('chat-dialog');
    if (!dialog) return;
    if (!open) {
      dialog.setAttribute('hidden', '');
      return;
    }
    dialog.removeAttribute('hidden');
    var host = byId('pet-chat-root');
    var panel = host ? host.querySelector('.pet-chat') : null;
    if (!panel) {
      if (host && !host.querySelector('.chatEmpty')) {
        var note = document.createElement('p');
        note.className = 'chatEmpty';
        note.textContent = '对话面板没有加载出来：控制台脚本缺失时请重新构建（npm run bundle）后再打开本页。';
        host.appendChild(note);
      }
      return;
    }
    var list = panel.querySelector('.pet-chat-list');
    if (list) list.scrollTop = list.scrollHeight;
    var input = panel.querySelector('.pet-chat-input');
    if (input) {
      try { input.focus(); } catch (_) {}
    }
  }
  function tokenHeaders() {
    var headers = {};
    if (TOKEN) headers['X-Blue-Fish-Token'] = TOKEN;
    return headers;
  }

  async function api(method, path, body) {
    var headers = tokenHeaders();
    var opts = { method: method, credentials: 'same-origin', cache: 'no-store', headers: headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var res = await fetch(API + path, opts);
    var data = await res.json().catch(function () { return null; });
    if (!res.ok) {
      if (res.status === 403) throw new Error('打开凭据已失效，请从桌宠菜单重新打开控制台。');
      throw new Error((data && (data.message || data.error)) || '本机接口暂时无法处理请求');
    }
    return data;
  }

  var FALLBACK_PHYSICS = {
    gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1,
    ceilingBounce: true, petCollision: true, hapticEnabled: true, tiltGravity: true, shakeThrow: true
  };
  var FALLBACK_FONT = { family: 'candy', size: 21, followPet: true };
  var MIN_PETS = 1;

  var state = { main: null, pets: [], petIndex: 0, globals: null, draft: null, catalog: null, meta: null, ai: null, savedProvider: 'edge' };
  var previewAudio = null;
  var previewSeq = 0;
  var audioCtx = null;
  var activeSource = null;
  var avatarVersion = Date.now();

  function ensureAudioCtx() {
    if (audioCtx) return audioCtx;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try { audioCtx = new Ctx(); } catch (_) { audioCtx = null; }
    return audioCtx;
  }
  function stopActiveSource() {
    if (!activeSource) return;
    try { activeSource.stop(); } catch (_) {}
    activeSource = null;
  }

  /** 全局草稿：语音段沿用 draft 命名，其余分区共用同一个对象。 */
  function draftFrom(main) {
    var src = main || {};
    var physics = src.physics && typeof src.physics === 'object' ? src.physics : null;
    var font = src.font && typeof src.font === 'object' ? src.font : null;
    return {
      voiceEnabled: src.voiceEnabled === true,
      voiceProvider: normalizeProvider(src.voiceProvider),
      voiceName: typeof src.voiceName === 'string' ? src.voiceName : '',
      voiceVolume: clamp(src.voiceVolume, 0, 3, 1),
      voiceRate: clamp(src.voiceRate, 0.5, 2, 1),
      voiceWhisperEnabled: src.voiceWhisperEnabled !== false,
      voiceTodoEnabled: src.voiceTodoEnabled !== false,
      hasFishApiKey: src.hasFishApiKey === true,
      hasBreezeApiKey: src.hasBreezeApiKey === true,
      fishApiKeyDraft: '',
      breezeApiKeyDraft: '',
      clearFishApiKey: false,
      clearBreezeApiKey: false,
      fishTtsModel: typeof src.fishTtsModel === 'string' && src.fishTtsModel ? src.fishTtsModel : 's2.1-pro-free',
      fishVoices: cloneVoiceList(src.fishVoices),
      breezeVoices: cloneVoiceList(src.breezeVoices),
      fishCustomId: '',
      fishCustomLabel: '',
      breezeCustomId: '',
      breezeCustomLabel: '',
      notificationsEnabled: src.notificationsEnabled !== false,
      clickSoundEnabled: src.clickSoundEnabled !== false,
      clickSoundVolume: clamp(src.clickSoundVolume, 0, 1, 0.5),
      whisperImageEnabled: src.whisperImageEnabled === true,
      chatImageEnabled: src.chatImageEnabled === true,
      chatAnimationEnabled: src.chatAnimationEnabled === true,
      confineToScreen: src.confineToScreen === true,
      trayEnabled: src.trayEnabled !== false,
      obsCaptureEnabled: src.obsCaptureEnabled !== false,
      physics: {
        gravity: clamp(physics && physics.gravity, 0, 10000, FALLBACK_PHYSICS.gravity),
        restitution: clamp(physics && physics.restitution, 0, 1, FALLBACK_PHYSICS.restitution),
        groundFriction: clamp(physics && physics.groundFriction, 0, 30, FALLBACK_PHYSICS.groundFriction),
        throwPower: clamp(physics && physics.throwPower, 0.1, 5, FALLBACK_PHYSICS.throwPower),
        ceilingBounce: !physics || physics.ceilingBounce !== false,
        petCollision: !physics || physics.petCollision !== false,
        hapticEnabled: !physics || physics.hapticEnabled !== false,
        tiltGravity: !physics || physics.tiltGravity !== false,
        shakeThrow: !physics || physics.shakeThrow !== false
      },
      font: {
        family: font && typeof font.family === 'string' && font.family ? font.family : FALLBACK_FONT.family,
        size: clamp(font && font.size, 4, 200, FALLBACK_FONT.size),
        followPet: !font || font.followPet !== false
      }
    };
  }

  function cloneVoiceList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (v) { return v && typeof v.id === 'string' && v.id; })
      .map(function (v) { return { id: v.id, label: typeof v.label === 'string' && v.label ? v.label : v.id }; });
  }

  function currentPet() {
    return state.pets[state.petIndex] || null;
  }
  // 素材根口径与旧设置页一致：/config 的 main.pets 上没有 assetRoot，缺省一律按内置条目 main。
  function petRoot(pet) {
    return pet && typeof pet.assetRoot === 'string' && pet.assetRoot ? pet.assetRoot : 'main';
  }
  function setSwitch(btn, checked) {
    if (!btn) return;
    btn.classList.toggle('on', checked === true);
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
  }
  function getSwitch(btn) { return btn.classList.contains('on'); }
  function setSwitchByKey(key, on) {
    setSwitch(document.querySelector('[data-switch="' + key + '"]'), on === true);
  }

  // ---------- 宠物列表与宠物配置 ----------

  function avatarUrl(root) {
    var parts = ['v=' + avatarVersion];
    if (root) parts.unshift('root=' + encodeURIComponent(root));
    return API + '/logo?' + parts.join('&');
  }

  async function loadAvatar(image, root) {
    if (!image) return;
    try {
      var res = await fetch(avatarUrl(root), { credentials: 'same-origin', cache: 'no-store', headers: tokenHeaders() });
      if (!res.ok) return;
      var blob = await res.blob();
      var previous = image.dataset.blobUrl;
      if (previous) URL.revokeObjectURL(previous);
      var url = URL.createObjectURL(blob);
      image.dataset.blobUrl = url;
      image.src = url;
    } catch (_) {
      // 预览失败留空白，不该挡住其它字段。
    }
  }

  function renderPets() {
    var host = byId('pet-avatars');
    if (!host) return;
    host.textContent = '';
    state.pets.forEach(function (pet, index) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar' + (index === state.petIndex ? ' active' : '');
      btn.setAttribute('data-pet-index', String(index));
      btn.setAttribute('title', (pet.name || pet.id) + '（' + pet.id + '）');
      var img = document.createElement('img');
      img.alt = '';
      btn.appendChild(img);
      var label = document.createElement('span');
      label.className = 'avatarLabel';
      label.textContent = pet.name || pet.id;
      btn.appendChild(label);
      if (index === state.petIndex) {
        var check = document.createElement('span');
        check.className = 'check';
        check.setAttribute('aria-hidden', 'true');
        check.textContent = '✓';
        btn.appendChild(check);
      }
      host.appendChild(btn);
      void loadAvatar(img, petRoot(pet));
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'avatar addAvatar';
    add.setAttribute('data-add-pet', 'true');
    add.setAttribute('title', '添加宠物');
    var plus = document.createElement('span');
    plus.className = 'plus';
    plus.setAttribute('aria-hidden', 'true');
    plus.textContent = '＋';
    add.appendChild(plus);
    host.appendChild(add);
  }

  function renderPetsForm() {
    var pet = currentPet();
    var status = byId('pet-status');
    if (!pet) {
      setStatus(status, '当前没有宠物可编辑。', 'error');
      return;
    }
    if (!pet.position) pet.position = { corner: 'bottom-right', marginX: 40, marginY: 40 };
    byId('pet-name').value = pet.name || '';
    byId('pet-id').value = pet.id || '';
    byId('pet-size').value = String(pet.size);
    byId('pet-size-percent').value = typeof pet.sizePercent === 'number' ? String(pet.sizePercent) : '';
    byId('pet-margin-x').value = String(pet.position.marginX);
    byId('pet-margin-y').value = String(pet.position.marginY);
    setCorner(pet.position.corner);
    setSwitchByKey('pet-balance', pet.balanceEnabled !== false);
    setSwitchByKey('pet-whisper', pet.whisperEnabled !== false);
    setSwitchByKey('pet-work', pet.workStatusEnabled !== false);
    setSwitchByKey('pet-fixed', pet.fixedEnabled === true);
    var area = byId('pet-persona');
    if (area && document.activeElement !== area) {
      area.value = typeof pet.whisperPrompt === 'string' ? pet.whisperPrompt : '';
    }
    // 人设口径对齐旧页：占位符放所属条目的人设全文，旁边给字数与规则说明。
    var entryPrompt = state.main && typeof state.main.whisperPrompt === 'string' ? state.main.whisperPrompt : '';
    if (area) area.placeholder = entryPrompt || '留空则没有系统提示词';
    updatePersonaCount();
    var personaHint = byId('pet-persona-hint');
    if (personaHint) {
      personaHint.textContent = entryPrompt
        ? '留空 = 跟随所属条目的人设，输入框里的灰色文字就是那份内容。'
        : '这个条目还没写人设；留空表示这只宠物没有系统提示词。';
    }
    // 内置条目（main）：上传入口直接不显示，只留包内 logo 预览，与服务端拒绝口径保持一致。
    var root = petRoot(pet);
    var editable = root !== 'main';
    var uploadBtn = byId('pet-avatar-upload');
    if (uploadBtn) uploadBtn.hidden = !editable;
    void loadAvatar(byId('pet-avatar-img'), root);
    setStatus(status, '');
  }

  function updatePersonaCount() {
    var area = byId('pet-persona');
    var count = byId('pet-persona-count');
    if (area && count) count.textContent = area.value.length + ' 字';
  }

  function setCorner(corner) {
    Array.prototype.forEach.call(document.querySelectorAll('#pet-corner-row .corner'), function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-corner') === corner);
    });
  }

  function selectPet(index) {
    if (index < 0 || index >= state.pets.length) return;
    state.petIndex = index;
    renderPets();
    renderPetsForm();
  }

  function addPet() {
    var base = state.pets[0];
    var n = state.pets.length + 1;
    var id = 'pet' + n;
    while (state.pets.some(function (p) { return p.id === id; })) {
      n += 1;
      id = 'pet' + n;
    }
    state.pets.push({
      id: id,
      name: '新宠物',
      size: base && Number.isFinite(Number(base.size)) ? Number(base.size) : 128,
      display: base && typeof base.display === 'string' && base.display ? base.display : 'both',
      balanceEnabled: true,
      whisperEnabled: true,
      workStatusEnabled: true,
      fixedEnabled: false,
      position: { corner: 'bottom-right', marginX: 40, marginY: 40 }
    });
    state.petIndex = state.pets.length - 1;
    renderPets();
    renderPetsForm();
    setStatus(byId('pet-list-status'), '已添加一只新宠物，检查配置后点「保存」写盘。', 'ok');
  }

  async function deletePet() {
    var status = byId('pet-status');
    var pet = currentPet();
    if (!pet) return;
    if (state.pets.length <= MIN_PETS) {
      setStatus(status, '至少要保留一只宠物，不能全部删除。', 'error');
      return;
    }
    var name = pet.name || pet.id;
    if (!window.confirm('删除「' + name + '」？点确定后立即写盘，不能撤销。')) return;
    state.pets.splice(state.petIndex, 1);
    state.petIndex = Math.min(state.petIndex, state.pets.length - 1);
    renderPets();
    renderPetsForm();
    await submitPayload(basePayload(), status, byId('pet-delete'), '已删除「' + name + '」。');
  }

  function petFieldsInvalid() {
    var pet = currentPet();
    if (!pet) return '当前没有可保存的宠物。';
    var size = Number(pet.size);
    if (!Number.isFinite(size) || size <= 0) return '大小必须是大于 0 的数字。';
    var corner = pet.position && pet.position.corner;
    if (['top-left', 'top-right', 'bottom-left', 'bottom-right'].indexOf(String(corner)) < 0) return '停靠角落不合法。';
    if (!Number.isFinite(Number(pet.position.marginX)) || !Number.isFinite(Number(pet.position.marginY))) {
      return '水平 / 垂直偏移必须是数字。';
    }
    if (['web', 'desktop', 'both', 'none'].indexOf(String(pet.display)) < 0) pet.display = 'both';
    if (typeof pet.balanceEnabled !== 'boolean') return '余额功能开关状态丢失了，刷新页面再试。';
    return '';
  }

  // ---------- 全局 / 物理 / 字体 / 对话 ----------

  function renderGlobals() {
    var g = state.globals;
    if (!g) return;
    setSwitchByKey('g-notify', g.notificationsEnabled);
    setSwitchByKey('g-click', g.clickSoundEnabled);
    setSwitchByKey('g-confine', g.confineToScreen);
    setSwitchByKey('g-tray', g.trayEnabled);
    setSwitchByKey('g-obs', g.obsCaptureEnabled);
    setSwitchByKey('g-whisper-image', g.whisperImageEnabled);
    setSwitchByKey('g-chat-image', g.chatImageEnabled);
    setSwitchByKey('g-chat-anim', g.chatAnimationEnabled);
    var vol = byId('g-click-volume');
    if (vol && document.activeElement !== vol) vol.value = String(g.clickSoundVolume);
  }

  function renderPhysics() {
    var g = state.globals;
    if (!g) return;
    var p = g.physics;
    var fields = { 'ph-gravity': p.gravity, 'ph-restitution': p.restitution, 'ph-friction': p.groundFriction, 'ph-power': p.throwPower };
    Object.keys(fields).forEach(function (id) {
      var el = byId(id);
      if (el && document.activeElement !== el) el.value = String(fields[id]);
    });
    setSwitchByKey('ph-ceiling', p.ceilingBounce);
    setSwitchByKey('ph-collide', p.petCollision);
    setSwitchByKey('ph-haptic', p.hapticEnabled);
    setSwitchByKey('ph-tilt', p.tiltGravity);
    setSwitchByKey('ph-shake', p.shakeThrow);
  }

  function renderFont() {
    var g = state.globals;
    if (!g) return;
    var f = byId('font-family');
    if (f) f.value = g.font.family;
    var s = byId('font-size');
    if (s && document.activeElement !== s) s.value = String(g.font.size);
    setSwitchByKey('font-follow', g.font.followPet);
  }

  // ---------- 语音（沿用既有口径） ----------

  function builtinVoiceOptions(provider) {
    var cat = state.catalog;
    if (!cat) return [];
    var list =
      provider === 'fish' ? cat.fishVoices
        : provider === 'breeze' ? cat.breezeVoices
          : (cat.edgeVoices || cat.voices);
    list = Array.isArray(list) ? list : [];
    if (provider !== 'fish' && provider !== 'breeze') return list;
    return list.filter(function (v) { return String((v && v.tag) || '').indexOf('自定义') < 0; });
  }
  function customVoiceListFor(provider) {
    var d = state.draft;
    if (!d) return [];
    var list = provider === 'fish' ? d.fishVoices : provider === 'breeze' ? d.breezeVoices : [];
    return Array.isArray(list) ? list : [];
  }
  function voiceOptionsFor(provider) {
    var customs = customVoiceListFor(provider).map(function (v) {
      return { id: v.id, name: v.label, tag: '自定义' };
    });
    return builtinVoiceOptions(provider).concat(customs);
  }
  function defaultVoiceFor(provider) {
    var opts = builtinVoiceOptions(provider);
    var flagged = opts.filter(function (o) { return o.default === true; });
    if (flagged.length) return flagged[0].id;
    return opts.length ? opts[0].id : '';
  }

  function renderVoice() {
    var d = state.draft;
    if (!d) return;
    var providerSel = byId('voice-provider');
    providerSel.value = d.voiceProvider;
    var nameSel = byId('voice-name');
    nameSel.textContent = '';
    voiceOptionsFor(d.voiceProvider).forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.id;
      o.textContent = opt.name + (opt.tag ? ' · ' + opt.tag : '');
      nameSel.appendChild(o);
    });
    var known = voiceOptionsFor(d.voiceProvider).some(function (o) { return o.id === d.voiceName; });
    if (!known && d.voiceName) {
      var fallback = document.createElement('option');
      fallback.value = d.voiceName;
      fallback.textContent = d.voiceName;
      nameSel.appendChild(fallback);
    }
    nameSel.value = d.voiceName;
    var rateEl = byId('voice-rate');
    if (rateEl && document.activeElement !== rateEl) rateEl.value = String(d.voiceRate);
    var volEl = byId('voice-volume');
    if (volEl && document.activeElement !== volEl) volEl.value = String(d.voiceVolume);
    setSwitchByKey('voice-enabled', d.voiceEnabled);
    setSwitchByKey('voice-whisper', d.voiceWhisperEnabled);
    setSwitchByKey('voice-todo', d.voiceTodoEnabled);
    renderKeyRows();
    renderFishModel();
    renderCustomVoices();
  }

  function renderFishModel() {
    var rowEl = byId('fish-model-row');
    var d = state.draft;
    if (!rowEl || !d) return;
    var show = d.voiceProvider === 'fish';
    rowEl.hidden = !show;
    if (!show) return;
    var sel = byId('voice-fish-model');
    var models = (state.catalog && state.catalog.fishModels) || [];
    sel.textContent = '';
    models.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.label || m.id;
      sel.appendChild(o);
    });
    if (models.length && !models.some(function (m) { return m.id === d.fishTtsModel; })) {
      var fallback = document.createElement('option');
      fallback.value = d.fishTtsModel;
      fallback.textContent = d.fishTtsModel;
      sel.appendChild(fallback);
    }
    sel.value = models.length ? d.fishTtsModel : '';
    setStatus(byId('voice-fish-model-status'), '免费档不消耗额度；付费模型需要 Fish 账户有对应额度。');
  }

  function renderCustomVoices() {
    var d = state.draft;
    if (!d) return;
    ['fish', 'breeze'].forEach(function (provider) {
      var rowEl = byId(provider + '-custom-row');
      if (!rowEl) return;
      var show = d.voiceProvider === provider;
      rowEl.hidden = !show;
      if (!show) return;
      var idInput = byId('voice-' + provider + '-custom-id');
      var labelInput = byId('voice-' + provider + '-custom-label');
      var draftId = provider === 'fish' ? d.fishCustomId : d.breezeCustomId;
      var draftLabel = provider === 'fish' ? d.fishCustomLabel : d.breezeCustomLabel;
      if (idInput && document.activeElement !== idInput) idInput.value = draftId;
      if (labelInput && document.activeElement !== labelInput) labelInput.value = draftLabel;
      renderCustomList(provider);
    });
  }

  function renderCustomList(provider) {
    var listEl = byId('voice-' + provider + '-custom-list');
    var statusEl = byId('voice-' + provider + '-custom-status');
    if (!listEl) return;
    var list = customVoiceListFor(provider);
    listEl.textContent = '';
    list.forEach(function (v) {
      var item = document.createElement('span');
      item.className = 'customVoiceItem';
      var text = document.createElement('span');
      text.textContent = (v.label || v.id) + '（' + v.id + '）';
      var del = document.createElement('button');
      del.type = 'button';
      del.textContent = '删除';
      del.setAttribute('data-voice-id', v.id);
      item.appendChild(text);
      item.appendChild(del);
      listEl.appendChild(item);
    });
    if (!list.length) setStatus(statusEl, '还没有自定义音色；填入 Voice ID 后点「添加音色」。');
    else setStatus(statusEl, '共 ' + list.length + ' 个自定义音色，保存后生效。');
  }

  function addCustomVoice(provider) {
    var d = state.draft;
    if (!d) return;
    var idInput = byId('voice-' + provider + '-custom-id');
    var labelInput = byId('voice-' + provider + '-custom-label');
    var statusEl = byId('voice-' + provider + '-custom-status');
    // 本段是文件的模板字符串内容，任何反斜杠转义都会被吃掉（曾把正则的空白类变成字母 s，误删 ID 里的 s）。
    // 所以这里完全不用正则：先去掉所有空格再 trim。
    var id = (idInput.value || '').split(' ').join('').trim();
    if (!id) { setStatus(statusEl, '请先填 Voice ID。', 'error'); return; }
    if (id.length > 128 || !/^[A-Za-z0-9_-]+$/.test(id)) {
      setStatus(statusEl, 'Voice ID 只能用字母、数字与 _ -，最长 128 字符。', 'error');
      return;
    }
    var builtins = builtinVoiceOptions(provider).map(function (o) { return o.id; });
    if (builtins.indexOf(id) >= 0) { setStatus(statusEl, '该 Voice ID 已是内置音色，不用重复添加。', 'error'); return; }
    var list = customVoiceListFor(provider);
    if (list.some(function (v) { return v.id === id; })) { setStatus(statusEl, '该 Voice ID 已在自定义列表里。', 'error'); return; }
    var label = (labelInput.value || '').trim();
    var next = list.concat([{ id: id, label: label || id }]);
    if (provider === 'fish') {
      d.fishVoices = next;
      d.fishCustomId = '';
      d.fishCustomLabel = '';
    } else {
      d.breezeVoices = next;
      d.breezeCustomId = '';
      d.breezeCustomLabel = '';
    }
    d.voiceName = id;
    renderVoice();
    setStatus(statusEl, '已加入音色池并选中，保存后生效。', 'ok');
  }

  function removeCustomVoice(provider, id) {
    var d = state.draft;
    if (!d) return;
    var next = customVoiceListFor(provider).filter(function (v) { return v.id !== id; });
    if (provider === 'fish') d.fishVoices = next;
    else d.breezeVoices = next;
    if (!voiceOptionsFor(d.voiceProvider).some(function (o) { return o.id === d.voiceName; })) {
      d.voiceName = defaultVoiceFor(d.voiceProvider);
    }
    renderVoice();
  }

  var KEY_ROWS = [
    { kind: 'fish', row: 'fish-key-row', input: 'voice-fish-key', btn: 'voice-fish-clear', status: 'voice-fish-key-status', draft: 'fishApiKeyDraft', clear: 'clearFishApiKey', has: 'hasFishApiKey', placeholder: '在 Fish Audio 控制台获取 Bearer Key' },
    { kind: 'breeze', row: 'breeze-key-row', input: 'voice-breeze-key', btn: 'voice-breeze-clear', status: 'voice-breeze-key-status', draft: 'breezeApiKeyDraft', clear: 'clearBreezeApiKey', has: 'hasBreezeApiKey', placeholder: '在 Breeze Blue 开发者控制台获取（请求头 xi-api-key）' }
  ];

  function renderKeyRows() {
    var d = state.draft;
    if (!d) return;
    KEY_ROWS.forEach(function (r) {
      var rowEl = byId(r.row);
      if (!rowEl) return;
      var show = d.voiceProvider === r.kind;
      rowEl.hidden = !show;
      if (!show) return;
      var input = byId(r.input), btn = byId(r.btn), status = byId(r.status);
      var clear = d[r.clear], has = d[r.has];
      if (document.activeElement !== input) input.value = d[r.draft];
      input.disabled = clear;
      input.placeholder = has ? '已保存密钥，留空保留；填写新 Key 则覆盖' : r.placeholder;
      btn.disabled = !has;
      btn.textContent = clear ? '取消清除' : '清除';
      if (clear) setStatus(status, '保存后将删除磁盘上已保存的密钥。', 'error');
      else if (has) setStatus(status, '已保存密钥，留空保留；点清除可删除。');
      else setStatus(status, '尚未保存 Key；填好后随语音设置一起保存。');
    });
  }

  // ---------- 保存 ----------

  function basePayload() { return { pets: clonePets(state.pets) }; }

  function globalsPayload() {
    var g = state.globals;
    return {
      notificationsEnabled: g.notificationsEnabled,
      clickSoundEnabled: g.clickSoundEnabled,
      clickSoundVolume: g.clickSoundVolume,
      whisperImageEnabled: g.whisperImageEnabled,
      chatImageEnabled: g.chatImageEnabled,
      chatAnimationEnabled: g.chatAnimationEnabled,
      confineToScreen: g.confineToScreen,
      trayEnabled: g.trayEnabled,
      obsCaptureEnabled: g.obsCaptureEnabled
    };
  }

  function physicsPayload() {
    var p = state.globals.physics;
    return {
      gravity: p.gravity,
      restitution: p.restitution,
      groundFriction: p.groundFriction,
      throwPower: p.throwPower,
      ceilingBounce: p.ceilingBounce,
      petCollision: p.petCollision,
      hapticEnabled: p.hapticEnabled,
      tiltGravity: p.tiltGravity,
      shakeThrow: p.shakeThrow
    };
  }

  function fontPayload() {
    var f = state.globals.font;
    return { family: f.family, size: f.size, followPet: f.followPet };
  }

  function voiceFields() {
    var d = state.draft;
    var payload = {
      voiceEnabled: d.voiceEnabled,
      voiceProvider: d.voiceProvider,
      voiceName: d.voiceName,
      voiceVolume: d.voiceVolume,
      voiceRate: d.voiceRate,
      voiceWhisperEnabled: d.voiceWhisperEnabled,
      voiceTodoEnabled: d.voiceTodoEnabled,
      fishTtsModel: d.fishTtsModel,
      fishVoices: d.fishVoices,
      breezeVoices: d.breezeVoices
    };
    var fishKey = d.fishApiKeyDraft.trim();
    var breezeKey = d.breezeApiKeyDraft.trim();
    if (d.clearFishApiKey) payload.clearFishApiKey = true;
    else if (fishKey) payload.fishApiKey = fishKey;
    if (d.clearBreezeApiKey) payload.clearBreezeApiKey = true;
    else if (breezeKey) payload.breezeApiKey = breezeKey;
    return payload;
  }

  function allPayload() {
    return Object.assign(
      basePayload(),
      globalsPayload(),
      { physics: physicsPayload(), font: fontPayload() },
      voiceFields()
    );
  }

  /** 保存成功后只回写这一段，别处没保存的输入（Key 草稿、改了一半的数字）不会被刷掉。 */
  function applyMerged(section, merged) {
    var main = merged && merged.main && typeof merged.main === 'object' ? merged.main : null;
    if (!main) return;
    state.main = main;
    state.pets = clonePets(main.pets);
    if (state.petIndex >= state.pets.length) state.petIndex = Math.max(0, state.pets.length - 1);
    var g = state.globals;
    if (section === 'global' || section === 'all') {
      var fresh = draftFrom(main);
      g.notificationsEnabled = fresh.notificationsEnabled;
      g.clickSoundEnabled = fresh.clickSoundEnabled;
      g.clickSoundVolume = fresh.clickSoundVolume;
      g.whisperImageEnabled = fresh.whisperImageEnabled;
      g.chatImageEnabled = fresh.chatImageEnabled;
      g.chatAnimationEnabled = fresh.chatAnimationEnabled;
      g.confineToScreen = fresh.confineToScreen;
      g.trayEnabled = fresh.trayEnabled;
      g.obsCaptureEnabled = fresh.obsCaptureEnabled;
    }
    if (section === 'physics' || section === 'all') {
      g.physics = draftFrom(main).physics;
    }
    if (section === 'font' || section === 'all') {
      g.font = draftFrom(main).font;
    }
    if (section === 'voice' || section === 'all') {
      var freshV = draftFrom(main);
      g.voiceEnabled = freshV.voiceEnabled;
      g.voiceProvider = freshV.voiceProvider;
      g.voiceName = freshV.voiceName;
      g.voiceVolume = freshV.voiceVolume;
      g.voiceRate = freshV.voiceRate;
      g.voiceWhisperEnabled = freshV.voiceWhisperEnabled;
      g.voiceTodoEnabled = freshV.voiceTodoEnabled;
      g.hasFishApiKey = freshV.hasFishApiKey;
      g.hasBreezeApiKey = freshV.hasBreezeApiKey;
      g.fishApiKeyDraft = '';
      g.breezeApiKeyDraft = '';
      g.clearFishApiKey = false;
      g.clearBreezeApiKey = false;
      g.fishTtsModel = freshV.fishTtsModel;
      g.fishVoices = freshV.fishVoices;
      g.breezeVoices = freshV.breezeVoices;
      state.savedProvider = freshV.voiceProvider;
    }
  }

  async function submitPayload(payload, statusEl, btn, doneText, section) {
    if (btn) btn.disabled = true;
    setStatus(statusEl, '正在保存…');
    try {
      var merged = await api('PUT', '/config', payload);
      if (!merged || merged.ok === false) {
        throw new Error((merged && (merged.message || merged.reason)) || '宿主拒绝了这次保存。');
      }
      applyMerged(section, merged);
      renderPets();
      renderPetsForm();
      renderGlobals();
      renderPhysics();
      renderFont();
      renderVoice();
      setStatus(statusEl, doneText || '已保存到本机。', 'ok');
    } catch (error) {
      setStatus(statusEl, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function savePet() {
    var message = petFieldsInvalid();
    if (message) { setStatus(byId('pet-status'), message, 'error'); return; }
    void submitPayload(basePayload(), byId('pet-status'), byId('pet-save'), '宠物配置已保存。', 'pet');
  }

  function saveGlobal() {
    void submitPayload(Object.assign(basePayload(), globalsPayload()), byId('global-status'), byId('global-save'), '全局开关已保存。', 'global');
  }

  function savePhysics() {
    void submitPayload(Object.assign(basePayload(), { physics: physicsPayload() }), byId('physics-status'), byId('physics-save'), '物理参数已保存。', 'physics');
  }

  function saveFont() {
    void submitPayload(Object.assign(basePayload(), { font: fontPayload() }), byId('font-status'), byId('font-save'), '字体设置已保存。', 'font');
  }

  function saveVoice() {
    if (!state.draft || !state.main) { setStatus(byId('voice-save-status'), '配置尚未读取完成。', 'error'); return; }
    if (!state.draft.voiceName) { setStatus(byId('voice-save-status'), '请先选择音色，再保存。', 'error'); return; }
    void submitPayload(Object.assign(basePayload(), voiceFields()), byId('voice-save-status'), byId('voice-save'), '语音设置已保存。', 'voice');
  }

  function saveAll() {
    var petMessage = petFieldsInvalid();
    if (petMessage) { setStatus(byId('console-status'), petMessage, 'error'); return; }
    if (!state.draft.voiceName) { setStatus(byId('console-status'), '请先选择音色，再保存。', 'error'); return; }
    void submitPayload(allPayload(), byId('console-status'), byId('console-save'), '全部设置已保存。', 'all');
  }

  async function syncDefault(statusId, btnId) {
    var status = byId(statusId || 'console-status');
    if (!window.confirm('用内置默认覆盖用户配置？现有用户配置会被整份替换，不能撤销。')) return;
    var btn = byId(btnId || 'console-sync');
    if (btn) btn.disabled = true;
    setStatus(status, '正在同步…');
    try {
      var merged = await api('POST', '/config');
      if (!merged || merged.ok === false) {
        throw new Error((merged && (merged.message || merged.reason)) || '宿主拒绝了这次同步。');
      }
      var main = merged.main && typeof merged.main === 'object' ? merged.main : null;
      if (main) {
        state.main = main;
        state.pets = clonePets(main.pets);
        state.petIndex = 0;
        state.draft = draftFrom(main);
        state.globals = state.draft;
        state.savedProvider = normalizeProvider(main.voiceProvider);
        renderAll();
      }
      setStatus(status, '已用内置默认覆盖用户配置。', 'ok');
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- 试听 ----------

  async function playSynthBlob(blob, volume, statusEl) {
    var vol = clamp(volume, 0, 3, 1);
    var ctx = ensureAudioCtx();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        var buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
        stopActiveSource();
        var source = ctx.createBufferSource();
        source.buffer = buffer;
        var gain = ctx.createGain();
        gain.gain.value = vol;
        source.connect(gain);
        gain.connect(ctx.destination);
        activeSource = source;
        setStatus(statusEl, '正在播放（音量 ' + Math.round(vol * 100) + '%）…', 'ok');
        await new Promise(function (resolve) {
          source.onended = function () {
            if (activeSource === source) activeSource = null;
            resolve();
          };
          source.start(0);
        });
        return;
      } catch (_) {
        stopActiveSource();
      }
    }
    var objectUrl = URL.createObjectURL(blob);
    var audio = new Audio(objectUrl);
    audio.volume = Math.min(1, Math.max(0, vol));
    setStatus(statusEl, '正在播放（音量 ' + Math.round(Math.min(1, vol) * 100) + '%，受播放器上限截断）…', 'ok');
    await new Promise(function (resolve, reject) {
      audio.onended = function () { URL.revokeObjectURL(objectUrl); resolve(); };
      audio.onerror = function () { URL.revokeObjectURL(objectUrl); reject(new Error('播放失败。')); };
      previewAudio = audio;
      audio.play().catch(reject);
    });
  }

  async function previewVoice() {
    var statusEl = byId('voice-preview-status');
    var btn = byId('voice-preview-btn');
    var d = state.draft;
    if (!d) { setStatus(statusEl, '配置尚未读取完成。', 'error'); return; }
    if (!d.voiceName) { setStatus(statusEl, '请先选择音色。', 'error'); return; }
    if (d.voiceProvider !== state.savedProvider) {
      setStatus(statusEl, '请先保存语音引擎，再试听。', 'error');
      return;
    }
    var draftKey = '';
    if (d.voiceProvider === 'fish') {
      draftKey = d.fishApiKeyDraft.trim();
      if (!d.hasFishApiKey && !draftKey) { setStatus(statusEl, '请先在 Fish Audio API Key 里填 Key，填了就能直接试听。', 'error'); return; }
    } else if (d.voiceProvider === 'breeze') {
      draftKey = d.breezeApiKeyDraft.trim();
      if (!d.hasBreezeApiKey && !draftKey) { setStatus(statusEl, '请先在 Breeze Blue API Key 里填 Key，填了就能直接试听。', 'error'); return; }
    }
    var token = ++previewSeq;
    if (previewAudio) { previewAudio.pause(); previewAudio = null; }
    stopActiveSource();
    ensureAudioCtx();
    btn.disabled = true;
    setStatus(statusEl, '正在合成试听…');
    try {
      var ratePct = Math.round((clamp(d.voiceRate, 0.5, 2, 1) - 1) * 100);
      var rate = (ratePct >= 0 ? '+' : '') + ratePct + '%';
      var headers = tokenHeaders();
      headers['Content-Type'] = 'application/json';
      var res = await fetch(API + '/voice/speak', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: headers,
        body: JSON.stringify({ text: '你好，这是音色试听。', voice: d.voiceName, rate: rate, apiKey: draftKey })
      });
      if (token !== previewSeq) return;
      var ctype = res.headers.get('content-type') || '';
      if (!res.ok || ctype.indexOf('audio') < 0) {
        var data = await res.json().catch(function () { return null; });
        var msg = data && typeof data.message === 'string' ? data.message : '';
        throw new Error(msg && !/voice synthesis failed/i.test(msg) ? msg : '试听合成失败：Key 无效 / 额度不足 / 网络不通都可能，详见插件日志。');
      }
      var blob = await res.blob();
      if (token !== previewSeq) return;
      await playSynthBlob(blob, d.voiceVolume, statusEl);
      if (token === previewSeq) setStatus(statusEl, '试听结束。', 'ok');
    } catch (error) {
      if (token === previewSeq) setStatus(statusEl, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (token === previewSeq) btn.disabled = false;
    }
  }

  async function uploadAvatar(file) {
    var status = byId('pet-status');
    var pet = currentPet();
    if (!pet) return;
    var root = petRoot(pet);
    if (root === 'main') {
      setStatus(status, '内置条目的头像固定用包里的 logo，不能单独替换；要给文件宠物换头像，请在旧 AI 设置页切到它所在的条目。', 'error');
      return;
    }
    setStatus(status, '正在上传头像…');
    try {
      var base64 = await readImageBase64(file);
      var res = await fetch(API + '/pet-avatar?root=' + encodeURIComponent(root), {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: Object.assign(tokenHeaders(), { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ base64: base64 })
      });
      var data = await res.json().catch(function () { return null; });
      if (res.status === 403) throw new Error('打开凭据已失效，请从桌宠菜单重新打开控制台。');
      if (!data) throw new Error('本机接口没有返回结果，请重试。');
      if (data.ok !== true) throw new Error(data.message || '上传失败');
      avatarVersion += 1;
      await loadAvatar(byId('pet-avatar-img'), root);
      renderPets();
      setStatus(status, '头像已更新。', 'ok');
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    }
  }

  function readImageBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var url = String(reader.result || '');
        resolve(url.slice(url.indexOf(',') + 1));
      };
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.readAsDataURL(file);
    });
  }

  // ---------- 渲染与绑定 ----------

  function renderAll() {
    renderPets();
    renderPetsForm();
    renderGlobals();
    renderPhysics();
    renderFont();
    renderAi();
    renderVoice();
    renderAdvanced();
  }

  /** 「高级」板块只读展示落盘位置：读不到时给一句说明，不猜路径。 */
  function renderAdvanced() {
    var host = byId('advanced-paths');
    if (!host) return;
    var meta = state.meta;
    var parts = [];
    if (meta && typeof meta === 'object') {
      [
        ['用户配置', meta.user],
        ['内置默认', meta.default],
        ['动画配置', meta.animations],
        ['表情包', meta.memes],
        ['待办数据', meta.todos],
        ['日志', meta.logs]
      ].forEach(function (pair) {
        if (!pair[1]) return;
        parts.push('<span class="pathKey">' + escapeText(pair[0]) + '</span><span class="pathValue">' + escapeText(String(pair[1])) + '</span>');
      });
      if (Array.isArray(meta.storage)) {
        meta.storage.forEach(function (item) {
          if (!item || !item.path) return;
          parts.push('<span class="pathKey">' + (item.exists === false ? '未生成' : '已存在') + '</span><span class="pathValue">' + escapeText(String(item.path)) + '</span>');
        });
      }
    }
    if (!parts.length) {
      host.innerHTML = '<span class="empty">读不到落盘位置信息。</span>';
      return;
    }
    host.innerHTML = parts.join('');
  }

  // ---------- 模型连接（走独立模式自己的 /standalone-ai/*） ----------

  /** 独立模式的模型设置与插件配置是两份文件，这里固定用它的专用前缀。 */
  async function aiCall(method, path, body) {
    var headers = tokenHeaders();
    var options = { method: method, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    var response = await fetch('/standalone-ai' + path, options);
    var data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) {
      if (response.status === 403) throw new Error('打开凭据已失效，请从桌宠菜单重新打开控制台。');
      if (response.status === 429) throw new Error('保存过于频繁，请稍等一分钟再试。');
      throw new Error('请求未完成，请检查接口地址、模型名称与密钥。');
    }
    return data;
  }

  /** 模型连接表单渲染：密钥永远留空回显，只按 hasKey 决定是否给「删除密钥」。 */
  function renderAi() {
    var ai = state.ai;
    var model = byId('ai-model');
    var protocol = byId('ai-protocol');
    var base = byId('ai-base-url');
    var balance = byId('ai-balance-provider');
    var key = byId('ai-api-key');
    var del = byId('ai-key-delete');
    var hint = byId('ai-key-hint');
    var status = byId('ai-save-status');
    if (!ai) {
      setStatus(status, '读不到模型设置；可以照常填写后保存。');
      if (del) del.hidden = true;
      if (key) key.value = '';
      return;
    }
    if (protocol && document.activeElement !== protocol) protocol.value = ai.protocol === 'anthropic' ? 'anthropic' : 'openai-compatible';
    if (base && document.activeElement !== base) base.value = typeof ai.baseUrl === 'string' ? ai.baseUrl : '';
    if (model && document.activeElement !== model) model.value = typeof ai.model === 'string' ? ai.model : '';
    if (balance && document.activeElement !== balance) balance.value = typeof ai.balanceProvider === 'string' ? ai.balanceProvider : '';
    if (key) key.value = '';
    if (del) del.hidden = ai.hasKey !== true;
    if (hint) {
      hint.textContent = ai.hasKey === true
        ? '已保存密钥并存于本机，不会回显；留空保存会保留，点「删除密钥」才会清掉。'
        : '密钥只写入本机配置，不会回显。';
    }
    setStatus(status, '');
    var result = byId('ai-result-status');
    if (result) setStatus(result, '');
  }

  /** 保存模型连接：只提交这几个字段，apiKey 留空即表示沿用已保存的密钥。 */
  async function saveAi() {
    var status = byId('ai-save-status');
    var btn = byId('ai-save');
    var input = {
      protocol: byId('ai-protocol') ? byId('ai-protocol').value : 'openai-compatible',
      baseUrl: byId('ai-base-url') ? byId('ai-base-url').value.trim() : '',
      model: byId('ai-model') ? byId('ai-model').value.trim() : '',
      balanceProvider: byId('ai-balance-provider') ? byId('ai-balance-provider').value : '',
      apiKey: byId('ai-api-key') ? byId('ai-api-key').value : ''
    };
    if (btn) btn.disabled = true;
    setStatus(status, '正在保存到本机…');
    try {
      state.ai = await aiCall('POST', '/settings', input);
      renderAi();
      var after = byId('ai-model-picked');
      if (after) after.hidden = true;
      setStatus(status, '已保存到本机。');
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function testAi() {
    var status = byId('ai-result-status');
    var btn = byId('ai-test-btn');
    var input = {
      protocol: byId('ai-protocol') ? byId('ai-protocol').value : 'openai-compatible',
      baseUrl: byId('ai-base-url') ? byId('ai-base-url').value.trim() : '',
      model: byId('ai-model') ? byId('ai-model').value.trim() : '',
      apiKey: byId('ai-api-key') ? byId('ai-api-key').value.trim() : ''
    };
    if (btn) btn.disabled = true;
    setStatus(status, '正在测试连接，请稍候…');
    try {
      var data = await aiCall('POST', '/test', input);
      if (data && data.ok) {
        setStatus(status, '连接成功：' + (data.message || '模型已响应') + (data.reply ? '；回复：' + data.reply : ''));
      } else {
        setStatus(status, (data && (data.message || data.error)) || '测试失败', 'error');
      }
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** 余额文案沿用旧页口径：只显示服务商返回的形状，失败说明原因不给假数字。 */
  function describeBalance(data) {
    if (!data || data.ok !== true) {
      if (data && data.reason === 'credential-missing') return '缺少密钥：请先保存所选服务商的 API 密钥。';
      if (data && data.reason === 'unsupported') return '该服务商不提供余额查询。';
      return data && data.message ? '查询失败：' + data.message : '查询失败，请稍后重试。';
    }
    var payload = data.data || {};
    if (data.shape === 'money' && payload.wallets) {
      return payload.wallets.map(function (wallet) { return wallet.currency + ' ' + wallet.total; }).join(' / ');
    }
    if (data.shape === 'points') return payload.total + ' ' + payload.unit;
    if (data.shape === 'windows') return '月度已用 ' + payload.monthly + '%';
    return '已取到余额数据。';
  }

  async function queryBalance() {
    var status = byId('ai-result-status');
    var btn = byId('ai-balance-btn');
    if (btn) btn.disabled = true;
    setStatus(status, '正在查询余额…');
    try {
      setStatus(status, describeBalance(await aiCall('POST', '/balance', undefined)));
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /** 拉取模型清单：用当前填写的地址与密钥试一次，不写盘；拿到后填进下拉，选中即回填模型名。 */
  async function fetchModels() {
    var status = byId('ai-model-status');
    var btn = byId('ai-model-fetch');
    var picked = byId('ai-model-picked');
    var input = {
      protocol: byId('ai-protocol') ? byId('ai-protocol').value : 'openai-compatible',
      baseUrl: byId('ai-base-url') ? byId('ai-base-url').value.trim() : '',
      apiKey: byId('ai-api-key') ? byId('ai-api-key').value.trim() : ''
    };
    if (btn) btn.disabled = true;
    setStatus(status, '正在拉取模型清单…');
    try {
      var data = await aiCall('POST', '/models', input);
      var list = data && Array.isArray(data.models) ? data.models : [];
      if (!list.length) {
        if (picked) picked.hidden = true;
        setStatus(status, (data && data.message) || '服务商没有返回模型清单，直接手填模型名即可。');
        return;
      }
      if (picked) {
        var parts = ['<option value="">从清单里选一个（共 ' + list.length + ' 个）</option>'];
        list.forEach(function (item) {
          var value = typeof item === 'string' ? item : item && item.id ? String(item.id) : '';
          if (!value) return;
          parts.push('<option value="' + escapeText(value) + '">' + escapeText(value) + '</option>');
        });
        picked.innerHTML = parts.join('');
        picked.hidden = false;
      }
      setStatus(status, '已取到 ' + list.length + ' 个模型。');
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deleteAiKey() {
    if (!window.confirm('删除已保存的密钥？删除后桌宠将无法再调用模型，需要重新填写密钥才能恢复。')) return;
    var status = byId('ai-save-status');
    setStatus(status, '正在删除密钥…');
    try {
      state.ai = await aiCall('POST', '/settings', { clearApiKey: true });
      renderAi();
      setStatus(status, '已删除保存的密钥。');
    } catch (error) {
      setStatus(status, error && error.message ? error.message : String(error), 'error');
    }
  }

  async function load() {
    var config = await api('GET', '/config');
    if (!config || config.ok === false || !config.main) throw new Error('读取配置失败：宿主没有返回可用的配置。');
    state.main = config.main;
    state.pets = clonePets(config.main.pets);
    state.petIndex = 0;
    state.draft = draftFrom(config.main);
    state.globals = state.draft;
    state.savedProvider = normalizeProvider(config.main.voiceProvider);
    try { state.catalog = await api('GET', '/voice/voices'); } catch (_) { state.catalog = null; }
    try { state.meta = await api('GET', '/config/meta'); } catch (_) { state.meta = null; }
    try { state.ai = await aiCall('GET', '/settings'); } catch (_) { state.ai = null; }
    renderAll();
  }

  var SWITCH_FIELD = {
    'voice-enabled': 'voiceEnabled',
    'voice-whisper': 'voiceWhisperEnabled',
    'voice-todo': 'voiceTodoEnabled',
    'g-notify': 'notificationsEnabled',
    'g-click': 'clickSoundEnabled',
    'g-confine': 'confineToScreen',
    'g-tray': 'trayEnabled',
    'g-obs': 'obsCaptureEnabled',
    'g-whisper-image': 'whisperImageEnabled',
    'g-chat-image': 'chatImageEnabled',
    'g-chat-anim': 'chatAnimationEnabled'
  };
  var SWITCH_PHYSICS = {
    'ph-ceiling': 'ceilingBounce',
    'ph-collide': 'petCollision',
    'ph-haptic': 'hapticEnabled',
    'ph-tilt': 'tiltGravity',
    'ph-shake': 'shakeThrow'
  };
  var SWITCH_FONT = { 'font-follow': 'followPet' };
  var SWITCH_PET = {
    'pet-balance': 'balanceEnabled',
    'pet-whisper': 'whisperEnabled',
    'pet-work': 'workStatusEnabled',
    'pet-fixed': 'fixedEnabled'
  };

  function bind() {
    // 宠物列表：切换与添加
    var avatars = byId('pet-avatars');
    if (avatars) avatars.addEventListener('click', function (event) {
      var node = event.target && event.target.closest ? event.target.closest('[data-pet-index],[data-add-pet]') : null;
      if (!node) return;
      if (node.getAttribute('data-add-pet')) { addPet(); return; }
      selectPet(Number(node.getAttribute('data-pet-index')));
    });

    // 宠物表单
    var petField = {
      'pet-name': function (pet, value) { pet.name = value; },
      'pet-size': function (pet, value) { pet.size = Number(value); },
      'pet-size-percent': function (pet, value) {
        if (value.trim() === '') delete pet.sizePercent;
        else pet.sizePercent = Number(value);
      },
      'pet-margin-x': function (pet, value) { pet.position.marginX = Number(value); },
      'pet-margin-y': function (pet, value) { pet.position.marginY = Number(value); },
      'pet-persona': function (pet, value) {
        var text = value.trim();
        if (text) pet.whisperPrompt = value;
        else delete pet.whisperPrompt;
      }
    };
    Object.keys(petField).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener('input', function () {
        var pet = currentPet();
        if (!pet) return;
        if (!pet.position) pet.position = { corner: 'bottom-right', marginX: 40, marginY: 40 };
        petField[id](pet, el.value);
        if (id === 'pet-persona') updatePersonaCount();
      });
    });
    var cornerRow = byId('pet-corner-row');
    if (cornerRow) cornerRow.addEventListener('click', function (event) {
      var node = event.target && event.target.closest ? event.target.closest('[data-corner]') : null;
      if (!node) return;
      var pet = currentPet();
      if (!pet) return;
      if (!pet.position) pet.position = { corner: 'bottom-right', marginX: 40, marginY: 40 };
      pet.position.corner = node.getAttribute('data-corner');
      setCorner(pet.position.corner);
    });

    // 全局数字
    var numField = {
      'g-click-volume': function (value) { state.globals.clickSoundVolume = clamp(value, 0, 1, 0.5); },
      'ph-gravity': function (value) { state.globals.physics.gravity = clamp(value, 0, 10000, 1400); },
      'ph-restitution': function (value) { state.globals.physics.restitution = clamp(value, 0, 1, 0.78); },
      'ph-friction': function (value) { state.globals.physics.groundFriction = clamp(value, 0, 30, 2.5); },
      'ph-power': function (value) { state.globals.physics.throwPower = clamp(value, 0.1, 5, 1); },
      'font-size': function (value) { state.globals.font.size = clamp(value, 4, 200, 21); }
    };
    Object.keys(numField).forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener('input', function () { if (state.globals) numField[id](el.value); });
    });
    var familyEl = byId('font-family');
    if (familyEl) familyEl.addEventListener('change', function () {
      if (state.globals) state.globals.font.family = familyEl.value;
    });

    // 开关：语音 / 全局 / 物理 / 字体 / 宠物
    Array.prototype.forEach.call(document.querySelectorAll('[data-switch]'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-switch');
        var next = !getSwitch(btn);
        setSwitch(btn, next);
        if (!state.globals) return;
        if (SWITCH_PET[key]) {
          var pet = currentPet();
          if (pet) pet[SWITCH_PET[key]] = next;
          return;
        }
        if (SWITCH_PHYSICS[key]) {
          state.globals.physics[SWITCH_PHYSICS[key]] = next;
          return;
        }
        if (SWITCH_FONT[key]) {
          state.globals.font[SWITCH_FONT[key]] = next;
          return;
        }
        if (SWITCH_FIELD[key]) state.globals[SWITCH_FIELD[key]] = next;
      });
    });

    // 语音卡控件
    byId('voice-provider').addEventListener('change', function () {
      if (!state.draft) return;
      var next = normalizeProvider(this.value);
      state.draft.voiceProvider = next;
      var opts = voiceOptionsFor(next);
      if (!opts.some(function (o) { return o.id === state.draft.voiceName; })) {
        state.draft.voiceName = defaultVoiceFor(next);
      }
      renderVoice();
    });
    byId('voice-name').addEventListener('change', function () {
      if (state.draft) state.draft.voiceName = this.value;
    });
    var modelSel = byId('voice-fish-model');
    if (modelSel) modelSel.addEventListener('change', function () {
      if (state.draft) state.draft.fishTtsModel = this.value;
    });
    ['fish', 'breeze'].forEach(function (provider) {
      var idInput = byId('voice-' + provider + '-custom-id');
      var labelInput = byId('voice-' + provider + '-custom-label');
      var addBtn = byId('voice-' + provider + '-custom-add');
      var listEl = byId('voice-' + provider + '-custom-list');
      if (idInput) idInput.addEventListener('input', function () {
        if (!state.draft) return;
        if (provider === 'fish') state.draft.fishCustomId = idInput.value;
        else state.draft.breezeCustomId = idInput.value;
      });
      if (labelInput) labelInput.addEventListener('input', function () {
        if (!state.draft) return;
        if (provider === 'fish') state.draft.fishCustomLabel = labelInput.value;
        else state.draft.breezeCustomLabel = labelInput.value;
      });
      if (addBtn) addBtn.addEventListener('click', function () { addCustomVoice(provider); });
      if (listEl) listEl.addEventListener('click', function (event) {
        var target = event.target;
        var voiceId = target && target.getAttribute ? target.getAttribute('data-voice-id') : null;
        if (voiceId) removeCustomVoice(provider, voiceId);
      });
    });
    byId('voice-rate').addEventListener('input', function () {
      if (state.draft) state.draft.voiceRate = clamp(this.value, 0.5, 2, 1);
    });
    byId('voice-volume').addEventListener('input', function () {
      if (state.draft) state.draft.voiceVolume = clamp(this.value, 0, 3, 1);
    });
    KEY_ROWS.forEach(function (r) {
      var input = byId(r.input), btn = byId(r.btn);
      if (input) input.addEventListener('input', function () {
        if (!state.draft) return;
        state.draft[r.draft] = input.value;
        if (input.value.trim() !== '') state.draft[r.clear] = false;
        renderKeyRows();
      });
      if (btn) btn.addEventListener('click', function () {
        if (!state.draft) return;
        state.draft[r.clear] = !state.draft[r.clear];
        if (state.draft[r.clear]) state.draft[r.draft] = '';
        renderKeyRows();
      });
    });
    // Breeze 控制台跳转：与旧页「获取 API Key」同一地址
    var breezeLink = byId('voice-breeze-link');
    if (breezeLink) breezeLink.addEventListener('click', function () {
      window.open(BREEZE_KEY_URL, '_blank', 'noopener,noreferrer');
    });

    // 头像
    var uploadBtn = byId('pet-avatar-upload');
    var fileInput = byId('pet-avatar-file');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function () {
        var pet = currentPet();
        var root = petRoot(pet);
        if (root === 'main') {
          setStatus(byId('pet-status'), '内置条目的头像固定用包里的 logo，不能单独替换；要给文件宠物换头像，请在旧 AI 设置页切到它所在的条目。', 'error');
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file) void uploadAvatar(file);
      });
    }

    // 头像下的对话入口：弹窗就是对话窗口本身（面板已随 chat-panel.js 挂在 #pet-chat-root）
    var chatOpen = byId('chat-open');
    var chatDialog = byId('chat-dialog');
    var chatClose = byId('chat-close');
    if (chatOpen && chatDialog) {
      chatOpen.addEventListener('click', function () { setChatDialog(true); });
      if (chatClose) chatClose.addEventListener('click', function () { setChatDialog(false); });
      chatDialog.addEventListener('click', function (event) {
        if (event.target === chatDialog) setChatDialog(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && !chatDialog.hasAttribute('hidden')) setChatDialog(false);
      });
    }

    // 保存与重置
    byId('pet-save').addEventListener('click', savePet);
    byId('pet-delete').addEventListener('click', function () { void deletePet(); });
    byId('global-save').addEventListener('click', saveGlobal);
    byId('physics-save').addEventListener('click', savePhysics);
    byId('font-save').addEventListener('click', saveFont);
    byId('ai-save').addEventListener('click', function () { void saveAi(); });
    byId('ai-test-btn').addEventListener('click', function () { void testAi(); });
    byId('ai-balance-btn').addEventListener('click', function () { void queryBalance(); });
    byId('ai-model-fetch').addEventListener('click', function () { void fetchModels(); });
    byId('ai-key-delete').addEventListener('click', function () { void deleteAiKey(); });
    byId('ai-model-picked').addEventListener('change', function () {
      var value = byId('ai-model-picked').value;
      if (value) byId('ai-model').value = value;
    });
    byId('voice-save').addEventListener('click', saveVoice);
    byId('voice-preview-btn').addEventListener('click', function () { void previewVoice(); });
    byId('console-save').addEventListener('click', saveAll);
    byId('console-sync').addEventListener('click', function () { void syncDefault(); });
    byId('advanced-sync').addEventListener('click', function () { void syncDefault('advanced-status', 'advanced-sync'); });
  }

  bind();
  load().catch(function (error) {
    var statusLine = byId('console-status');
    if (statusLine) statusLine.textContent = error && error.message ? error.message : String(error);
  });
})();
`;

/** 控制台页面样式：卡片流布局，色值沿用旧设置页的浅/深令牌。 */
export const consoleStyle = `:root{
  color-scheme:light;
  --bg-base:#eef3fb;--bg-card:#ffffff;--label-primary:#1c1c1e;--label-secondary:#3a3a3c;--label-tertiary:#8e8e93;
  --border:rgba(60,60,67,.10);--primary:#007aff;--primary-hover:#0062cc;--danger:#ff3b30;
  --radius:16px;--shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.06);
  --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue","Segoe UI","Microsoft YaHei",sans-serif;
}
html[data-theme=dark]{
  color-scheme:dark;
  --bg-base:#0f1420;--bg-card:#1c1c1e;--label-primary:#f5f5f7;--label-secondary:#ebebf5;--label-tertiary:#98989d;
  --border:rgba(84,84,88,.36);--primary:#0a84ff;--primary-hover:#409cff;--danger:#ff453a;
  --shadow:0 1px 2px rgba(0,0,0,.35),0 8px 28px rgba(0,0,0,.45);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{height:100%}
body{margin:0;background:var(--bg-base);color:var(--label-primary);font:15px/1.5 var(--font);-webkit-font-smoothing:antialiased}
.console{max-width:1080px;margin:0 auto;padding:28px 28px 40px;display:flex;flex-direction:column;gap:18px}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{display:flex;align-items:center;gap:14px}
.brandLogo{width:48px;height:48px;border-radius:14px;object-fit:cover;background:var(--bg-card);box-shadow:var(--shadow)}
.title{margin:0;font-size:24px;font-weight:700;letter-spacing:-.01em}
.subtitle{margin:2px 0 0;color:var(--label-tertiary);font-size:14px}
.slogan{display:flex;align-items:center;gap:10px;color:var(--label-secondary)}
.sloganBadge{display:inline-flex;width:40px;height:40px;border-radius:50%;background:var(--bg-card);color:var(--primary);align-items:center;justify-content:center;box-shadow:var(--shadow)}
.themeToggle{cursor:pointer;border:0;padding:0;font:inherit;transition:transform .12s ease,border-color .12s ease}
.themeToggle:hover{transform:scale(1.06)}
.themeToggle:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.themeToggle .iconSun,.themeToggle .iconMoon{display:flex;align-items:center;justify-content:center}
html[data-theme=dark] .themeToggle .iconSun{display:none}
html[data-theme=light] .themeToggle .iconMoon{display:none}
.sloganText{font-size:15px;font-weight:600;line-height:1.35}
.card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:20px 22px;margin-bottom:18px;break-inside:avoid;overflow:hidden}
.cardHead{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.cardTitle{margin:0;font-size:17px;font-weight:650}
.cardActions{display:flex;gap:8px;margin-left:auto}
.kind{font-size:16px;font-weight:650}
.chip{background:rgba(0,122,255,.12);color:var(--primary);border-radius:8px;padding:2px 10px;font-size:13px;font-weight:600}
.petListTitle{margin-left:auto;color:var(--label-secondary)}
.avatars{display:flex;gap:14px;flex-wrap:wrap}
.avatar{position:relative;width:76px;padding:8px 6px;border-radius:18px;border:1.5px dashed var(--border);background:transparent;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;font:inherit}
.avatar img{width:52px;height:52px;border-radius:14px;object-fit:cover}
.avatarLabel{max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--label-tertiary)}
.avatar.active{border-style:solid;border-color:var(--primary)}
.avatar.active .avatarLabel{color:var(--primary)}
.avatar .plus{font-size:26px;color:var(--primary);height:52px;display:flex;align-items:center}
.addAvatar{justify-content:center;border-style:dashed}
.avatar .check{position:absolute;right:-4px;top:-4px;width:20px;height:20px;border-radius:50%;background:var(--primary);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
/* 瀑布流：两列各自向下堆叠，一张卡变高不会把对面那张拉齐。宠物卡用 column-span 通栏。 */
.grid{display:block;column-count:2;column-gap:18px}
@media (max-width:880px){.grid{column-count:1}}
.petConfig{column-span:all}
.petConfigBody{display:grid;grid-template-columns:240px 1fr;gap:22px}
@media (max-width:880px){.petConfigBody{grid-template-columns:1fr}}
.avatarBox{position:relative;min-height:180px;border-radius:18px;background:var(--bg-base);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;padding:14px;text-align:center}
.avatarBox img{width:140px;height:140px;max-width:100%;object-fit:contain;border-radius:16px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
.fieldRow{display:flex;flex-direction:column;gap:6px;min-width:0}
.fieldRow.wide{grid-column:1/-1}
.fieldGap{margin-top:14px}
.switchGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:880px){.fields{grid-template-columns:1fr}.fieldRow.wide,.switchPair{grid-column:auto}}
.fieldLabel{font-size:13px;color:var(--label-secondary)}
.fieldHint{grid-column:1/-1;margin:10px 0 0;font-size:12px;line-height:1.5;color:var(--label-tertiary)}
.fieldInput{width:100%;height:34px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-base);color:var(--label-primary);font:inherit}
select.fieldInput{cursor:pointer}
.fieldInput.area{height:auto;min-height:72px;padding:10px 12px;resize:vertical}
.fieldInput:disabled{opacity:.75}
.cornerRow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.corner{height:32px;padding:0 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);color:var(--label-secondary);font:inherit;cursor:pointer}
.corner.active{background:var(--primary);border-color:var(--primary);color:#fff}
.switchPair{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.switchLine{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:14px;color:var(--label-secondary)}
.switchText{display:flex;flex-direction:column;gap:3px;min-width:0}
.switchHint{font-size:12px;line-height:1.45;color:var(--label-tertiary)}
.cardHint{margin:-6px 0 14px;font-size:13px;line-height:1.55;color:var(--label-tertiary)}
.personaFoot{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.personaCount{flex:none;font-size:12px;color:var(--label-tertiary)}
.personaFoot .fieldHint{margin:0}
.switch{margin-top:2px}
.pathRows{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;font-size:13px;color:var(--label-secondary)}
.pathKey{color:var(--label-tertiary);white-space:nowrap}
.pathValue{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--label-secondary);word-break:break-all}
.empty{font-size:13px;color:var(--label-tertiary);grid-column:1/-1}
.switch{position:relative;width:42px;height:24px;border-radius:99px;background:var(--border);flex:none;border:none;padding:0;font:inherit}
button.switch{cursor:pointer}
.switch.on{background:var(--primary)}
.switch:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s}
.switch.on:after{transform:translateX(18px)}
.cardFoot{display:flex;align-items:center;gap:12px;margin-top:16px;flex-wrap:wrap}
.previewRow{flex-direction:row;align-items:center;gap:12px}
.keyInputRow{display:flex;gap:10px;align-items:center}
.keyInputRow .fieldInput{flex:1}
.keyInputRow .btn{height:34px;padding:0 14px;flex:none}
.keyRow .voiceStatus{min-height:18px}
.customVoiceInputs{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.customVoiceInputs .fieldInput{flex:1;min-width:150px}
.customVoiceInputs .btn{height:34px;padding:0 14px;flex:none}
.customVoiceList{display:flex;flex-wrap:wrap;gap:8px;margin-top:2px}
.customVoiceItem{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-base);font-size:13px;color:var(--label-secondary)}
.customVoiceItem button{border:none;background:transparent;color:var(--danger);font:inherit;font-size:13px;cursor:pointer;padding:0}
.voiceStatus{font-size:13px;color:var(--label-tertiary);min-height:20px}
.voiceStatus[data-ok="true"]{color:var(--primary)}
.voiceStatus[data-error="true"]{color:var(--danger)}
.actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.status{margin:0;color:var(--label-tertiary);font-size:13px;min-height:20px;flex:1}
.actionButtons{display:flex;gap:12px}
.btn{height:38px;padding:0 20px;border-radius:12px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid transparent}
.btn.primary{background:var(--primary);color:#fff}
.btn.primary:hover{background:var(--primary-hover)}
.btn.ghost{background:var(--bg-card);border-color:var(--border);color:var(--label-secondary)}
.btn.ghost.danger{color:var(--danger)}
.btn:disabled{opacity:.55;cursor:default}
/* 头像下的对话入口：圆形图标按钮 */
.chatEntry{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:1px solid var(--border);background:var(--bg-card);color:var(--primary);cursor:pointer;padding:0;transition:background .15s ease,color .15s ease}
.chatEntry:hover{background:rgba(0,122,255,.10)}
.chatEntry:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
html[data-theme=dark] .chatEntry:hover{background:rgba(10,132,255,.20)}
/* 对话弹窗：卡片风遮罩 + 面板；面板高度由 .chatBody 给，.pet-chat 自己铺满 */
.chatMask{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(17,20,26,.42)}
.chatDialog{width:min(880px,100%);height:min(90vh,900px);display:flex;flex-direction:column;overflow:hidden;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,.24);
--dsw-alias-label-primary:var(--label-primary);--dsw-alias-label-secondary:var(--label-secondary);--dsw-alias-label-tertiary:var(--label-tertiary);--dsw-alias-label-caption:var(--label-tertiary);--dsw-alias-label-primary-foreground:#ffffff;
--dsw-alias-border-l2:var(--border);--dsw-alias-border-l3:color-mix(in srgb,var(--label-primary) 22%,transparent);
--dsw-alias-interactive-bg-hover:color-mix(in srgb,var(--label-primary) 8%,transparent);--dsw-alias-interactive-bg-active:color-mix(in srgb,var(--label-primary) 14%,transparent);--dsw-alias-interactive-bg-hover-danger:color-mix(in srgb,var(--danger) 12%,transparent);
--dsw-alias-bg-module-platform:color-mix(in srgb,var(--label-primary) 6%,var(--bg-card));--dsw-alias-bg-multi-select:color-mix(in srgb,var(--primary) 12%,transparent);
--dsw-alias-state-error-primary:var(--danger);--dsw-alias-state-error-secondary:color-mix(in srgb,var(--danger) 78%,#000000);--dsw-alias-state-business-primary:var(--primary);
--dsw-specific-bubble:color-mix(in srgb,var(--primary) 14%,var(--bg-card));--dsw-specific-input-major:color-mix(in srgb,var(--label-primary) 4%,var(--bg-card));
--dsw-alias-button-info-fill:var(--primary);--dsw-alias-button-info-hover:var(--primary-hover);--dsw-alias-tooltip-bg:rgba(28,28,30,.94);--dsw-static-neutral-00:#ffffff;
--dsw-radius-xs:6px;--dsw-radius-sm:8px;--dsw-radius-md:10px;--dsw-radius-xl:14px;
--dsw-font-s-14:14px/1.55 var(--font);--dsw-font-xxs-12:12px/1.5 var(--font);--dsw-font-xxxs-11:11px/1.5 var(--font);
--ds-transition-duration-fast:.13s;--ds-ease-in-out:cubic-bezier(.4,0,.2,1)}
.chatHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border);flex:none}
.chatTitle{margin:0;font-size:16px;font-weight:650}
.chatClose{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--label-secondary);cursor:pointer;padding:0}
.chatClose:hover{color:var(--primary);border-color:var(--primary)}
.chatBody{flex:1 1 auto;min-height:0;display:flex}
.chatBody>div{flex:1 1 auto;min-height:0}
.chatEmpty{margin:auto;padding:18px;font-size:13px;line-height:1.6;color:var(--label-tertiary);text-align:center}
/* 窄屏（含控制台自己的单列断点）：弹窗吃满遮罩内可用的宽高，避免小屏还要滚动 */
@media (max-width:880px){.chatMask{padding:12px}.chatDialog{width:100%;height:100%;border-radius:16px}}
${PANEL_CSS}
`;
