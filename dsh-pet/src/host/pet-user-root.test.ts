/**
 * 用户数据根路径。
 * 跑法：node --experimental-strip-types --test src/host/pet-user-root.test.ts
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';

import { petUserRootForHome, PET_USER_DIR } from './pet-user-root.ts';

describe('petUserRootForHome', () => {
  test('…/.dsh → 同级 .blue-fish', () => {
    assert.equal(petUserRootForHome(join('/Users/x', '.dsh')), join('/Users/x', PET_USER_DIR));
  });

  test('自定义 home → {home}/dsh-pet', () => {
    assert.equal(petUserRootForHome(join('/tmp', 'iso')), join('/tmp', 'iso', 'dsh-pet'));
  });
});
