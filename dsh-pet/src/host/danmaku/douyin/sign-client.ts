/**
 * 抖音 WSS 签名客户端：向 Electron Helper 本机签名桥发请求。
 *
 * Helper 在隐藏 BrowserWindow 里跑 webmssdk + vFun（与 danmu-ji 同源），
 * 宿主半侧拿不到浏览器 API，所以签名必须跨进程。
 * @module dsh-pet/src/host/danmaku/douyin/sign-client
 */

/** stdout / globalThis 共用的签名桥 URL 前缀。 */
export const DOUYIN_SIGN_PREFIX = 'dsh-pet-douyin-sign:';

/** globalThis 上挂签名桥基址的键。 */
export const DOUYIN_SIGN_GLOBAL_KEY = '__dshPetDouyinSignBaseUrl';

/** 读当前进程内（应用同进程 Helper）或外部注入的签名桥基址。 */
export function readInProcessSignBaseUrl(): string | undefined {
  const g = globalThis as Record<string, unknown>;
  const v = g[DOUYIN_SIGN_GLOBAL_KEY];
  return typeof v === 'string' && /^https?:\/\//.test(v) ? v.replace(/\/$/, '') : undefined;
}

/**
 * 向签名桥要 X-Bogus。
 * @param baseUrl - 形如 `http://127.0.0.1:PORT`。
 * @param roomId - 真实 room_id（非 web_rid）。
 * @param uniqueId - user_unique_id。
 */
export async function requestDySignature(
  baseUrl: string,
  roomId: string,
  uniqueId: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/douyin-sign`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomId: String(roomId), uniqueId: String(uniqueId) }),
  });
  const text = await res.text();
  let json: { ok?: boolean; signature?: string; message?: string } = {};
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(`签名桥返回非 JSON（HTTP ${res.status}）`);
  }
  if (!res.ok || !json.ok || !json.signature) {
    throw new Error(json.message || `签名失败（HTTP ${res.status}）`);
  }
  return String(json.signature);
}
