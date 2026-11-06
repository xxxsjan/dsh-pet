/**
 * 语音播报开关（POST /voice-toggle）：右键菜单切换 voiceEnabled。
 *
 * 与 POST /obs-capture 同口径：白名单重建 + 磁盘原值透传，写盘成功后 requestRestart()。
 * 不解析 pets[]，只改顶层布尔；失败一律 200 + 失败实体。
 * @module dsh-pet/src/host/routes/config/voice-toggle
 */
import { readAllConfig, saveUserConfig } from '../../config.ts';
import { redactConfigSecrets } from '../../config/public.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { type RouteResult } from '../../http.ts';
import type { PetRouteDeps, RouteInput } from '../types.ts';
import { resolveConfigLayer } from './layer.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from '../result.ts';

/**
 * 改 voiceEnabled 并返回改动后的成品聚合。
 */
export async function setVoiceToggle(deps: PetRouteDeps, input: RouteInput): Promise<RouteResult> {
  if (input.method !== 'POST') return methodNotAllowed();
  let payload: { enabled?: unknown };
  try {
    payload = JSON.parse(input.body ?? '') as { enabled?: unknown };
  } catch {
    return invalidJson();
  }
  if (typeof payload.enabled !== 'boolean') {
    return failResult('bad-request', 'enabled 必须是布尔：true / false');
  }
  const enabled = payload.enabled;
  let merged: Record<string, Record<string, unknown>>;
  try {
    merged = readAllConfig(deps.configPaths);
  } catch (e) {
    return failResult('generate-error', e instanceof Error ? e.message : String(e));
  }
  // voiceEnabled 是 main 条目的全局开关：只写用户主配置层，不碰种类文件。
  const resolved = resolveConfigLayer(deps, 'main');
  if (!resolved.ok) return failResult('generate-error', '用户主配置文件找不到');
  const layer = resolved.layer;
  const mainConf = (merged.main ?? {}) as Record<string, unknown>;
  const pets = Array.isArray(mainConf.pets) ? (mainConf.pets as Record<string, unknown>[]) : [];
  const clean = saveUserConfig({ pets, voiceEnabled: enabled }, layer.existing);
  if (!clean) return failResult('bad-request', '宠物配置非法');
  try {
    await mkdir(layer.dir, { recursive: true });
    await writeFile(layer.path, JSON.stringify(clean, null, 2), 'utf8');
  } catch (e) {
    return failResult('generate-error', e instanceof Error ? e.message : String(e));
  }
  deps.state.writeSection('config', {});
  // 不 await：发起者很可能就是即将被这次重载换掉的桌面 Helper。
  void deps.requestRestart();
  return okResult(redactConfigSecrets(readAllConfig(deps.configPaths)));
}
