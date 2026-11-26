/**
 * OBS 页面显示选项测试：配置默认值、URL 覆盖与缩放夹取。
 *
 * 跑法：node --experimental-strip-types --test src/obs/params.test.ts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseObsOptions } from './params.ts';

const parse = (main: unknown, query = '') => parseObsOptions(main, new URLSearchParams(query));

describe('parseObsOptions —— OBS 页面显示选项', () => {
  test('缺省：显示宠物与气泡、缩放 1', () => {
    assert.deepEqual(parse(undefined), { showPet: true, showBubble: true, scale: 1 });
    assert.deepEqual(parse({}), { showPet: true, showBubble: true, scale: 1 });
  });

  test('配置值生效', () => {
    assert.deepEqual(parse({ obsShowPet: false, obsShowBubble: false, obsScale: 1.5 }), {
      showPet: false,
      showBubble: false,
      scale: 1.5,
    });
  });

  test('URL 参数覆盖配置', () => {
    assert.deepEqual(parse({ obsShowPet: false, obsShowBubble: false, obsScale: 1 }, 'pet=1&bubble=1&scale=0.8'), {
      showPet: true,
      showBubble: true,
      scale: 0.8,
    });
  });

  test('缩放夹在 0.2–3；非法参数回落配置', () => {
    assert.equal(parse({}, 'scale=9').scale, 3);
    assert.equal(parse({}, 'scale=0.01').scale, 0.2);
    assert.equal(parse({ obsScale: 1.2 }, 'scale=abc').scale, 1.2);
    assert.equal(parse({ obsScale: 99 }).scale, 3);
  });

  test('非法开关参数按配置处理', () => {
    assert.equal(parse({ obsShowPet: false }, 'pet=maybe').showPet, false);
    assert.equal(parse({}, 'pet=0').showPet, false);
    assert.equal(parse({}, 'bubble=0').showBubble, false);
  });
});
