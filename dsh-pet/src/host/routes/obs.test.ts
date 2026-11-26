/**
 * OBS 页面路由测试：页面/脚本的内容类型、缺产物回 404、非 GET 回 405、无关路径放行。
 *
 * 跑法：node --experimental-strip-types --test src/host/routes/obs.test.ts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleObsRoutes } from './obs.ts';

const call = (rest: string, method = 'GET', script?: string) =>
  handleObsRoutes({} as never, { url: new URL(`http://127.0.0.1/blue-fish/${rest}`), rest, method }, () => script);

describe('handleObsRoutes —— OBS 直播源页面', () => {
  test('GET /obs 返回透明页面 HTML，脚本走同源相对地址', async () => {
    const result = await call('obs');
    assert.ok(result !== undefined && result.kind === 'text');
    assert.equal(result.status, 200);
    assert.match(result.contentType ?? '', /text\/html/);
    assert.match(result.body, /<script src="obs\.js" defer><\/script>/);
    assert.match(result.body, /background:transparent/);
  });

  test('GET /obs.js 返回打包脚本', async () => {
    const result = await call('obs.js', 'GET', 'console.log("obs")');
    assert.ok(result !== undefined && result.kind === 'text');
    assert.equal(result.status, 200);
    assert.match(result.contentType ?? '', /application\/javascript/);
    assert.equal(result.body, 'console.log("obs")');
  });

  test('产物缺失时回 404 并提示重新构建', async () => {
    const result = await call('obs.js');
    assert.ok(result !== undefined && result.kind === 'text');
    assert.equal(result.status, 404);
    assert.match(result.body, /npm run build/);
  });

  test('非 GET/HEAD 回 405', async () => {
    const result = await call('obs', 'POST');
    assert.ok(result !== undefined && result.kind === 'json');
    assert.equal(result.status, 405);
  });

  test('无关路径放行给后续处理器', async () => {
    assert.equal(await call('state'), undefined);
  });
});
