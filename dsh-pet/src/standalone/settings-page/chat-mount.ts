/**
 * 独立模式「对话」分区的浏览器入口：把 DSH 右侧栏那套面板挂到设置页上。
 *
 * 组件、状态与渲染树全部来自 client/chat，这里只补宿主那一侧：react 运行时由本包自己
 * 打包（独立环境没有 DSH 注入），样式走外链 CSS（页面 CSP 是 style-src 'self'，内联
 * style 会被拦掉）。平台 UI 原语在独立模式没有，面板按既有分支自行降级。
 *
 * 语音配置也在这里灌进 shared/voice：对话喇叭与设置页试听是两份 bundle，不主动
 * setVoiceConfig 的话点播会一直落在默认 100%，>1 的增益对不上试听。
 * @module dsh-pet/src/standalone/settings-page/chat-mount
 */
import { createElement, useEffect, useRef, useState, type FC } from 'react';
import { createRoot } from 'react-dom/client';
import { jsx } from 'react/jsx-runtime';
import { makePetChatPanel } from '../../client/chat/panel.ts';
import type { ChatPanelRuntime } from '../../client/chat/runtime.ts';
import { ROUTE_PATH } from '../../shared/constants.ts';
import { setVoiceConfig, unlockVoiceAudio } from '../../shared/voice.ts';

/** 设置页里对话面板的挂载点 id，与 chrome.ts 的容器一致。 */
const HOST_ID = 'pet-chat-root';

/** 注入给面板的 react 能力；独立模式没有宿主可注入，用本包打进来的那份 react。 */
const runtime = { h: jsx, useState, useEffect, useRef } as unknown as ChatPanelRuntime;

/** 把成品配置里的语音段灌进对话 bundle 的 shared/voice；失败留给 speakText 的懒加载。 */
async function hydrateVoiceFromConfig(): Promise<void> {
  try {
    const response = await fetch(ROUTE_PATH + '/config', { cache: 'no-store' });
    const body = (await response.json()) as { main?: Record<string, unknown>; ok?: boolean } | null;
    if (!body || body.ok === false) return;
    const main = body.main;
    if (typeof main !== 'object' || main === null) return;
    setVoiceConfig(main.voiceName, main.voiceEnabled, main.voiceVolume, main.voiceRate);
  } catch {
    /* 对话仍可点播：speakText 里 loadConfigOnce 会再试一次 */
  }
}

const host = document.getElementById(HOST_ID);
if (host !== null) {
  void hydrateVoiceFromConfig();
  // 首次点击解锁增益上下文：挂载时往往还没有用户手势，resume 会失败。
  const unlockOnce = (): void => {
    void unlockVoiceAudio();
    window.removeEventListener('pointerdown', unlockOnce, true);
    window.removeEventListener('keydown', unlockOnce, true);
  };
  window.addEventListener('pointerdown', unlockOnce, true);
  window.addEventListener('keydown', unlockOnce, true);

  const Panel = makePetChatPanel(runtime) as unknown as FC;
  createRoot(host).render(createElement(Panel));
}
