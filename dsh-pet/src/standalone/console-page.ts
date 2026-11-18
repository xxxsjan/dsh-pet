/**
 * 「桌宠控制台」独立页面：HTML 外壳、脚本与样式三件套。
 *
 * 与旧 `/standalone-ai/` 设置页完全并行：旧入口、旧路由、旧窗口链路一行不动。
 * 本页面走新的 `/standalone-console/` 路由，由右键菜单「桌宠控制台」在应用内窗口打开。
 *
 * 安全口径与旧设置页一致：只在本机回环提供；页面不内联脚本与样式（CSP default-src 'none'），
 * 脚本/样式均为同源外挂；图标复用旧设置页的公开资源路径 `/standalone-ai/icon.png`。
 *
 * 分区全部接入本机 `/config` 读写：宠物列表与宠物配置、全局开关、语音播报、物理、
 * 外观与字体，各自独立保存；模型走独立的 AI 设置接口；底部「重置」走 POST /config。
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

<section class="desktop">
<div class="petDesk">
<div class="deskSectionHead"><span class="petListTitle">我的宠物</span></div>
<div class="avatars" id="pet-avatars"></div>
<span class="voiceStatus" id="pet-list-status" role="status" aria-live="polite"></span>
</div>
<div class="settingsGrid" role="group" aria-label="设置入口">
<button type="button" class="deskEntry" data-panel="pet-panel" title="宠物配置"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5" cy="6" r="1.6"/><circle cx="11" cy="6" r="1.6"/><circle cx="3.6" cy="9.6" r="1.6"/><circle cx="12.4" cy="9.6" r="1.6"/><path d="M8 8.6c-1.9 0-3.2 1.4-3.2 2.7 0 .9.7 1.5 1.6 1.5 1 0 1.1-.4 1.6-.4s.6.4 1.6.4c.9 0 1.6-.6 1.6-1.5C11.2 10 9.9 8.6 8 8.6Z"/></svg></span><span class="deskEntryLabel">宠物</span></button>
<button type="button" class="deskEntry" data-panel="global-panel" title="全局开关"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 2v1.6M8 12.4V14M2 8h1.6M12.4 8H14M3.7 3.7l1.1 1.1M11.2 11.2l1.1 1.1M12.3 3.7l-1.1 1.1M4.8 11.2l-1.1 1.1"/></svg></span><span class="deskEntryLabel">全局</span></button>
<button type="button" class="deskEntry" data-panel="physics-panel" title="物理"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3.5c2.6 1.6 7.4 1.6 10 0M3 8c2.6 1.6 7.4 1.6 10 0M3 12.5c2.6 1.6 7.4 1.6 10 0"/></svg></span><span class="deskEntryLabel">物理</span></button>
<button type="button" class="deskEntry" data-panel="font-panel" title="字体"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true"><path d="M2.5 12.5 5 4.5h2l2.5 8M3.6 9.6h4.8M9.5 12.5 12 4.5h1.5"/></svg></span><span class="deskEntryLabel">字体</span></button>
<button type="button" class="deskEntry" data-panel="voice-panel" title="语音"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="4" height="7.5" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5"/></svg></span><span class="deskEntryLabel">语音</span></button>
<button type="button" class="deskEntry" data-panel="ai-panel" title="模型"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="2"/><path d="M8 6.2v3.6M6.2 8h3.6M3.5 6H2m12 0h-1.5M3.5 10H2m12 0h-1.5M6 3.5V2m4 1.5V2M6 12.5V14m4-1.5V14"/></svg></span><span class="deskEntryLabel">模型</span></button>
<button type="button" class="deskEntry" data-panel="advanced-panel" title="高级"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 2.5h3l.7 2.4 2.2 1.2 2.3-.6 1.5 2.6-1.7 1.8 0 2.4 1.7 1.8-1.5 2.6-2.3-.6-2.2 1.2-.7 2.4h-3l-.7-2.4-2.2-1.2-2.3.6-1.5-2.6 1.7-1.8 0-2.4-1.7-1.8 1.5-2.6 2.3.6 2.2-1.2L6.5 2.5Z"/><circle cx="8" cy="8" r="1.8"/></svg></span><span class="deskEntryLabel">高级</span></button>
<button type="button" class="deskEntry dangerEntry" id="console-sync" title="用内置默认恢复出厂配置"><span class="deskEntryIcon"><svg viewBox="0 0 16 16" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3a5 5 0 1 1-4.3 2.5"/><path d="M3 3v3h3"/></svg></span><span class="deskEntryLabel">恢复默认</span></button>
</div>
</section>

<div class="panelMask" id="pet-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="pet-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="pet-panel-title">宠物</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭宠物配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
<p class="cardHint">这里编辑的是默认条目的实例；改动在点保存后写盘。</p>
<div class="petConfigBody">
<div class="avatarBox">
<img id="pet-avatar-img" alt="">
<button type="button" class="btn ghost" id="pet-avatar-upload" hidden>上传头像</button>
<input type="file" id="pet-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
</div>
<div class="fields petFields">
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
<div class="fieldRow"><div class="switchLine"><span>余额功能</span><button type="button" class="switch" data-switch="pet-balance" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>碎碎念</span><button type="button" class="switch" data-switch="pet-whisper" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>工作状态联动</span><button type="button" class="switch" data-switch="pet-work" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>固定不动</span><button type="button" class="switch" data-switch="pet-fixed" aria-checked="false"></button></div></div>
</div>
</div>
<div class="personaBlock">
<div class="fieldRow wide">
<label class="fieldLabel" for="pet-persona">这只的人设（可选）</label>
<textarea class="fieldInput area" id="pet-persona" rows="3" maxlength="4000"></textarea>
<div class="personaFoot"><span class="fieldHint" id="pet-persona-hint"></span><span class="personaCount" id="pet-persona-count">0 字</span></div>
<span class="fieldHint">发给模型的 system = 这段 + 自动追加的名字与时间背景，别在这里重复写。</span>
</div>
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="pet-save">保存</button><button type="button" class="btn ghost danger" id="pet-delete">删除</button><span class="voiceStatus" id="pet-status" role="status" aria-live="polite"></span></div>
</div>
</div>
</div>
</div>

<div class="panelMask" id="global-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="global-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="global-panel-title">全局开关</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭全局配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
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
</div>
</div>
</div>

<div class="panelMask" id="font-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="font-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="font-panel-title">字体</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭字体配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
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
</div>
</div>
</div>

<div class="panelMask" id="physics-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="physics-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="physics-panel-title">物理</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭物理配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
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
</div>
<div class="cardFoot"><button type="button" class="btn primary" id="physics-save">保存</button><span class="voiceStatus" id="physics-status" role="status" aria-live="polite"></span></div>
</div>
</div>
</div>
</div>

<div class="panelMask" id="ai-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="ai-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="ai-panel-title">模型</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭模型配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
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
</div>
</div>
</div>

<div class="panelMask" id="voice-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="voice-panel-title">
<div class="panelBody">
<div class="card voiceCard">
<div class="cardHead"><h2 class="cardTitle" id="voice-panel-title">语音</h2><button type="button" class="switch" data-switch="voice-enabled" aria-label="语音播报总开关" aria-checked="false"></button><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭语音配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
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
</div>
</div>
</div>

<div class="panelMask" id="advanced-panel" hidden>
<div class="panelDialog" role="dialog" aria-modal="true" aria-labelledby="advanced-panel-title">
<div class="panelBody">
<div class="card">
<div class="cardHead"><h2 class="cardTitle" id="advanced-panel-title">高级</h2><div class="cardActions"><button type="button" class="panelClose" data-panel-close aria-label="关闭高级配置"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
<p class="cardHint">手改配置文件时可以从这里找到位置；「同步」会用内置默认覆盖用户配置。</p>
<div class="pathRows" id="advanced-paths"><span class="empty">正在读取落盘位置…</span></div>
<div class="cardFoot"><button type="button" class="btn primary" id="advanced-sync">用内置默认覆盖用户配置</button><span class="voiceStatus" id="advanced-status" role="status" aria-live="polite"></span></div>
</div>
</div>
</div>
</div>
</main>
<nav class="dockBar" aria-label="功能入口"><button type="button" class="chatEntry" id="chat-open" aria-label="打开对话窗口" title="对话"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M3 3.4h10a1.1 1.1 0 0 1 1.1 1.1v5.6A1.1 1.1 0 0 1 13 11.2H8.2L5 13.6v-2.4H3a1.1 1.1 0 0 1-1.1-1.1V4.5A1.1 1.1 0 0 1 3 3.4Z"/></svg></button><button type="button" class="chatEntry liveEntry" id="live-open" aria-label="打开直播间弹幕窗口" title="直播间弹幕"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3.5" width="12" height="8" rx="1.6"/><path d="M5.5 13.5h5M8 11.5v2"/><circle cx="12" cy="5.7" r=".9" fill="currentColor" stroke="none"/></svg></button><span class="dockStatus" id="console-status" role="status" aria-live="polite"></span></nav>
<div class="chatMask" id="chat-dialog" hidden>
<div class="chatDialog" role="dialog" aria-modal="true" aria-labelledby="chat-dialog-title">
<div class="chatHead"><h2 class="chatTitle" id="chat-dialog-title">对话</h2><button type="button" class="chatClose" id="chat-close" aria-label="关闭对话窗口"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
<div class="chatBody" id="pet-chat-root"></div>
</div>
</div>
<div class="chatMask" id="live-dialog" hidden>
<div class="chatDialog liveDialog" role="dialog" aria-modal="true" aria-labelledby="live-dialog-title">
<div class="chatHead"><h2 class="chatTitle" id="live-dialog-title"><span class="liveStatusLight" id="live-status-light" aria-hidden="true"></span>直播间</h2><div class="liveHeadRight"><div class="liveLogoRow" id="live-logos"><button type="button" class="liveLogo is-active" data-select="dm" data-platform="dm" title="抖音" aria-label="抖音配置"><span class="liveLogoIcon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M14.2 6.2c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S5.1 16.95 5.1 14.4s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V6.2h2.15z" fill="#25F4EE"/><path d="M13.85 5.85c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S4.75 16.6 4.75 14.05s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V5.85h2.15z" fill="#FE2C55"/><path d="M13.5 5.5c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S4.4 16.25 4.4 13.7s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V5.5H13.5z" fill="#18191C"/></svg></span><span class="liveLogoName">抖音</span><span class="livePill off" data-pill="dm" aria-hidden="true"></span></button><button type="button" class="liveLogo" data-select="ks" data-platform="ks" title="快手" aria-label="快手配置"><span class="liveLogoIcon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FF4906"/><path d="M9.2 7.4c0-.55.45-.9.95-.65l7.1 4.1c.5.28.5 1.02 0 1.3l-7.1 4.1c-.5.28-.95-.1-.95-.65V7.4z" fill="#fff"/></svg></span><span class="liveLogoName">快手</span><span class="livePill off" data-pill="ks" aria-hidden="true"></span></button><button type="button" class="liveLogo" data-select="xs" data-platform="xs" title="小红书" aria-label="小红书配置"><span class="liveLogoIcon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FF2442"/><text x="12" y="12.8" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" font-size="6.2" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, sans-serif" letter-spacing="-0.35">小红书</text></svg></span><span class="liveLogoName">小红书</span><span class="livePill off" data-pill="xs" aria-hidden="true"></span></button><button type="button" class="liveLogo" data-select="bl" data-platform="bl" title="B站" aria-label="B站配置"><span class="liveLogoIcon"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FB7299"/><path fill="#fff" d="M7.2 7.1 5.5 5.4l1.1-1.1 2.1 2.1h6.6l2.1-2.1 1.1 1.1-1.7 1.7H18c.7 0 1.2.5 1.2 1.2v8.2c0 .7-.5 1.2-1.2 1.2H6c-.7 0-1.2-.5-1.2-1.2V8.3c0-.7.5-1.2 1.2-1.2h1.2zm1.3 2.4c-.5 0-.9.4-.9.9v4.2c0 .5.4.9.9.9h7c.5 0 .9-.4.9-.9V10.4c0-.5-.4-.9-.9-.9h-7zm1.2 1.5h1.5v2.8H9.7v-2.8zm3.4 0h1.5v2.8h-1.5v-2.8z"/></svg></span><span class="liveLogoName">B站</span><span class="livePill off" data-pill="bl" aria-hidden="true"></span></button></div><button type="button" class="chatClose" id="live-close" aria-label="关闭直播间窗口"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
<div class="liveBody">
<div class="liveConfigPane" id="live-config-pane"><div class="liveConfig" role="region" aria-labelledby="live-config-title"><span class="liveConfigTitle" id="live-config-title">抖音</span><div class="liveConfigBody">
<div class="livePlatform" data-platform="dm">
<div class="liveConfigPanel" data-panel="dm">
<div class="dmCard">
<div class="dmField"><label class="dmLabel" for="dm-url">直播间链接或房间号</label><div class="liveUrlRow"><input class="fieldInput" id="dm-url" type="text" placeholder="粘贴直播间链接，或直接填纯数字房间号" autocomplete="off" spellcheck="false"></div></div>
<div class="dmField"><label class="dmLabel" for="dm-cookie">Cookie <span class="dmLabelOpt">可选</span></label><textarea class="fieldInput area" id="dm-cookie" placeholder="不填将弹出窗口扫码登录；有登录 Cookie 可粘贴到这里" spellcheck="false"></textarea></div>
<p class="status" id="dm-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow"><p class="liveStatus" id="dm-status">加载中…</p><button type="button" class="liveStatusRefresh" id="dm-refresh">刷新状态</button></div>
<div class="liveOpenLiveRow"><button type="button" class="liveOpenLiveText" id="dm-open-live" title="用浏览器打开直播间">打开直播间</button></div>
</div>
</div>
<div class="livePlatform" data-platform="xs">
<div class="liveConfigPanel" data-panel="xs">
<div class="dmCard">
<p class="liveLoginNote">小红书需要扫码登录后使用。</p>
<p class="status" id="xs-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow"><p class="liveStatus" id="xs-status">加载中…</p><button type="button" class="liveStatusRefresh" id="xs-refresh">刷新状态</button></div>
</div>
</div>
<div class="livePlatform" data-platform="ks">
<div class="liveConfigPanel" data-panel="ks">
<div class="dmCard">
<div class="dmField"><label class="dmLabel" for="ks-url">直播间链接或主播短链</label><div class="liveUrlRow"><input class="fieldInput" id="ks-url" type="text" placeholder="粘贴直播间链接，或直接填主播短链 / 裸 id" autocomplete="off" spellcheck="false"></div></div>
<div class="dmField"><label class="dmLabel" for="ks-cookie">Cookie <span class="dmLabelOpt">可选</span></label><textarea class="fieldInput area" id="ks-cookie" placeholder="直连需登录 Cookie（userId + passToken/web_st/webday7_st）；有就粘贴，没有可留空尝试" spellcheck="false"></textarea></div>
<p class="status" id="ks-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow"><p class="liveStatus" id="ks-status">加载中…</p><button type="button" class="liveStatusRefresh" id="ks-refresh">刷新状态</button></div>
<div class="liveOpenLiveRow"><button type="button" class="liveOpenLiveText" id="ks-open-live" title="用浏览器打开直播间">打开直播间</button></div>
</div>
</div>
<div class="livePlatform" data-platform="bl">
<div class="liveConfigPanel" data-panel="bl">
<div class="dmCard">
<div class="dmField"><label class="dmLabel" for="bl-url">直播间链接或房间号</label><div class="liveUrlRow"><input class="fieldInput" id="bl-url" type="text" placeholder="粘贴直播间链接，或直接填裸房间号" autocomplete="off" spellcheck="false"></div></div>
<div class="dmField"><label class="dmLabel" for="bl-cookie">Cookie <span class="dmLabelOpt">可选</span></label><textarea class="fieldInput area" id="bl-cookie" placeholder="不填走访客匿名；登录可粘贴 SESSDATA，失效会自动回落访客" spellcheck="false"></textarea></div>
<p class="status" id="bl-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow"><p class="liveStatus" id="bl-status">加载中…</p><button type="button" class="liveStatusRefresh" id="bl-refresh">刷新状态</button></div>
<div class="liveOpenLiveRow"><button type="button" class="liveOpenLiveText" id="bl-open-live" title="用浏览器打开直播间">打开直播间</button></div>
</div>
</div>
</div>
</div>
</div>
</div>
<div class="liveFoot"><div class="liveFootLeft"><div class="liveFootSwitches is-active" data-foot-switches="dm"><label class="dmSwitch"><span>回复弹幕</span><input id="dm-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="dm-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="xs"><label class="dmSwitch"><span>回复弹幕</span><input id="xs-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="xs-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="ks"><label class="dmSwitch"><span>回复弹幕</span><input id="ks-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="ks-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="bl"><label class="dmSwitch"><span>回复弹幕</span><input id="bl-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="bl-thank-gift" type="checkbox"></label></div></div><div class="liveFootRight"><button type="button" class="btn ghost" id="live-open-mini">打开弹幕小窗</button><button type="button" class="btn primary" id="live-start">开始监听</button></div></div>
<section class="liveMain">
<div class="liveFeedPanel is-active" data-feed="dm">
<div class="dmCard dmGiftCard">
<div class="dmCardHead"><h3 class="dmCardTitle">礼物</h3><span class="dmFeedMeta" id="dm-gift-meta">0</span></div>
<div class="dmGift" id="dm-gift" aria-live="polite"></div>
</div>
<div class="dmCard dmFeedCard">
<div class="dmCardHead"><h3 class="dmCardTitle">弹幕</h3></div>
<div class="dmFeed" id="dm-feed" aria-live="polite"></div>
</div>
</div>
<div class="liveFeedPanel" data-feed="xs">
<div class="dmCard dmGiftCard">
<div class="dmCardHead"><h3 class="dmCardTitle">礼物</h3><span class="dmFeedMeta" id="xs-gift-meta">0</span></div>
<div class="dmGift" id="xs-gift" aria-live="polite"></div>
</div>
<div class="dmCard dmFeedCard">
<div class="dmCardHead"><h3 class="dmCardTitle">弹幕</h3></div>
<div class="dmFeed" id="xs-feed" aria-live="polite"></div>
</div>
</div>
<div class="liveFeedPanel" data-feed="ks">
<div class="dmCard dmGiftCard">
<div class="dmCardHead"><h3 class="dmCardTitle">礼物</h3><span class="dmFeedMeta" id="ks-gift-meta">0</span></div>
<div class="dmGift" id="ks-gift" aria-live="polite"></div>
</div>
<div class="dmCard dmFeedCard">
<div class="dmCardHead"><h3 class="dmCardTitle">弹幕</h3></div>
<div class="dmFeed" id="ks-feed" aria-live="polite"></div>
</div>
</div>
<div class="liveFeedPanel" data-feed="bl">
<div class="dmCard dmGiftCard">
<div class="dmCardHead"><h3 class="dmCardTitle">礼物</h3><span class="dmFeedMeta" id="bl-gift-meta">0</span></div>
<div class="dmGift" id="bl-gift" aria-live="polite"></div>
</div>
<div class="dmCard dmFeedCard">
<div class="dmCardHead"><h3 class="dmCardTitle">弹幕</h3></div>
<div class="dmFeed" id="bl-feed" aria-live="polite"></div>
</div>
</div>
</section>
</div>
</div>
</div>
<noscript>需要启用 JavaScript 才能使用控制台。请从桌宠右键菜单打开本页。</noscript>
<div id="toast-root" class="toastRoot" aria-live="polite"></div>
</body></html>`;
}

/** 控制台页面脚本：各分区读写本机 `/config`，语音分区另接 `/voice/speak` 试听。 */
export const consoleScript = `
(function () {
  var API = ${JSON.stringify(ROUTE_SEGMENT)};
  var BREEZE_KEY_URL = ${JSON.stringify(BREEZE_API_KEY_URL)};
  var TOKEN = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  // 独立直播间窗口：主进程以 ?live=1 打开本页，隐藏控制台表单、直播间铺满整窗；
  // 普通控制台页与无 Electron 桥的网页/预览环境不置该标志，行为回落到页内弹窗。
  // 必须在下面的 replaceState 清掉 query 之前读取，否则刷新后标志取不到。
  var LIVE_STANDALONE = new URLSearchParams(location.search).get('live') === '1';
  // 小弹窗模式：主进程以 ?live=1&mini=1&p=xx 打开无边框置顶浮窗，只留弹幕区，固定暗色（直播伴侣那种小窗）。
  // p 是控制台「开始监听」时选中的平台，小窗按它显示对应平台的弹幕，窗口内不再提供切平台。
  var LIVE_MINI = new URLSearchParams(location.search).get('mini') === '1';
  var LIVE_MINI_PLATFORM = new URLSearchParams(location.search).get('p') || '';
  var hasCloseLiveBridge = !!(window.petBridge && typeof window.petBridge.closeLive === 'function');
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
  // 小弹窗固定暗色：不读也不写主题（避免浮窗把控制台的主题带跑）。
  if (!LIVE_MINI) wireTheme();

  function byId(id) { return document.getElementById(id); }

  // ---------- 桌面设置面板（居中浮层，互斥开合） ----------
  function panelMasks() { return Array.prototype.slice.call(document.querySelectorAll('.panelMask')); }
  function closePanels() { panelMasks().forEach(function (m) { m.setAttribute('hidden', ''); }); }
  function openPanel(id) {
    closePanels();
    var mask = byId(id);
    if (mask) mask.removeAttribute('hidden');
  }
  function anyPanelOpen() { return panelMasks().some(function (m) { return !m.hasAttribute('hidden'); }); }
  // 统一直播间弹窗的共享状态：各平台渲染/轮询回调在顶层闭包内引用，必须定义在本层。
  var liveCurrent = 'dm';
  function liveDialogEl() { return byId('live-dialog'); }
  function liveIsOpen() { var d = liveDialogEl(); return !!d && !d.hasAttribute('hidden'); }
  /** 某平台是否在监听：logo 角上的小圆点是唯一事实来源，四平台的状态渲染与底部按钮都读它。 */
  function liveReadingPlatform(platform) {
    var pill = document.querySelector('[data-pill="' + platform + '"]');
    return !!(pill && pill.classList.contains('on'));
  }
  /** 底部「开始/停止监听」：未监听显示开始（主色），已监听显示停止（危险色）。 */
  function liveSyncStartBtn(listening) {
    var button = byId('live-start');
    var running = typeof listening === 'boolean' ? listening : liveReadingPlatform(liveCurrent);
    var light = byId('live-status-light');
    if (light) light.classList.toggle('on', !!running);
    if (!button) return;
    button.textContent = running ? '停止监听' : '开始监听';
    button.className = running ? 'btn danger' : 'btn primary';
    button.disabled = false;
  }
  function liveSyncPill(platform, listening) {
    var pill = document.querySelector('[data-pill="' + platform + '"]');
    if (pill) pill.className = 'livePill ' + (listening ? 'on' : 'off');
    // 底部「开始/停止监听」跟随当前平台的真实状态一起翻，避免两处口径不一致。
    if (platform === liveCurrent) liveSyncStartBtn(listening);
  }
  function setStatus(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.dataset.error = kind === 'error' ? 'true' : 'false';
    node.dataset.ok = kind === 'ok' ? 'true' : 'false';
  }

  // 保存结果气泡：成功 / 失败浮层提示，自动浮现、定时收起；只写 textContent，不拼 HTML。
  function showToast(text, kind) {
    var root = byId('toast-root');
    if (!root) return;
    var toast = document.createElement('div');
    toast.className = 'toast ' + (kind === 'error' ? 'toastError' : 'toastOk');
    toast.textContent = text || '';
    root.appendChild(toast);
    while (root.children.length > 3) root.removeChild(root.firstChild);
    void toast.offsetWidth;
    toast.classList.add('toastShow');
    setTimeout(function () {
      toast.classList.remove('toastShow');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 220);
    }, 2400);
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
  /** 抖音弹幕弹窗：整套搬自旧设置页「抖音弹幕」分区，缓存 key 与旧页一致，升级后已填内容不丢。 */
  var DM_CACHE_KEY = 'blue_fish_douyin_danmaku_form_v1';
  var DM_POLL_MS = 3000;
  var dmListening = false;
  var dmLastFeedId = 0;
  var dmStickBottom = true;
  var dmLastStatusUrl = '';

  function dmNode(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  /**
   * 配置页那一行监听状态：一个小圆点 + 一行摘要；只有扫码/报错这类需要用户动手的提示才补第二行。
   * 不再占一整块卡片或灰底方块。
   */
  function renderLiveStatus(box, listening, summary, note) {
    if (!box) return;
    box.textContent = '';
    if (listening) box.classList.add('on');
    else box.classList.remove('on');
    box.appendChild(dmNode('span', 'statusDot', ''));
    box.appendChild(dmNode('span', 'statusText', (listening ? '监听中' : '未监听') + (summary ? ' · ' + summary : '')));
    if (note) box.appendChild(dmNode('span', 'statusNote', note));
  }
  /** 抖音/小红书：CDP 扫码态与最近报错压成一行提示。 */
  function dmStatusNote(status) {
    var note = '';
    if (status.mode === 'cdp') {
      if (status.cdpVisible && !status.cdpLoggedIn) note = '等待扫码：在弹出的窗口完成登录';
      else if (!status.cdpLoggedIn) note = '未检测到登录态：礼物、进场可能不下发，可粘贴 Cookie 后重开';
    }
    return joinNote(note, status);
  }
  function xsStatusNote(status) {
    var note = '';
    if (status.mode === 'cdp') {
      if (status.cdpVisible && !status.cdpLoggedIn) note = '等待扫码：在弹出的中控台窗口完成登录';
      else if (!status.cdpLoggedIn) note = '未检测到登录态：可粘贴 Cookie 后重开';
    }
    return joinNote(note, status);
  }
  /** 快手/B站：直连 WSS 没有扫码态，只有报错时才补一行。 */
  function wsStatusNote(status) {
    return joinNote('', status);
  }
  function joinNote(note, status) {
    var error = String((status && status.lastError) || '').trim();
    if (error) return (note ? note + ' · ' : '') + '最近问题：' + error;
    return note;
  }
  /** 弹幕行头像：昵称首字 + 按昵称散列的固定配色（同一人每次同色），礼物行换金色礼盒图标。 */
  function dmFeedTone(nick) {
    var text = String(nick || '匿名');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    return (hash % 5) + 1;
  }
  /** 礼物行头像里的礼盒图标：用 SVG 命名空间逐个建节点，不拼 innerHTML。 */
  function dmFeedGiftIcon() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '14');
    svg.setAttribute('height', '14');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.3');
    svg.setAttribute('stroke-linejoin', 'round');
    [
      'M2.6 6.4h10.8v6.2a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1V6.4Z',
      'M1.8 4.1h12.4v2.3H1.8z',
      'M8 4.1v9.5',
      'M8 4.1S7.2 1.3 5.8 2c-1.4.7-.7 2.1.7 2.1H8Zm0 0s.8-2.8 2.2-2.1c1.4.7.7 2.1-.7 2.1H8Z',
    ].forEach(function (d) {
      var pathNode = document.createElementNS(NS, 'path');
      pathNode.setAttribute('d', d);
      svg.appendChild(pathNode);
    });
    return svg;
  }
  function dmFeedAvatar(nick, kind) {
    var name = String(nick || '匿名').trim() || '匿名';
    var avatar = dmNode('span', 'dmFeedAva va' + dmFeedTone(name));
    avatar.setAttribute('aria-hidden', 'true');
    if (kind === 'gift') avatar.appendChild(dmFeedGiftIcon());
    else avatar.textContent = name.charAt(0);
    return avatar;
  }
  /** 从「纯房间号」或直播间链接里取出房间号；不用带反斜杠的正则，免模板转义。 */
  function dmExtractWebRid(raw) {
    var text = String(raw || '').trim();
    if (/^[0-9]{5,}$/.test(text)) return text;
    var key = 'live.douyin.com/';
    var at = text.toLowerCase().indexOf(key);
    if (at < 0) return '';
    var tail = text.slice(at + key.length).split('/')[0].split('?')[0].split('&')[0].trim();
    return /^[0-9]{5,}$/.test(tail) ? tail : '';
  }
  function dmInputValue(id) {
    var node = byId(id);
    return node ? node.value : '';
  }
  function dmChecked(id) {
    var node = byId(id);
    return !!(node && node.checked);
  }
  function dmSetChecked(id, value) {
    var node = byId(id);
    if (node) node.checked = !!value;
  }
  function dmFormatTime(at) {
    var date = new Date(Number(at) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }
  function dmFormState() {
    return {
      url: dmInputValue('dm-url').trim(),
      cookie: dmInputValue('dm-cookie').trim(),
      replyChat: dmChecked('dm-reply-chat'),
      thankGift: dmChecked('dm-thank-gift'),
    };
  }
  function dmLoadCache() {
    try {
      var raw = localStorage.getItem(DM_CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      var urlInput = byId('dm-url');
      var cookieInput = byId('dm-cookie');
      if (urlInput && typeof parsed.url === 'string' && parsed.url.trim()) urlInput.value = parsed.url.trim();
      if (cookieInput && typeof parsed.cookie === 'string' && parsed.cookie.trim()) cookieInput.value = parsed.cookie.trim();
      if (typeof parsed.replyChat === 'boolean') dmSetChecked('dm-reply-chat', parsed.replyChat);
      if (typeof parsed.thankGift === 'boolean') dmSetChecked('dm-thank-gift', parsed.thankGift);
    } catch (_) { /* 缓存坏了就当没填过 */ }
  }
  function dmSaveCache() {
    try {
      var form = dmFormState();
      localStorage.setItem(DM_CACHE_KEY, JSON.stringify(form));
    } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
  }
  function dmSyncToggle() {
    var button = byId('dm-toggle');
    if (!button) return;
    button.textContent = dmListening ? '停止监听' : '开始监听';
    button.className = dmListening ? 'btn danger' : 'btn primary';
  }
  function dmRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var prevId = dmLastFeedId;
    var chats = list.filter(function (item) { return item.kind !== 'gift'; });
    var gifts = list.filter(function (item) { return item.kind === 'gift'; });
    var giftMeta = byId('dm-gift-meta');
    if (giftMeta) giftMeta.textContent = String(gifts.length);
    var feedBox = byId('dm-feed');
    var giftBox = byId('dm-gift');
    if (!feedBox || !giftBox) return;
    var nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    var shouldStick = dmStickBottom || nearBottom;
    var maxId = 0;
    list.forEach(function (item) { maxId = Math.max(maxId, Number(item.id) || 0); });
    if (list.length === 0) dmLastFeedId = 0;
    feedBox.textContent = '';
    giftBox.textContent = '';
    gifts.forEach(function (item) {
      var body = String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1);
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'gift'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', body));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', dmFormatTime(item.at)));
      giftBox.appendChild(row);
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '')));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', dmFormatTime(item.at)));
      feedBox.appendChild(row);
    });
    if (shouldStick && (list.length === 0 || maxId !== dmLastFeedId)) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
    dmLastFeedId = maxId;
  }
  function dmRenderStatus(data, syncToggles) {
    var status = data || {};
    dmListening = !!status.listening;
    liveSyncPill('dm', dmListening);
    dmSyncToggle();
    if (typeof status.url === 'string' && status.url.trim()) dmLastStatusUrl = status.url.trim();
    var box = byId('dm-status');
    if (box) {
      var roomId = status.roomId || dmExtractWebRid(status.url);
      var bits = [];
      if (dmListening) {
        bits.push('「' + (status.title || '未知') + '」');
        bits.push('主播 ' + (status.anchor || '未知'));
        if (roomId) bits.push('房间 ' + roomId);
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, dmListening, bits.join(' · '), dmStatusNote(status));
    }
    dmRenderFeed(status.recent);
    // 未监听时保留本地勾选，避免 status 的默认 false 冲掉表单。
    if (syncToggles || dmListening) {
      if (typeof status.replyChat === 'boolean') dmSetChecked('dm-reply-chat', status.replyChat);
      if (typeof status.thankGift === 'boolean') dmSetChecked('dm-thank-gift', status.thankGift);
    }
  }
  async function dmRefresh() {
    var data = await api('GET', '/danmaku/douyin/status');
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '读取状态失败');
    dmRenderStatus(data, false);
    return data;
  }
  async function dmPushOptions() {
    dmSaveCache();
    var data = await api('POST', '/danmaku/douyin/options', {
      replyChat: dmChecked('dm-reply-chat'),
      thankGift: dmChecked('dm-thank-gift'),
    });
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '更新开关失败');
    dmRenderStatus(data, true);
    return data;
  }
  async function dmStart() {
    var button = byId('dm-toggle');
    setStatus(byId('dm-msg'), '正在连接…');
    if (button) button.disabled = true;
    dmSaveCache();
    try {
      var data = await api('POST', '/danmaku/douyin/start', dmFormState(), 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      if (data.url) {
        var urlInput = byId('dm-url');
        if (urlInput) urlInput.value = data.url;
      }
      dmSaveCache();
      dmRenderStatus(data, true);
      setStatus(byId('dm-msg'), '');
      showToast('已开始监听', 'ok');
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('dm-msg'), '连接超时，后台可能仍在启动…');
        try { dmRenderStatus(await dmRefresh(), false); } catch (_) { dmRenderStatus(null, false); }
        showToast(dmListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        return;
      }
      setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
      showToast((error && error.message) || String(error), 'error');
      try { await dmRefresh(); } catch (_) { /* 状态也读不到时保留报错文案 */ }
    } finally {
      if (button) button.disabled = false;
      dmSyncToggle();
    }
  }
  async function dmStop() {
    var button = byId('dm-toggle');
    setStatus(byId('dm-msg'), '正在停止…');
    if (button) button.disabled = true;
    try {
      var data = await api('POST', '/danmaku/douyin/stop', {});
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '停止失败');
      dmRenderStatus(data, false);
      setStatus(byId('dm-msg'), '');
      setStatus(byId('dm-msg'), '已停止', 'ok');
    } catch (error) {
      setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
      dmSyncToggle();
    }
  }
  /** 抖音表单缓存、开关与 3s 轮询接线（轮询只在统一直播间弹窗打开且选中抖音时发请求）。 */
  function wireDanmakuDialog() {
    dmLoadCache();
    dmSyncToggle();

    var feedBox = byId('dm-feed');
    if (feedBox) {
      feedBox.addEventListener('scroll', function () {
        dmStickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
      });
    }
    ['dm-url', 'dm-cookie'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('input', dmSaveCache);
      node.addEventListener('change', dmSaveCache);
      node.addEventListener('blur', dmSaveCache);
    });
    ['dm-reply-chat', 'dm-thank-gift'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('change', function () {
        dmSaveCache();
        void dmPushOptions().catch(function (error) {
          setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
        });
      });
    });
    var toggleBtn = byId('dm-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (dmListening) void dmStop();
        else void dmStart();
      });
    }
    var refreshBtn = byId('dm-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        setStatus(byId('dm-msg'), '');
        void dmRefresh().catch(function (error) {
          setStatus(byId('dm-msg'), (error && error.message) || String(error), 'error');
        });
      });
    }

    // 轮询只在统一直播间弹窗打开且当前选中抖音时发请求。
    if (typeof setInterval === 'function') {
      setInterval(function () {
        if (!liveIsOpen() || liveCurrent !== 'dm') return;
        void dmRefresh().catch(function () {});
      }, DM_POLL_MS);
    }
  }

  /** 小红书中控台弹幕弹窗：内嵌中控台扫码登录后 CDP 旁听自己这场直播。 */
  var XS_CACHE_KEY = 'blue_fish_xhs_danmaku_form_v1';
  var XS_POLL_MS = 3000;
  var xsListening = false;
  var xsLastFeedId = 0;
  var xsStickBottom = true;

  function xsInputValue(id) {
    var node = byId(id);
    return node ? node.value : '';
  }
  function xsChecked(id) {
    var node = byId(id);
    return !!(node && node.checked);
  }
  function xsSetChecked(id, value) {
    var node = byId(id);
    if (node) node.checked = !!value;
  }
  function xsFormatTime(at) {
    var date = new Date(Number(at) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }
  function xsFormState() {
    return {
      replyChat: xsChecked('xs-reply-chat'),
      thankGift: xsChecked('xs-thank-gift'),
    };
  }
  function xsLoadCache() {
    try {
      var raw = localStorage.getItem(XS_CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      if (typeof parsed.replyChat === 'boolean') xsSetChecked('xs-reply-chat', parsed.replyChat);
      if (typeof parsed.thankGift === 'boolean') xsSetChecked('xs-thank-gift', parsed.thankGift);
    } catch (_) { /* 缓存坏了就当没填过 */ }
  }
  function xsSaveCache() {
    try {
      localStorage.setItem(XS_CACHE_KEY, JSON.stringify(xsFormState()));
    } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
  }
  function xsSyncToggle() {
    var button = byId('xs-toggle');
    if (!button) return;
    button.textContent = xsListening ? '停止监听' : '开始监听';
    button.className = xsListening ? 'btn danger' : 'btn primary';
  }
  function xsRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var prevId = xsLastFeedId;
    var chats = list.filter(function (item) { return item.kind !== 'gift'; });
    var gifts = list.filter(function (item) { return item.kind === 'gift'; });
    var giftMeta = byId('xs-gift-meta');
    if (giftMeta) giftMeta.textContent = String(gifts.length);
    var feedBox = byId('xs-feed');
    var giftBox = byId('xs-gift');
    if (!feedBox || !giftBox) return;
    var nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    var shouldStick = xsStickBottom || nearBottom;
    var maxId = 0;
    list.forEach(function (item) { maxId = Math.max(maxId, Number(item.id) || 0); });
    if (list.length === 0) xsLastFeedId = 0;
    feedBox.textContent = '';
    giftBox.textContent = '';
    gifts.forEach(function (item) {
      var body = String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1);
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'gift'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', body));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', xsFormatTime(item.at)));
      giftBox.appendChild(row);
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '')));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', xsFormatTime(item.at)));
      feedBox.appendChild(row);
    });
    if (shouldStick && (list.length === 0 || maxId !== xsLastFeedId)) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
    xsLastFeedId = maxId;
  }
  function xsRenderStatus(data, syncToggles) {
    var status = data || {};
    xsListening = !!status.listening;
    liveSyncPill('xs', xsListening);
    xsSyncToggle();
    var box = byId('xs-status');
    if (box) {
      var bits = [];
      if (xsListening) {
        bits.push('中控台这场直播');
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, xsListening, bits.join(' · '), xsStatusNote(status));
    }
    xsRenderFeed(status.recent);
    if (syncToggles || xsListening) {
      if (typeof status.replyChat === 'boolean') xsSetChecked('xs-reply-chat', status.replyChat);
      if (typeof status.thankGift === 'boolean') xsSetChecked('xs-thank-gift', status.thankGift);
    }
  }
  async function xsRefresh() {
    var data = await api('GET', '/danmaku/xiaohongshu/status');
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '读取状态失败');
    xsRenderStatus(data, false);
    return data;
  }
  async function xsPushOptions() {
    xsSaveCache();
    var data = await api('POST', '/danmaku/xiaohongshu/options', {
      replyChat: xsChecked('xs-reply-chat'),
      thankGift: xsChecked('xs-thank-gift'),
    });
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '更新开关失败');
    xsRenderStatus(data, true);
    return data;
  }
  async function xsStart() {
    var button = byId('xs-toggle');
    setStatus(byId('xs-msg'), '正在连接…');
    if (button) button.disabled = true;
    xsSaveCache();
    try {
      var data = await api('POST', '/danmaku/xiaohongshu/start', xsFormState(), 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      xsSaveCache();
      xsRenderStatus(data, true);
      setStatus(byId('xs-msg'), '');
      showToast('已开始监听', 'ok');
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('xs-msg'), '连接超时，后台可能仍在启动…');
        try { xsRenderStatus(await xsRefresh(), false); } catch (_) { xsRenderStatus(null, false); }
        showToast(xsListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        return;
      }
      setStatus(byId('xs-msg'), (error && error.message) || String(error), 'error');
      showToast((error && error.message) || String(error), 'error');
      try { await xsRefresh(); } catch (_) { /* 状态也读不到时保留报错文案 */ }
    } finally {
      if (button) button.disabled = false;
      xsSyncToggle();
    }
  }
  async function xsStop() {
    var button = byId('xs-toggle');
    setStatus(byId('xs-msg'), '正在停止…');
    if (button) button.disabled = true;
    try {
      var data = await api('POST', '/danmaku/xiaohongshu/stop', {});
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '停止失败');
      xsRenderStatus(data, false);
      setStatus(byId('xs-msg'), '');
      setStatus(byId('xs-msg'), '已停止', 'ok');
    } catch (error) {
      setStatus(byId('xs-msg'), (error && error.message) || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
      xsSyncToggle();
    }
  }
  /** 小红书表单缓存、开关与 3s 轮询接线（轮询只在统一直播间弹窗打开且选中小红书时发请求）。 */
  function wireXhsDialog() {
    xsLoadCache();
    xsSyncToggle();

    var feedBox = byId('xs-feed');
    if (feedBox) {
      feedBox.addEventListener('scroll', function () {
        xsStickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
      });
    }
    ['xs-reply-chat', 'xs-thank-gift'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('change', function () {
        xsSaveCache();
        void xsPushOptions().catch(function (error) {
          setStatus(byId('xs-msg'), (error && error.message) || String(error), 'error');
        });
      });
    });
    var toggleBtn = byId('xs-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (xsListening) void xsStop();
        else void xsStart();
      });
    }
    var refreshBtn = byId('xs-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        setStatus(byId('xs-msg'), '');
        void xsRefresh().catch(function (error) {
          setStatus(byId('xs-msg'), (error && error.message) || String(error), 'error');
        });
      });
    }

    if (typeof setInterval === 'function') {
      setInterval(function () {
        if (!liveIsOpen() || liveCurrent !== 'xs') return;
        void xsRefresh().catch(function () {});
      }, XS_POLL_MS);
    }
  }

  /** 快手直连弹幕弹窗：进房换票后 WSS 直连，仅入库弹幕 + 礼物。 */
  var KS_CACHE_KEY = 'blue_fish_ks_danmaku_form_v1';
  var KS_POLL_MS = 3000;
  var ksListening = false;
  var ksLastFeedId = 0;
  var ksStickBottom = true;

  function ksInputValue(id) {
    var node = byId(id);
    return node ? node.value : '';
  }
  function ksChecked(id) {
    var node = byId(id);
    return !!(node && node.checked);
  }
  function ksSetChecked(id, value) {
    var node = byId(id);
    if (node) node.checked = !!value;
  }
  function ksFormatTime(at) {
    var date = new Date(Number(at) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }
  function ksFormState() {
    return {
      url: ksInputValue('ks-url').trim(),
      cookie: ksInputValue('ks-cookie').trim(),
      replyChat: ksChecked('ks-reply-chat'),
      thankGift: ksChecked('ks-thank-gift'),
    };
  }
  function ksLoadCache() {
    try {
      var raw = localStorage.getItem(KS_CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      var urlInput = byId('ks-url');
      if (urlInput && typeof parsed.url === 'string' && parsed.url.trim()) urlInput.value = parsed.url.trim();
      var cookieInput = byId('ks-cookie');
      if (cookieInput && typeof parsed.cookie === 'string' && parsed.cookie.trim()) cookieInput.value = parsed.cookie.trim();
      if (typeof parsed.replyChat === 'boolean') ksSetChecked('ks-reply-chat', parsed.replyChat);
      if (typeof parsed.thankGift === 'boolean') ksSetChecked('ks-thank-gift', parsed.thankGift);
    } catch (_) { /* 缓存坏了就当没填过 */ }
  }
  function ksSaveCache() {
    try {
      localStorage.setItem(KS_CACHE_KEY, JSON.stringify(ksFormState()));
    } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
  }
  function ksSyncToggle() {
    var button = byId('ks-toggle');
    if (!button) return;
    button.textContent = ksListening ? '停止监听' : '开始监听';
    button.className = ksListening ? 'btn danger' : 'btn primary';
  }
  function ksRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var prevId = ksLastFeedId;
    var chats = list.filter(function (item) { return item.kind !== 'gift'; });
    var gifts = list.filter(function (item) { return item.kind === 'gift'; });
    var giftMeta = byId('ks-gift-meta');
    if (giftMeta) giftMeta.textContent = String(gifts.length);
    var feedBox = byId('ks-feed');
    var giftBox = byId('ks-gift');
    if (!feedBox || !giftBox) return;
    var nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    var shouldStick = ksStickBottom || nearBottom;
    var maxId = 0;
    list.forEach(function (item) { maxId = Math.max(maxId, Number(item.id) || 0); });
    if (list.length === 0) ksLastFeedId = 0;
    feedBox.textContent = '';
    giftBox.textContent = '';
    gifts.forEach(function (item) {
      var body = String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1);
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'gift'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', body));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', ksFormatTime(item.at)));
      giftBox.appendChild(row);
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '')));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', ksFormatTime(item.at)));
      feedBox.appendChild(row);
    });
    if (shouldStick && (list.length === 0 || maxId !== ksLastFeedId)) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
    ksLastFeedId = maxId;
  }
  function ksRenderStatus(data, syncToggles) {
    var status = data || {};
    ksListening = !!status.listening;
    liveSyncPill('ks', ksListening);
    ksSyncToggle();
    var box = byId('ks-status');
    if (box) {
      var bits = [];
      if (ksListening) {
        bits.push('直连 WSS');
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, ksListening, bits.join(' · '), wsStatusNote(status));
    }
    ksRenderFeed(status.recent);
    if (syncToggles || ksListening) {
      if (typeof status.replyChat === 'boolean') ksSetChecked('ks-reply-chat', status.replyChat);
      if (typeof status.thankGift === 'boolean') ksSetChecked('ks-thank-gift', status.thankGift);
    }
  }
  async function ksRefresh() {
    var data = await api('GET', '/danmaku/kuaishou/status');
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '读取状态失败');
    ksRenderStatus(data, false);
    return data;
  }
  async function ksPushOptions() {
    ksSaveCache();
    var data = await api('POST', '/danmaku/kuaishou/options', {
      replyChat: ksChecked('ks-reply-chat'),
      thankGift: ksChecked('ks-thank-gift'),
    });
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '更新开关失败');
    ksRenderStatus(data, true);
    return data;
  }
  async function ksStart() {
    var button = byId('ks-toggle');
    var form = ksFormState();
    if (!form.url) {
      setStatus(byId('ks-msg'), '请填写直播间链接或主播短链', 'error');
      return;
    }
    setStatus(byId('ks-msg'), '正在连接…');
    if (button) button.disabled = true;
    ksSaveCache();
    try {
      var data = await api('POST', '/danmaku/kuaishou/start', form, 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      ksSaveCache();
      ksRenderStatus(data, true);
      setStatus(byId('ks-msg'), '');
      showToast('已开始监听', 'ok');
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('ks-msg'), '连接超时，后台可能仍在启动…');
        try { ksRenderStatus(await ksRefresh(), false); } catch (_) { ksRenderStatus(null, false); }
        showToast(ksListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        return;
      }
      setStatus(byId('ks-msg'), (error && error.message) || String(error), 'error');
      showToast((error && error.message) || String(error), 'error');
      try { await ksRefresh(); } catch (_) { /* 状态也读不到时保留报错文案 */ }
    } finally {
      if (button) button.disabled = false;
      ksSyncToggle();
    }
  }
  async function ksStop() {
    var button = byId('ks-toggle');
    setStatus(byId('ks-msg'), '正在停止…');
    if (button) button.disabled = true;
    try {
      var data = await api('POST', '/danmaku/kuaishou/stop', {});
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '停止失败');
      ksRenderStatus(data, false);
      setStatus(byId('ks-msg'), '');
      setStatus(byId('ks-msg'), '已停止', 'ok');
    } catch (error) {
      setStatus(byId('ks-msg'), (error && error.message) || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
      ksSyncToggle();
    }
  }
  /** 快手表单缓存、开关与 3s 轮询接线（轮询只在统一直播间弹窗打开且选中快手时发请求）。 */
  function wireKsDialog() {
    ksLoadCache();
    ksSyncToggle();

    var feedBox = byId('ks-feed');
    if (feedBox) {
      feedBox.addEventListener('scroll', function () {
        ksStickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
      });
    }
    var urlNode = byId('ks-url');
    if (urlNode) {
      urlNode.addEventListener('input', ksSaveCache);
      urlNode.addEventListener('change', ksSaveCache);
      urlNode.addEventListener('blur', ksSaveCache);
    }
    var cookieNode = byId('ks-cookie');
    if (cookieNode) {
      cookieNode.addEventListener('input', ksSaveCache);
      cookieNode.addEventListener('change', ksSaveCache);
      cookieNode.addEventListener('blur', ksSaveCache);
    }
    ['ks-reply-chat', 'ks-thank-gift'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('change', function () {
        ksSaveCache();
        void ksPushOptions().catch(function (error) {
          setStatus(byId('ks-msg'), (error && error.message) || String(error), 'error');
        });
      });
    });
    var toggleBtn = byId('ks-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (ksListening) void ksStop();
        else void ksStart();
      });
    }
    var refreshBtn = byId('ks-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        setStatus(byId('ks-msg'), '');
        void ksRefresh().catch(function (error) {
          setStatus(byId('ks-msg'), (error && error.message) || String(error), 'error');
        });
      });
    }

    if (typeof setInterval === 'function') {
      setInterval(function () {
        if (!liveIsOpen() || liveCurrent !== 'ks') return;
        void ksRefresh().catch(function () {});
      }, KS_POLL_MS);
    }
  }

  var BL_CACHE_KEY = 'blue_fish_bili_danmaku_form_v1';
  var BL_POLL_MS = 3000;
  var blListening = false;
  var blLastFeedId = 0;
  var blStickBottom = true;

  function blInputValue(id) {
    var node = byId(id);
    return node ? node.value : '';
  }
  function blChecked(id) {
    var node = byId(id);
    return !!(node && node.checked);
  }
  function blSetChecked(id, value) {
    var node = byId(id);
    if (node) node.checked = !!value;
  }
  function blFormatTime(at) {
    var date = new Date(Number(at) || 0);
    if (!Number.isFinite(date.getTime()) || date.getTime() <= 0) return '';
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }
  function blFormState() {
    return {
      url: blInputValue('bl-url').trim(),
      cookie: blInputValue('bl-cookie').trim(),
      replyChat: blChecked('bl-reply-chat'),
      thankGift: blChecked('bl-thank-gift'),
    };
  }
  function blLoadCache() {
    try {
      var raw = localStorage.getItem(BL_CACHE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      var urlInput = byId('bl-url');
      if (urlInput && typeof parsed.url === 'string' && parsed.url.trim()) urlInput.value = parsed.url.trim();
      var cookieInput = byId('bl-cookie');
      if (cookieInput && typeof parsed.cookie === 'string' && parsed.cookie.trim()) cookieInput.value = parsed.cookie.trim();
      if (typeof parsed.replyChat === 'boolean') blSetChecked('bl-reply-chat', parsed.replyChat);
      if (typeof parsed.thankGift === 'boolean') blSetChecked('bl-thank-gift', parsed.thankGift);
    } catch (_) { /* 缓存坏了就当没填过 */ }
  }
  function blSaveCache() {
    try {
      localStorage.setItem(BL_CACHE_KEY, JSON.stringify(blFormState()));
    } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
  }
  function blSyncToggle() {
    var button = byId('bl-toggle');
    if (!button) return;
    button.textContent = blListening ? '停止监听' : '开始监听';
    button.className = blListening ? 'btn danger' : 'btn primary';
  }
  function blRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var prevId = blLastFeedId;
    var chats = list.filter(function (item) { return item.kind !== 'gift'; });
    var gifts = list.filter(function (item) { return item.kind === 'gift'; });
    var giftMeta = byId('bl-gift-meta');
    if (giftMeta) giftMeta.textContent = String(gifts.length);
    var feedBox = byId('bl-feed');
    var giftBox = byId('bl-gift');
    if (!feedBox || !giftBox) return;
    var nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    var shouldStick = blStickBottom || nearBottom;
    var maxId = 0;
    list.forEach(function (item) { maxId = Math.max(maxId, Number(item.id) || 0); });
    if (list.length === 0) blLastFeedId = 0;
    feedBox.textContent = '';
    giftBox.textContent = '';
    gifts.forEach(function (item) {
      var body = String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1);
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'gift'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', body));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', blFormatTime(item.at)));
      giftBox.appendChild(row);
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '')));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', blFormatTime(item.at)));
      feedBox.appendChild(row);
    });
    if (shouldStick && (list.length === 0 || maxId !== blLastFeedId)) {
      feedBox.scrollTop = feedBox.scrollHeight;
    }
    blLastFeedId = maxId;
  }
  function blRenderStatus(data, syncToggles) {
    var status = data || {};
    blListening = !!status.listening;
    liveSyncPill('bl', blListening);
    blSyncToggle();
    var box = byId('bl-status');
    if (box) {
      var bits = [];
      if (blListening) {
        if (status.title) bits.push('「' + String(status.title) + '」');
        if (status.anchor) bits.push('主播 ' + String(status.anchor));
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, blListening, bits.join(' · '), wsStatusNote(status));
    }
    blRenderFeed(status.recent);
    if (syncToggles || blListening) {
      if (typeof status.replyChat === 'boolean') blSetChecked('bl-reply-chat', status.replyChat);
      if (typeof status.thankGift === 'boolean') blSetChecked('bl-thank-gift', status.thankGift);
    }
  }
  async function blRefresh() {
    var data = await api('GET', '/danmaku/bilibili/status');
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '读取状态失败');
    blRenderStatus(data, false);
    return data;
  }
  async function blPushOptions() {
    blSaveCache();
    var data = await api('POST', '/danmaku/bilibili/options', {
      replyChat: blChecked('bl-reply-chat'),
      thankGift: blChecked('bl-thank-gift'),
    });
    if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '更新开关失败');
    blRenderStatus(data, true);
    return data;
  }
  async function blStart() {
    var button = byId('bl-toggle');
    var form = blFormState();
    if (!form.url) {
      setStatus(byId('bl-msg'), '请填写直播间链接或房间号', 'error');
      return;
    }
    setStatus(byId('bl-msg'), '正在连接…');
    if (button) button.disabled = true;
    blSaveCache();
    try {
      var data = await api('POST', '/danmaku/bilibili/start', form, 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      blSaveCache();
      blRenderStatus(data, true);
      setStatus(byId('bl-msg'), '');
      showToast('已开始监听', 'ok');
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('bl-msg'), '连接超时，后台可能仍在启动…');
        try { blRenderStatus(await blRefresh(), false); } catch (_) { blRenderStatus(null, false); }
        showToast(blListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        return;
      }
      setStatus(byId('bl-msg'), (error && error.message) || String(error), 'error');
      showToast((error && error.message) || String(error), 'error');
      try { await blRefresh(); } catch (_) { /* 状态也读不到时保留报错文案 */ }
    } finally {
      if (button) button.disabled = false;
      blSyncToggle();
    }
  }
  async function blStop() {
    var button = byId('bl-toggle');
    setStatus(byId('bl-msg'), '正在停止…');
    if (button) button.disabled = true;
    try {
      var data = await api('POST', '/danmaku/bilibili/stop', {});
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '停止失败');
      blRenderStatus(data, false);
      setStatus(byId('bl-msg'), '');
      setStatus(byId('bl-msg'), '已停止', 'ok');
    } catch (error) {
      setStatus(byId('bl-msg'), (error && error.message) || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
      blSyncToggle();
    }
  }
  /** B 站表单缓存、开关与 3s 轮询接线（轮询只在统一直播间弹窗打开且选中 B 站时发请求）。 */
  function wireBiliDialog() {
    blLoadCache();
    blSyncToggle();

    var feedBox = byId('bl-feed');
    if (feedBox) {
      feedBox.addEventListener('scroll', function () {
        blStickBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
      });
    }
    var urlNode = byId('bl-url');
    if (urlNode) {
      urlNode.addEventListener('input', blSaveCache);
      urlNode.addEventListener('change', blSaveCache);
      urlNode.addEventListener('blur', blSaveCache);
    }
    var cookieNode = byId('bl-cookie');
    if (cookieNode) {
      cookieNode.addEventListener('input', blSaveCache);
      cookieNode.addEventListener('change', blSaveCache);
      cookieNode.addEventListener('blur', blSaveCache);
    }
    ['bl-reply-chat', 'bl-thank-gift'].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener('change', function () {
        blSaveCache();
        void blPushOptions().catch(function (error) {
          setStatus(byId('bl-msg'), (error && error.message) || String(error), 'error');
        });
      });
    });
    var toggleBtn = byId('bl-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        if (blListening) void blStop();
        else void blStart();
      });
    }
    var refreshBtn = byId('bl-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        setStatus(byId('bl-msg'), '');
        void blRefresh().catch(function (error) {
          setStatus(byId('bl-msg'), (error && error.message) || String(error), 'error');
        });
      });
    }

    if (typeof setInterval === 'function') {
      setInterval(function () {
        if (!liveIsOpen() || liveCurrent !== 'bl') return;
        void blRefresh().catch(function () {});
      }, BL_POLL_MS);
    }
  }

  function tokenHeaders() {
    var headers = {};
    if (TOKEN) headers['X-Blue-Fish-Token'] = TOKEN;
    return headers;
  }

  async function api(method, path, body, timeoutMs) {
    var headers = tokenHeaders();
    var opts = { method: method, credentials: 'same-origin', cache: 'no-store', headers: headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    var controller = null;
    var timer = 0;
    if (typeof timeoutMs === 'number' && timeoutMs > 0 && typeof AbortController === 'function') {
      controller = new AbortController();
      opts.signal = controller.signal;
      timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    }
    try {
      var res = await fetch(API + path, opts);
      var data = await res.json().catch(function () { return null; });
      if (!res.ok) {
        if (res.status === 403) throw new Error('打开凭据已失效，请从桌宠菜单重新打开控制台。');
        throw new Error((data && (data.message || data.error)) || '本机接口暂时无法处理请求');
      }
      return data;
    } catch (error) {
      if (controller && controller.signal && controller.signal.aborted) {
        var timeoutErr = new Error('连接超时，后台可能仍在启动；稍后会自动刷新状态');
        timeoutErr.isTimeout = true;
        throw timeoutErr;
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  var FALLBACK_PHYSICS = {
    gravity: 1400, restitution: 0.78, groundFriction: 2.5, throwPower: 1,
    ceilingBounce: true, petCollision: true
  };
  /** 旧页物理卡没有 UI 的三个可选键（手机端体感）：原配置写过就随保存原样带回，没写过不补键。 */
  var PHYSICS_OPTIONAL_KEYS = ['hapticEnabled', 'tiltGravity', 'shakeThrow'];
  var FALLBACK_FONT = { family: 'candy', size: 21, followPet: true };
  var MIN_PETS = 1;

  /** 原配置里真正写过的可选体感键；界面不编辑它们，保存时只把写过的原值带回去。 */
  function physicsOptionalOf(main) {
    var p = main && main.physics && typeof main.physics === 'object' ? main.physics : null;
    var out = {};
    if (!p) return out;
    PHYSICS_OPTIONAL_KEYS.forEach(function (key) {
      if (typeof p[key] === 'boolean') out[key] = p[key];
    });
    return out;
  }

  var state = { main: null, pets: [], petIndex: 0, globals: null, draft: null, catalog: null, meta: null, ai: null, savedProvider: 'edge', physicsOptional: null };
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
        petCollision: !physics || physics.petCollision !== false
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
    var deleteBtn = byId('pet-delete');
    if (deleteBtn) deleteBtn.hidden = !editable;
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
    openPanel('pet-panel');
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
    openPanel('pet-panel');
    setStatus(byId('pet-list-status'), '已添加一只新宠物，检查配置后点「保存」写盘。', 'ok');
  }

  async function deletePet() {
    var status = byId('pet-status');
    var pet = currentPet();
    if (!pet) return;
    if (petRoot(pet) === 'main') {
      setStatus(status, '内置主宠物不能删除。', 'error');
      return;
    }
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
    var out = {
      gravity: p.gravity,
      restitution: p.restitution,
      groundFriction: p.groundFriction,
      throwPower: p.throwPower,
      ceilingBounce: p.ceilingBounce,
      petCollision: p.petCollision
    };
    // 旧页没有这三个手机端体感开关的界面：原配置写过就原值带回，没写过就不补键（与旧页 physicsBody 同口径）
    var optional = state.physicsOptional;
    if (optional) {
      PHYSICS_OPTIONAL_KEYS.forEach(function (key) {
        if (key in optional) out[key] = optional[key];
      });
    }
    return out;
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

  /** 保存成功后只回写这一段，别处没保存的输入（Key 草稿、改了一半的数字）不会被刷掉。 */
  function applyMerged(section, merged) {
    var main = merged && merged.main && typeof merged.main === 'object' ? merged.main : null;
    if (!main) return;
    state.main = main;
    state.pets = clonePets(main.pets);
    if (state.petIndex >= state.pets.length) state.petIndex = Math.max(0, state.pets.length - 1);
    var g = state.globals;
    if (section === 'global') {
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
    if (section === 'physics') {
      g.physics = draftFrom(main).physics;
    }
    if (section === 'font') {
      g.font = draftFrom(main).font;
    }
    if (section === 'voice') {
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
      var doneText = doneText || '已保存到本机。';
      setStatus(statusEl, doneText, 'ok');
      showToast(doneText, 'ok');
    } catch (error) {
      var errMsg = error && error.message ? error.message : String(error);
      setStatus(statusEl, errMsg, 'error');
      showToast(errMsg, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function savePet() {
    var message = petFieldsInvalid();
    if (message) { setStatus(byId('pet-status'), message, 'error'); showToast(message, 'error'); return; }
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
    if (!state.draft || !state.main) { setStatus(byId('voice-save-status'), '配置尚未读取完成。', 'error'); showToast('配置尚未读取完成。', 'error'); return; }
    if (!state.draft.voiceName) { setStatus(byId('voice-save-status'), '请先选择音色，再保存。', 'error'); showToast('请先选择音色，再保存。', 'error'); return; }
    void submitPayload(Object.assign(basePayload(), voiceFields()), byId('voice-save-status'), byId('voice-save'), '语音设置已保存。', 'voice');
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
        state.physicsOptional = physicsOptionalOf(main);
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
      showToast('AI 设置已保存。', 'ok');
    } catch (error) {
      var aiErr = error && error.message ? error.message : String(error);
      setStatus(status, aiErr, 'error');
      showToast(aiErr, 'error');
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
    state.physicsOptional = physicsOptionalOf(config.main);
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
    'ph-collide': 'petCollision'
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

    // 桌面设置入口：点开对应的居中配置面板
    Array.prototype.forEach.call(document.querySelectorAll('.deskEntry[data-panel]'), function (entry) {
      entry.addEventListener('click', function () { openPanel(entry.getAttribute('data-panel')); });
    });
    // 面板关闭：点遮罩空白处 / 关闭按钮；Esc 优先收起设置面板
    panelMasks().forEach(function (mask) {
      mask.addEventListener('click', function (event) {
        if (event.target === mask) closePanels();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-panel-close]'), function (btn) {
      btn.addEventListener('click', function () {
        var mask = btn.closest ? btn.closest('.panelMask') : null;
        if (mask) mask.setAttribute('hidden', '');
      });
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && anyPanelOpen()) closePanels();
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

    // ===== 直播间窗口：顶部平台 logo 当 Tab，中间是当前平台配置，底部一键开始监听（弹幕在弹幕小窗里看） =====
    var LIVE_PLATFORMS = ['dm', 'xs', 'ks', 'bl'];
    var liveNames = { dm: '抖音', xs: '小红书', ks: '快手', bl: 'B站' };
    var liveRefreshers = { dm: dmRefresh, xs: xsRefresh, ks: ksRefresh, bl: blRefresh };
    var liveStarters = { dm: dmStart, xs: xsStart, ks: ksStart, bl: blStart };
    var liveStoppers = { dm: dmStop, xs: xsStop, ks: ksStop, bl: blStop };
    var liveMsgNodes = { dm: 'dm-msg', xs: 'xs-msg', ks: 'ks-msg', bl: 'bl-msg' };
    var liveSavers = { dm: dmSaveCache, xs: xsSaveCache, ks: ksSaveCache, bl: blSaveCache };

    function liveSaveCurrent() {
      var saver = liveSavers[liveCurrent];
      if (saver) saver();
    }

    function liveApplySelection() {
      LIVE_PLATFORMS.forEach(function (p) {
        var active = p === liveCurrent;
        var logo = document.querySelector('[data-select="' + p + '"]');
        if (logo) logo.classList.toggle('is-active', active);
        var feed = document.querySelector('[data-feed="' + p + '"]');
        if (feed) feed.classList.toggle('is-active', active);
        var panel = document.querySelector('[data-panel="' + p + '"]');
        if (panel) panel.classList.toggle('is-active', active);
        var foot = document.querySelector('[data-foot-switches="' + p + '"]');
        if (foot) foot.classList.toggle('is-active', active);
      });
      var title = byId('live-config-title');
      if (title) title.textContent = liveNames[liveCurrent];
      liveSyncStartBtn();
    }

    function liveRefreshCurrent() {
      var refresher = liveRefreshers[liveCurrent];
      if (!refresher) return;
      void refresher().catch(function (error) {
        setStatus(byId(liveMsgNodes[liveCurrent]), (error && error.message) || String(error), 'error');
      });
    }

    /** 开弹幕小窗：桌面端走主进程桥（带上当前平台，小窗里就不再需要切平台）；网页/预览给提示，不假装开窗。 */
    function liveOpenMini(platform) {
      var target = platform || liveCurrent;
      if (window.petBridge && typeof window.petBridge.openLiveMini === 'function') {
        window.petBridge.openLiveMini(target);
        return true;
      }
      showToast('弹幕小窗要在桌面端（独立模式）里才能开', 'error');
      return false;
    }

    /** 把「纯房间号」或短链拼成完整直播间地址；已经是 http(s) 链接则原样返回。 */
    function liveResolveRoomUrl(platform, raw) {
      var text = String(raw || '').trim();
      if (/^https?:[/][/]/i.test(text)) return text;
      var rid = text.replace(/[^0-9]/g, '');
      if (!rid) return '';
      if (platform === 'dm') return 'https://live.douyin.com/' + rid;
      if (platform === 'bl') return 'https://live.bilibili.com/' + rid;
      if (platform === 'ks') return 'https://live.kuaishou.com/u/' + rid;
      return '';
    }

    /** 「打开直播间」：读当前平台链接输入框，用系统浏览器打开对应直播间地址。 */
    function liveOpenRoom(platform) {
      var inputIds = { dm: 'dm-url', ks: 'ks-url', bl: 'bl-url' };
      var inputId = inputIds[platform];
      var input = inputId ? byId(inputId) : null;
      var raw = input ? input.value : '';
      var url = liveResolveRoomUrl(platform, raw);
      if (!url) {
        showToast('请先填写直播间链接或房间号', 'error');
        return;
      }
      if (window.petBridge && typeof window.petBridge.openExternal === 'function') {
        window.petBridge.openExternal(url);
      } else {
        showToast('要用桌面端（独立模式）才能跳转浏览器', 'error');
      }
    }

    /** 底部唯一按钮：未监听就启动当前平台（成功后直接开小窗），已在监听就停止。 */
    function liveToggleCurrent() {
      var button = byId('live-start');
      if (button) button.disabled = true;
      var platform = liveCurrent;
      if (liveReadingPlatform(platform)) {
        var stopper = liveStoppers[platform];
        if (!stopper) { liveSyncStartBtn(); return; }
        Promise.resolve(stopper()).then(function () { liveSyncStartBtn(); }, function () { liveSyncStartBtn(); });
        return;
      }
      var starter = liveStarters[platform];
      if (!starter) { liveSyncStartBtn(); return; }
      Promise.resolve(starter()).then(function () {
        liveSyncStartBtn();
        // 各平台的 start 自己吞错并把失败写进状态行；只有真起来了才开小窗。
        if (liveReadingPlatform(platform)) liveOpenMini(platform);
      }, function () { liveSyncStartBtn(); });
    }

    function selectLive(platform) {
      if (LIVE_PLATFORMS.indexOf(platform) < 0) return;
      if (platform === liveCurrent) return;
      liveSaveCurrent();
      liveCurrent = platform;
      liveApplySelection();
      liveRefreshCurrent();
    }

    function setLiveDialog(open) {
      var d = liveDialogEl();
      if (!d) return;
      if (!open) {
        liveSaveCurrent();
        d.setAttribute('hidden', '');
        return;
      }
      d.removeAttribute('hidden');
      liveApplySelection();
      liveRefreshCurrent();
    }

    // 独立窗口内的关闭动作：优先走主进程桥关窗；桥缺失时 standalone 页自己 window.close()，
    // 普通控制台页则退回隐藏页内弹窗。
    function closeLiveWindow() {
      if (hasCloseLiveBridge) { window.petBridge.closeLive(); return; }
      if (LIVE_STANDALONE) { window.close(); return; }
      setLiveDialog(false);
    }

    function wireLiveDialog() {
      var openBtn = byId('live-open');
      var dialog = liveDialogEl();
      var closeBtn = byId('live-close');
      if (openBtn && dialog) {
        openBtn.addEventListener('click', function () {
          // 直播间统一为控制台页内 HTML 弹窗：不再另开独立桌面窗口；看弹幕仍走「弹幕小窗」。
          if (dialog.hasAttribute('hidden')) setLiveDialog(true);
          else setLiveDialog(false);
        });
      }
      if (closeBtn) closeBtn.addEventListener('click', function () {
        if (LIVE_STANDALONE) closeLiveWindow();
        else setLiveDialog(false);
      });
      var startBtn = byId('live-start');
      if (startBtn) startBtn.addEventListener('click', liveToggleCurrent);
      LIVE_PLATFORMS.forEach(function (p) {
        var statusRefresh = byId(p + '-refresh');
        if (statusRefresh) statusRefresh.addEventListener('click', function () {
          setStatus(byId(liveMsgNodes[p]), '');
          var refresher = liveRefreshers[p];
          if (!refresher) return;
          void refresher().catch(function (error) {
            setStatus(byId(liveMsgNodes[p]), (error && error.message) || String(error), 'error');
          });
        });
      });
      var openMiniBtn = byId('live-open-mini');
      if (openMiniBtn) openMiniBtn.addEventListener('click', function () {
        liveOpenMini(liveCurrent);
      });
      if (dialog) {
        dialog.addEventListener('click', function (event) {
          // 独立窗口里直播间就是整页主体，点空白不关闭；只在页内弹窗模式下点遮罩才收弹窗。
          if (LIVE_STANDALONE) return;
          if (event.target === dialog) setLiveDialog(false);
        });
      }
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !liveIsOpen()) return;
        if (LIVE_STANDALONE) closeLiveWindow();
        else setLiveDialog(false);
      });
      LIVE_PLATFORMS.forEach(function (p) {
        var logo = document.querySelector('[data-select="' + p + '"]');
        if (logo) logo.addEventListener('click', function () { selectLive(p); });
      });
      ['dm', 'ks', 'bl'].forEach(function (p) {
        var openRoom = byId(p + '-open-live');
        if (openRoom) openRoom.addEventListener('click', function () { liveOpenRoom(p); });
      });
      liveApplySelection();
    }

    // 抖音入口：对话入口右侧的抖音 logo 按钮，点开就是弹幕弹窗。
    wireDanmakuDialog();
    // 小红书入口：抖音 logo 右侧的按钮，打开中控台弹幕弹窗。
    wireXhsDialog();
    // 快手入口：直连 WSS 弹幕弹窗。
    wireKsDialog();
    // B 站入口：直连 WSS 弹幕弹窗。
    wireBiliDialog();
    // 统一直播间弹窗：单一入口，左侧平台单选，右侧弹幕流。
    wireLiveDialog();

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
    byId('console-sync').addEventListener('click', function () { void syncDefault(); });
    byId('advanced-sync').addEventListener('click', function () { void syncDefault('advanced-status', 'advanced-sync'); });

    // 独立直播间窗口：隐藏控制台主体与对话弹窗，直播间作为整页主体直接展开。
    if (LIVE_STANDALONE) {
      document.body.classList.add('live-standalone');
      setLiveDialog(true);
    }
    // 弹幕小窗：同一页的紧凑模式——固定暗色、只留弹幕区，平台由开窗时传进来的 p 决定，窗内不能切平台。
    if (LIVE_MINI) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('live-mini');
      if (LIVE_PLATFORMS.indexOf(LIVE_MINI_PLATFORM) >= 0) liveCurrent = LIVE_MINI_PLATFORM;
      var miniTitle = byId('live-dialog-title');
      if (miniTitle) miniTitle.textContent = '弹幕';
      setLiveDialog(true);
    }
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
body{margin:0;background-color:var(--bg-base);background-image:url('/standalone-console/console-bg.webp');background-size:cover;background-position:center top;background-repeat:no-repeat;color:var(--label-primary);font:15px/1.5 var(--font);-webkit-font-smoothing:antialiased}
html[data-theme=dark] body{background-image:none}
.console{max-width:1080px;margin:0 auto;padding:28px 28px 104px;display:flex;flex-direction:column;gap:18px}
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
.petListTitle{color:var(--label-secondary);font-size:14px;font-weight:600}
.avatars{display:flex;gap:14px;flex-wrap:wrap}
.avatar{position:relative;width:76px;padding:8px 6px;border-radius:18px;border:1.5px dashed var(--border);background:transparent;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;font:inherit}
.avatar img{width:52px;height:52px;border-radius:14px;object-fit:cover}
.avatarLabel{max-width:66px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--label-tertiary)}
.avatar.active{border-style:solid;border-color:var(--primary)}
.avatar.active .avatarLabel{color:var(--primary)}
.avatar .plus{font-size:26px;color:var(--primary);height:52px;display:flex;align-items:center}
.addAvatar{justify-content:center;border-style:dashed}
.avatar .check{position:absolute;right:-4px;top:-4px;width:20px;height:20px;border-radius:50%;background:var(--primary);color:#fff;font-size:12px;display:flex;align-items:center;justify-content:center}
/* 桌面主区：左侧宠物头像网格，右侧设置入口图标格 */
.desktop{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:start}
.petDesk{display:flex;flex-direction:column;gap:14px;min-width:0}
.deskSectionHead{display:flex;align-items:center;gap:10px;color:var(--label-secondary)}
.settingsGrid{display:grid;grid-template-columns:repeat(2,minmax(118px,1fr));gap:14px;align-content:start}
.deskEntry{display:flex;flex-direction:column;align-items:center;gap:9px;padding:18px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);box-shadow:var(--shadow);cursor:pointer;font:inherit;color:var(--label-primary);transition:border-color .15s ease,transform .12s ease}
.deskEntry:hover{border-color:var(--primary);transform:translateY(-2px)}
.deskEntry:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.deskEntryIcon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:14px;background:rgba(0,122,255,.10);color:var(--primary)}
.deskEntryLabel{font-size:13px;color:var(--label-secondary)}
.dangerEntry .deskEntryIcon{background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)}
.dangerEntry .deskEntryLabel{color:var(--danger)}
.dangerEntry:hover{border-color:var(--danger)}
.dangerEntry:hover .deskEntryIcon{background:color-mix(in srgb,var(--danger) 18%,transparent)}
@media (max-width:880px){.desktop{grid-template-columns:1fr}.settingsGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.petConfigBody{display:grid;grid-template-columns:240px 1fr;gap:22px;align-items:start}
.petConfigBody>.fields{min-width:0}
.personaBlock{margin-top:18px;display:flex;flex-direction:column;gap:6px;min-width:0}
@media (max-width:880px){.petConfigBody{grid-template-columns:1fr}}
.avatarBox{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:6px 14px;text-align:center}
.avatarBox img{width:140px;height:140px;max-width:100%;object-fit:contain;border-radius:16px}
.fields{display:grid;grid-template-columns:1fr 1fr;gap:14px 18px}
.fieldRow{display:flex;flex-direction:column;gap:6px;min-width:0}
/* 宠物字段区：两列网格，行距、控件高度、角落按钮整体收紧，仅作用于本区，不影响其他卡片 */
.petFields{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px}
.petFields .fieldRow{gap:4px}
.petFields .fieldInput{height:32px}
.petFields .cornerRow{gap:6px}
.petFields .corner{height:30px}
.petFields .switchLine{font-size:13px}
.fieldRow.wide{grid-column:1/-1}
.fieldGap{margin-top:14px}
.switchGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:880px){.fields,.petFields{grid-template-columns:1fr}.fieldRow.wide,.switchPair{grid-column:auto}}
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
.status{margin:0;color:var(--label-tertiary);font-size:13px;min-height:20px;flex:1}
.btn{height:38px;padding:0 20px;border-radius:12px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid transparent}
.btn.primary{background:var(--primary);color:#fff}
.btn.primary:hover{background:var(--primary-hover)}
.btn.ghost{background:var(--bg-card);border-color:var(--border);color:var(--label-secondary)}
.btn.ghost.danger{color:var(--danger)}
.btn:disabled{opacity:.55;cursor:default}
/* 底部 Dock 功能区：悬浮居中圆角长条，对话 icon 在左、直播间 icon 在右，毛玻璃底 */
.dockBar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:24px;background:color-mix(in srgb,var(--bg-card) 84%,transparent);border:1px solid var(--border);box-shadow:var(--shadow);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4)}
/* Dock 内入口：圆形图标按钮 */
.chatEntry{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:50%;border:1px solid var(--border);background:var(--bg-card);color:var(--primary);cursor:pointer;padding:0;transition:background .15s ease,color .15s ease}
.chatEntry:hover{background:rgba(0,122,255,.10)}
.chatEntry:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
html[data-theme=dark] .chatEntry:hover{background:rgba(10,132,255,.20)}
/* Dock 状态小字 */
.dockStatus{font-size:12px;color:var(--label-tertiary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 设置面板：居中模态浮层，内容为原配置卡片 */
.panelMask{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(17,20,26,.42)}
.panelDialog{width:min(720px,100%);max-height:86vh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-card);border:1px solid var(--border);border-radius:20px;box-shadow:0 10px 40px rgba(0,0,0,.24)}
.panelBody{flex:1 1 auto;min-height:0;overflow-y:auto;padding:20px 22px}
.panelBody .card{margin-bottom:0;box-shadow:none;padding:0;overflow:visible;border:none}
.panelClose{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--label-secondary);cursor:pointer;padding:0;flex:none}
.panelClose:hover{color:var(--primary);border-color:var(--primary)}
@media (max-width:880px){.panelMask{padding:12px}.panelDialog{width:100%;max-height:100%;border-radius:16px}}
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
/* 平台弹幕入口：透明底，彩色 logo 由 SVG 自身铺圆角，不套黑色容器 */
.dmEntry{border-radius:10px;background:transparent;border-color:transparent;color:#fff;padding:0}
.dmEntry svg{width:36px;height:36px;display:block}
.dmEntry:hover{background:rgba(0,0,0,.06)}
html[data-theme=dark] .dmEntry{border-color:transparent}
html[data-theme=dark] .dmEntry:hover{background:rgba(255,255,255,.08)}
/* 直播间窗口：顶部平台 logo 当 Tab，中间当前平台配置，底部一键开始监听；弹幕区只在小窗里出现 */
.liveDialog{width:min(900px,100%);height:min(88vh,860px);border-radius:26px;box-shadow:0 28px 80px rgba(20,40,80,.22),0 2px 8px rgba(20,40,80,.06)}
.liveDialog .chatHead{padding:22px 26px 18px;gap:16px}
.liveDialog .chatTitle{font-size:21px;font-weight:700;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:10px}
.liveStatusLight{flex:none;width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--label-tertiary) 55%,transparent);transition:background .2s ease,box-shadow .2s ease}
.liveStatusLight.on{background:#34c759;box-shadow:0 0 0 4px color-mix(in srgb,#34c759 18%,transparent)}
.liveDialog .chatClose{width:38px;height:38px;border-radius:50%;border-color:color-mix(in srgb,var(--label-primary) 12%,var(--border));color:var(--label-tertiary)}
.liveDialog .chatClose:hover{color:var(--label-primary);border-color:color-mix(in srgb,var(--label-primary) 30%,var(--border));background:color-mix(in srgb,var(--label-primary) 5%,var(--bg-card))}
.liveBody{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:22px 26px 24px;overflow:hidden}
.liveMain{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0}
body:not(.live-mini) .liveMain{display:none}
.liveHeadRight{display:flex;align-items:center;gap:12px}
.liveLogoRow{display:flex;align-items:center;gap:10px}
.liveLogo{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:46px;padding:0 16px;border-radius:14px;border:1px solid color-mix(in srgb,var(--label-primary) 10%,var(--border));background:var(--bg-card);color:var(--label-secondary);cursor:pointer;transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease}
.liveLogo:hover{border-color:color-mix(in srgb,var(--primary) 45%,var(--border));box-shadow:0 4px 12px color-mix(in srgb,var(--primary) 14%,transparent)}
.liveLogo.is-active{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 7%,var(--bg-card));color:var(--primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 12%,transparent)}
.liveLogoIcon{display:inline-flex;align-items:center;justify-content:center}
.liveLogoIcon svg{width:22px;height:22px}
.liveLogoName{font-size:14px;font-weight:650;line-height:1;white-space:nowrap}
.liveLogo .livePill{position:absolute;top:6px;right:7px;width:8px;height:8px;border-radius:50%;padding:0}
.livePill.on{background:#34c759;box-shadow:0 0 0 2px var(--bg-card)}
.livePill.off{background:color-mix(in srgb,var(--label-tertiary) 45%,transparent)}
/* 配置在主区里直接摊开，不再是从右侧滑出的抽屉 */
.liveConfigPane{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;padding:0 2px 0}
.liveConfig{display:flex;flex-direction:column;min-height:0}
.liveConfigTitle{display:none}
.liveConfigBody{padding:0 2px}
.liveConfigPanel{display:none;flex-direction:column;gap:16px}
.liveConfigPanel.is-active{display:flex}
.liveConfigPanel .dmCard{border-color:color-mix(in srgb,var(--label-primary) 9%,var(--border));background:var(--bg-card);border-radius:20px;padding:24px}
.liveConfigPanel .dmCard .status{margin-top:12px}
.liveConfigPanel .dmCard .status:empty{display:none}
/* 配置页小美化：输入框聚焦光环 */
.liveConfigPanel .fieldInput{height:52px;border-radius:14px;padding:0 16px;background:var(--bg-card);font-size:15px;transition:border-color .15s ease,box-shadow .15s ease}
.liveConfigPanel .fieldInput.area{height:auto;min-height:112px;padding:14px 16px;line-height:1.55}
.liveConfigPanel .fieldInput:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 14%,transparent)}
.liveConfigPanel .dmLabel{font-size:15px;font-weight:600;color:var(--label-primary)}
.liveConfigPanel .dmLabelOpt{margin-left:6px;font-size:13px;font-weight:400;color:var(--label-tertiary)}
/* 链接输入框独占一行 */
.liveUrlRow{display:flex;gap:12px}
.liveUrlRow .fieldInput{flex:1;min-width:0}
/* 状态行左下方的纯文本「打开直播间」 */
.liveOpenLiveRow{margin:6px 4px 0}
.liveOpenLiveText{border:0;background:none;padding:0;font:inherit;font-size:13px;line-height:1.6;color:var(--label-tertiary);cursor:pointer;white-space:nowrap}
.liveOpenLiveText:hover{color:var(--primary);text-decoration:underline}
/* 监听状态只占一行文字：圆点 + 摘要，必要时补第二行提示 */
.liveStatus{display:flex;flex-wrap:wrap;align-items:center;column-gap:7px;row-gap:3px;margin:0 4px;font-size:14px;line-height:1.6;color:var(--label-tertiary);word-break:break-word}
.liveStatusRow{display:flex;align-items:flex-start;gap:10px;margin:0 4px}
.liveStatusRow .liveStatus{flex:1 1 auto;min-width:0;margin:0}
.liveStatusRefresh{flex:none;margin-left:auto;border:0;background:none;padding:0;font:inherit;font-size:13px;line-height:1.6;color:var(--label-tertiary);cursor:pointer;white-space:nowrap}
.liveStatusRefresh:hover{color:var(--primary);text-decoration:underline}
.liveLoginNote{margin:0;font-size:13.5px;line-height:1.7;color:var(--label-secondary)}
.liveStatus.on .statusText{color:var(--label-secondary)}
.liveStatus .statusDot{flex:none;width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--label-tertiary) 55%,transparent)}
.liveStatus.on .statusDot{background:#34c759}
.liveStatus .statusNote{flex-basis:100%;color:var(--label-tertiary)}
.liveFoot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:18px 26px 22px;margin-top:18px;border-top:1px solid var(--border)}
.liveFootLeft{display:flex;align-items:center;min-width:0}
.liveFootSwitches{display:none;align-items:center;gap:20px}
.liveFootSwitches.is-active{display:flex}
.liveFootSwitches .dmSwitch{flex:none;border-left:0;padding:6px 2px}
.liveFootSwitches .dmSwitch:hover{background:transparent}
.liveFootRight{display:flex;align-items:center;gap:12px;margin-left:auto}
.liveFoot .btn{height:52px;border-radius:14px;padding:0 26px;font-size:15px}
.liveFoot .btn.primary{background:var(--primary);box-shadow:0 10px 24px color-mix(in srgb,var(--primary) 30%,transparent)}
.liveFoot .btn.primary:hover{background:var(--primary-hover)}
body.live-mini .liveConfigPane{display:none!important}
.liveFeedPanel{display:none;flex:1 1 auto;min-height:0}
.liveFeedPanel.is-active{display:flex;flex-direction:column}
.liveFeedPanel .dmFeedCard{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.liveFeedPanel .dmFeed{flex:1 1 auto;max-height:none;min-height:0}
.liveFeedPanel .dmGiftCard{flex:none;display:flex;flex-direction:column;min-height:0;margin-bottom:10px}
.liveFeedPanel .dmGift{flex:none;max-height:26vh;overflow-y:auto;min-height:0}
/* 抖音弹幕弹窗：左列表单与状态、右列弹幕流；小屏落成一列 */
.dmDialog{width:min(980px,100%);height:min(90vh,860px)}
.dmBody{flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 18px 20px}
.dmGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
.dmCol{display:flex;flex-direction:column;gap:14px;min-width:0}
.dmCard{padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card)}
.dmCardTitle{margin:0 0 10px;font-size:15px;font-weight:650}
.dmField{display:flex;flex-direction:column;gap:6px;margin-top:12px}
.dmLabel{font-size:13px;color:var(--label-secondary)}
.dmSwitches{display:flex;margin-top:18px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);overflow:hidden}
.dmSwitch{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:1 1 0;padding:12px 14px;font-size:13.5px;color:var(--label-secondary);cursor:pointer;user-select:none;border-left:1px solid var(--border)}
.dmSwitch:first-child{border-left:0}
.dmSwitch:hover{background:color-mix(in srgb,var(--primary) 6%,transparent)}
.dmSwitch input{position:relative;flex:none;width:42px;height:24px;margin:0;border-radius:999px;background:var(--border);-webkit-appearance:none;appearance:none;cursor:pointer;transition:background-color .15s ease}
.dmSwitch input::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform .15s ease}
.dmSwitch input:checked{background:#34c759}
.dmSwitch input:checked::after{transform:translateX(18px)}
.dmActions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}
.dmStatusBox{padding:12px 14px;border-radius:10px;background:color-mix(in srgb,var(--label-primary) 6%,transparent);font-size:13px;line-height:1.65;color:var(--label-secondary);word-break:break-word}
.dmPill{display:inline-flex;align-items:center;margin:0 0 6px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:600;background:color-mix(in srgb,var(--label-primary) 12%,transparent);color:var(--label-tertiary)}
.dmPill.on{background:color-mix(in srgb,#34c759 16%,transparent);color:#248a3d}
.dmPill.off{background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)}
.dmStatusLine{display:block;white-space:pre-line}
.dmCardHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}
.dmCardHead .dmCardTitle{margin:0}
.dmFeedMeta{flex:none;padding:2px 9px;border-radius:999px;background:color-mix(in srgb,var(--label-primary) 6%,transparent);font-size:11px;line-height:1.6;color:var(--label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
/* 礼物区玻璃卡：金色调，独立于弹幕区；窄屏/小窗里压缩高度，超出滚动 */
.dmGiftCard{position:relative;padding:10px 12px 10px;border:1px solid color-mix(in srgb,#ffb340 38%,var(--border));border-radius:16px;
background:linear-gradient(158deg,color-mix(in srgb,#ffb340 8%,var(--bg-card)),var(--bg-card) 48%,color-mix(in srgb,#ffcf7d 7%,var(--bg-card)));
box-shadow:inset 0 1px 0 rgba(255,255,255,.5),var(--shadow)}
.dmGiftCard .dmCardHead{padding:0 4px;margin:0 0 8px}
.dmGiftCard .dmCardTitle{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;letter-spacing:.02em}
.dmGiftCard .dmCardTitle::before{content:"";flex:none;width:4px;height:13px;border-radius:2px;background:linear-gradient(180deg,#ffd389,#ee8b00)}
.dmGiftCard .dmFeedMeta{padding:2px 10px;border:1px solid color-mix(in srgb,#ffb340 32%,transparent);background:color-mix(in srgb,#ffb340 12%,transparent);color:#b26a00;font-weight:600}
.dmGift{display:flex;flex-direction:column;gap:6px;padding:6px;border:1px solid color-mix(in srgb,#ffb340 18%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--label-primary) 3%,transparent);font-size:12.5px;line-height:1.5;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--label-primary) 22%,transparent) transparent}
.dmGift:empty::before{content:"暂无礼物";margin:auto;padding:8px 12px;text-align:center;color:var(--label-tertiary);font-size:12px}
html[data-theme=dark] .dmGiftCard{border-color:rgba(255,179,64,.4);background:linear-gradient(158deg,rgba(255,179,64,.1),rgba(255,179,64,.02) 48%)}
html[data-theme=dark] .dmGiftCard .dmFeedMeta{color:#ffd7a3;border-color:rgba(255,179,64,.34)}
html[data-theme=dark] .dmGift{border-color:rgba(255,179,64,.2);background:rgba(255,255,255,.02)}
/* 弹幕区玻璃卡：面板 → 头像/昵称色/正文 → 礼物金色卡；明暗两套主题共用令牌，深色另给一组玻璃覆盖 */
.dmFeedCard{position:relative;padding:12px 12px 10px;border:1px solid color-mix(in srgb,var(--primary) 18%,var(--border));border-radius:18px;
background:linear-gradient(158deg,color-mix(in srgb,var(--primary) 9%,var(--bg-card)),var(--bg-card) 46%,color-mix(in srgb,#6fa8ff 8%,var(--bg-card)));
box-shadow:inset 0 1px 0 rgba(255,255,255,.55),var(--shadow)}
.dmFeedCard .dmCardHead{padding:0 4px}
.dmFeedCard .dmCardTitle{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:650;letter-spacing:.02em}
.dmFeedCard .dmCardTitle::before{content:"";flex:none;width:4px;height:14px;border-radius:2px;background:linear-gradient(180deg,#5aa9ff,#007aff);box-shadow:0 0 8px color-mix(in srgb,var(--primary) 45%,transparent)}
.dmFeedCard .dmFeedMeta{padding:2px 10px;border:1px solid color-mix(in srgb,var(--primary) 22%,transparent);background:color-mix(in srgb,var(--primary) 10%,transparent);color:var(--primary);font-weight:600}
.dmFeed{display:flex;flex-direction:column;gap:8px;min-height:180px;max-height:56vh;overflow-y:auto;padding:8px;border:1px solid color-mix(in srgb,var(--primary) 10%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--label-primary) 3%,transparent);font-size:13px;line-height:1.5;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--label-primary) 22%,transparent) transparent}
.dmFeed:empty::before{content:"开始监听后，弹幕会出现在这里";margin:auto;padding:20px 12px;text-align:center;color:var(--label-tertiary)}
.dmFeedItem{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 12px 8px 8px;border:1px solid color-mix(in srgb,var(--border) 60%,transparent);border-radius:12px;background:color-mix(in srgb,var(--bg-card) 84%,transparent);box-shadow:0 1px 2px rgba(16,40,80,.05);transition:border-color .15s ease,background-color .15s ease}
.dmFeedItem.chat:hover{border-color:color-mix(in srgb,var(--primary) 26%,var(--border))}
.dmFeedItem.gift{border-color:color-mix(in srgb,#ffb340 52%,var(--border));background:linear-gradient(100deg,color-mix(in srgb,#ffb340 18%,var(--bg-card)),color-mix(in srgb,#ff8a00 6%,var(--bg-card)))}
.dmFeedAva{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border-radius:50%;font-size:12px;font-weight:700;line-height:1;color:#fff;box-shadow:0 2px 6px rgba(16,40,80,.18);user-select:none}
.dmFeedAva.va1{background:linear-gradient(155deg,#63b0ff,#007aff)}
.dmFeedAva.va2{background:linear-gradient(155deg,#5fe0d1,#00998f)}
.dmFeedAva.va3{background:linear-gradient(155deg,#ffc766,#e3860b)}
.dmFeedAva.va4{background:linear-gradient(155deg,#ab9bff,#6042cc)}
.dmFeedAva.va5{background:linear-gradient(155deg,#ff93b2,#dd3a64)}
.dmFeedItem.gift .dmFeedAva{background:linear-gradient(155deg,#ffd389,#ee8b00)}
.dmFeedBody{min-width:0;font-size:13px;line-height:1.48}
.dmFeedNick{display:inline;font-size:12.5px;font-weight:650;color:var(--label-secondary);word-break:break-word}
.dmFeedNick::after{content:"：";font-weight:400;color:var(--label-tertiary)}
.dmFeedNick.nk1{color:#007aff}
.dmFeedNick.nk2{color:#0b9c8f}
.dmFeedNick.nk3{color:#b26a00}
.dmFeedNick.nk4{color:#6b46c9}
.dmFeedNick.nk5{color:#c93d69}
.dmFeedText{display:inline;color:var(--label-primary);word-break:break-word}
.dmFeedItem.gift .dmFeedText{color:#a86100}
.dmFeedTime{align-self:start;margin-top:3px;font-size:11px;color:var(--label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
@keyframes dmFeedIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
.dmFeedItem.dmFresh{animation:dmFeedIn .34s cubic-bezier(.22,.85,.25,1) both}
@media (prefers-reduced-motion:reduce){.dmFeedItem.dmFresh{animation:none}}
html[data-theme=dark] .dmFeedCard{border-color:rgba(120,170,255,.24);
background:linear-gradient(158deg,rgba(44,70,118,.52),rgba(18,24,38,.82) 52%,rgba(10,16,28,.9));
box-shadow:inset 0 1px 0 rgba(255,255,255,.10),0 10px 30px rgba(0,0,0,.5)}
html[data-theme=dark] .dmFeed{border-color:rgba(120,170,255,.16);background:rgba(255,255,255,.03)}
html[data-theme=dark] .dmFeedItem{background:rgba(255,255,255,.035);border-color:rgba(120,170,255,.16);box-shadow:none}
html[data-theme=dark] .dmFeedItem.gift{border-color:rgba(255,179,64,.44);background:linear-gradient(100deg,rgba(255,179,64,.16),rgba(255,138,0,.05))}
html[data-theme=dark] .dmFeedItem.gift .dmFeedText{color:#ffd7a3}
html[data-theme=dark] .dmFeedNick.nk1{color:#5aa9ff}
html[data-theme=dark] .dmFeedNick.nk2{color:#4fd8c8}
html[data-theme=dark] .dmFeedNick.nk3{color:#ffc06a}
html[data-theme=dark] .dmFeedNick.nk4{color:#b1a2ff}
html[data-theme=dark] .dmFeedNick.nk5{color:#ff9fbb}
/* 停止监听沿用旧页红色按钮口径 */
.btn.danger{background:color-mix(in srgb,var(--danger) 14%,transparent);border-color:transparent;color:var(--danger)}
.btn.danger:hover{background:color-mix(in srgb,var(--danger) 22%,transparent)}
/* 保存结果气泡：底部居中浮层，成功主色点、失败红点亮，自动浮现与收起，不遮挡页面点击 */
.toastRoot{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.toast{display:flex;align-items:center;gap:9px;max-width:min(420px,86vw);padding:11px 16px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border);box-shadow:var(--shadow);color:var(--label-primary);font-size:14px;line-height:1.5;opacity:0;transform:translateY(10px);transition:opacity .22s ease,transform .22s ease}
.toastShow{opacity:1;transform:translateY(0)}
.toast::before{content:"";width:8px;height:8px;border-radius:50%;flex:none}
.toastOk::before{background:var(--primary)}
.toastError::before{background:var(--danger)}
/* 窄屏（含控制台自己的单列断点）：弹窗吃满遮罩内可用的宽高，避免小屏还要滚动 */
@media (max-width:880px){.chatMask{padding:12px}.chatDialog{width:100%;height:100%;border-radius:16px}.dmFeed{max-height:44vh}.liveMain{min-height:280px}.liveConfig{width:min(320px,100%)}}
/* 独立直播间窗口：无边框卡片铺满整窗；控制台主体与对话弹窗隐藏，头部作为窗口拖动区 */
body.live-standalone .console,
body.live-standalone #chat-dialog,
body.live-standalone .dockBar{display:none!important}
body.live-standalone #live-dialog{position:fixed;inset:0;z-index:40;display:flex;align-items:stretch;justify-content:stretch;padding:0;background:var(--bg-base)}
body.live-standalone .liveDialog{width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;align-items:center}
body.live-standalone .liveDialog .chatHead,
body.live-standalone .liveDialog .liveBody,
body.live-standalone .liveDialog .liveFoot{width:100%;max-width:980px}
body.live-standalone .liveDialog .chatHead{-webkit-app-region:drag}
body.live-standalone .liveDialog .chatClose,
body.live-standalone .liveLogo{-webkit-app-region:no-drag}
/* 弹幕小窗（直播伴侣式浮窗）：整窗只有一行头部 + 礼物/弹幕两区，固定深色，不跟随明暗主题 */
body.live-mini{background:#070d18;color:#e8eefb}
body.live-mini #live-dialog{padding:0;align-items:stretch;justify-content:stretch;background:#070d18}
body.live-mini .liveDialog{width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:linear-gradient(180deg,#0b1422,#070d18 62%);color:#e8eefb}
/* 独立模式的 align-items:center 会把子元素缩成内容宽；小窗可见的礼物/弹幕区在 .liveMain 里，
   不在上面 chatHead/liveBody/liveFoot 的补宽名单中，这里补满整窗宽度，头部同步去掉 980px 上限 */
body.live-mini .liveDialog .chatHead,body.live-mini .liveDialog .liveMain{width:100%;max-width:none}
body.live-mini .liveDialog .chatHead{padding:12px 14px;gap:10px;border-bottom:1px solid rgba(255,255,255,.06);background:transparent}
body.live-mini .liveDialog .chatTitle{display:inline-flex;align-items:center;gap:0;font-size:15px;font-weight:700;letter-spacing:.02em;color:#eaf1fb}
body.live-mini .liveStatusLight{display:none!important}
body.live-mini .liveLogoRow{display:none!important}
body.live-mini .chatClose{width:30px;height:30px;border-radius:10px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.05);color:#9fb0c8}
body.live-mini .chatClose:hover{color:#eaf1fb;border-color:rgba(255,255,255,.18);background:rgba(255,255,255,.08)}
body.live-mini .liveBody{display:none!important}
body.live-mini .liveFoot{display:none!important}
body.live-mini .liveFeedPanel.is-active{padding:12px 12px 10px;border:0;border-radius:0;background:transparent;gap:16px}
body.live-mini .liveFeedPanel .dmGiftCard,
body.live-mini .liveFeedPanel .dmFeedCard{margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
body.live-mini .dmGiftCard .dmCardHead,
body.live-mini .dmFeedCard .dmCardHead{margin:0 0 8px;padding:0 2px}
body.live-mini .dmGiftCard .dmCardTitle,
body.live-mini .dmFeedCard .dmCardTitle{font-size:14px;font-weight:700;gap:8px;color:#eaf1fb}
body.live-mini .dmGiftCard .dmCardTitle::before{height:13px;width:4px;border-radius:2px;background:linear-gradient(180deg,#ffd389,#ee8b00)}
body.live-mini .dmFeedCard .dmCardTitle::before{height:13px;width:4px;border-radius:2px;background:linear-gradient(180deg,#5aa9ff,#007aff)}
body.live-mini .dmGiftCard .dmFeedMeta{padding:1px 9px;font-size:11px;border-radius:999px;border:1px solid rgba(255,179,64,.30);background:rgba(255,179,64,.12);color:#ffcf7d;font-weight:600}
body.live-mini .dmFeedCard .dmFeedMeta{padding:1px 9px;font-size:11px;border-radius:999px;border:1px solid rgba(120,170,255,.22);background:rgba(120,170,255,.10);color:#a9bfdc;font-weight:600}
body.live-mini .dmGift{gap:6px;padding:0;border:0;background:transparent;border-radius:0;max-height:30vh}
body.live-mini .dmGift:empty::before{font-size:11px;color:#7e90a8}
body.live-mini .dmFeed{gap:6px;padding:0;border:0;background:transparent;border-radius:0}
body.live-mini .dmFeed:empty::before{font-size:12px;color:#7e90a8}
body.live-mini .dmFeedItem{gap:8px;padding:7px 10px 7px 7px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);box-shadow:none}
body.live-mini .dmFeedItem.chat:hover{border-color:rgba(120,170,255,.28)}
body.live-mini .dmFeedItem.gift{border-color:rgba(255,179,64,.32);background:linear-gradient(100deg,rgba(255,179,64,.15),rgba(255,138,0,.05))}
body.live-mini .dmFeedAva{width:24px;height:24px;font-size:11.5px;box-shadow:none}
body.live-mini .dmFeedBody{font-size:12.5px;line-height:1.5;color:#e8eefb}
body.live-mini .dmFeedNick{font-size:12.5px;font-weight:650;color:#c7d4e8}
body.live-mini .dmFeedNick.nk1{color:#5aa9ff}
body.live-mini .dmFeedNick.nk2{color:#4fd8c8}
body.live-mini .dmFeedNick.nk3{color:#ffc06a}
body.live-mini .dmFeedNick.nk4{color:#b1a2ff}
body.live-mini .dmFeedNick.nk5{color:#ff9fbb}
body.live-mini .dmFeedNick::after{color:#7e90a8}
body.live-mini .dmFeedText{color:#e8eefb}
body.live-mini .dmFeedItem.gift .dmFeedText{color:#ffe0ad}
body.live-mini .dmFeedTime{display:none}
body.live-mini .toastRoot{bottom:16px}
${PANEL_CSS}
`;
