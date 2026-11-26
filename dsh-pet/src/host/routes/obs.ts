/**
 * OBS 直播源页面：`/blue-fish/obs` 页面与 `/blue-fish/obs.js` 脚本。
 *
 * 只读、无鉴权之外的业务判断：地址固定、无参数，供 OBS「浏览器源」直接加载。
 * 页面与脚本都从包内产物读取，素材沿用已有的 /thumb、/font 路由。
 * @module dsh-pet/src/host/routes/obs
 */
import { readObsPageScript } from '../obs-asset.ts';
import { obsPage } from '../obs-page.ts';
import { methodNotAllowed } from './result.ts';
import type { RouteResult } from '../http.ts';
import type { PetRouteDeps, RouteInput } from './types.ts';

/** OBS 页面路由：未命中返回 undefined（obs / obs.js 之外一律放行给后续处理器）。 */
export async function handleObsRoutes(
  _deps: PetRouteDeps,
  input: RouteInput,
  readScript: () => string | undefined = readObsPageScript,
): Promise<RouteResult | undefined> {
  const { method, rest } = input;
  if (rest !== 'obs' && rest !== 'obs.js') return undefined;
  if (method !== 'GET' && method !== 'HEAD') return methodNotAllowed();

  if (rest === 'obs') {
    return { kind: 'text', status: 200, body: obsPage(), contentType: 'text/html; charset=utf-8' };
  }
  const script = readScript();
  if (script === undefined) {
    return {
      kind: 'text',
      status: 404,
      body: 'obs page missing: run `npm run build`',
      contentType: 'text/plain; charset=utf-8',
    };
  }
  return { kind: 'text', status: 200, body: script, contentType: 'application/javascript; charset=utf-8' };
}
