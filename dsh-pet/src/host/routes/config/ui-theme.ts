/**
 * 设置页主题偏好：GET /ui-theme 读，POST /ui-theme 写。
 *
 * 主题必须跨端口、跨 host、跨浏览器都记得住，所以不能只依赖 localStorage 或 cookie：
 * 前者按 origin（协议+域名+端口）隔离，后者按域名隔离——独立模式默认端口被占用会自动顺延
 * （3080 → 3081），浏览器也可能分别用 127.0.0.1 与 localhost。
 *
 * 刻意不写进用户主配置：那条保存路径（PUT /config）会重启桌面 Helper，切一次主题让桌宠闪
 * 一下是不可接受的代价。这里落一个独立的小文件，读写都不触发任何重载。
 *
 * 必须始终成立：文件缺失或内容损坏一律回落 light，主题坏了不能让设置页不可用。
 * @module dsh-pet/src/host/routes/config/ui-theme
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RouteResult } from '../../http.ts';
import type { PetRouteDeps, RouteInput } from '../types.ts';
import { failResult, invalidJson, methodNotAllowed, okResult } from '../result.ts';

/** 主题取值集合。 */
const THEME_SET: ReadonlySet<string> = new Set(['light', 'dark']);
/** 主题文件名（落在用户数据根下）。 */
const THEME_FILE = 'ui-theme.json';

/** 主题文件绝对路径。 */
function themePath(deps: PetRouteDeps): string {
  return join(deps.userRoot, THEME_FILE);
}

/**
 * 读磁盘上的主题。
 *
 * `saved` 区分「明确存过 light」与「根本没有记录」：后者让设置页把浏览器里的旧选择迁过来，
 * 避免升级后第一次打开被默认值覆盖掉用户此前选的暗色。
 * 文件不存在、JSON 损坏或取值不认识都回落 light 且 saved=false。
 */
async function readTheme(deps: PetRouteDeps): Promise<{ theme: 'light' | 'dark'; saved: boolean }> {
  try {
    const raw = JSON.parse(await readFile(themePath(deps), 'utf8')) as { theme?: unknown };
    if (raw.theme === 'light' || raw.theme === 'dark') return { theme: raw.theme, saved: true };
    return { theme: 'light', saved: false };
  } catch {
    return { theme: 'light', saved: false };
  }
}

/**
 * 主题读写端点。
 *
 * @param deps - 路由依赖（用 userRoot 定位主题文件）。
 * @param input - 已解析的请求（GET 读、POST 写，其余 405）。
 * @returns 当前主题（读），或写入后的主题；非法取值与写盘失败都是业务结论。
 */
export async function handleUiTheme(deps: PetRouteDeps, input: RouteInput): Promise<RouteResult> {
  if (input.method === 'GET') {
    return okResult(await readTheme(deps), { 'cache-control': 'no-store' });
  }
  if (input.method !== 'POST') return methodNotAllowed();
  let payload: { theme?: unknown };
  try {
    payload = JSON.parse(input.body ?? '') as { theme?: unknown };
  } catch {
    return invalidJson();
  }
  const theme = payload.theme;
  if (typeof theme !== 'string' || !THEME_SET.has(theme)) {
    return failResult('bad-request', 'theme 必须是 light 或 dark');
  }
  try {
    await mkdir(deps.userRoot, { recursive: true });
    await writeFile(themePath(deps), JSON.stringify({ theme }, null, 2), 'utf8');
  } catch (e) {
    return failResult('generate-error', e instanceof Error ? e.message : String(e));
  }
  return okResult({ theme });
}
