/**
 * 语音领域：`/voice/speak` 合成、`/voice/hear` 识别、`/voice/voices` 音色列表，
 * 以及 `/voice/utterance/{id}/report` 朗读回执。
 *
 * 校验、排队与缓存都在语音服务里；这里只判定方法与 JSON，并把结论映射成路由应答。
 * 契约见 openapi.yaml，本模块不重复描述字段。
 * @module dsh-pet/src/host/routes/voice
 */
import type { RouteResult } from '../http.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from './result.ts';

/** `voice/utterance/<id>/report` → utteranceId；其它形态 → undefined。 */
function parseUtteranceReportPath(rest: string): string | undefined {
  const m = /^voice\/utterance\/([^/]+)\/report$/.exec(rest);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1] ?? '');
  } catch {
    return undefined;
  }
}

/** 语音领域：未命中返回 undefined，命中返回应答。 */
export async function handleVoiceRoutes(deps: PetRouteDeps, input: RouteInput): Promise<RouteResult | undefined> {
  const { body, method, rest, signal } = input;

  // 朗读回执：渲染端真正读完 / 跳过 / 失败后上报；弹幕队列靠它串行下一条。
  const utteranceId = parseUtteranceReportPath(rest);
  if (utteranceId !== undefined) {
    if (method !== 'POST') return methodNotAllowed();
    if (!utteranceId) return failResult('bad-request', 'invalid utterance id');
    let reported: unknown;
    try {
      reported = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    const o = reported && typeof reported === 'object' ? (reported as Record<string, unknown>) : {};
    const outcome = deps.voiceUtterances.report(utteranceId, o.status, o.reason);
    if (outcome === 'unknown') return failResult('unknown-utterance', 'unknown utterance');
    if (outcome === 'invalid') return failResult('bad-request', 'invalid status');
    return okResult({ ok: true });
  }

  if (rest === 'voice/voices') {
    if (method !== 'GET') return methodNotAllowed();
    // 目录含 edge / fish 分列与当前引擎下的 voices（旧客户端只读 voices 仍可用）
    return okResult({ ok: true, ...deps.voice.listVoices() });
  }

  if (rest === 'voice/speak') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    const result = await deps.voice.speak(parsed);
    if (!result.ok) return failResult(result.reason, result.message);
    return { kind: 'file', file: result.file, contentType: 'audio/mpeg' };
  }

  // 与 /voice/speak 反向：音频进、文字出。格式由宿主 provider 校验，这里只转发结论。
  if (rest === 'voice/hear') {
    if (method !== 'POST') return methodNotAllowed();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body ?? 'null');
    } catch {
      return invalidJson();
    }
    const result = await deps.speech.hear(parsed, signal);
    if (!result.ok) return failResult(result.reason, result.message);
    return okResult({ ok: true, text: result.text });
  }

  return undefined;
}
