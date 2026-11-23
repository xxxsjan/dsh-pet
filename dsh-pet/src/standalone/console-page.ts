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
import { BREEZE_API_KEY_URL, FISH_API_KEY_URL } from '../shared/voice-links.ts';
import { PANEL_CSS } from '../client/chat/panel-css.ts';
import { giftIconUrlMapJson } from './live-gift-icon.ts';
import { dyEmojiNameMapJson } from './dy-emoji.ts';
import { xhsEmojiUrlMapJson } from './xhs-emoji.ts';

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
<div class="liveMonitorCard" id="live-monitor-card" hidden>
  <div class="lmHead">
    <span class="lmDot" aria-hidden="true"></span>
    <span class="lmState">监听中</span>
    <span class="lmPlat" id="lm-plat"></span>
    <button type="button" class="lmStop" id="lm-stop">停止监听</button>
  </div>
  <div class="lmTitle" id="lm-title"></div>
  <div class="lmMeta">
    <span>主播 <b id="lm-anchor"></b></span>
    <span>房间 <b id="lm-room"></b></span>
    <span>弹幕 <b id="lm-chat"></b> / 礼物 <b id="lm-gift"></b></span>
  </div>
  <div class="lmUrl">
    <svg class="lmUrlIco" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.6 9.4a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5l-1.2 1.2"/><path d="M9.4 6.6a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5l1.2-1.2"/></svg>
    <span class="lmUrlText" id="lm-url"></span>
    <a class="lmOpen" id="lm-mini" href="#">弹幕小窗 ›</a>
    <a class="lmOpen" id="lm-open" href="#">跳转直播间 ›</a>
  </div>
</div>
</div>
<div class="liveEntryGrid" role="group" aria-label="直播平台入口">
<button type="button" class="deskEntry liveDeskEntry" data-live="dm" title="抖音直播间配置" aria-label="打开抖音直播间配置"><span class="deskEntryIcon"><svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#161823"/><g transform="translate(3.9 3.2) scale(0.74)"><path d="M14.2 6.2c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S5.1 16.95 5.1 14.4s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V6.2h2.15z" fill="#25F4EE"/><path d="M13.85 5.85c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S4.75 16.6 4.75 14.05s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V5.85h2.15z" fill="#FE2C55"/><path d="M13.5 5.5c.55 1.35 1.7 2.35 3.15 2.7v2.15c-1.15-.1-2.2-.5-3.05-1.15v4.55c0 2.55-2.05 4.6-4.6 4.6S4.4 16.25 4.4 13.7s2.05-4.6 4.6-4.6c.25 0 .5.02.75.07v2.25a2.4 2.4 0 0 0-.75-.12c-1.3 0-2.35 1.05-2.35 2.35s1.05 2.35 2.35 2.35 2.35-1.05 2.35-2.35V5.5H13.5z" fill="#FFFFFF"/></g></svg></span><span class="deskEntryLabel">抖音</span><span class="livePill off" data-pill="dm" aria-hidden="true"></span></button>
<button type="button" class="deskEntry liveDeskEntry" data-live="ks" title="快手直播间配置" aria-label="打开快手直播间配置"><span class="deskEntryIcon"><svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FF4906"/><path d="M9.2 7.4c0-.55.45-.9.95-.65l7.1 4.1c.5.28.5 1.02 0 1.3l-7.1 4.1c-.5.28-.95-.1-.95-.65V7.4z" fill="#fff"/></svg></span><span class="deskEntryLabel">快手</span><span class="livePill off" data-pill="ks" aria-hidden="true"></span></button>
<button type="button" class="deskEntry liveDeskEntry" data-live="xs" title="小红书直播间配置" aria-label="打开小红书直播间配置"><span class="deskEntryIcon"><svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FF2442"/><text x="12" y="12.8" text-anchor="middle" dominant-baseline="middle" fill="#FFFFFF" font-size="6.2" font-weight="700" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC, sans-serif" letter-spacing="-0.35">小红书</text></svg></span><span class="deskEntryLabel">小红书</span><span class="livePill off" data-pill="xs" aria-hidden="true"></span></button>
<button type="button" class="deskEntry liveDeskEntry" data-live="bl" title="B站直播间配置" aria-label="打开B站直播间配置"><span class="deskEntryIcon"><svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#FB7299"/><path fill="#fff" d="M7.2 7.1 5.5 5.4l1.1-1.1 2.1 2.1h6.6l2.1-2.1 1.1 1.1-1.7 1.7H18c.7 0 1.2.5 1.2 1.2v8.2c0 .7-.5 1.2-1.2 1.2H6c-.7 0-1.2-.5-1.2-1.2V8.3c0-.7.5-1.2 1.2-1.2h1.2zm1.3 2.4c-.5 0-.9.4-.9.9v4.2c0 .5.4.9.9.9h7c.5 0 .9-.4.9-.9V10.4c0-.5-.4-.9-.9-.9h-7zm1.2 1.5h1.5v2.8H9.7v-2.8zm3.4 0h1.5v2.8h-1.5v-2.8z"/></svg></span><span class="deskEntryLabel">B站</span><span class="livePill off" data-pill="bl" aria-hidden="true"></span></button>
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
<div class="petGrid">
<div class="petAside">
<div class="petPreview">
<div class="petPreviewCard"><img id="pet-avatar-img" alt=""></div>
<button type="button" class="btn ghost" id="pet-avatar-upload" hidden>上传头像</button>
<input type="file" id="pet-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
<span class="petPreviewCaption">宠物预览</span>
</div>
<section class="petPanel petPanel--aside">
<div class="petPanelHead"><h3 class="petPanelTitle">位置设置</h3></div>
<div class="petPosStack">
<div class="petPosCorners"><span class="fieldLabel">停靠角落</span><div class="cornerRow" id="pet-corner-row">
<button type="button" class="corner" data-corner="top-left">左上角</button>
<button type="button" class="corner" data-corner="top-right">右上角</button>
<button type="button" class="corner" data-corner="bottom-left">左下角</button>
<button type="button" class="corner" data-corner="bottom-right">右下角</button>
</div></div>
<div class="fields petFields petFields--margins">
<div class="fieldRow"><label class="fieldLabel" for="pet-margin-x">水平偏移（px）</label><input class="fieldInput" id="pet-margin-x" type="number" step="1"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-margin-y">垂直偏移（px）</label><input class="fieldInput" id="pet-margin-y" type="number" step="1"></div>
</div>
</div>
</section>
</div>
<div class="petPanels">
<section class="petPanel">
<div class="petPanelHead"><h3 class="petPanelTitle">基础信息</h3></div>
<div class="fields petFields">
<div class="fieldRow"><label class="fieldLabel" for="pet-name">名字</label><input class="fieldInput" id="pet-name" type="text" autocomplete="off"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-id">标识 (id)</label><input class="fieldInput" id="pet-id" type="text" disabled></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-size">大小（宽度 px）</label><input class="fieldInput" id="pet-size" type="number" min="1" step="1"></div>
<div class="fieldRow"><label class="fieldLabel" for="pet-size-percent">占屏宽度（%）</label><input class="fieldInput" id="pet-size-percent" type="number" min="1" step="1" placeholder="留空 = 按 px 显示"></div>
</div>
</section>
<section class="petPanel">
<div class="petPanelHead"><h3 class="petPanelTitle">行为设置</h3></div>
<div class="fields petFields">
<div class="fieldRow"><div class="switchLine"><span>余额功能</span><button type="button" class="switch" data-switch="pet-balance" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>碎碎念</span><button type="button" class="switch" data-switch="pet-whisper" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>工作状态联动</span><button type="button" class="switch" data-switch="pet-work" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>固定不动</span><button type="button" class="switch" data-switch="pet-fixed" aria-checked="false"></button></div></div>
<div class="fieldRow"><div class="switchLine"><span>点击音效</span><button type="button" class="switch" data-switch="pet-click" aria-checked="false"></button></div></div>
<div class="fieldRow petVolumeField"><label class="fieldLabel" for="pet-click-volume">点击音效音量 <output id="pet-click-volume-value" for="pet-click-volume">0.50</output></label><input class="petVolumeRange" id="pet-click-volume" type="range" min="0" max="1" step="0.05" aria-label="点击音效音量（0–1）"><span class="fieldHint">1 = 100%；短提示音不做增益放大。只影响这只宠物。</span></div>
</div>
</section>
</div>
<section class="petPanel petPanel--wide">
<div class="petPanelHead"><h3 class="petPanelTitle">人设</h3></div>
<div class="personaBlock">
<div class="fieldRow wide">
<label class="fieldLabel" for="pet-persona">这只的人设（可选）</label>
<textarea class="fieldInput area" id="pet-persona" rows="3" maxlength="4000"></textarea>
<div class="personaFoot"><span class="fieldHint" id="pet-persona-hint"></span><div class="personaActions"><button type="button" class="secondaryBtn compact" id="pet-persona-reset">重置</button><span class="personaCount" id="pet-persona-count">0 字</span></div></div>
<span class="fieldHint">发给模型的 system = 这段 + 自动追加的名字与时间背景，别在这里重复写。</span>
</div>
</div>
</section>
<div class="petBottomActions"><span class="voiceStatus" id="pet-status" role="status" aria-live="polite"></span><div class="petPanelActs"><button type="button" class="btn ghost danger" id="pet-delete">删除</button><button type="button" class="btn primary" id="pet-save">保存</button></div></div>
</div>
</div>
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
<div class="switchLine"><span>碎碎念配图</span><button type="button" class="switch" data-switch="g-whisper-image" aria-checked="false"></button></div>
<div class="switchLine"><span>对话配图</span><button type="button" class="switch" data-switch="g-chat-image" aria-checked="false"></button></div>
<div class="switchLine"><span>对话动作联动</span><button type="button" class="switch" data-switch="g-chat-anim" aria-checked="false"></button></div>
<div class="switchLine"><span>锁定在当前屏幕</span><button type="button" class="switch" data-switch="g-confine" aria-checked="false"></button></div>
<div class="switchLine"><span>系统托盘图标</span><button type="button" class="switch" data-switch="g-tray" aria-checked="false"></button></div>
<div class="switchLine"><span>窗口模式</span><button type="button" class="switch" data-switch="g-obs" aria-checked="false"></button></div>
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
<div class="keyInputRow"><input class="fieldInput" type="password" id="voice-fish-key" autocomplete="off"><button type="button" class="btn ghost" id="voice-fish-link">获取 API Key</button></div>
<span class="voiceStatus" id="voice-fish-key-status" role="status"></span>
</div>
<div class="fieldRow wide keyRow" id="breeze-key-row" hidden>
<label class="fieldLabel" for="voice-breeze-key">Breeze Blue API Key（xi-api-key）</label>
<div class="keyInputRow"><input class="fieldInput" type="password" id="voice-breeze-key" autocomplete="off"><button type="button" class="btn ghost" id="voice-breeze-link">获取 API Key</button></div>
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
<div class="customVoiceList" id="voice-breeze-custom-list"></div>
<span class="voiceStatus" id="voice-breeze-custom-status" role="status"></span>
</div>
<div class="fieldRow voiceVolumeField"><label class="fieldLabel" for="voice-rate">语速（0.5–2）<output id="voice-rate-value" for="voice-rate">1.00</output></label><input class="voiceVolumeRange" type="range" id="voice-rate" min="0.5" max="2" step="0.05" aria-label="语速（0.5–2）"></div>
<div class="fieldRow voiceVolumeField"><label class="fieldLabel" for="voice-volume">音量（0–3，最高 300%）<output id="voice-volume-value" for="voice-volume">1.00</output></label><input class="voiceVolumeRange" type="range" id="voice-volume" min="0" max="3" step="0.05" aria-label="音量（0–3，最高 300%）"></div>
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
<nav class="dockBar" aria-label="功能入口"><button type="button" class="chatEntry" id="chat-open" aria-label="打开对话窗口" title="对话"><svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M3 3.4h10a1.1 1.1 0 0 1 1.1 1.1v5.6A1.1 1.1 0 0 1 13 11.2H8.2L5 13.6v-2.4H3a1.1 1.1 0 0 1-1.1-1.1V4.5A1.1 1.1 0 0 1 3 3.4Z"/></svg></button><span class="dockStatus" id="console-status" role="status" aria-live="polite"></span></nav>
<div class="chatMask" id="chat-dialog" hidden>
<div class="chatDialog" role="dialog" aria-modal="true" aria-labelledby="chat-dialog-title">
<div class="chatHead"><h2 class="chatTitle" id="chat-dialog-title">对话</h2><button type="button" class="chatClose" id="chat-close" aria-label="关闭对话窗口"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
<div class="chatBody" id="pet-chat-root"></div>
</div>
</div>
<div class="chatMask" id="live-dialog" hidden>
<div class="chatDialog liveDialog" role="dialog" aria-modal="true" aria-labelledby="live-dialog-title">
<div class="chatHead"><h2 class="chatTitle" id="live-dialog-title"><span class="liveStatusLight" id="live-status-light" aria-hidden="true"></span>直播间<span class="liveTitlePlat" id="live-title-plat"></span><span class="liveRoomMeta" id="live-room-meta"></span></h2><div class="miniLatest" id="mini-latest"><span class="miniLatestNick" id="mini-latest-nick"></span><span class="miniLatestText" id="mini-latest-text">暂无新消息</span></div><div class="liveHeadRight"><button type="button" class="chatClose miniCollapseBtn" id="live-collapse" aria-label="折叠为标题栏" aria-expanded="true" title="折叠"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4"/></svg></button><button type="button" class="chatClose miniOpacityBtn" id="live-opacity" aria-label="调节窗口透明度" aria-expanded="false" title="调节透明度"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5.2"/><path d="M8 2.8a5.2 5.2 0 0 1 0 10.4Z" fill="currentColor" stroke="none"/></svg></button><button type="button" class="chatClose" id="live-close" aria-label="关闭直播间窗口"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div></div>
<div class="miniStats" id="mini-stats"><span class="miniStat"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><b id="mini-stat-viewer">—</b></span><span class="miniStat"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5 12 8c1-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg><b id="mini-stat-gift">0</b></span><span class="miniStat" title="本场累计点赞"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg><b id="mini-stat-like">0</b></span></div>
<div class="liveBody">
<div class="liveConfigPane" id="live-config-pane"><div class="liveConfig" role="region" aria-labelledby="live-config-title"><span class="liveConfigTitle" id="live-config-title">抖音</span><div class="liveConfigBody">
<div class="livePlatform" data-platform="dm">
<div class="liveConfigPanel" data-panel="dm">
<div class="dmCard">
<div class="dmField"><div class="liveUrlLabelRow"><label class="dmLabel" for="dm-url">直播间链接或房间号</label><button type="button" class="liveOpenLiveText" id="dm-open-live" title="用浏览器跳转直播间">跳转直播间</button></div><div class="liveUrlRow"><input class="fieldInput" id="dm-url" type="text" placeholder="粘贴直播间链接，或直接填纯数字房间号" autocomplete="off" spellcheck="false"></div><div class="liveIdHistory" id="dm-url-history" role="group" aria-label="最近使用的房间号"></div></div>
<div class="dmField"><div class="dmCookieLabelRow"><label class="dmLabel" for="dm-cookie">Cookie <span class="dmLabelOpt">可选</span></label><div class="dmCookieRow"><button type="button" class="liveStatusRefresh" id="dm-check-cookie" title="校验 Cookie 有效性（进房接口回显登录态 + 游客占位判定）">检测 Cookie</button><button type="button" class="liveStatusRefresh dmCookieGuideBtn" data-cookie-guide="dm">获取 Cookie</button></div></div><textarea class="fieldInput area" id="dm-cookie" placeholder="不填将弹出窗口扫码登录；有登录 Cookie 可粘贴到这里" spellcheck="false"></textarea></div>
<p class="dmCookieNote">提示：该账号若已在其他直播间观看（如手机端），开始监听会将其从原直播间踢出。</p>
<p class="status" id="dm-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow" hidden><p class="liveStatus" id="dm-status">加载中…</p></div>
<div class="liveOpenLiveRow"><button type="button" class="liveStatusRefresh" id="dm-refresh">刷新状态</button></div>
</div>
</div>
<div class="livePlatform" data-platform="xs">
<div class="liveConfigPanel" data-panel="xs">
<div class="dmCard">
<p class="liveLoginNote">小红书需要扫码登录后使用。</p>
<p class="status" id="xs-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow" hidden><p class="liveStatus" id="xs-status">加载中…</p></div>
<div class="liveOpenLiveRow"><button type="button" class="liveStatusRefresh" id="xs-refresh">刷新状态</button></div>
</div>
</div>
<div class="livePlatform" data-platform="ks">
<div class="liveConfigPanel" data-panel="ks">
<div class="dmCard">
<div class="dmField"><div class="liveUrlLabelRow"><label class="dmLabel" for="ks-url">直播间链接或主播短链</label><button type="button" class="liveOpenLiveText" id="ks-open-live" title="用浏览器跳转直播间">跳转直播间</button></div><div class="liveUrlRow"><input class="fieldInput" id="ks-url" type="text" placeholder="粘贴直播间链接，或直接填主播短链 / 裸 id" autocomplete="off" spellcheck="false"></div><div class="liveIdHistory" id="ks-url-history" role="group" aria-label="最近使用的房间号"></div></div>
<div class="dmField"><div class="dmCookieLabelRow"><label class="dmLabel" for="ks-cookie">Cookie <span class="dmLabelOpt">必填</span></label><div class="dmCookieRow"><button type="button" class="liveStatusRefresh dmCookieGuideBtn" data-cookie-guide="ks">获取 Cookie</button></div></div><textarea class="fieldInput area" id="ks-cookie" placeholder="请粘贴登录 Cookie（必须包含 userId + passToken/web_st/webday7_st）" spellcheck="false"></textarea></div>
<p class="status" id="ks-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow" hidden><p class="liveStatus" id="ks-status">加载中…</p></div>
<div class="liveOpenLiveRow"><button type="button" class="liveStatusRefresh" id="ks-refresh">刷新状态</button></div>
</div>
</div>
<div class="livePlatform" data-platform="bl">
<div class="liveConfigPanel" data-panel="bl">
<div class="dmCard">
<div class="dmField"><div class="liveUrlLabelRow"><label class="dmLabel" for="bl-url">直播间链接或房间号</label><button type="button" class="liveOpenLiveText" id="bl-open-live" title="用浏览器跳转直播间">跳转直播间</button></div><div class="liveUrlRow"><input class="fieldInput" id="bl-url" type="text" placeholder="粘贴直播间链接，或直接填裸房间号" autocomplete="off" spellcheck="false"></div><div class="liveIdHistory" id="bl-url-history" role="group" aria-label="最近使用的房间号"></div></div>
<div class="dmField"><div class="dmCookieLabelRow"><label class="dmLabel" for="bl-cookie">Cookie <span class="dmLabelOpt">可选</span></label><div class="dmCookieRow"><button type="button" class="liveStatusRefresh dmCookieGuideBtn" data-cookie-guide="bl">获取 Cookie</button></div></div><textarea class="fieldInput area" id="bl-cookie" placeholder="不填走访客匿名；登录可粘贴 SESSDATA，失效会自动回落访客" spellcheck="false"></textarea></div>
<p class="status" id="bl-msg" role="status" aria-live="polite"></p>
</div>
<div class="liveStatusRow" hidden><p class="liveStatus" id="bl-status">加载中…</p></div>
<div class="liveOpenLiveRow"><button type="button" class="liveStatusRefresh" id="bl-refresh">刷新状态</button></div>
</div>
</div>
</div>
</div>
</div>
</div>
<div class="liveFoot"><div class="liveFootLeft"><div class="liveFootSwitches is-active" data-foot-switches="dm"><label class="dmSwitch"><span>回复弹幕</span><input id="dm-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="dm-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="xs"><label class="dmSwitch"><span>回复弹幕</span><input id="xs-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="xs-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="ks"><label class="dmSwitch"><span>回复弹幕</span><input id="ks-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="ks-thank-gift" type="checkbox"></label></div><div class="liveFootSwitches" data-foot-switches="bl"><label class="dmSwitch"><span>回复弹幕</span><input id="bl-reply-chat" type="checkbox"></label><label class="dmSwitch"><span>感谢礼物</span><input id="bl-thank-gift" type="checkbox"></label></div></div><div class="liveFootRight"><button type="button" class="btn primary" id="live-start">开始监听</button></div></div>
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
<div class="chatMask" id="cookie-guide-dialog" hidden>
<div class="chatDialog cookieGuideDialog" role="dialog" aria-modal="true" aria-labelledby="cookie-guide-title">
<div class="chatHead"><h2 class="chatTitle" id="cookie-guide-title">获取 Cookie 教程</h2><button type="button" class="chatClose" id="cookie-guide-close" aria-label="关闭 Cookie 教程"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button></div>
<div class="cookieGuideBody"><ol class="cookieGuideSteps"><li>在浏览器登录对应直播平台。</li><li>按 <b>F12</b> 打开开发者工具，切到 <b>Network</b>。</li><li>刷新直播间页面，在请求列表中选择任意直播或文档请求。</li><li>在 <b>Headers → Request Headers</b> 中找到 <b>Cookie</b>，复制整行值。</li><li id="cookie-guide-key">再将完整 Cookie 粘贴到输入框。</li></ol><div class="cookieGuideImageWrap"><img class="cookieGuideImage" src="/standalone-console/cookie-guide-network.png" alt="浏览器 Network 面板中复制 Cookie 的示例"></div></div>
</div>
</div>
<div class="chatMask" id="dm-kick-dialog" hidden>
<div class="chatDialog kickDialog" role="alertdialog" aria-modal="true" aria-labelledby="dm-kick-title">
<div class="chatHead"><h2 class="chatTitle" id="dm-kick-title">弹幕连接已中断</h2></div>
<div class="kickBody"><p class="kickText" id="dm-kick-text">该账号疑似已在其他设备进入别的直播间，本地弹幕监听被挤下线。要立即重连吗？</p></div>
<div class="kickFoot"><button type="button" class="btn ghost" id="dm-kick-later">暂不重连</button><button type="button" class="btn primary" id="dm-kick-retry">重连</button></div>
</div>
</div>
<div class="miniOpacityPop" id="mini-opacity-pop" role="group" aria-label="窗口透明度" hidden><span class="miniOpacityLabel">透明度</span><input class="miniOpacityRange" id="mini-opacity-range" type="range" min="20" max="100" step="5" value="100" aria-label="窗口透明度"><span class="miniOpacityValue" id="mini-opacity-value">100%</span></div>
<div class="miniClosePop" id="mini-close-pop" role="dialog" aria-labelledby="mini-close-title" hidden><p class="miniCloseTitle" id="mini-close-title">关闭小窗时，是否停止监听？</p><div class="miniCloseActions"><button type="button" class="miniCloseBtn is-stop" id="mini-close-stop">停止监听并关闭</button><button type="button" class="miniCloseBtn" id="mini-close-only">只关闭小窗</button></div></div>
<noscript>需要启用 JavaScript 才能使用控制台。请从桌宠右键菜单打开本页。</noscript>
<div id="toast-root" class="toastRoot" aria-live="polite"></div>
</body></html>`;
}

/** 控制台页面脚本：各分区读写本机 `/config`，语音分区另接 `/voice/speak` 试听。 */
export const consoleScript = `
(function () {
  var API = ${JSON.stringify(ROUTE_SEGMENT)};
  var BREEZE_KEY_URL = ${JSON.stringify(BREEZE_API_KEY_URL)};
  var FISH_KEY_URL = ${JSON.stringify(FISH_API_KEY_URL)};
  var TOKEN = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  // 独立直播间窗口：主进程以 ?live=1 打开本页，隐藏控制台表单、直播间铺满整窗；
  // 普通控制台页与无 Electron 桥的网页/预览环境不置该标志，行为回落到页内弹窗。
  // 必须在下面的 replaceState 清掉 query 之前读取，否则刷新后标志取不到。
  var LIVE_STANDALONE = new URLSearchParams(location.search).get('live') === '1';
  // 小弹窗模式：主进程以 ?live=1&mini=1&p=xx 打开无边框置顶浮窗，只留弹幕区，固定暗色（直播伴侣那种小窗）。
  // p 是控制台「开始监听」时选中的平台，小窗按它显示对应平台的弹幕，窗口内不再提供切平台。
  var LIVE_MINI = new URLSearchParams(location.search).get('mini') === '1';
  var LIVE_MINI_PLATFORM = new URLSearchParams(location.search).get('p') || '';
  // 礼物名 → 同源取图地址：表在 src/standalone/live-gift-icon.ts，页面 CSP 只有 img-src 'self'，
  // 所以走本机 /standalone-console/gift-icon 代取，未收录的礼物继续用金色礼物托。
  var GIFT_ICON_URLS = ${giftIconUrlMapJson()};
  // 抖音自定义表情：表内 token 才挂图（表在 src/standalone/dy-emoji-table.ts），
  // 未收录的 [名字] 原样显示文字，不会出现裂图。
  var DY_EMOJI_NAMES = ${dyEmojiNameMapJson()};
  var DY_EMOJI_TOKEN_RE = /\\[[^[\\]\\s]{1,20}\\]/g;
  // 小红书表情：名字（含别名写法）→ 同源取图地址，表在 src/standalone/xhs-emoji.ts。
  // 站内 token 带 R/H 后缀，查表前要去掉，规则与后端归一一致。
  var XHS_EMOJI_URLS = ${xhsEmojiUrlMapJson()};
  // 小窗礼物行的金色礼物托（取不到官方图时的占位）
  var GIFT_TILE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5 12 8c1-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';
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
  // 小窗透明度（20%–100%）存在本机，下次开小窗沿用；只影响小窗整块面板，不改字号与排版。
  var MINI_ALPHA_KEY = 'blue_fish_live_mini_alpha';
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
  /** 底部按钮的启动/停止请求还没回包（'start' / 'stop'）：期间按钮保持 loading 动效，轮询不许翻文案。 */
  var liveStartBusy = '';
  function liveDialogEl() { return byId('live-dialog'); }
  function liveIsOpen() { var d = liveDialogEl(); return !!d && !d.hasAttribute('hidden'); }
  /** 某平台是否在监听：控制台平台入口卡角上的小圆点是唯一事实来源，四平台的状态渲染与底部按钮都读它。 */
  function liveReadingPlatform(platform) {
    var pill = document.querySelector('[data-pill="' + platform + '"]');
    return !!(pill && pill.classList.contains('on'));
  }
  /** 底部「开始/停止监听」：未监听显示开始（主色），已监听显示停止（危险色）；请求在途时切 loading 动效。 */
  function liveSyncStartBtn(listening) {
    var button = byId('live-start');
    var running = typeof listening === 'boolean' ? listening : liveReadingPlatform(liveCurrent);
    var light = byId('live-status-light');
    if (light) light.classList.toggle('on', !!running);
    if (!button) return;
    // 启动/停止还没回包：锁定按钮并转圈，别被 3s 状态轮询把文案翻回去。
    if (liveStartBusy) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = liveStartBusy === 'stop' ? '停止中…' : '连接中…';
      button.className = (running ? 'btn danger' : 'btn primary') + ' is-busy';
      return;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = running ? '停止监听' : '开始监听';
    button.className = running ? 'btn danger' : 'btn primary';
  }
  function liveSyncPill(platform, listening) {
    var pill = document.querySelector('[data-pill="' + platform + '"]');
    if (pill) pill.className = 'livePill ' + (listening ? 'on' : 'off');
    // 底部「开始/停止监听」跟随当前平台的真实状态一起翻，避免两处口径不一致。
    if (platform === liveCurrent) liveSyncStartBtn(listening);
  }
  /** 停止监听成功后同步关弹幕小窗：只关展示该平台的小窗；网页/预览没有桥，静默跳过。 */
  function liveCloseMini(platform) {
    if (window.petBridge && typeof window.petBridge.closeLiveMini === 'function') {
      window.petBridge.closeLiveMini(platform);
    }
  }
  // 弹幕小窗统计行：在线观众人数 + 礼物数 + 本场累计点赞；弹幕数已从这里移除（主窗监控卡仍保留 chatCount）。
  /** 统计数字缩略：万位以上用 W（28000 → 2.8W），亿位保留亿；原始值放到 title 里可悬停查看。 */
  function miniFormatCount(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/[.]0$/, '') + '亿';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/[.]0$/, '') + 'W';
    return String(Math.floor(n));
  }
  function miniSyncStats(platform, status) {
    if (!LIVE_MINI || platform !== liveCurrent) return;
    var viewerNode = byId('mini-stat-viewer');
    var giftNode = byId('mini-stat-gift');
    var likeNode = byId('mini-stat-like');
    if (viewerNode) {
      // 负数 / 缺字段 = 本场还没收到平台在线统计帧，用占位符，不冒充 0 人。
      var viewers = Number(status && status.viewerCount);
      viewerNode.textContent = viewers >= 0 ? miniFormatCount(viewers) : '—';
      viewerNode.title = viewers >= 0 ? String(viewers) : '';
    }
    if (giftNode) giftNode.textContent = String(Number(status && status.giftCount) || 0);
    // 抖音 / 快手回 likeCount（本场累计点赞）；其余平台缺字段时显示 0，不冒装有点赞。
    if (likeNode) {
      var likes = Number(status && status.likeCount) || 0;
      likeNode.textContent = miniFormatCount(likes);
      likeNode.title = String(likes);
    }
    // 小窗没有状态行：下播时在统计行右侧挂一个「已下播」小胶囊，关掉再出现即摘掉。
    var statsRow = byId('mini-stats');
    if (statsRow) {
      var endedTag = statsRow.querySelector('.miniEndedTag');
      if (status && status.ended) {
        if (!endedTag) statsRow.appendChild(dmNode('span', 'miniEndedTag', '已下播'));
      } else if (endedTag && endedTag.parentNode) {
        endedTag.parentNode.removeChild(endedTag);
      }
    }
  }
  // 折叠态标题让位给最新一条消息：取 recent 里 id 最大的一条（老数据没有 id 时退化成数组最后一条）。
  function miniLatestItem(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var latest = null;
    var latestId = -1;
    list.forEach(function (item) {
      var id = Number(item && item.id);
      if (!Number.isFinite(id)) id = -1;
      // >= 让「没有 id」的列表也能取到最后一条。
      if (!latest || id >= latestId) { latest = item; latestId = id; }
    });
    return latest;
  }
  function miniSyncLatest(recent) {
    if (!LIVE_MINI) return;
    var nickNode = byId('mini-latest-nick');
    var textNode = byId('mini-latest-text');
    if (!nickNode || !textNode) return;
    var item = miniLatestItem(recent);
    if (!item) {
      nickNode.textContent = '';
      textNode.textContent = '暂无新消息';
      return;
    }
    var isGift = item.kind === 'gift';
    var body = String(item.text || (isGift ? '礼物' : ''));
    if (isGift) body = '送了 ' + body + ' ×' + Math.max(1, Number(item.count) || 1);
    nickNode.textContent = String(item.nick || '匿名');
    // 弹幕用「昵称：正文」，礼物用「昵称 送了 xx ×n」，跟展开态文案口径一致。
    textNode.textContent = (isGift ? ' ' : '：') + body;
  }
  // 小窗礼物行的礼物托：礼物名在图标表里就放真实礼物图，否则保持金色礼盒占位。
  function dmGiftTile(giftName, platform, imageUrl) {
    var tile = dmNode('span', 'dmGiftTile');
    var key = String(platform || '') + '|' + String(giftName == null ? '' : giftName).trim();
    var src = platform === 'douyin' && imageUrl
      ? '/standalone-console/gift-icon?p=douyin&u=' + encodeURIComponent(String(imageUrl))
      : '';
    if (!src) src = giftName ? GIFT_ICON_URLS[key] || '' : '';
    if (!src) {
      tile.innerHTML = GIFT_TILE_SVG;
      return tile;
    }
    tile.classList.add('dmGiftReal');
    var img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.setAttribute('referrerpolicy', 'no-referrer');
    // 取图失败（离线或上游 404）：退回金色礼盒，不留白框
    img.addEventListener('error', function () {
      tile.classList.remove('dmGiftReal');
      tile.textContent = '';
      tile.innerHTML = GIFT_TILE_SVG;
    });
    tile.appendChild(img);
    return tile;
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
  var DM_POLL_MS = 1000;
  var dmListening = false;
  /** 下播提示只弹一次：状态里 ended 由 false→true 时提示，回到非 ended 时重置。 */
  var dmEndedNotified = false;
  /** 小红书/快手/B站通用的下播提示去重表：platform → 是否已弹过。 */
  var endedNotifiedMap = {};
  /** 下播自动停听的一次性提示（与抖音 dmEndedNotified 同语义，三平台共用）。 */
  function platformEndedToast(platform, status) {
    var isEnded = status.ended === true;
    if (!isEnded) {
      delete endedNotifiedMap[platform];
      return;
    }
    if (endedNotifiedMap[platform]) return;
    endedNotifiedMap[platform] = true;
    showToast(
      status.startedAt ? '主播已下播，已自动停止监听' : '主播已下播，等开播后再开始监听',
      'error',
    );
  }
  var dmLastFeedId = 0;
  var dmFeedSignature = '';
  var dmFeedNodes = new Map();
  var dmGiftNodes = new Map();
  var dmFeedQueue = [];
  var dmFeedQueueTimer = null;
  var dmStickBottom = true;
  var dmLastGiftId = 0;
  var dmGiftStickBottom = true;
  var dmLastStatusUrl = '';
  var dmSessionStartedAt = null;
  /** 被挤下线确认框每次中断只弹一次：状态 interrupted 回到 false 时重置。 */
  var dmKickPrompted = false;

  function dmNode(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  /**
   * 弹幕正文：把抖音的 [微笑] 这类 token 换成表情图，其余原样按文本节点渲染。
   * 只动已知 token（DY_EMOJI_NAMES），取图失败退回原 token，不留裂图或空位。
   */
  function dmRichText(text) {
    var node = dmNode('span', 'dmFeedText');
    var raw = String(text == null ? '' : text);
    if (raw.indexOf('[') < 0) {
      node.textContent = raw;
      return node;
    }
    var last = 0;
    var m;
    DY_EMOJI_TOKEN_RE.lastIndex = 0;
    while ((m = DY_EMOJI_TOKEN_RE.exec(raw)) !== null) {
      var token = m[0];
      if (!DY_EMOJI_NAMES[token]) continue;
      if (m.index > last) node.appendChild(document.createTextNode(raw.slice(last, m.index)));
      node.appendChild(dmEmojiImg(token));
      last = m.index + token.length;
    }
    if (last < raw.length) node.appendChild(document.createTextNode(raw.slice(last)));
    return node;
  }
  /** 单个表情图：alt 保留 [名字] 语义，加载失败就地换回文字；src 缺省走抖音取图路由。
   *  title 另给时按它显示（小红书 token 带 R/H 后缀，悬停不该看到那截后缀）。
   *  上游偶发限流会回 404，先带 cache-buster 重试一次，仍失败才退回文字。 */
  function dmEmojiImg(token, src, title) {
    var img = document.createElement('img');
    img.className = 'dmEmoji';
    img.alt = token;
    img.title = title || token.slice(1, -1);
    img.setAttribute('referrerpolicy', 'no-referrer');
    var baseSrc = src || '/standalone-console/emoji?n=' + encodeURIComponent(token);
    img.src = baseSrc;
    img.addEventListener('error', function () {
      if (!img.dataset.retried) {
        img.dataset.retried = '1';
        setTimeout(function () {
          img.src = baseSrc + (baseSrc.indexOf('?') < 0 ? '?' : '&') + 'r=1';
        }, 500);
        return;
      }
      var text = document.createTextNode(token);
      if (img.parentNode) img.parentNode.replaceChild(text, img);
    });
    return img;
  }
  /**
   * 配置页那一行监听状态：一个小圆点 + 一行摘要；只有扫码/报错这类需要用户动手的提示才补第二行。
   * 不再占一整块卡片或灰底方块。
   */
  function renderLiveStatus(box, listening, summary, note, ended) {
    if (!box) return;
    box.textContent = '';
    if (listening) box.classList.add('on');
    else box.classList.remove('on');
    var text = ended ? '已下播' : (listening ? '监听中' : '未监听');
    box.appendChild(dmNode('span', 'statusDot', ''));
    box.appendChild(dmNode('span', 'statusText', text + (summary ? ' · ' + summary : '')));
    if (note) box.appendChild(dmNode('span', 'statusNote', note));
  }
  /** 抖音/小红书：CDP 扫码态与最近报错压成一行提示。 */
  function dmStatusNote(status) {
    // 下播是终点状态：收过播说「自动停止」，从没开起来就说「等开播再点」——别拿没发生的事糊人。
    if (status.ended) {
      return status.startedAt
        ? '主播已下播，已自动停止监听'
        : '主播已下播（直播结束），等开播后再点开始监听';
    }
    if (status.interrupted) return '疑似被其他设备挤下线（可能在别的直播间），弹幕已中断';
    var note = '';
    if (status.mode === 'cdp') {
      if (status.cdpVisible && !status.cdpLoggedIn) note = '等待扫码：在弹出的窗口完成登录';
      else if (!status.cdpLoggedIn) note = '未检测到登录态：礼物、进场可能不下发，可粘贴 Cookie 后重开';
    }
    return joinNote(note, status);
  }
  /** 被挤下线确认框：只负责显隐，重连/停听的动作由按钮接线决定。 */
  function hideDmKickDialog() {
    var d = byId('dm-kick-dialog');
    if (d) d.setAttribute('hidden', '');
  }
  function showDmKickDialog() {
    var d = byId('dm-kick-dialog');
    if (!d) return;
    d.removeAttribute('hidden');
    var retry = byId('dm-kick-retry');
    if (retry) { try { retry.focus(); } catch (_) {} }
  }
  function xsStatusNote(status) {
    if (status.ended) {
      return status.startedAt
        ? '主播已下播，已自动停止监听'
        : '主播已下播（直播结束），等开播后再点开始监听';
    }
    var note = '';
    if (status.mode === 'cdp') {
      if (status.cdpVisible && !status.cdpLoggedIn) note = '等待扫码：在弹出的中控台窗口完成登录';
      else if (!status.cdpLoggedIn) note = '未检测到登录态：可粘贴 Cookie 后重开';
    }
    return joinNote(note, status);
  }
  /** 快手/B站：直连 WSS 没有扫码态，只有报错时才补一行。 */
  function wsStatusNote(status) {
    if (status.ended) {
      return status.startedAt
        ? '主播已下播，已自动停止监听'
        : '主播已下播（直播结束），等开播后再点开始监听';
    }
    return joinNote('', status);
  }
  // 下播/未开播写进 lastError 只是给状态定性，不是错误：停止监听后 ended 复位，
  // 它会被当成「最近问题」重复展示，这里滤掉；真正的报错照常显示。
  var ENDED_REASON_RE = /已下播|直播结束|未开播/;
  function joinNote(note, status) {
    var error = String((status && status.lastError) || '').trim();
    if (error && !ENDED_REASON_RE.test(error)) return (note ? note + ' · ' : '') + '最近问题：' + error;
    return note;
  }
  /** 弹幕行头像：昵称首字 + 按昵称散列的固定配色（同一人每次同色），礼物行换金色礼盒图标。 */
  function dmFeedTone(nick) {
    var text = String(nick || '匿名');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 100003;
    return (hash % 5) + 1;
  }
  /** 进场消息（来了/加入/进入…）：小窗里置灰，不跟普通弹幕抢视觉。 */
  function dmIsEntryText(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    return /^(来了|加入|进入|进来了?|光临|进房|抵达|进入直播间)/.test(t) ||
      /[ \u3000]+(来了|加入|进入|进来了?|光临|进房|抵达|进入直播间)/.test(t);
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
  function liveFeedFingerprint(list) {
    if (!Array.isArray(list)) return '';
    return list.map(function (item) {
      return [
        Number(item.id) || 0,
        String(item.kind || ''),
        String(item.nick || ''),
        String(item.text || ''),
        Number(item.count) || 0,
        String(item.giftImageUrl || ''),
      ].join('|');
    }).join(';;');
  }
  /**
   * 新行入场后的滚动：贴底时只补上新增高度，已有行停在原位不动；不贴底时完全不碰滚动位置。
   * 直接 scrollTop = scrollHeight 会把整块列表瞬间上推，看起来像所有旧消息一起抖。
   */
  function liveScrollForNewRow(box, stickToBottom) {
    if (!stickToBottom) return;
    var before = box.scrollTop;
    var overflow = Math.max(0, box.scrollHeight - box.clientHeight - before);
    box.scrollTop = before + overflow;
  }
  function dmClearFeedQueue() {
    dmFeedQueue.length = 0;
    if (dmFeedQueueTimer) {
      clearTimeout(dmFeedQueueTimer);
      dmFeedQueueTimer = null;
    }
  }
  function dmQueueFeedRow(box, row, stickToBottom) {
    dmFeedQueue.push({ box: box, row: row, stickToBottom: stickToBottom });
    if (dmFeedQueueTimer) return;
    var pump = function () {
      var next = dmFeedQueue.shift();
      if (!next) {
        dmFeedQueueTimer = null;
        return;
      }
      if (!next.row.parentNode) next.box.appendChild(next.row);
      liveScrollForNewRow(next.box, next.stickToBottom);
      dmFeedQueueTimer = setTimeout(pump, 180);
    };
    dmFeedQueueTimer = setTimeout(pump, 0);
  }
  function dmCreateGiftRow(item, prevId) {
    var nickText = String(item.nick || '匿名');
    var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
    row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
    var bodyBox = dmNode('div', 'dmFeedBody');
    if (LIVE_MINI) {
      bodyBox.appendChild(dmNode('span', 'dmFeedNick', nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedVerb', '送了'));
      bodyBox.appendChild(dmGiftTile(item.text, 'douyin', item.giftImageUrl));
      bodyBox.appendChild(dmNode('span', 'dmFeedGiftName', String(item.text || '礼物')));
      bodyBox.appendChild(dmNode('span', 'dmFeedCount', '×' + Math.max(1, Number(item.count) || 1)));
    } else {
      row.appendChild(dmFeedAvatar(nickText, 'gift'));
      bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)));
    }
    row.appendChild(bodyBox);
    row.appendChild(dmNode('span', 'dmFeedTime', dmFormatTime(item.at)));
    return row;
  }
  function dmCreateChatRow(item, prevId) {
    var nickText = String(item.nick || '匿名');
    var row = dmNode('div', 'dmFeedItem chat' + (dmIsEntryText(item.text) ? ' entry' : '') + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
    row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
    if (!LIVE_MINI) row.appendChild(dmFeedAvatar(nickText, 'chat'));
    var bodyBox = dmNode('div', 'dmFeedBody');
    bodyBox.appendChild(dmNode('span', LIVE_MINI ? 'dmFeedNick' : 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
    bodyBox.appendChild(dmRichText(item.text));
    row.appendChild(bodyBox);
    row.appendChild(dmNode('span', 'dmFeedTime', dmFormatTime(item.at)));
    return row;
  }
  function dmSyncToggle() {
    var button = byId('dm-toggle');
    if (!button) return;
    button.textContent = dmListening ? '停止监听' : '开始监听';
    button.className = dmListening ? 'btn danger' : 'btn primary';
  }
  function dmRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var nextSignature = liveFeedFingerprint(list);
    if (nextSignature === dmFeedSignature) return;
    dmFeedSignature = nextSignature;
    var prevId = dmLastFeedId;
    var chats = list.filter(function (item) { return item.kind !== 'gift'; });
    var gifts = list.filter(function (item) { return item.kind === 'gift'; });
    var giftMeta = byId('dm-gift-meta');
    if (giftMeta) giftMeta.textContent = String(gifts.length);
    var feedBox = byId('dm-feed');
    var giftBox = byId('dm-gift');
    if (!feedBox || !giftBox) return;
    if (list.length === 0) dmClearFeedQueue();
    var nearBottom = feedBox.scrollHeight - feedBox.scrollTop - feedBox.clientHeight < 48;
    var shouldStick = dmStickBottom || nearBottom;
    var maxId = 0;
    list.forEach(function (item) { maxId = Math.max(maxId, Number(item.id) || 0); });
    var maxGiftId = 0;
    gifts.forEach(function (item) { maxGiftId = Math.max(maxGiftId, Number(item.id) || 0); });
    if (list.length === 0) dmLastFeedId = 0;
    if (gifts.length === 0) dmLastGiftId = 0;
    var giftNearBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
    var shouldStickGift = dmGiftStickBottom || giftNearBottom;
    if (gifts.length === 0) {
      // 无礼物快照不等于本场已清空：轮询可能短暂落后或只带聊天帧，保留已有礼物。
    } else {
      var giftFreshIndex = 0;
      gifts.forEach(function (item) {
        var key = String(item.id);
        var signature = liveFeedFingerprint([item]);
        var existing = dmGiftNodes.get(key);
        if (existing && existing.getAttribute('data-feed-signature') !== signature) {
          // 连击数量更新只换内容，不重放入场动画：旧行本来就在屏幕上，抖动会带动整列。
          var replacement = dmCreateGiftRow(item, 0);
          replacement.classList.remove('dmFresh');
          existing.parentNode.replaceChild(replacement, existing);
          dmGiftNodes.set(key, replacement);
        } else if (!existing) {
          var newRow = dmCreateGiftRow(item, prevId);
          dmGiftNodes.set(key, newRow);
          giftFreshIndex += 1;
          dmQueueFeedRow(giftBox, newRow, shouldStickGift);
        }
      });
    }
    if (chats.length === 0) {
      // 聊天空快照同样保留最近消息，避免轮询分帧造成闪空。
    } else {
      var chatFreshIndex = 0;
      chats.forEach(function (item) {
        var key = String(item.id);
        var signature = liveFeedFingerprint([item]);
        var existing = dmFeedNodes.get(key);
        if (existing && existing.getAttribute('data-feed-signature') !== signature) {
          var replacement = dmCreateChatRow(item, 0);
          replacement.classList.remove('dmFresh');
          existing.parentNode.replaceChild(replacement, existing);
          dmFeedNodes.set(key, replacement);
        } else if (!existing) {
          var newRow = dmCreateChatRow(item, prevId);
          dmFeedNodes.set(key, newRow);
          chatFreshIndex += 1;
          dmQueueFeedRow(feedBox, newRow, shouldStick);
        }
      });
    }
    if (shouldStick && (list.length === 0 || maxId !== dmLastFeedId)) {
      liveScrollForNewRow(feedBox, true);
    }
    if (shouldStickGift && (gifts.length === 0 || maxGiftId !== dmLastGiftId)) {
      liveScrollForNewRow(giftBox, true);
    }
    dmLastFeedId = maxId;
    dmLastGiftId = maxGiftId;
    miniSyncLatest(recent);
  }
  function dmResetFeedSession() {
    dmFeedSignature = '';
    dmLastFeedId = 0;
    dmLastGiftId = 0;
    dmClearFeedQueue();
    var feedBox = byId('dm-feed');
    var giftBox = byId('dm-gift');
    dmFeedNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    dmGiftNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    dmFeedNodes.clear();
    dmGiftNodes.clear();
    if (feedBox) feedBox.textContent = '';
    if (giftBox) giftBox.textContent = '';
  }
  function dmRenderStatus(data, syncToggles) {
    var status = data || {};
    var startedAt = Number(status.startedAt) || 0;
    if (startedAt > 0 && dmSessionStartedAt !== startedAt) {
      dmSessionStartedAt = startedAt;
      dmResetFeedSession();
    }
    dmListening = !!status.listening;
    liveSyncPill('dm', dmListening);
    liveMonitorSnapshots.dm = status;
    liveSyncRoomMeta();
    miniSyncStats('dm', status);
    renderLiveMonitorCard();
    dmSyncToggle();
    if (typeof status.url === 'string' && status.url.trim()) dmLastStatusUrl = status.url.trim();
    var dmEnded = !!status.ended;
    // 下播是「自动停听」的终点：第一次拿到这个状态时提示一次，避免 3s 轮询重复弹。
    if (!dmEnded) dmEndedNotified = false;
    else if (!dmEndedNotified) {
      dmEndedNotified = true;
      showToast(
        status.startedAt ? '主播已下播，已自动停止监听' : '主播已下播，等开播后再开始监听',
        'error',
      );
    }
    // 疑似被挤下线：确认框只在「互动消息区」弹幕小窗里弹，每次中断只弹一次；
    // 恢复出帧后 status.interrupted 归 false，下次中断还能再弹。普通控制台/独立直播间窗口只留状态行旁注。
    if (!status.interrupted) dmKickPrompted = false;
    else if (!dmKickPrompted && LIVE_MINI) {
      dmKickPrompted = true;
      showDmKickDialog();
    }
    var box = byId('dm-status');
    if (box) {
      var roomId = status.roomId || dmExtractWebRid(status.url);
      var bits = [];
      if (dmListening) {
        bits.push('「' + (status.title || '未知') + '」');
        bits.push('主播 ' + (status.anchor || '未知'));
        if (roomId) bits.push('房间 ' + roomId);
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      } else if (dmEnded) {
        // 收播后仍给出「播了多久 / 收了多少」，方便回看这场的数据。
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, dmListening, bits.join(' · '), dmStatusNote(status), dmEnded);
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
  async function dmCheckCookie(button) {
    var msgEl = byId('dm-msg');
    var form = dmFormState();
    if (!form.cookie) {
      setStatus(msgEl, '请先在 Cookie 框粘贴内容，再点检测', 'warn');
      return;
    }
    var origText = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = '检测中…'; }
    setStatus(msgEl, '正在校验 Cookie（进房接口）…');
    try {
      var data = await api('POST', '/danmaku/douyin/check-cookie', { cookie: form.cookie, url: form.url }, 15000);
      if (!data) throw new Error('检测接口无响应');
      if (data.ok === true) {
        setStatus(msgEl, '✅ ' + (data.message || 'Cookie 有效'), 'ok');
      } else {
        setStatus(msgEl, '❌ ' + (data.message || 'Cookie 无效'), 'error');
      }
    } catch (error) {
      setStatus(msgEl, '❌ 检测请求失败：' + ((error && error.message) || String(error)), 'error');
    } finally {
      if (button) { button.disabled = false; button.textContent = origText || '检测 Cookie'; }
    }
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
    dmClearFeedQueue();
    var button = byId('dm-toggle');
    hideDmKickDialog();
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
      liveIdHistoryRemember('dm', (data && data.url) || dmInputValue('dm-url'));
      setStatus(byId('dm-msg'), '');
      showToast('已开始监听', 'ok');
      // 平台互斥：启动本平台会顶掉其余平台的监听；全量拉一遍，纠正它们的绿点与主页状态卡。
      void refreshLiveMonitorCard();
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('dm-msg'), '连接超时，后台可能仍在启动…');
        try { dmRenderStatus(await dmRefresh(), false); } catch (_) { dmRenderStatus(null, false); }
        showToast(dmListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        liveIdHistoryRemember('dm', dmInputValue('dm-url'));
        void refreshLiveMonitorCard();
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
    dmClearFeedQueue();
    var button = byId('dm-toggle');
    hideDmKickDialog();
    setStatus(byId('dm-msg'), '正在停止…');
    if (button) button.disabled = true;
    try {
      var data = await api('POST', '/danmaku/douyin/stop', {});
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '停止失败');
      dmRenderStatus(data, false);
      setStatus(byId('dm-msg'), '');
      setStatus(byId('dm-msg'), '已停止', 'ok');
      liveCloseMini('dm');
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
    var giftBox = byId('dm-gift');
    if (giftBox) {
      giftBox.addEventListener('scroll', function () {
        dmGiftStickBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
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
    var checkCookieBtn = byId('dm-check-cookie');
    if (checkCookieBtn) {
      checkCookieBtn.addEventListener('click', function () {
        void dmCheckCookie(checkCookieBtn);
      });
    }
    var kickRetryBtn = byId('dm-kick-retry');
    if (kickRetryBtn) {
      kickRetryBtn.addEventListener('click', function () {
        hideDmKickDialog();
        void dmStart();
      });
    }
    var kickLaterBtn = byId('dm-kick-later');
    if (kickLaterBtn) {
      kickLaterBtn.addEventListener('click', function () {
        // 「暂不重连」= 停掉本地监听；保留 lastError 让状态行继续显示被挤原因。
        hideDmKickDialog();
        void dmStop();
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
  var xsSessionStartedAt = 0;
  var xsLastFeedId = 0;
  var xsFeedSignature = '';
  var xsFeedNodes = new Map();
  var xsGiftNodes = new Map();
  var xsChatQueue = { rows: [], timer: null };
  var xsGiftQueue = { rows: [], timer: null };
  var xsStickBottom = true;
  var xsLastGiftId = 0;
  var xsGiftStickBottom = true;

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
  function xsClearFeedQueue() {
    [xsChatQueue, xsGiftQueue].forEach(function (queue) {
      queue.rows.length = 0;
      if (!queue.timer) return;
      clearTimeout(queue.timer);
      queue.timer = null;
    });
  }
  function xsQueueFeedRow(queue, box, row, stickToBottom) {
    queue.rows.push({ box: box, row: row, stickToBottom: stickToBottom });
    if (queue.timer) return;
    var pump = function () {
      var next = queue.rows.shift();
      if (!next) {
        queue.timer = null;
        return;
      }
      if (!next.row.parentNode) next.box.appendChild(next.row);
      liveScrollForNewRow(next.box, next.stickToBottom);
      queue.timer = setTimeout(pump, 180);
    };
    queue.timer = setTimeout(pump, 0);
  }
  function xsReplaceFeedRow(existing, replacement) {
    replacement.classList.remove('dmFresh');
    if (existing.parentNode) {
      existing.parentNode.replaceChild(replacement, existing);
      return;
    }
    [xsChatQueue, xsGiftQueue].forEach(function (queue) {
      queue.rows.forEach(function (entry) {
        if (entry.row === existing) entry.row = replacement;
      });
    });
  }
  function xsResetFeedSession() {
    xsFeedSignature = '';
    xsLastFeedId = 0;
    xsLastGiftId = 0;
    xsClearFeedQueue();
    xsFeedNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    xsGiftNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    xsFeedNodes.clear();
    xsGiftNodes.clear();
    var feedBox = byId('xs-feed');
    var giftBox = byId('xs-gift');
    if (feedBox) feedBox.textContent = '';
    if (giftBox) giftBox.textContent = '';
  }
  /** 小红书表情查表：去方括号后先按原名查，再去站内 R/H 后缀查一次；未收录返回空串。 */
  function xsEmojiSrc(token) {
    var name = token.slice(1, -1);
    var src = XHS_EMOJI_URLS[name];
    if (src) return src;
    if (name.length > 1 && /[RH]$/i.test(name)) return XHS_EMOJI_URLS[name.slice(0, -1)] || '';
    return '';
  }
  /** 悬停提示用裸名字：[微笑R] 显示「微笑」，不带站内后缀。 */
  function xsEmojiLabel(token) {
    var name = token.slice(1, -1);
    if (name.length > 1 && /[RH]$/i.test(name) && XHS_EMOJI_URLS[name.slice(0, -1)]) return name.slice(0, -1);
    return name;
  }
  /** 小红书弹幕正文：已知表情 token 换成图，其余原样按文本节点渲染；token 正则与抖音同一套。 */
  function xsRichText(text) {
    var node = dmNode('span', 'dmFeedText');
    var raw = String(text == null ? '' : text);
    if (raw.indexOf('[') < 0) {
      node.textContent = raw;
      return node;
    }
    var last = 0;
    var m;
    DY_EMOJI_TOKEN_RE.lastIndex = 0;
    while ((m = DY_EMOJI_TOKEN_RE.exec(raw)) !== null) {
      var token = m[0];
      var src = xsEmojiSrc(token);
      if (!src) continue;
      if (m.index > last) node.appendChild(document.createTextNode(raw.slice(last, m.index)));
      node.appendChild(dmEmojiImg(token, src, xsEmojiLabel(token)));
      last = m.index + token.length;
    }
    if (last < raw.length) node.appendChild(document.createTextNode(raw.slice(last)));
    return node;
  }
  function xsRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var nextSignature = liveFeedFingerprint(list);
    if (nextSignature === xsFeedSignature) return;
    xsFeedSignature = nextSignature;
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
    var maxGiftId = 0;
    gifts.forEach(function (item) { maxGiftId = Math.max(maxGiftId, Number(item.id) || 0); });
    if (list.length === 0) xsLastFeedId = 0;
    if (gifts.length === 0) xsLastGiftId = 0;
    var giftNearBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
    var shouldStickGift = xsGiftStickBottom || giftNearBottom;
    gifts.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      var bodyBox = dmNode('div', 'dmFeedBody');
      if (LIVE_MINI) {
        // 小窗对齐设计稿：昵称 + 送了 + 礼物托 + 礼物名 + ×数量胶囊
        bodyBox.appendChild(dmNode('span', 'dmFeedNick', nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedVerb', '送了'));
        bodyBox.appendChild(dmGiftTile(item.text, 'xiaohongshu'));
        bodyBox.appendChild(dmNode('span', 'dmFeedGiftName', String(item.text || '礼物')));
        bodyBox.appendChild(dmNode('span', 'dmFeedCount', '×' + Math.max(1, Number(item.count) || 1)));
      } else {
        row.appendChild(dmFeedAvatar(nickText, 'gift'));
        bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)));
      }
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', xsFormatTime(item.at)));
      var key = String(item.id);
      var existing = xsGiftNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        xsReplaceFeedRow(existing, row);
        xsGiftNodes.set(key, row);
      } else if (!existing) {
        xsGiftNodes.set(key, row);
        xsQueueFeedRow(xsGiftQueue, giftBox, row, shouldStickGift);
      }
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + (dmIsEntryText(item.text) ? ' entry' : '') + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      if (!LIVE_MINI) row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', LIVE_MINI ? 'dmFeedNick' : 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(xsRichText(item.text));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', xsFormatTime(item.at)));
      var key = String(item.id);
      var existing = xsFeedNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        xsReplaceFeedRow(existing, row);
        xsFeedNodes.set(key, row);
      } else if (!existing) {
        xsFeedNodes.set(key, row);
        xsQueueFeedRow(xsChatQueue, feedBox, row, shouldStick);
      }
    });
    if (shouldStick && (list.length === 0 || maxId !== xsLastFeedId)) {
      liveScrollForNewRow(feedBox, true);
    }
    if (shouldStickGift && (gifts.length === 0 || maxGiftId !== xsLastGiftId)) {
      liveScrollForNewRow(giftBox, true);
    }
    xsLastFeedId = maxId;
    xsLastGiftId = maxGiftId;
    miniSyncLatest(recent);
  }
  function xsRenderStatus(data, syncToggles) {
    var status = data || {};
    var startedAt = Number(status.startedAt) || 0;
    if (startedAt > 0 && xsSessionStartedAt !== startedAt) {
      xsSessionStartedAt = startedAt;
      xsResetFeedSession();
    }
    xsListening = !!status.listening;
    liveSyncPill('xs', xsListening);
    liveMonitorSnapshots.xs = status;
    liveSyncRoomMeta();
    miniSyncStats('xs', status);
    renderLiveMonitorCard();
    xsSyncToggle();
    platformEndedToast('xs', status);
    var xsEnded = status.ended === true;
    var box = byId('xs-status');
    if (box) {
      var bits = [];
      if (xsListening) {
        bits.push('中控台这场直播');
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      } else if (xsEnded) {
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, xsListening, bits.join(' · '), xsStatusNote(status), xsEnded);
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
    if (button) button.disabled = true;
    xsSaveCache();
    try {
      var data = await api('POST', '/danmaku/xiaohongshu/start', xsFormState(), 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      xsSaveCache();
      xsRenderStatus(data, true);
      setStatus(byId('xs-msg'), '');
      showToast('已开始监听', 'ok');
      // 平台互斥：启动本平台会顶掉其余平台的监听；全量拉一遍，纠正它们的绿点与主页状态卡。
      void refreshLiveMonitorCard();
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('xs-msg'), '连接超时，后台可能仍在启动…');
        try { xsRenderStatus(await xsRefresh(), false); } catch (_) { xsRenderStatus(null, false); }
        showToast(xsListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        void refreshLiveMonitorCard();
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
      liveCloseMini('xs');
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
    var giftBox = byId('xs-gift');
    if (giftBox) {
      giftBox.addEventListener('scroll', function () {
        xsGiftStickBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
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
  var ksSessionStartedAt = 0;
  var ksLastFeedId = 0;
  var ksFeedSignature = '';
  var ksFeedNodes = new Map();
  var ksGiftNodes = new Map();
  var ksChatQueue = { rows: [], timer: null };
  var ksGiftQueue = { rows: [], timer: null };
  var ksStickBottom = true;
  var ksLastGiftId = 0;
  var ksGiftStickBottom = true;
  /** 快手表情表：[表情名] → 图片地址，来自直播间页 webConfig，进房后由状态带回。 */
  var KS_EMOJI_URLS = {};

  /** 把快手正文里的 [表情名] token 换成表情图；未收录的 token 原样保留文本。 */
  function ksEmojiText(text) {
    var raw = String(text || '');
    if (raw.indexOf('[') < 0) return document.createTextNode(raw);
    var frag = document.createDocumentFragment();
    var last = 0;
    var i = raw.indexOf('[');
    while (i >= 0) {
      var j = raw.indexOf(']', i + 1);
      if (j < 0) break;
      var token = raw.slice(i, j + 1);
      var src = token.length <= 10 ? KS_EMOJI_URLS[token] : '';
      if (!src) {
        i = raw.indexOf('[', i + 1);
        continue;
      }
      if (i > last) frag.appendChild(document.createTextNode(raw.slice(last, i)));
      frag.appendChild(ksEmojiImg(token, src));
      last = j + 1;
      i = raw.indexOf('[', last);
    }
    if (last === 0) return document.createTextNode(raw);
    if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
    return frag;
  }

  function ksEmojiImg(token, src) {
    var img = document.createElement('img');
    img.className = 'dmEmoji';
    img.alt = token.slice(1, -1);
    img.title = img.alt;
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', function () {
      var span = document.createTextNode(token);
      if (img.parentNode) img.parentNode.replaceChild(span, img);
    });
    img.src = src;
    return img;
  }

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
  function ksClearFeedQueue() {
    [ksChatQueue, ksGiftQueue].forEach(function (queue) {
      queue.rows.length = 0;
      if (!queue.timer) return;
      clearTimeout(queue.timer);
      queue.timer = null;
    });
  }
  function ksQueueFeedRow(queue, box, row, stickToBottom) {
    queue.rows.push({ box: box, row: row, stickToBottom: stickToBottom });
    if (queue.timer) return;
    var pump = function () {
      var next = queue.rows.shift();
      if (!next) {
        queue.timer = null;
        return;
      }
      if (!next.row.parentNode) next.box.appendChild(next.row);
      liveScrollForNewRow(next.box, next.stickToBottom);
      queue.timer = setTimeout(pump, 180);
    };
    queue.timer = setTimeout(pump, 0);
  }
  function ksReplaceFeedRow(existing, replacement) {
    replacement.classList.remove('dmFresh');
    if (existing.parentNode) {
      existing.parentNode.replaceChild(replacement, existing);
      return;
    }
    [ksChatQueue, ksGiftQueue].forEach(function (queue) {
      queue.rows.forEach(function (entry) {
        if (entry.row === existing) entry.row = replacement;
      });
    });
  }
  function ksResetFeedSession() {
    ksFeedSignature = '';
    ksLastFeedId = 0;
    ksLastGiftId = 0;
    ksClearFeedQueue();
    ksFeedNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    ksGiftNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    ksFeedNodes.clear();
    ksGiftNodes.clear();
    var feedBox = byId('ks-feed');
    var giftBox = byId('ks-gift');
    if (feedBox) feedBox.textContent = '';
    if (giftBox) giftBox.textContent = '';
  }
  function ksRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var nextSignature = liveFeedFingerprint(list);
    if (nextSignature === ksFeedSignature) return;
    ksFeedSignature = nextSignature;
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
    var maxGiftId = 0;
    gifts.forEach(function (item) { maxGiftId = Math.max(maxGiftId, Number(item.id) || 0); });
    if (list.length === 0) ksLastFeedId = 0;
    if (gifts.length === 0) ksLastGiftId = 0;
    var giftNearBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
    var shouldStickGift = ksGiftStickBottom || giftNearBottom;
    gifts.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      var bodyBox = dmNode('div', 'dmFeedBody');
      if (LIVE_MINI) {
        // 小窗对齐设计稿：昵称 + 送了 + 礼物托 + 礼物名 + ×数量胶囊
        bodyBox.appendChild(dmNode('span', 'dmFeedNick', nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedVerb', '送了'));
        bodyBox.appendChild(dmGiftTile(item.text, 'kuaishou'));
        bodyBox.appendChild(dmNode('span', 'dmFeedGiftName', String(item.text || '礼物')));
        bodyBox.appendChild(dmNode('span', 'dmFeedCount', '×' + Math.max(1, Number(item.count) || 1)));
      } else {
        row.appendChild(dmFeedAvatar(nickText, 'gift'));
        bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)));
      }
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', ksFormatTime(item.at)));
      var key = String(item.id);
      var existing = ksGiftNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        ksReplaceFeedRow(existing, row);
        ksGiftNodes.set(key, row);
      } else if (!existing) {
        ksGiftNodes.set(key, row);
        ksQueueFeedRow(ksGiftQueue, giftBox, row, shouldStickGift);
      }
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + (dmIsEntryText(item.text) ? ' entry' : '') + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      if (!LIVE_MINI) row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', LIVE_MINI ? 'dmFeedNick' : 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      var textBox = dmNode('span', 'dmFeedText', '');
      textBox.appendChild(ksEmojiText(item.text));
      bodyBox.appendChild(textBox);
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', ksFormatTime(item.at)));
      var key = String(item.id);
      var existing = ksFeedNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        ksReplaceFeedRow(existing, row);
        ksFeedNodes.set(key, row);
      } else if (!existing) {
        ksFeedNodes.set(key, row);
        ksQueueFeedRow(ksChatQueue, feedBox, row, shouldStick);
      }
    });
    if (shouldStick && (list.length === 0 || maxId !== ksLastFeedId)) {
      liveScrollForNewRow(feedBox, true);
    }
    if (shouldStickGift && (gifts.length === 0 || maxGiftId !== ksLastGiftId)) {
      liveScrollForNewRow(giftBox, true);
    }
    ksLastFeedId = maxId;
    ksLastGiftId = maxGiftId;
    miniSyncLatest(recent);
  }
  function ksRenderStatus(data, syncToggles) {
    var status = data || {};
    var startedAt = Number(status.startedAt) || 0;
    if (startedAt > 0 && ksSessionStartedAt !== startedAt) {
      ksSessionStartedAt = startedAt;
      ksResetFeedSession();
    }
    if (status.emoji && typeof status.emoji === 'object') KS_EMOJI_URLS = status.emoji;
    ksListening = !!status.listening;
    liveSyncPill('ks', ksListening);
    liveMonitorSnapshots.ks = status;
    liveSyncRoomMeta();
    miniSyncStats('ks', status);
    renderLiveMonitorCard();
    ksSyncToggle();
    platformEndedToast('ks', status);
    var ksEnded = status.ended === true;
    var box = byId('ks-status');
    if (box) {
      var bits = [];
      if (ksListening) {
        bits.push('直连 WSS');
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      } else if (ksEnded) {
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, ksListening, bits.join(' · '), wsStatusNote(status), ksEnded);
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
    if (!form.cookie) {
      setStatus(byId('ks-msg'), '快手直连监听需要登录 Cookie，请在浏览器登录后复制完整 Cookie', 'error');
      return;
    }
    if (button) button.disabled = true;
    ksSaveCache();
    try {
      var data = await api('POST', '/danmaku/kuaishou/start', form, 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      ksSaveCache();
      ksRenderStatus(data, true);
      liveIdHistoryRemember('ks', ksInputValue('ks-url'));
      setStatus(byId('ks-msg'), '');
      showToast('已开始监听', 'ok');
      // 平台互斥：启动本平台会顶掉其余平台的监听；全量拉一遍，纠正它们的绿点与主页状态卡。
      void refreshLiveMonitorCard();
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('ks-msg'), '连接超时，后台可能仍在启动…');
        try { ksRenderStatus(await ksRefresh(), false); } catch (_) { ksRenderStatus(null, false); }
        showToast(ksListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        liveIdHistoryRemember('ks', ksInputValue('ks-url'));
        void refreshLiveMonitorCard();
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
      liveCloseMini('ks');
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
    var giftBox = byId('ks-gift');
    if (giftBox) {
      giftBox.addEventListener('scroll', function () {
        ksGiftStickBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
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
  var blSessionStartedAt = 0;
  var blLastFeedId = 0;
  var blFeedSignature = '';
  var blFeedNodes = new Map();
  var blGiftNodes = new Map();
  var blChatQueue = { rows: [], timer: null };
  var blGiftQueue = { rows: [], timer: null };
  var blStickBottom = true;
  var blLastGiftId = 0;
  var blGiftStickBottom = true;

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
  function blClearFeedQueue() {
    [blChatQueue, blGiftQueue].forEach(function (queue) {
      queue.rows.length = 0;
      if (!queue.timer) return;
      clearTimeout(queue.timer);
      queue.timer = null;
    });
  }
  function blQueueFeedRow(queue, box, row, stickToBottom) {
    queue.rows.push({ box: box, row: row, stickToBottom: stickToBottom });
    if (queue.timer) return;
    var pump = function () {
      var next = queue.rows.shift();
      if (!next) {
        queue.timer = null;
        return;
      }
      if (!next.row.parentNode) next.box.appendChild(next.row);
      liveScrollForNewRow(next.box, next.stickToBottom);
      queue.timer = setTimeout(pump, 180);
    };
    queue.timer = setTimeout(pump, 0);
  }
  function blReplaceFeedRow(existing, replacement) {
    replacement.classList.remove('dmFresh');
    if (existing.parentNode) {
      existing.parentNode.replaceChild(replacement, existing);
      return;
    }
    [blChatQueue, blGiftQueue].forEach(function (queue) {
      queue.rows.forEach(function (entry) {
        if (entry.row === existing) entry.row = replacement;
      });
    });
  }
  function blResetFeedSession() {
    blFeedSignature = '';
    blLastFeedId = 0;
    blLastGiftId = 0;
    blClearFeedQueue();
    blFeedNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    blGiftNodes.forEach(function (row) { if (row.parentNode) row.parentNode.removeChild(row); });
    blFeedNodes.clear();
    blGiftNodes.clear();
    var feedBox = byId('bl-feed');
    var giftBox = byId('bl-gift');
    if (feedBox) feedBox.textContent = '';
    if (giftBox) giftBox.textContent = '';
  }
  function blRenderFeed(recent) {
    var list = Array.isArray(recent) ? recent : [];
    var nextSignature = liveFeedFingerprint(list);
    if (nextSignature === blFeedSignature) return;
    blFeedSignature = nextSignature;
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
    var maxGiftId = 0;
    gifts.forEach(function (item) { maxGiftId = Math.max(maxGiftId, Number(item.id) || 0); });
    if (list.length === 0) blLastFeedId = 0;
    if (gifts.length === 0) blLastGiftId = 0;
    var giftNearBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
    var shouldStickGift = blGiftStickBottom || giftNearBottom;
    gifts.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem gift' + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      var bodyBox = dmNode('div', 'dmFeedBody');
      if (LIVE_MINI) {
        // 小窗对齐设计稿：昵称 + 送了 + 礼物托 + 礼物名 + ×数量胶囊
        bodyBox.appendChild(dmNode('span', 'dmFeedNick', nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedVerb', '送了'));
        bodyBox.appendChild(dmGiftTile(item.text, 'bilibili'));
        bodyBox.appendChild(dmNode('span', 'dmFeedGiftName', String(item.text || '礼物')));
        bodyBox.appendChild(dmNode('span', 'dmFeedCount', '×' + Math.max(1, Number(item.count) || 1)));
      } else {
        row.appendChild(dmFeedAvatar(nickText, 'gift'));
        bodyBox.appendChild(dmNode('span', 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
        bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '') + ' ×' + Math.max(1, Number(item.count) || 1)));
      }
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', blFormatTime(item.at)));
      var key = String(item.id);
      var existing = blGiftNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        blReplaceFeedRow(existing, row);
        blGiftNodes.set(key, row);
      } else if (!existing) {
        blGiftNodes.set(key, row);
        blQueueFeedRow(blGiftQueue, giftBox, row, shouldStickGift);
      }
    });
    chats.forEach(function (item) {
      var nickText = String(item.nick || '匿名');
      var row = dmNode('div', 'dmFeedItem chat' + (dmIsEntryText(item.text) ? ' entry' : '') + ((Number(item.id) || 0) > prevId && prevId > 0 ? ' dmFresh' : ''));
      row.setAttribute('data-feed-signature', liveFeedFingerprint([item]));
      if (!LIVE_MINI) row.appendChild(dmFeedAvatar(nickText, 'chat'));
      var bodyBox = dmNode('div', 'dmFeedBody');
      bodyBox.appendChild(dmNode('span', LIVE_MINI ? 'dmFeedNick' : 'dmFeedNick nk' + dmFeedTone(nickText), nickText));
      bodyBox.appendChild(dmNode('span', 'dmFeedText', String(item.text || '')));
      row.appendChild(bodyBox);
      row.appendChild(dmNode('span', 'dmFeedTime', blFormatTime(item.at)));
      var key = String(item.id);
      var existing = blFeedNodes.get(key);
      if (existing && existing.getAttribute('data-feed-signature') !== row.getAttribute('data-feed-signature')) {
        blReplaceFeedRow(existing, row);
        blFeedNodes.set(key, row);
      } else if (!existing) {
        blFeedNodes.set(key, row);
        blQueueFeedRow(blChatQueue, feedBox, row, shouldStick);
      }
    });
    if (shouldStick && (list.length === 0 || maxId !== blLastFeedId)) {
      liveScrollForNewRow(feedBox, true);
    }
    if (shouldStickGift && (gifts.length === 0 || maxGiftId !== blLastGiftId)) {
      liveScrollForNewRow(giftBox, true);
    }
    blLastFeedId = maxId;
    blLastGiftId = maxGiftId;
    miniSyncLatest(recent);
  }
  function blRenderStatus(data, syncToggles) {
    var status = data || {};
    var startedAt = Number(status.startedAt) || 0;
    if (startedAt > 0 && blSessionStartedAt !== startedAt) {
      blSessionStartedAt = startedAt;
      blResetFeedSession();
    }
    blListening = !!status.listening;
    liveSyncPill('bl', blListening);
    liveMonitorSnapshots.bl = status;
    liveSyncRoomMeta();
    miniSyncStats('bl', status);
    renderLiveMonitorCard();
    blSyncToggle();
    platformEndedToast('bl', status);
    var blEnded = status.ended === true;
    var box = byId('bl-status');
    if (box) {
      var bits = [];
      if (blListening) {
        if (status.title) bits.push('「' + String(status.title) + '」');
        if (status.anchor) bits.push('主播 ' + String(status.anchor));
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      } else if (blEnded) {
        bits.push('弹幕 ' + (Number(status.chatCount) || 0) + ' / 礼物 ' + (Number(status.giftCount) || 0));
      }
      renderLiveStatus(box, blListening, bits.join(' · '), wsStatusNote(status), blEnded);
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
  /** 主页监听状态卡：各平台最近一次状态快照与当前展示平台（顶层作用域，供四个 renderStatus 与 load 共用）。 */
  var liveMonitorSnapshots = { dm: null, xs: null, ks: null, bl: null };
  function liveSyncRoomMeta() {
    var node = byId('live-room-meta');
    if (!node) return;
    var snapshot = liveMonitorSnapshots[liveCurrent];
    var metaParts = [];
    if (snapshot && snapshot.listening) {
      if (typeof snapshot.anchor === 'string' && snapshot.anchor.trim()) metaParts.push(snapshot.anchor.trim());
      if (typeof snapshot.title === 'string' && snapshot.title.trim()) metaParts.push(snapshot.title.trim());
    }
    var metaText = metaParts.join(' · ');
    node.textContent = metaText;
    if (metaText) node.title = metaText;
    else node.removeAttribute('title');
  }
  var liveMonitorPlatform = '';
  /** 当前监听快照的地址是不是中控台（小红书主播中控台）；true 时右下角动作改为「打开中控台」，弹回内嵌窗。 */
  var liveMonitorIsCenter = false;
  var liveMonitorNames = { dm: '抖音', xs: '小红书', ks: '快手', bl: 'B站' };
  var liveMonitorPlatforms = ['dm', 'xs', 'ks', 'bl'];
  var liveMonitorRefreshers = { dm: dmRefresh, xs: xsRefresh, ks: ksRefresh, bl: blRefresh };

  /** 中控台地址（小红书主播中控台）：这类链接不是他人直播间，右下角动作应弹回内嵌中控台窗，而不是用外部浏览器开直播间。 */
  function isCenterControlUrl(url) {
    return /live_center_control/i.test(String(url || ''));
  }

  /** 主页状态卡：从最近快照里找正在监听的平台；没有就整块隐藏。 */
  function renderLiveMonitorCard() {
    var card = byId('live-monitor-card');
    if (!card) return;
    var active = null;
    liveMonitorPlatforms.forEach(function (p) {
      var snap = liveMonitorSnapshots[p];
      if (snap && snap.listening && !active) active = { p: p, snap: snap };
    });
    if (!active) {
      card.hidden = true;
      liveMonitorPlatform = '';
      liveMonitorIsCenter = false;
      return;
    }
    liveMonitorPlatform = active.p;
    var snap = active.snap;
    liveMonitorIsCenter = isCenterControlUrl(snap.url);
    var setText = function (id, text) { var node = byId(id); if (node) node.textContent = text; };
    setText('lm-plat', liveMonitorNames[active.p] || active.p);
    setText('lm-title', String(snap.title || '未知直播间'));
    setText('lm-anchor', String(snap.anchor || '未知'));
    setText('lm-room', String(snap.roomId || dmExtractWebRid(snap.url) || '—'));
    setText('lm-chat', String(Number(snap.chatCount) || 0));
    setText('lm-gift', String(Number(snap.giftCount) || 0));
    setText('lm-url', String(snap.url || ''));
    var lmOpen = byId('lm-open');
    if (lmOpen) {
      lmOpen.textContent = liveMonitorIsCenter ? '打开中控台 ›' : '跳转直播间 ›';
      lmOpen.title = liveMonitorIsCenter ? '把已登录的内嵌中控台窗口弹回前台' : '用浏览器跳转直播间';
    }
    card.hidden = false;
  }

  /** 拉一遍四平台状态刷新主页状态卡；各 refresher 写快照后由 renderLiveMonitorCard 收口。 */
  function refreshLiveMonitorCard() {
    Promise.all(liveMonitorPlatforms.map(function (p) {
      var refresher = liveMonitorRefreshers[p];
      if (!refresher) return Promise.resolve(null);
      return refresher().catch(function () { return null; });
    })).then(renderLiveMonitorCard);
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
    if (button) button.disabled = true;
    blSaveCache();
    try {
      var data = await api('POST', '/danmaku/bilibili/start', form, 12000);
      if (!data || data.ok === false) throw new Error((data && (data.message || data.error)) || '启动失败');
      blSaveCache();
      blRenderStatus(data, true);
      liveIdHistoryRemember('bl', blInputValue('bl-url'));
      setStatus(byId('bl-msg'), '');
      showToast('已开始监听', 'ok');
      // 平台互斥：启动本平台会顶掉其余平台的监听；全量拉一遍，纠正它们的绿点与主页状态卡。
      void refreshLiveMonitorCard();
    } catch (error) {
      if (error && error.isTimeout) {
        setStatus(byId('bl-msg'), '连接超时，后台可能仍在启动…');
        try { blRenderStatus(await blRefresh(), false); } catch (_) { blRenderStatus(null, false); }
        showToast(blListening ? '已开始监听' : '已提交，后台仍在连接', 'ok');
        liveIdHistoryRemember('bl', blInputValue('bl-url'));
        void refreshLiveMonitorCard();
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
      liveCloseMini('bl');
    } catch (error) {
      setStatus(byId('bl-msg'), (error && error.message) || String(error), 'error');
    } finally {
      if (button) button.disabled = false;
      blSyncToggle();
    }
  }
  // ===== 直播间 ID 历史：开始监听成功后缓存房间 ID，每平台最多 3 条（最近优先），输入框下方点击快速填入 =====
  // 每条可单独锁定：锁定的条目不会被新房间顶掉，也不会被上限淘汰；解锁后回到正常的最旧优先淘汰。
  var LIVE_ID_HISTORY_KEY = 'blue_fish_live_id_history_v1';
  var LIVE_ID_HISTORY_MAX = 3;
  var LIVE_ID_HISTORY_PLATFORMS = ['dm', 'ks', 'bl'];
  var liveIdHistory = { dm: [], ks: [], bl: [] };

  /** 缓存条目统一成 { id, locked }：兼容只存字符串的旧缓存。 */
  function liveIdHistoryEntry(item) {
    if (typeof item === 'string') {
      var text = item.trim();
      return text ? { id: text, locked: false } : null;
    }
    if (!item || typeof item !== 'object') return null;
    var id = String(item.id == null ? '' : item.id).trim();
    if (!id) return null;
    return { id: id, locked: item.locked === true };
  }

  /** 规整成去重后的 { id, locked } 数组；不合法的条目直接丢掉。 */
  function liveIdHistoryList(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) {
      var entry = liveIdHistoryEntry(item);
      if (!entry) return;
      var seen = false;
      for (var i = 0; i < out.length; i += 1) {
        if (out[i].id === entry.id) { seen = true; break; }
      }
      if (!seen) out.push(entry);
    });
    return out;
  }

  /** 纯合并：新 ID 提到最前（沿用原锁定态）+ 去重 + 锁定的永不淘汰；不碰 DOM/存储，便于单测。 */
  function liveIdHistoryMerge(list, id, max) {
    var limit = Math.max(1, Math.floor(Number(max) || 1));
    var base = liveIdHistoryList(list);
    var text = String(id == null ? '' : id).trim();
    if (text) {
      var locked = false;
      for (var i = 0; i < base.length; i += 1) {
        if (base[i].id === text) { locked = base[i].locked; break; }
      }
      base = [{ id: text, locked: locked }].concat(base.filter(function (item) { return item.id !== text; }));
    }
    while (base.length > limit) {
      var dropAt = -1;
      for (var j = base.length - 1; j >= 0; j -= 1) {
        if (!base[j].locked) { dropAt = j; break; }
      }
      if (dropAt < 0) break;
      base.splice(dropAt, 1);
    }
    return base;
  }
  /** 从输入里取出要展示/缓存的 ID：抖音复用 web rid 提取；B站取纯数字或链接尾段数字；快手取裸 id / 短链尾段。 */
  function liveIdHistoryExtract(platform, raw) {
    var text = String(raw || '').trim();
    if (!text) return '';
    if (platform === 'dm') return dmExtractWebRid(text) || text;
    if (/^[0-9]{3,}$/.test(text)) return text;
    var tail = text.split('?')[0].split('#')[0].split('/').filter(Boolean).pop() || '';
    if (platform === 'bl') return /^[0-9]{3,}$/.test(tail) ? tail : text;
    return tail || text;
  }
  /** 历史 chip 点击时填入的完整直播间地址；未知平台退回裸 id。 */
  function liveIdHistoryUrl(platform, id) {
    var text = String(id == null ? '' : id).trim();
    if (!text) return '';
    if (platform === 'dm') return 'https://live.douyin.com/' + text;
    if (platform === 'bl') return 'https://live.bilibili.com/' + text;
    if (platform === 'ks') return 'https://live.kuaishou.com/u/' + text;
    return text;
  }
  /** 展示顺序：锁定的固定排在最前（组内保持原有先后），未锁定的随后；只影响渲染，不改存储顺序。 */
  function liveIdHistoryOrdered(list) {
    var normal = liveIdHistoryList(list);
    var locked = [];
    var unlocked = [];
    normal.forEach(function (item) {
      (item.locked ? locked : unlocked).push(item);
    });
    return locked.concat(unlocked);
  }
  function liveIdHistoryLoad() {
    try {
      var raw = localStorage.getItem(LIVE_ID_HISTORY_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      LIVE_ID_HISTORY_PLATFORMS.forEach(function (p) {
        // 走一次空 ID 合并：老格式（纯字符串）升级成 { id, locked }，顺带按上限裁剪。
        liveIdHistory[p] = liveIdHistoryMerge(parsed[p], '', LIVE_ID_HISTORY_MAX);
      });
    } catch (_) { /* 缓存坏了就当没监听过 */ }
  }
  function liveIdHistorySave() {
    try {
      localStorage.setItem(LIVE_ID_HISTORY_KEY, JSON.stringify(liveIdHistory));
    } catch (_) { /* 隐私模式写不进去也不影响使用 */ }
  }
  /** 锁图标：锁定=合扣，未锁定=开扣；未锁定时平时隐藏，悬停/键盘聚焦才露出（见 .liveIdHistoryLock）。 */
  function liveIdHistoryLockIcon(locked) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.4');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var shackle = document.createElementNS(ns, 'path');
    shackle.setAttribute('d', locked ? 'M5.4 7V5.3a2.6 2.6 0 0 1 5.2 0V7' : 'M5.4 7V5.3a2.6 2.6 0 0 1 5.2 0');
    var body = document.createElementNS(ns, 'rect');
    body.setAttribute('x', '3.4');
    body.setAttribute('y', '6.8');
    body.setAttribute('width', '9.2');
    body.setAttribute('height', '6.4');
    body.setAttribute('rx', '1.6');
    svg.appendChild(shackle);
    svg.appendChild(body);
    return svg;
  }
  /** 让 chip 的激活态跟上输入框：输入/粘贴/点选后都按「解析出的房间号」对齐。 */
  function liveIdHistorySyncActive(platform) {
    var box = byId(platform + '-url-history');
    if (!box) return;
    var input = byId(platform + '-url');
    var current = liveIdHistoryExtract(platform, input ? input.value : '');
    var items = box.querySelectorAll('.liveIdHistoryItem');
    for (var i = 0; i < items.length; i += 1) {
      var hit = !!current && items[i].getAttribute('data-history-id') === current;
      items[i].classList.toggle('active', hit);
      var btn = items[i].querySelector('.liveIdHistoryBtn');
      if (!btn) continue;
      if (hit) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    }
  }
  function liveIdHistoryRender(platform) {
    var box = byId(platform + '-url-history');
    var input = byId(platform + '-url');
    if (!box) return;
    box.textContent = '';
    var current = liveIdHistoryExtract(platform, input ? input.value : '');
    liveIdHistoryOrdered(liveIdHistory[platform]).forEach(function (entry) {
      var id = entry.id;
      var active = !!current && current === id;
      var row = document.createElement('span');
      row.className =
        'liveIdHistoryItem' + (entry.locked ? ' locked' : '') + (active ? ' active' : '');
      row.setAttribute('data-history-id', id);

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'liveIdHistoryBtn';
      btn.textContent = id;
      btn.title = '点击填入 ' + liveIdHistoryUrl(platform, id);
      btn.setAttribute('aria-label', '填入房间号 ' + id);
      if (active) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', function () {
        if (!input) return;
        input.value = liveIdHistoryUrl(platform, id) || id;
        input.focus();
        liveIdHistorySyncActive(platform);
      });

      var lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'liveIdHistoryLock';
      lock.setAttribute('aria-pressed', entry.locked ? 'true' : 'false');
      lock.setAttribute('data-history-lock', id);
      lock.setAttribute('aria-label', (entry.locked ? '解锁房间号 ' : '锁定房间号 ') + id);
      lock.title = entry.locked
        ? '已锁定：不会被新房间顶掉，也不会被清出历史'
        : '锁定后不会被新房间顶掉，也不会被清出历史';
      lock.appendChild(liveIdHistoryLockIcon(entry.locked));
      lock.addEventListener('click', function () {
        liveIdHistoryToggleLock(platform, id, true);
      });

      row.appendChild(btn);
      row.appendChild(lock);
      box.appendChild(row);
    });
  }
  function liveIdHistoryRenderAll() {
    LIVE_ID_HISTORY_PLATFORMS.forEach(liveIdHistoryRender);
  }
  /** 锁定/解锁一条历史；keepFocus 为重绘后把焦点还给同一把锁，键盘操作不会丢位置。 */
  function liveIdHistoryToggleLock(platform, id, keepFocus) {
    if (LIVE_ID_HISTORY_PLATFORMS.indexOf(platform) < 0) return;
    liveIdHistory[platform] = liveIdHistoryList(liveIdHistory[platform]).map(function (item) {
      return { id: item.id, locked: item.id === id ? !item.locked : item.locked };
    });
    liveIdHistorySave();
    liveIdHistoryRender(platform);
    if (!keepFocus) return;
    var box = byId(platform + '-url-history');
    var next = box && box.querySelector('.liveIdHistoryLock[data-history-lock="' + id + '"]');
    if (next && typeof next.focus === 'function') next.focus();
  }
  /** 开始监听被接受后调用：缓存当前房间 ID 并刷新快捷行。 */
  function liveIdHistoryRemember(platform, raw) {
    if (LIVE_ID_HISTORY_PLATFORMS.indexOf(platform) < 0) return;
    var id = liveIdHistoryExtract(platform, raw);
    if (!id) return;
    liveIdHistory[platform] = liveIdHistoryMerge(liveIdHistory[platform], id, LIVE_ID_HISTORY_MAX);
    liveIdHistorySave();
    liveIdHistoryRender(platform);
  }
  liveIdHistoryLoad();
  liveIdHistoryRenderAll();
  // 输入框内容变了就同步 chip 激活态（打字、粘贴、程序回填都走 input/change）。
  LIVE_ID_HISTORY_PLATFORMS.forEach(function (p) {
    var input = byId(p + '-url');
    if (!input) return;
    var sync = function () { liveIdHistorySyncActive(p); };
    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
  });

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
    var giftBox = byId('bl-gift');
    if (giftBox) {
      giftBox.addEventListener('scroll', function () {
        blGiftStickBottom = giftBox.scrollHeight - giftBox.scrollTop - giftBox.clientHeight < 48;
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
      fishTtsModel: typeof src.fishTtsModel === 'string' && src.fishTtsModel ? src.fishTtsModel : 's2.1-pro-free',
      fishVoices: cloneVoiceList(src.fishVoices),
      breezeVoices: cloneVoiceList(src.breezeVoices),
      fishCustomId: '',
      fishCustomLabel: '',
      breezeCustomId: '',
      breezeCustomLabel: '',
      notificationsEnabled: src.notificationsEnabled !== false,
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
    setSwitchByKey('pet-click', pet.clickSoundEnabled !== false);
    var clickVol = byId('pet-click-volume');
    var clickVolume = typeof pet.clickSoundVolume === 'number' ? pet.clickSoundVolume : 0.5;
    if (clickVol && document.activeElement !== clickVol) clickVol.value = String(clickVolume);
    var clickVolumeValue = byId('pet-click-volume-value');
    if (clickVolumeValue) clickVolumeValue.textContent = clickVolume.toFixed(2);
    var area = byId('pet-persona');
    var entryPrompt = state.main && typeof state.main.whisperPrompt === 'string' ? state.main.whisperPrompt : '';
    var ownPrompt = typeof pet.whisperPrompt === 'string' && pet.whisperPrompt.trim() !== '' ? pet.whisperPrompt : '';
    if (area && document.activeElement !== area) {
      area.value = ownPrompt || entryPrompt;
    }
    if (area) area.placeholder = entryPrompt || '留空则没有系统提示词';
    var reset = byId('pet-persona-reset');
    if (reset) reset.disabled = !entryPrompt;
    updatePersonaCount();
    var personaHint = byId('pet-persona-hint');
    if (personaHint) {
      personaHint.textContent = entryPrompt
        ? '输入框直接显示默认人设；可继续编辑。重置会恢复为条目默认人设并取消实例覆盖。'
        : '这个条目还没写人设；输入框为空表示这只宠物没有系统提示词。';
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
      clickSoundEnabled: true,
      clickSoundVolume: 0.5,
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
    setSwitchByKey('g-confine', g.confineToScreen);
    setSwitchByKey('g-tray', g.trayEnabled);
    setSwitchByKey('g-obs', g.obsCaptureEnabled);
    setSwitchByKey('g-whisper-image', g.whisperImageEnabled);
    setSwitchByKey('g-chat-image', g.chatImageEnabled);
    setSwitchByKey('g-chat-anim', g.chatAnimationEnabled);
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
    var rateValueEl = byId('voice-rate-value');
    if (rateValueEl) rateValueEl.textContent = Number(d.voiceRate).toFixed(2);
    var volEl = byId('voice-volume');
    if (volEl && document.activeElement !== volEl) volEl.value = String(d.voiceVolume);
    var volValueEl = byId('voice-volume-value');
    if (volValueEl) volValueEl.textContent = Number(d.voiceVolume).toFixed(2);
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
    setStatus(statusEl, '');
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
    { kind: 'fish', row: 'fish-key-row', input: 'voice-fish-key', status: 'voice-fish-key-status', draft: 'fishApiKeyDraft', has: 'hasFishApiKey', placeholder: '在 Fish Audio 控制台获取 Bearer Key' },
    { kind: 'breeze', row: 'breeze-key-row', input: 'voice-breeze-key', status: 'voice-breeze-key-status', draft: 'breezeApiKeyDraft', has: 'hasBreezeApiKey', placeholder: '在 Breeze Blue 开发者控制台获取（请求头 xi-api-key）' }
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
      var input = byId(r.input), status = byId(r.status);
      var has = d[r.has];
      if (document.activeElement !== input) input.value = d[r.draft];
      input.placeholder = has ? '已保存密钥，留空保留；填写新 Key 则覆盖' : r.placeholder;
      setStatus(status, '');
    });
  }

  // ---------- 保存 ----------

  function basePayload() { return { pets: clonePets(state.pets) }; }

  function globalsPayload() {
    var g = state.globals;
    return {
      notificationsEnabled: g.notificationsEnabled,
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
    if (fishKey) payload.fishApiKey = fishKey;
    if (breezeKey) payload.breezeApiKey = breezeKey;
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
        body: JSON.stringify({ text: '你好，这是音色试听。', voice: d.voiceName, rate: rate, apiKey: draftKey, fresh: true })
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
    void refreshLiveMonitorCard();
  }

  var SWITCH_FIELD = {
    'voice-enabled': 'voiceEnabled',
    'voice-whisper': 'voiceWhisperEnabled',
    'voice-todo': 'voiceTodoEnabled',
    'g-notify': 'notificationsEnabled',
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
    'pet-fixed': 'fixedEnabled',
    'pet-click': 'clickSoundEnabled'
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
    // 面板关闭：只认右上角关闭按钮与 Esc；点遮罩空白处不关，避免手滑把正在编辑的配置关掉
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
      'pet-click-volume': function (pet, value) {
        pet.clickSoundVolume = clamp(value, 0, 1, 0.5);
        var output = byId('pet-click-volume-value');
        if (output) output.textContent = pet.clickSoundVolume.toFixed(2);
      },
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
      var value = clamp(this.value, 0.5, 2, 1);
      if (state.draft) state.draft.voiceRate = value;
      var output = byId('voice-rate-value');
      if (output) output.textContent = value.toFixed(2);
    });
    byId('voice-volume').addEventListener('input', function () {
      var value = clamp(this.value, 0, 3, 1);
      if (state.draft) state.draft.voiceVolume = value;
      var output = byId('voice-volume-value');
      if (output) output.textContent = value.toFixed(2);
    });
    KEY_ROWS.forEach(function (r) {
      var input = byId(r.input);
      if (input) input.addEventListener('input', function () {
        if (!state.draft) return;
        state.draft[r.draft] = input.value;
        renderKeyRows();
      });
    });
    // Breeze 控制台跳转：与旧页「获取 API Key」同一地址
    var breezeLink = byId('voice-breeze-link');
    if (breezeLink) breezeLink.addEventListener('click', function () {
      window.open(BREEZE_KEY_URL, '_blank', 'noopener,noreferrer');
    });
    // Fish 控制台跳转：与 Breeze 同一交互
    var fishLink = byId('voice-fish-link');
    if (fishLink) fishLink.addEventListener('click', function () {
      window.open(FISH_KEY_URL, '_blank', 'noopener,noreferrer');
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

    // ===== 直播间窗口：平台由控制台入口选定，中间是该平台配置，底部一键开始监听（弹幕在弹幕小窗里看） =====
    var LIVE_PLATFORMS = ['dm', 'xs', 'ks', 'bl'];
    var liveNames = { dm: '抖音', xs: '小红书', ks: '快手', bl: 'B站' };
    var liveRefreshers = { dm: dmRefresh, xs: xsRefresh, ks: ksRefresh, bl: blRefresh };
    // 控制台主页监听卡只在本地动作时刷新；小窗/独立直播间窗口是另一个渲染进程窗口，
    // 后台定时器会被限流甚至不跑，所以开始/停止成功后经同源 BroadcastChannel 通知控制台刷新。
    var liveChannel = null;
    try {
      liveChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('blue-fish-live-monitor') : null;
    } catch (_) {
      liveChannel = null;
    }
    function announceLiveChange() {
      if (liveChannel) liveChannel.postMessage({ type: 'live-changed' });
    }
    function liveNotifying(fn) {
      return function () {
        return Promise.resolve(fn()).then(
          function (value) {
            announceLiveChange();
            return value;
          },
          function (error) {
            announceLiveChange();
            throw error;
          },
        );
      };
    }
    var liveStarters = {
      dm: liveNotifying(dmStart),
      xs: liveNotifying(xsStart),
      ks: liveNotifying(ksStart),
      bl: liveNotifying(blStart),
    };
    var liveStoppers = {
      dm: liveNotifying(dmStop),
      xs: liveNotifying(xsStop),
      ks: liveNotifying(ksStop),
      bl: liveNotifying(blStop),
    };
    var liveMsgNodes = { dm: 'dm-msg', xs: 'xs-msg', ks: 'ks-msg', bl: 'bl-msg' };
    var liveSavers = { dm: dmSaveCache, xs: xsSaveCache, ks: ksSaveCache, bl: blSaveCache };

    function liveSaveCurrent() {
      var saver = liveSavers[liveCurrent];
      if (saver) saver();
    }

    function liveApplySelection() {
      LIVE_PLATFORMS.forEach(function (p) {
        var active = p === liveCurrent;
        var entry = document.querySelector('[data-live="' + p + '"]');
        if (entry) entry.classList.toggle('is-active', active);
        var feed = document.querySelector('[data-feed="' + p + '"]');
        if (feed) feed.classList.toggle('is-active', active);
        var panel = document.querySelector('[data-panel="' + p + '"]');
        if (panel) panel.classList.toggle('is-active', active);
        var foot = document.querySelector('[data-foot-switches="' + p + '"]');
        if (foot) foot.classList.toggle('is-active', active);
      });
      var title = byId('live-config-title');
      if (title) title.textContent = liveNames[liveCurrent];
      var titlePlat = byId('live-title-plat');
      if (titlePlat) titlePlat.textContent = ' · ' + liveNames[liveCurrent];
      liveSyncRoomMeta();
      liveIdHistorySyncActive(liveCurrent);
      liveSyncStartBtn();
      if (liveCurrent !== 'dm') hideDmKickDialog();
    }

    /** 打开弹窗时全量拉一遍四平台状态：重开窗口后渲染端是全新内存，不能只刷当前平台，
     *  否则其余平台的监听绿点会一直停在默认 off。非当前平台报错静默，不抢当前平台的报错位。 */
    function liveRefreshAll() {
      LIVE_PLATFORMS.forEach(function (p) {
        var refresher = liveRefreshers[p];
        if (!refresher) return;
        void refresher().catch(function () { /* 非当前平台静默 */ });
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

    /**
     * 启动请求回包后尽量把弹幕小窗打开：CDP 进房 + 页面加载可能超过前端 12s 请求超时，
     * 回包时后台还在连、绿点未亮；等状态轮询确认真起来了再开，避免「监听成功却没有小窗」。
     */
    function liveOpenMiniAfterStart(platform, attempts) {
      if (liveReadingPlatform(platform)) {
        if (liveOpenMini(platform)) {
          if (LIVE_STANDALONE) closeLiveWindow();
          else setLiveDialog(false);
        }
        return;
      }
      var left = typeof attempts === 'number' ? attempts : 15;
      if (left <= 0) return;
      setTimeout(function () {
        var refresher = liveRefreshers[platform];
        if (!refresher) return;
        refresher()
          .catch(function () { /* 还没起来时刷新失败不打扰用户 */ })
          .then(function () { liveOpenMiniAfterStart(platform, left - 1); });
      }, 1000);
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

    /** 「跳转直播间」：读当前平台链接输入框，用系统浏览器打开对应直播间地址。 */
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

    /** 「打开中控台」：把后台隐藏的小红书中控台内嵌窗弹回前台；无桥 / 未启动时由后端回错，toast 提示。 */
    function xsShowCenter() {
      void api('POST', '/danmaku/xiaohongshu/show-center', {}).catch(function (error) {
        showToast((error && error.message) || String(error), 'error');
      });
    }

    /** 底部唯一按钮：未监听就启动当前平台（成功后开小窗并顺手关掉直播间弹窗），已在监听就停止；请求在途时显示 loading。 */
    function liveToggleCurrent() {
      // 按钮在途时已 disabled，这里再兜一层，防止回车/连点重复发起。
      if (liveStartBusy) return;
      var platform = liveCurrent;
      if (liveReadingPlatform(platform)) {
        var stopper = liveStoppers[platform];
        if (!stopper) { liveSyncStartBtn(); return; }
        liveStartBusy = 'stop';
        liveSyncStartBtn();
        Promise.resolve(stopper()).then(liveFinishStart, liveFinishStart);
        return;
      }
      var starter = liveStarters[platform];
      if (!starter) { liveSyncStartBtn(); return; }
      liveStartBusy = 'start';
      liveSyncStartBtn();
      Promise.resolve(starter()).then(function () {
        liveFinishStart();
        // 各平台的 start 自己吞错并把失败写进状态行；只有真起来了才开小窗。
        // 请求超时但后台仍在连接时，这里会继续轮询状态，起来后再开。
        liveOpenMiniAfterStart(platform);
      }, liveFinishStart);
    }

    /** 启动/停止回包（成功或失败）后解锁按钮，按当前真实状态复原文案与配色。 */
    function liveFinishStart() {
      liveStartBusy = '';
      liveSyncStartBtn();
    }

    /** 控制台平台入口：先切到对应平台再开直播间弹窗；弹窗内不再提供切平台 Tab。
     *  setLiveDialog 打开时会 liveRefreshAll 全量刷状态，这里不重复发当前平台的刷新请求。 */
    function openLiveFor(platform) {
      if (LIVE_PLATFORMS.indexOf(platform) >= 0 && platform !== liveCurrent) {
        liveSaveCurrent();
        liveCurrent = platform;
      }
      setLiveDialog(true);
    }

    function setLiveDialog(open) {
      var d = liveDialogEl();
      if (!d) return;
      if (!open) {
        liveSaveCurrent();
        hideDmKickDialog();
        d.setAttribute('hidden', '');
        return;
      }
      d.removeAttribute('hidden');
      liveApplySelection();
      liveRefreshAll();
    }

    // 独立窗口内的关闭动作：优先走主进程桥关窗；桥缺失时 standalone 页自己 window.close()，
    // 普通控制台页则退回隐藏页内弹窗。
    function closeLiveWindow() {
      if (hasCloseLiveBridge) { window.petBridge.closeLive(); return; }
      if (LIVE_STANDALONE) { window.close(); return; }
      setLiveDialog(false);
    }

    // 小窗关闭确认气泡：挂在页面顶层，跟透明度浮层互斥；点外面 / Esc 收起，收起不改任何状态。
    function setMiniClosePop(open) {
      var pop = byId('mini-close-pop');
      if (!pop) return;
      if (!open) { pop.setAttribute('hidden', ''); return; }
      // 两个浮层位置一样，不能同时开着。
      setMiniOpacityPop(false);
      pop.removeAttribute('hidden');
      var safe = byId('mini-close-only');
      if (safe) safe.focus();
    }
    // 「停止监听并关闭」：沿用控制台那套 stop——成功后 stop 自己会关小窗；失败就留着窗并提示。
    function miniCloseWithStop() {
      var platform = liveCurrent;
      var stopper = liveStoppers[platform];
      if (!stopper) { closeLiveWindow(); return; }
      var stopBtn = byId('mini-close-stop');
      var onlyBtn = byId('mini-close-only');
      // 停止请求在途时锁住两个按钮，避免连点重复发请求。
      if (stopBtn) { stopBtn.disabled = true; stopBtn.textContent = '正在停止…'; }
      if (onlyBtn) onlyBtn.disabled = true;
      Promise.resolve(stopper()).then(function () {
        if (!liveReadingPlatform(platform)) { closeLiveWindow(); return; }
        if (stopBtn) { stopBtn.disabled = false; stopBtn.textContent = '停止监听并关闭'; }
        if (onlyBtn) onlyBtn.disabled = false;
        setMiniClosePop(false);
        showToast('停止监听失败，小窗保持打开', 'error');
      }, function (error) {
        if (stopBtn) { stopBtn.disabled = false; stopBtn.textContent = '停止监听并关闭'; }
        if (onlyBtn) onlyBtn.disabled = false;
        showToast((error && error.message) || String(error), 'error');
      });
    }
    // 小窗右上角关闭：监听中先弹气泡问「是否停止监听」；没在监听就直接关。
    // 折叠成一行时窗口只有标题栏高，气泡会被裁掉，所以先展开再弹。
    function requestMiniClose() {
      if (!liveReadingPlatform(liveCurrent)) { closeLiveWindow(); return; }
      var pop = byId('mini-close-pop');
      if (pop && !pop.hasAttribute('hidden')) { setMiniClosePop(false); return; }
      if (document.body.classList.contains('mini-collapsed')) setMiniCollapsed(false);
      setMiniClosePop(true);
    }
    function wireMiniClosePop() {
      if (!LIVE_MINI) return;
      var stopBtn = byId('mini-close-stop');
      var onlyBtn = byId('mini-close-only');
      if (stopBtn) stopBtn.addEventListener('click', function () { miniCloseWithStop(); });
      if (onlyBtn) onlyBtn.addEventListener('click', function () {
        setMiniClosePop(false);
        closeLiveWindow();
      });
      document.addEventListener('pointerdown', function (event) {
        var pop = byId('mini-close-pop');
        if (!pop || pop.hasAttribute('hidden')) return;
        var target = event.target;
        if (pop.contains(target)) return;
        var closeBtn = byId('live-close');
        if (closeBtn && closeBtn.contains(target)) return; // 关闭按钮自己负责开合
        setMiniClosePop(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setMiniClosePop(false);
      });
    }

    // 小窗透明度：滑块只调底色 alpha（--mini-panel-alpha），文字、图标、描边不跟着变；
    // 底色是 rgb(41,41,41)，100% = 不透明度 1（纯 #292929），20% = 0.2。值同时落本机 localStorage。
    function miniAlphaSaved() {
      var saved = 100;
      try { saved = Number(localStorage.getItem(MINI_ALPHA_KEY)); } catch (_) {}
      if (!(saved >= 20 && saved <= 100)) saved = 100;
      return Math.round(saved);
    }
    function applyMiniAlpha(percent) {
      var value = Math.min(100, Math.max(20, Math.round(Number(percent) || 100)));
      var alpha = Math.round(value) / 100;
      document.documentElement.style.setProperty('--mini-panel-alpha', String(alpha));
      var valueNode = byId('mini-opacity-value');
      if (valueNode) valueNode.textContent = value + '%';
      var rangeNode = byId('mini-opacity-range');
      if (rangeNode && Number(rangeNode.value) !== value) rangeNode.value = String(value);
    }
    function setMiniOpacityPop(open) {
      var pop = byId('mini-opacity-pop');
      var btn = byId('live-opacity');
      if (!pop) return;
      if (open) pop.removeAttribute('hidden');
      else pop.setAttribute('hidden', '');
      if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) btn.classList.add('is-on');
        else btn.classList.remove('is-on');
      }
    }
    function wireMiniOpacity() {
      if (!LIVE_MINI) return;
      applyMiniAlpha(miniAlphaSaved());
      var btn = byId('live-opacity');
      var range = byId('mini-opacity-range');
      if (btn) btn.addEventListener('click', function (event) {
        event.stopPropagation();
        // 两个浮层同一位置，开这个就收那个。
        setMiniClosePop(false);
        var pop = byId('mini-opacity-pop');
        setMiniOpacityPop(!!pop && pop.hasAttribute('hidden'));
      });
      if (range) range.addEventListener('input', function () {
        var percent = Number(range.value) || 100;
        applyMiniAlpha(percent);
        try { localStorage.setItem(MINI_ALPHA_KEY, String(percent)); } catch (_) {}
      });
      document.addEventListener('pointerdown', function (event) {
        var pop = byId('mini-opacity-pop');
        if (!pop || pop.hasAttribute('hidden')) return;
        var target = event.target;
        if (pop.contains(target) || (btn && btn.contains(target))) return;
        setMiniOpacityPop(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') setMiniOpacityPop(false);
      });
    }

    // 小窗头部拖动：整条头部当抓手，按屏幕坐标增量推窗口；按住时头部光标切成抓握。
    // 不走 -webkit-app-region:drag：那里的光标由系统非客户区接管，永远是箭头，抓手样式挂不上。
    function wireMiniDrag() {
      if (!LIVE_MINI) return;
      var head = document.querySelector('.liveDialog .chatHead');
      var bridge = window.petBridge;
      if (!head || !bridge || typeof bridge.windowDrag !== 'function') return;
      var dragging = false;
      var lastX = 0;
      var lastY = 0;
      function push(phase, x, y) {
        try { bridge.windowDrag(phase, x, y); } catch (_) {}
      }
      // 头部里的按钮（透明度/关闭）只负责点击，既不当拖动起点，也不吞掉点击。
      function fromControl(target) {
        return !!(target && target.closest && target.closest('button,a,input,select,textarea'));
      }
      head.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || fromControl(event.target)) return;
        dragging = true;
        lastX = event.screenX;
        lastY = event.screenY;
        head.classList.add('is-dragging');
        // 捕获指针：窗口跟着光标走后指针可能已经跑到头部外，没有捕获就会丢掉 pointerup，拖动收不住。
        try { head.setPointerCapture(event.pointerId); } catch (_) {}
        push('start', lastX, lastY);
        event.preventDefault();
      });
      head.addEventListener('pointermove', function (event) {
        if (!dragging) return;
        // 窗口跟着光标走会触发操作系统补发 mousemove，屏幕坐标没变就不必再推窗口。
        if (event.screenX === lastX && event.screenY === lastY) return;
        lastX = event.screenX;
        lastY = event.screenY;
        push('move', lastX, lastY);
      });
      function finish() {
        if (!dragging) return;
        dragging = false;
        head.classList.remove('is-dragging');
        push('end', 0, 0);
      }
      head.addEventListener('pointerup', finish);
      head.addEventListener('pointercancel', finish);
      // 被别的窗口抢走焦点时也要收口，否则松手收不到 pointerup，拖动会话一直挂着。
      window.addEventListener('blur', finish);
    }

    // 小窗折叠：点标题栏右侧箭头把整窗收成一行，再点展开。
    // 窗口高度归主进程管：页面只报「折叠后标题栏有多高（CSS px）」，主进程按当前缩放换算成窗口高度，
    // 否则收起后窗口本身还是原高度，透明区域照样挡住下面的鼠标。
    function setMiniCollapsed(collapsed) {
      var on = !!collapsed;
      document.body.classList.toggle('mini-collapsed', on);
      var btn = byId('live-collapse');
      if (btn) {
        btn.setAttribute('aria-expanded', on ? 'false' : 'true');
        btn.setAttribute('aria-label', on ? '展开消息区' : '折叠为标题栏');
        btn.title = on ? '展开' : '折叠';
        var arrow = btn.querySelector('path');
        if (arrow) arrow.setAttribute('d', on ? 'M4 9.5 8 5.5l4 4' : 'M4 6.5 8 10.5l4-4');
      }
      // 折叠后两个浮层都没有落点，先收起来，免得展开时它们还浮在标题栏下面。
      if (on) {
        setMiniOpacityPop(false);
        setMiniClosePop(false);
      }
      var bridge = window.petBridge;
      if (!bridge || typeof bridge.setLiveMiniCollapsed !== 'function') return;
      var head = document.querySelector('.liveDialog .chatHead');
      // +2 是面板上下各 1px 描边：窗口要连描边一起收，否则会切掉一条边。
      var cssHeight = head ? Math.ceil(head.getBoundingClientRect().height) + 2 : 40;
      try { bridge.setLiveMiniCollapsed(on, on ? cssHeight : 0); } catch (_) {}
    }
    function wireMiniCollapse() {
      if (!LIVE_MINI) return;
      var btn = byId('live-collapse');
      if (!btn) return;
      btn.addEventListener('click', function (event) {
        // 头部是拖动区：按钮自己吃掉这次点击，别让它被当成拖动起点。
        event.stopPropagation();
        setMiniCollapsed(!document.body.classList.contains('mini-collapsed'));
      });
    }

    function wireLiveDialog() {
      var cookieGuide = byId('cookie-guide-dialog');
      var cookieGuideClose = byId('cookie-guide-close');
      var cookieGuideKey = byId('cookie-guide-key');
      function closeCookieGuide() { if (cookieGuide) cookieGuide.hidden = true; }
      var cookieGuideImage = cookieGuide ? cookieGuide.querySelector('.cookieGuideImage') : null;
      if (cookieGuideImage) {
        cookieGuideImage.addEventListener('error', function () {
          if (cookieGuideImage.getAttribute('src') !== '/blue-fish/pic/cookie-guide-network.png') {
            cookieGuideImage.setAttribute('src', '/blue-fish/pic/cookie-guide-network.png');
          }
        });
      }
      document.querySelectorAll('[data-cookie-guide]').forEach(function (button) {
        button.addEventListener('click', function () {
          var platform = button.getAttribute('data-cookie-guide') || 'dm';
          if (cookieGuideKey) {
            var keyText = {
              dm: '抖音通常需要完整 Cookie 中的 sessionid；复制整行后粘贴到上方输入框。',
              ks: '快手 Cookie 至少需要 userId 与 passToken 或对应 web_st/webday7_st。',
              bl: 'B站登录态建议包含 SESSDATA；不填也可使用访客匿名模式。'
            };
            cookieGuideKey.textContent = keyText[platform] || keyText.dm;
          }
          if (cookieGuide) cookieGuide.hidden = false;
        });
      });
      if (cookieGuideClose) cookieGuideClose.addEventListener('click', closeCookieGuide);
      if (cookieGuide) cookieGuide.addEventListener('click', function (event) { if (event.target === cookieGuide) closeCookieGuide(); });

      var dialog = liveDialogEl();
      var closeBtn = byId('live-close');
      if (closeBtn) closeBtn.addEventListener('click', function () {
        // 小窗关闭要先问「是否停止监听」；独立直播间窗口/页内弹窗保持原来的直接关闭。
        if (LIVE_MINI) { requestMiniClose(); return; }
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
      var lmStop = byId('lm-stop');
      if (lmStop) lmStop.addEventListener('click', function () {
        var stopper = liveStoppers[liveMonitorPlatform];
        if (stopper) void stopper();
      });
      var lmMini = byId('lm-mini');
      if (lmMini) lmMini.addEventListener('click', function (event) {
        event.preventDefault();
        if (liveMonitorPlatform) liveOpenMini(liveMonitorPlatform);
      });
      var lmOpen = byId('lm-open');
      if (lmOpen) lmOpen.addEventListener('click', function (event) {
        event.preventDefault();
        // 中控台快照：弹回内嵌中控台窗；普通直播间：外部浏览器打开房间页。
        if (liveMonitorIsCenter) xsShowCenter();
        else liveOpenRoom(liveMonitorPlatform);
      });
      // 直播间弹窗只认右上角关闭按钮与 Esc；点遮罩空白处不关闭，避免手滑丢失正在填的配置。
      // 弹幕小窗是常驻浮窗，Esc 只用来收起小浮层（透明度/关闭确认），不关整窗。
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape') return;
        if (cookieGuide && !cookieGuide.hidden) { closeCookieGuide(); return; }
        if (!liveIsOpen() || LIVE_MINI) return;
        if (LIVE_STANDALONE) closeLiveWindow();
        else setLiveDialog(false);
      });
      LIVE_PLATFORMS.forEach(function (p) {
        var entry = document.querySelector('[data-live="' + p + '"]');
        if (entry) entry.addEventListener('click', function () { openLiveFor(p); });
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
    // 统一直播间弹窗：控制台四张平台入口卡各自打开对应平台配置，窗内不再切平台。
    wireLiveDialog();
    // 小窗头部的透明度滑块（非小窗形态内部直接 return）
    wireMiniOpacity();
    // 小窗头部拖动（非小窗形态内部直接 return）
    wireMiniDrag();
    // 小窗折叠（非小窗形态内部直接 return）
    wireMiniCollapse();
    // 小窗关闭确认气泡（非小窗形态内部直接 return）
    wireMiniClosePop();

    // 保存与重置
    byId('pet-save').addEventListener('click', savePet);
    byId('pet-delete').addEventListener('click', function () { void deletePet(); });
    byId('pet-persona-reset').addEventListener('click', function () {
      var pet = currentPet();
      var area = byId('pet-persona');
      var entryPrompt = state.main && typeof state.main.whisperPrompt === 'string' ? state.main.whisperPrompt : '';
      if (!pet || !area || !entryPrompt) return;
      delete pet.whisperPrompt;
      area.value = entryPrompt;
      updatePersonaCount();
      markDirty(true);
    });
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
    // 监听状态卡只在本地动作时刷新；小窗停止监听后靠跨窗口通知立即同步，
    // 窗口重新可见时再兜一次。后台定时器会被浏览器限流，只当最后的兜底。
    if (!LIVE_MINI && !LIVE_STANDALONE) {
      if (liveChannel) liveChannel.onmessage = function () { void refreshLiveMonitorCard(); };
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) void refreshLiveMonitorCard();
      });
      if (typeof setInterval === 'function') {
        setInterval(function () { void refreshLiveMonitorCard(); }, 5000);
      }
    }
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
      if (miniTitle) miniTitle.textContent = '互动消息区';
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
html[data-theme=dark] body{background-image:url('/standalone-console/console-bg-dark.webp')}
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
/* 桌面主区：左侧宠物头像网格，中间直播平台入口列，右侧设置入口图标格 */
.desktop{display:grid;grid-template-columns:1fr auto auto;gap:22px;align-items:start}
.petDesk{display:flex;flex-direction:column;gap:14px;min-width:0}
.liveMonitorCard{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px 18px;display:flex;flex-direction:column;gap:12px}
.lmHead{display:flex;align-items:center;gap:10px}
.lmDot{flex:none;width:9px;height:9px;border-radius:50%;background:#34c759;box-shadow:0 0 0 4px rgba(52,199,89,.18)}
.lmState{font-size:14px;font-weight:700;color:var(--label-primary)}
.lmPlat{flex:none;padding:2px 10px;border-radius:999px;background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);font-size:12px;font-weight:600}
.lmStop{margin-left:auto;flex:none;border:1px solid color-mix(in srgb,var(--danger) 35%,transparent);background:color-mix(in srgb,var(--danger) 8%,transparent);color:var(--danger);border-radius:10px;padding:5px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.lmStop:hover{background:color-mix(in srgb,var(--danger) 16%,transparent)}
.lmTitle{font-size:15px;font-weight:600;color:var(--label-primary);word-break:break-word}
.lmMeta{font-size:12.5px;color:var(--label-tertiary);display:flex;flex-wrap:wrap;gap:6px 12px}
.lmMeta b{color:var(--label-secondary);font-weight:600}
.lmUrl{display:flex;align-items:center;gap:8px;padding-top:10px;border-top:1px solid var(--border)}
.lmUrlIco{flex:none;color:var(--label-tertiary)}
.lmUrlText{flex:1;min-width:0;font-size:12.5px;color:var(--label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lmOpen{flex:none;font-size:12.5px;font-weight:600;color:var(--primary);text-decoration:none}
.lmOpen:hover{text-decoration:underline}
/* 两个文字动作并排时拉开间距（8px 容器 gap + 16px ≈ 24px），避免「弹幕小窗」「跳转直播间」粘连 */
.lmUrl .lmOpen+.lmOpen{margin-left:16px}
.deskSectionHead{display:flex;align-items:center;gap:10px;color:var(--label-secondary)}
.settingsGrid{display:grid;grid-template-columns:repeat(2,minmax(118px,1fr));gap:14px;align-content:start}
/* 直播平台入口列：纵向四张卡片，与右侧设置格逐行对齐；点击打开对应平台的直播间弹窗 */
.liveEntryGrid{display:grid;grid-template-columns:minmax(118px,1fr);gap:14px;align-content:start}
.liveDeskEntry{position:relative}
.liveDeskEntry .deskEntryIcon{background:transparent;color:inherit}
.liveDeskEntry.is-active{border-color:var(--primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 12%,transparent)}
.liveDeskEntry.is-active .deskEntryLabel{color:var(--primary)}
.liveDeskEntry .livePill{position:absolute;top:8px;right:8px;width:8px;height:8px;border-radius:50%;padding:0}
.deskEntry{display:flex;flex-direction:column;align-items:center;gap:9px;padding:18px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card);box-shadow:var(--shadow);cursor:pointer;font:inherit;color:var(--label-primary);transition:border-color .15s ease,transform .12s ease}
.deskEntry:hover{border-color:var(--primary);transform:translateY(-2px)}
.deskEntry:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
.deskEntryIcon{display:flex;align-items:center;justify-content:center;width:46px;height:46px;border-radius:14px;background:rgba(0,122,255,.10);color:var(--primary)}
.deskEntryLabel{font-size:13px;color:var(--label-secondary)}
.dangerEntry .deskEntryIcon{background:color-mix(in srgb,var(--danger) 12%,transparent);color:var(--danger)}
.dangerEntry .deskEntryLabel{color:var(--danger)}
.dangerEntry:hover{border-color:var(--danger)}
.dangerEntry:hover .deskEntryIcon{background:color-mix(in srgb,var(--danger) 18%,transparent)}
@media (max-width:880px){.desktop{grid-template-columns:1fr}.settingsGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.liveEntryGrid{grid-template-columns:repeat(4,minmax(0,1fr))}}
/* 宠物面板：左「预览」+ 右四块功能面板，与设计稿一致 */
.petGrid{display:grid;grid-template-columns:220px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:880px){.petGrid{grid-template-columns:minmax(0,1fr)}}
/* 左栏：预览 + 位置设置上下叠放 */
.petAside{display:flex;flex-direction:column;gap:12px;min-width:0}
.petPanel--aside{padding:12px 12px 14px}
.petPosStack{display:flex;flex-direction:column;gap:8px;min-width:0}
.petPosStack .petFields--margins{grid-template-columns:repeat(2,minmax(0,1fr));max-width:none}
.petPosStack .cornerRow{gap:6px}
.petPosStack .corner{height:30px;padding:0 8px;font-size:12px}
.petPreview{display:flex;flex-direction:column;align-items:center;gap:12px;padding:26px 16px;border-radius:16px;background:var(--bg-base)}
.petPreviewCard{width:150px;max-width:100%;padding:12px;border-radius:18px;background:#fff;box-shadow:var(--shadow)}
.petPreviewCard img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px}
.petPreviewCaption{font-size:12px;color:var(--label-tertiary)}
.petPanels{display:flex;flex-direction:column;gap:12px;min-width:0}
.petBottomActions{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding-top:2px}
.petBottomActions .petPanelActs{margin-left:auto}
/* 人设不参与左右分栏：它挂在 petGrid 的第二列，跨过预览栏的宽度占满整行 */
.petPanel--wide{grid-column:1/-1}
@media (max-width:880px){.petPanel--wide{grid-column:auto}}
.petPanel{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:16px;background:var(--bg-card);box-shadow:var(--shadow);min-width:0}
.petPanelHead{display:flex;align-items:center;gap:10px;min-height:24px}
.petPanelTitle{margin:0;font-size:14px;font-weight:600;color:var(--label-primary)}
.petPanelActs{display:flex;align-items:center;gap:8px;margin-left:auto}
.petPanel .petFields{gap:8px 16px}
.petPanel .fieldRow{gap:3px}
.petPosRow{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px 20px;align-items:start}
@media (max-width:700px){.petPosRow{grid-template-columns:1fr}}
.petPosCorners{display:flex;flex-direction:column;gap:4px}
.petFields--margins{grid-template-columns:repeat(2,minmax(0,1fr));max-width:320px}
.petVolumeField{grid-column:1/-1}
.petVolumeField .fieldLabel{display:flex;align-items:center;gap:6px}
.petVolumeField output{font-variant-numeric:tabular-nums;color:var(--label-primary)}
.petVolumeRange{width:100%;height:20px;margin:2px 0 0;accent-color:var(--primary);cursor:pointer}
.petVolumeRange:focus-visible{outline:2px solid var(--primary);outline-offset:3px;border-radius:4px}
.voiceVolumeField .fieldLabel{display:flex;align-items:center;gap:6px}
.voiceVolumeField output{font-variant-numeric:tabular-nums;color:var(--label-primary)}
.voiceVolumeRange{width:100%;height:20px;margin:2px 0 0;accent-color:var(--primary);cursor:pointer}
.voiceVolumeRange:focus-visible{outline:2px solid var(--primary);outline-offset:3px;border-radius:4px}
.personaBlock{display:flex;flex-direction:column;gap:6px;min-width:0}
.avatarBox{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:6px 14px;text-align:center}
.avatarBox img{width:100%;max-width:100%;object-fit:contain;border-radius:10px}
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
.liveIdHistory{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.liveIdHistory:empty{display:none}
.liveIdHistoryItem{display:inline-flex;align-items:center;max-width:220px;border:1px solid var(--border);border-radius:999px;background:var(--bg-card);overflow:hidden}
/* 锁定只换锁图标（合扣 + 主色），不加边框/高亮；选中只用蓝色边框，不铺底色 */
.liveIdHistoryItem.active{border-color:var(--primary)}
.liveIdHistoryBtn{max-width:180px;padding:2px 4px 2px 10px;border:0;background:transparent;color:var(--label-secondary);font-size:12px;line-height:1.6;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.liveIdHistoryBtn:hover{color:var(--label-primary)}
.liveIdHistoryBtn:focus-visible{outline:2px solid var(--label-tertiary);outline-offset:1px}
.liveIdHistoryLock{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 8px 0 2px;border:0;background:transparent;color:var(--label-secondary);cursor:pointer;line-height:0;opacity:0;transition:opacity .12s}
.liveIdHistoryLock:hover{color:var(--label-primary)}
.liveIdHistoryLock:focus-visible{outline:2px solid var(--label-tertiary);outline-offset:-1px}
.liveIdHistoryItem:hover .liveIdHistoryLock,.liveIdHistoryItem:focus-within .liveIdHistoryLock{opacity:1}
.liveIdHistoryItem.locked .liveIdHistoryLock{opacity:1;color:var(--primary)}
.cornerRow{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.corner{height:32px;padding:0 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);color:var(--label-secondary);font:inherit;cursor:pointer}
.corner.active{background:var(--primary);border-color:var(--primary);color:#fff}
.switchPair{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:14px}
.switchLine{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;font-size:14px;color:var(--label-secondary)}
.switchText{display:flex;flex-direction:column;gap:3px;min-width:0}
.switchHint{font-size:12px;line-height:1.45;color:var(--label-tertiary)}
.cardHint{margin:-6px 0 14px;font-size:13px;line-height:1.55;color:var(--label-tertiary)}
.personaFoot{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.personaActions{display:flex;align-items:center;gap:8px;flex:none}
.secondaryBtn.compact{min-height:26px;padding:3px 9px;font-size:12px}
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
.status[data-error="true"]{color:var(--danger);background:color-mix(in srgb,var(--danger) 10%,transparent);border:1px solid color-mix(in srgb,var(--danger) 26%,transparent);border-radius:10px;padding:6px 10px;font-weight:600}
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
/* 直播间窗口：单平台配置（平台由控制台入口选定），底部一键开始监听；弹幕区只在小窗里出现 */
.liveDialog{width:min(900px,100%);height:min(70vh,540px);border-radius:26px;box-shadow:0 28px 80px rgba(20,40,80,.22),0 2px 8px rgba(20,40,80,.06)}
.liveDialog .chatHead{padding:16px 26px 14px;gap:16px}
.liveDialog .chatTitle{font-size:19px;font-weight:700;letter-spacing:-.01em;display:inline-flex;align-items:center;gap:10px}
.liveDialog .chatTitle{flex:1 1 auto;min-width:0}
.liveStatusLight{flex:none;width:9px;height:9px;border-radius:50%;background:color-mix(in srgb,var(--label-tertiary) 55%,transparent);transition:background .2s ease,box-shadow .2s ease}
.liveStatusLight.on{background:#34c759;box-shadow:0 0 0 4px color-mix(in srgb,#34c759 18%,transparent)}
.liveDialog .chatClose{width:38px;height:38px;border-radius:50%;border-color:color-mix(in srgb,var(--label-primary) 12%,var(--border));color:var(--label-tertiary)}
.liveDialog .chatClose:hover{color:var(--label-primary);border-color:color-mix(in srgb,var(--label-primary) 30%,var(--border));background:color-mix(in srgb,var(--label-primary) 5%,var(--bg-card))}
/* 疑似被挤下线确认框：压在直播间弹窗之上，窄屏/小窗里也不溢出 */
.kickDialog{width:min(392px,calc(100% - 32px))}
.kickBody{padding:0 26px}
.kickText{margin:0;font-size:14px;line-height:1.7;color:var(--label-secondary)}
.kickFoot{display:flex;justify-content:flex-end;gap:10px;padding:18px 26px 22px}
.kickFoot .btn{height:40px;border-radius:10px;padding:0 18px;font-size:14px}
.liveBody{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;padding:16px 26px 14px;overflow:hidden}
.liveMain{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0}
body:not(.live-mini) .liveMain{display:none}
.liveHeadRight{display:flex;align-items:center;gap:12px}
.liveTitlePlat{font-size:15px;font-weight:600;color:var(--label-tertiary)}
.liveRoomMeta{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:500;color:var(--label-secondary)}
.livePill.on{background:#34c759;box-shadow:0 0 0 2px var(--bg-card)}
.livePill.off{background:color-mix(in srgb,var(--label-tertiary) 45%,transparent)}
/* 配置在主区里直接摊开，不再是从右侧滑出的抽屉 */
.liveConfigPane{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow-y:auto;padding:0 2px 0}
.liveConfig{display:flex;flex-direction:column;min-height:0}
.liveConfigTitle{display:none}
.liveConfigBody{padding:0 2px}
.liveConfigPanel{display:none;flex-direction:column;gap:12px}
.liveConfigPanel.is-active{display:flex}
/* 配置区不再套同色嵌套卡片：字段平铺，输入框靠内凹底色与聚焦光环识别 */
.liveConfigPanel .dmCard{border:0;background:transparent;border-radius:0;padding:0}
.liveConfigPanel .dmCard .status{margin-top:10px}
.liveConfigPanel .dmCard .status:empty{display:none}
/* 配置页小美化：输入框聚焦光环 */
.liveConfigPanel .fieldInput{height:44px;border-radius:12px;padding:0 14px;background:color-mix(in srgb,var(--label-primary) 4%,var(--bg-card));font-size:14px;transition:border-color .15s ease,box-shadow .15s ease}
.liveConfigPanel .fieldInput.area{height:auto;min-height:88px;padding:12px 14px;line-height:1.55}
.liveConfigPanel .fieldInput:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px color-mix(in srgb,var(--primary) 14%,transparent)}
.liveConfigPanel .dmLabel{font-size:14px;font-weight:600;color:var(--label-primary)}
.liveConfigPanel .dmLabelOpt{margin-left:6px;font-size:13px;font-weight:400;color:var(--label-tertiary)}
/* 房间号标题与跳转按钮同一行，输入框仍独占下一行 */
.liveUrlLabelRow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.liveUrlRow{display:flex;gap:12px}
.liveUrlRow .fieldInput{flex:1;min-width:0}
/* 状态行下方的纯文本「跳转直播间」 */
.liveOpenLiveRow{display:flex;align-items:center;gap:12px;margin:2px 4px 0}
.liveOpenLiveText{border:0;background:none;padding:0;font:inherit;font-size:13px;line-height:1.6;color:var(--label-tertiary);cursor:pointer;white-space:nowrap}
.liveOpenLiveText:hover{color:var(--primary);text-decoration:underline}
/* 监听状态只占一行文字：圆点 + 摘要，必要时补第二行提示 */
.liveStatus{display:flex;flex-wrap:wrap;align-items:center;column-gap:7px;row-gap:3px;margin:0 4px;font-size:14px;line-height:1.6;color:var(--label-tertiary);word-break:break-word}
.liveStatusRow{display:flex;align-items:flex-start;gap:10px;margin:0 4px}
.liveStatusRow[hidden]{display:none}
.liveStatusRow .liveStatus{flex:1 1 auto;min-width:0;margin:0}
.liveStatusRefresh{flex:none;border:0;background:none;padding:0;font:inherit;font-size:13px;line-height:1.6;color:var(--label-tertiary);cursor:pointer;white-space:nowrap}
.liveStatusRefresh:hover{color:var(--primary);text-decoration:underline}
.liveLoginNote{margin:0;font-size:13.5px;line-height:1.7;color:var(--label-secondary)}
.liveStatus.on .statusText{color:var(--label-secondary)}
.liveStatus .statusDot{flex:none;width:7px;height:7px;border-radius:50%;background:color-mix(in srgb,var(--label-tertiary) 55%,transparent)}
.liveStatus.on .statusDot{background:#34c759}
.liveStatus .statusNote{flex-basis:100%;color:var(--label-tertiary)}
.liveFoot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:14px 26px 16px;margin-top:14px;border-top:1px solid var(--border)}
.liveFootLeft{display:flex;align-items:center;min-width:0}
.liveFootSwitches{display:none;align-items:center;gap:20px}
.liveFootSwitches.is-active{display:flex}
.liveFootSwitches .dmSwitch{flex:none;border-left:0;padding:6px 2px}
.liveFootSwitches .dmSwitch:hover{background:transparent}
.liveFootRight{display:flex;align-items:center;gap:12px;margin-left:auto}
.liveFoot .btn{height:44px;border-radius:12px;padding:0 22px;font-size:14px}
.liveFoot .btn.primary{background:var(--primary);box-shadow:0 10px 24px color-mix(in srgb,var(--primary) 30%,transparent)}
.liveFoot .btn.primary:hover{background:var(--primary-hover)}
body.live-mini .liveConfigPane{display:none!important}
.liveFeedPanel{display:none;flex:1 1 auto;min-height:0}
.liveFeedPanel.is-active{display:flex;flex-direction:column}
.liveFeedPanel .dmFeedCard{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.liveFeedPanel .dmFeed{flex:1 1 auto;max-height:none;min-height:0}
.liveFeedPanel .dmGiftCard{flex:0 0 150px;height:150px;display:flex;flex-direction:column;min-height:150px;margin-bottom:10px;overflow:hidden}
.liveFeedPanel .dmGift{flex:1 1 auto;height:auto;max-height:none;overflow-y:auto;min-height:0}
/* 抖音弹幕弹窗：左列表单与状态、右列弹幕流；小屏落成一列 */
.dmDialog{width:min(980px,100%);height:min(90vh,860px)}
.dmBody{flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 18px 20px}
.dmGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
.dmCol{display:flex;flex-direction:column;gap:14px;min-width:0}
.dmCard{padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card)}
.dmCardTitle{margin:0 0 10px;font-size:15px;font-weight:650}
.dmField{display:flex;flex-direction:column;gap:5px;margin-top:10px}
.liveConfigPanel .dmField:first-child{margin-top:0}
.dmLabel{font-size:13px;color:var(--label-secondary)}
.dmCookieNote{margin:6px 0 0;font-size:12.5px;line-height:1.6;color:color-mix(in srgb,var(--danger) 78%,var(--label-secondary))}
.dmCookieGuideBtn{margin-top:0;text-align:left}
.dmCookieLabelRow{display:flex;height:26px;align-items:center;justify-content:space-between;gap:10px;line-height:26px}
.dmCookieLabelRow .dmLabel{display:flex;align-items:center;height:26px;line-height:26px;margin:0}
.dmCookieLabelRow .dmCookieRow{height:26px}
.dmCookieLabelRow .liveStatusRefresh{height:26px;display:inline-flex;align-items:center;line-height:26px}
.cookieGuideDialog{width:min(920px,calc(100% - 32px));max-height:min(90vh,760px)}
.cookieGuideBody{overflow:auto;padding:0 22px 20px}
.cookieGuideSteps{margin:0 0 14px;padding-left:22px;color:var(--label-secondary);font-size:13.5px;line-height:1.7}
.cookieGuideSteps li+li{margin-top:3px}
.cookieGuideImageWrap{display:flex;justify-content:center;padding:10px;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--label-primary) 3%,var(--bg-card));overflow:auto}
.cookieGuideImage{display:block;max-width:100%;height:auto;border-radius:6px}
.dmCookieRow{display:flex;align-items:center;justify-content:flex-end;gap:12px}
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
.dmFeedItem.gift{border-color:color-mix(in srgb,#ffb340 52%,var(--border));background:linear-gradient(100deg,color-mix(in srgb,#ffb340 18%,var(--bg-card)),color-mix(in srgb,#ff8a00 6%,var(--bg-card)));padding:8px 2px}
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
/* 抖音表情图：跟着正文行高走，别撑高行距 */
.dmEmoji{display:inline-block;width:1.15em;height:1.15em;object-fit:contain;vertical-align:-0.22em;margin:0 1px}
.dmFeedItem.gift .dmFeedText{color:#a86100}
.dmFeedTime{align-self:start;margin-top:3px;font-size:11px;color:var(--label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
@keyframes dmFeedIn{from{opacity:.35;background-color:color-mix(in srgb,var(--primary) 14%,transparent)}to{opacity:1;background-color:transparent}}
.dmFeedItem.dmFresh{animation:dmFeedIn .6s ease-out both}
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
/* 开始/停止监听请求在途：按钮转圈 + 锁定，回包前一直转（轮询改文案也压不住 .is-busy） */
.btn.is-busy{display:inline-flex;align-items:center;justify-content:center;gap:7px;opacity:1;cursor:progress}
.btn.is-busy::before{content:"";flex:none;width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:liveBtnSpin .75s linear infinite}
@keyframes liveBtnSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.btn.is-busy::before{animation-duration:2.4s}}
/* 保存结果气泡：顶部居中浮层，成功主色点、失败红点亮，自动浮现与收起，不遮挡页面点击 */
.toastRoot{position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;align-items:center;gap:10px;pointer-events:none}
.toast{display:flex;align-items:center;gap:9px;max-width:min(420px,86vw);padding:11px 16px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border);box-shadow:var(--shadow);color:var(--label-primary);font-size:14px;line-height:1.5;opacity:0;transform:translateY(-10px);transition:opacity .22s ease,transform .22s ease}
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
body.live-standalone .liveDialog .chatClose{-webkit-app-region:no-drag}
/* 弹幕小窗（直播伴侣式浮窗）：整窗只有一行头部 + 礼物/弹幕两区，固定深色，不跟随明暗主题 */
body.live-mini{background:transparent;color:#e8eaed}
/* 暗色主题 body 的背景图选择器优先级更高，必须在小窗显式关掉，否则控制台背景图会透进浮窗 */
body.live-mini,html[data-theme=dark] body.live-mini{background-image:none}
/* 小窗底色：rgb(41,41,41)，滑块调的是这一层底色自身的不透明度（100% = 纯 #292929），
   文字、图标、描边不跟着变。注意两点：必须用 background-color 长写（background 简写里 var() 不替换）；
   这层不能挂 transition，带过渡时 var 换出来的颜色不落地，读到的只是旧值。 */
body.live-mini #live-dialog{padding:0;align-items:stretch;justify-content:stretch;background-color:rgba(41,41,41,var(--mini-panel-alpha,1));border:1px solid rgba(255,255,255,.24);border-radius:10px;overflow:hidden}
body.live-mini .liveDialog{width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:transparent;color:#e8eaed}
/* 独立模式的 align-items:center 会把子元素缩成内容宽；小窗可见的礼物/弹幕区在 .liveMain 里，
   不在上面 chatHead/liveBody/liveFoot 的补宽名单中，这里补满整窗宽度，头部同步去掉 980px 上限 */
body.live-mini .liveDialog .chatHead,body.live-mini .liveDialog .liveMain{width:100%;max-width:none}
/* 窄屏媒体查询给 .liveMain 设了 min-height:280px；小窗最小高度只有 320，头和统计已占掉 ~64px，
   280 撑出窗口后被 overflow:hidden 裁掉弹幕区底部，滚到底也看不全最后一条。小窗里必须允许压扁。 */
body.live-mini .liveMain{min-height:0}
body.live-mini .liveDialog .chatHead{padding:8px 12px 3px;gap:8px;border-bottom:0;background:transparent}
/* 小窗头部是窗口的抓手：平时显示抓手光标，按住拖动时换成抓握。
   拖动由页内按屏幕坐标增量推窗口完成，不能挂 -webkit-app-region:drag——那条路的命中区交给
   系统非客户区，光标被固定成箭头，这里写的 cursor 根本不生效。 */
body.live-mini .liveDialog .chatHead{cursor:grab;user-select:none}
body.live-mini .liveDialog .chatHead.is-dragging{cursor:grabbing}
/* 头部里的透明度/关闭按钮只负责点击，光标保持小手，也不能当拖动起点 */
body.live-mini .liveDialog .chatHead button{cursor:pointer}
body.live-mini .liveDialog .chatTitle{display:inline-flex;align-items:center;gap:0;font-size:17px;font-weight:700;letter-spacing:.02em;color:#f2f3f5}
body.live-mini .liveStatusLight{display:none!important}
body.live-mini .chatClose{width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:#c9cdd3}
body.live-mini .chatClose:hover{color:#f2f3f5;background:rgba(255,255,255,.08)}
/* 透明度入口：只在小窗出现，外观跟随关闭按钮；点开在头部下方浮出滑块 */
.miniOpacityBtn{display:none}
body.live-mini .miniOpacityBtn{display:inline-flex;align-items:center;justify-content:center}
body.live-mini .miniOpacityBtn.is-on{color:#f2f3f5;background:rgba(255,255,255,.12)}
/* 折叠：入口只在小窗出现，外观沿用关闭按钮；点一下收起统计行与消息区，整窗收成一行标题栏。
   高度由主进程同步缩窗口，页面这层只负责内容显隐；没有桥时面板自己也收到标题栏高度，不留空窗。 */
.miniCollapseBtn{display:none}
body.live-mini .miniCollapseBtn{display:inline-flex;align-items:center;justify-content:center}
/* 折叠态没有面板可调透明度，图标一并收起，把宽度让给最新一条消息。 */
body.live-mini.mini-collapsed .miniOpacityBtn{display:none}
body.live-mini.mini-collapsed .miniStats,
body.live-mini.mini-collapsed .liveMain{display:none!important}
body.live-mini.mini-collapsed #live-dialog{bottom:auto;height:auto}
/* 折叠态把标题换成最新一条消息：一行内「昵称：正文」，超宽省略 */
.miniLatest{display:none;flex:1;min-width:0;align-items:baseline;overflow:hidden;white-space:nowrap}
body.live-mini.mini-collapsed .chatTitle{display:none}
body.live-mini.mini-collapsed .miniLatest{display:flex}
.miniLatestNick{flex:0 0 auto;max-width:96px;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;line-height:20px;font-weight:500;color:#4fc3f7}
.miniLatestText{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;line-height:20px;color:#e8eaed}
/* 滑块浮层挂在整页上（不在 #live-dialog 里），窗口调淡后它仍保持原亮度，低透明度下也点得动 */
.miniOpacityPop{position:fixed;top:52px;right:14px;z-index:70;display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:12px;background:rgba(28,29,32,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 30px rgba(0,0,0,.45);color:#e8eaed;font-size:13.5px;line-height:18px}
.miniOpacityPop[hidden]{display:none}
.miniOpacityLabel{color:#c9cdd3;white-space:nowrap}
.miniOpacityRange{width:110px;height:16px;margin:0;accent-color:#4fc3f7;cursor:pointer}
.miniOpacityValue{min-width:38px;text-align:right;color:#9aa0a6;font-variant-numeric:tabular-nums}
/* 关闭确认气泡：和透明度浮层一样挂在页面顶层，锚在关闭按钮下方；折叠成一行时先展开窗口再显示 */
.miniClosePop{position:fixed;top:52px;right:12px;z-index:72;width:248px;padding:12px;border-radius:12px;background:rgba(28,29,32,.96);border:1px solid rgba(255,255,255,.14);box-shadow:0 16px 36px rgba(0,0,0,.5);color:#e8eaed;font-size:13px;line-height:18px}
.miniClosePop[hidden]{display:none}
.miniClosePop::before{content:"";position:absolute;top:-5px;right:18px;width:8px;height:8px;background:rgba(28,29,32,.96);border-left:1px solid rgba(255,255,255,.14);border-top:1px solid rgba(255,255,255,.14);transform:rotate(45deg)}
.miniCloseTitle{margin:0 0 10px;font-weight:600;color:#f2f3f5}
.miniCloseActions{display:flex;gap:8px}
.miniCloseBtn{flex:1;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:transparent;color:#c9cdd3;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background .12s,color .12s,border-color .12s}
.miniCloseBtn:hover{background:rgba(255,255,255,.08);color:#f2f3f5}
.miniCloseBtn:disabled{opacity:.55;cursor:default}
.miniCloseBtn.is-stop{color:#ff8a8a;border-color:rgba(255,107,107,.42)}
.miniCloseBtn.is-stop:hover{background:rgba(255,107,107,.14);color:#ffb3b3}
/* 小窗透明度：--mini-panel-alpha（满格 .12）只作用在上面那层底色的 alpha 上，不对整块元素用 opacity，
   否则文字/图标会跟背景一起淡掉。 */
body.live-mini .liveBody{display:none!important}
body.live-mini .liveFoot{display:none!important}
/* 统计行只放真实口径（在线观众人数/礼物数/本场累计点赞数）；弹幕数不再展示，等级无数据源，不放死槽；抖音点赞由 likeCount 提供 */
.miniStats{display:none}
body.live-mini .miniStats{display:flex;width:100%;align-items:center;gap:14px;padding:0 12px 6px;color:#9aa0a6}
/* 小窗没有状态行：下播时在统计行右侧挂一个胶囊，跟抖音「已下播」口径一致 */
body.live-mini .miniEndedTag{margin-left:auto;padding:1px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.24);color:rgba(255,255,255,.62);font-size:12px;line-height:16px;white-space:nowrap}
body.live-mini .miniStat{display:inline-flex;align-items:center;gap:6px}
/* 小窗字号整体放大一档（正文/昵称 12.5→14.5，统计 12.5→14，标题 15→17），按 380×560 的窗口可视距离读 */
body.live-mini .miniStat svg{width:17px;height:17px;display:block}
body.live-mini .miniStat b{font-size:14px;line-height:18px;font-weight:500;color:#e8eaed}
body.live-mini .liveFeedPanel.is-active{padding:0 12px 8px;border:0;border-radius:0;background:transparent;gap:0}
body.live-mini .liveFeedPanel .dmGiftCard,
body.live-mini .liveFeedPanel .dmFeedCard{margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
/* 设计稿无「礼物/弹幕」小标题，计数收进顶部统计行 */
body.live-mini .dmCardHead{display:none}
/* 礼物区不再预留固定高度：空态时按内容收缩，有礼物时按条数自然增长（上限 32vh 内滚动），
   否则空态那 132px 会凭空把统计行和弹幕区拉开 */
body.live-mini .dmGiftCard{flex:0 0 118px!important;height:118px!important;min-height:118px!important;overflow:hidden}
/* 礼物行紧凑（A₂）：行距 4px，同行高能多放 1~2 条 */
body.live-mini .dmGift{gap:4px;padding:0;border:0;background:transparent;border-radius:0;height:118px;max-height:118px;min-height:118px;overflow-y:auto}
body.live-mini .dmGift:empty::before{content:"展示本场直播的礼物消息";margin:0;padding:2px 0 0;align-self:flex-start;font-size:13px;color:#6b7076}
/* 礼物区与弹幕区之间的发丝分隔线（ specificity 需压过上面 border:0 名单） */
body.live-mini .liveFeedPanel .dmFeedCard{border-top:1px solid rgba(255,255,255,.08);padding-top:8px;margin-top:8px}
body.live-mini .dmFeed{gap:4px;padding:0;border:0;background:transparent;border-radius:0;min-height:0}
/* 空态提示必须顶到容器顶部：基类 .dmFeed:empty::before 带 margin:auto，会把提示垂直居中，
   弹幕区一旦撑满剩余高度，中间就空出一大截 */
body.live-mini .dmFeed:empty::before{margin:0;padding:2px 0 0;align-self:flex-start;font-size:13px;color:#6b7076}
/* 小窗弹幕行：昵称与内容作为同一段文本流，右边没位置了再从左边第二行开始（不悬挂缩进）。
   容器保持 flex 是为了让礼物行的金色礼物托与文字区并排；文字区内部是文本流。 */
body.live-mini .dmFeedItem{display:flex;align-items:start;gap:8px;padding:5px 0;border-radius:0;border:0;background:transparent;box-shadow:none}
body.live-mini .dmFeedItem.chat:hover{border-color:transparent;background:transparent}
/* 礼物行紧凑（A₂）：更矮的行卡、更淡的金色描边 */
body.live-mini .dmFeedItem.gift{border:1px solid rgba(255,179,64,.2);background:rgba(255,179,64,.05);border-radius:9px;padding:4px 8px}
/* 设计稿弹幕行无左侧头像；礼物行用金色礼物托 */
body.live-mini .dmFeedAva{display:none}
body.live-mini .dmGiftTile{flex:none;width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,#ffc06a,#ff9a3d);color:#fff;display:flex;align-items:center;justify-content:center}
body.live-mini .dmGiftTile svg{width:11px;height:11px;display:block}
/* 命中官方礼物图时不铺金色底：礼物图自带留白与圆角，按 contain 塞进同一个 18px 方框 */
body.live-mini .dmGiftTile.dmGiftReal{background:none;border-radius:0}
body.live-mini .dmGiftTile.dmGiftReal img{width:18px;height:18px;object-fit:contain;display:block}
body.live-mini .dmFeedBody{display:block;min-width:0;font-size:14.5px;line-height:1.5;color:#e8eaed;white-space:normal}
/* 礼物行保持单行：长昵称/长礼物名在各自位置省略，不把 ×N 胶囊挤到下一行 */
body.live-mini .dmFeedItem.gift .dmFeedBody{display:flex;align-items:center;flex-wrap:nowrap;column-gap:5px;font-size:13.5px;line-height:1.45}
body.live-mini .dmFeedItem.chat .dmFeedNick{font-size:14.5px;font-weight:500;color:#4fc3f7}
body.live-mini .dmFeedItem.gift .dmFeedNick{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:500;color:#4fc3f7}
body.live-mini .dmFeedItem.chat .dmFeedNick::after{color:#4fc3f7}
body.live-mini .dmFeedItem.gift .dmFeedNick::after,body.live-mini .dmFeedItem.entry .dmFeedNick::after{content:none}
body.live-mini .dmFeedVerb{flex:none;color:#e8eaed}
/* 礼物名做成小徽章（A₂）：与礼物图紧挨，超长时只在本徽章内省略 */
body.live-mini .dmFeedGiftName{flex:1 1 auto;min-width:0;display:inline-flex;align-items:center;height:19px;padding:0 5px;border-radius:6px;border:1px solid rgba(255,192,106,.22);background:rgba(255,192,106,.11);color:#ffc06a;font-size:13px;line-height:19px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.live-mini .dmFeedCount{flex:none;display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:9px;border:1px solid rgba(255,192,106,.4);background:rgba(255,192,106,.14);color:#ffc06a;font-size:11px;line-height:18px;font-weight:700}
body.live-mini .dmFeedText{color:#e8eaed}
body.live-mini .dmFeedItem.entry .dmFeedNick{color:#4fc3f7}
body.live-mini .dmFeedItem.entry .dmFeedText{color:#e8eaed}
body.live-mini .dmFeedTime{display:none}
/* 细灰滚动条 */
body.live-mini .dmFeed,body.live-mini .dmGift{scrollbar-width:thin;scrollbar-color:#5a5f66 transparent}
body.live-mini .dmFeed::-webkit-scrollbar,body.live-mini .dmGift::-webkit-scrollbar{width:6px}
body.live-mini .dmFeed::-webkit-scrollbar-thumb,body.live-mini .dmGift::-webkit-scrollbar-thumb{background:#5a5f66;border-radius:3px}
body.live-mini .dmFeed::-webkit-scrollbar-track,body.live-mini .dmGift::-webkit-scrollbar-track{background:transparent}
/* 小窗头部（抓手 + 标题 + 按钮）压在最上面，气泡让到头部下沿再出现 */
body.live-mini .toastRoot{top:46px}
${PANEL_CSS}
`;
