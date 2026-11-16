/**
 * 快手礼物名称目录测试：allgifts 字典 / gift-list 列表解析、命中与兜底、预拉容错。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-gift-catalog.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createKsGiftCatalog, preloadKsGiftCatalog } from './ks-gift-catalog.ts';

describe('快手礼物目录', () => {
  test('allgifts 字典按 giftId 取名称', () => {
    const catalog = createKsGiftCatalog();
    catalog.ingestAllGifts({ data: { '456': { giftName: '棒棒糖' }, '789': { name: '啤酒' } } });
    assert.equal(catalog.nameFor('456'), '棒棒糖');
    assert.equal(catalog.nameFor('789'), '啤酒');
  });

  test('gift-list 列表解析 giftId/name', () => {
    const catalog = createKsGiftCatalog();
    catalog.ingestAllGifts({ data: { gifts: [{ giftId: 12, giftName: '火箭' }, { id: 34, name: '心心' }] } });
    assert.equal(catalog.nameFor('12'), '火箭');
    assert.equal(catalog.nameFor('34'), '心心');
  });

  test('未命中兜底 礼物#<id>，空 id 兜底 礼物', () => {
    const catalog = createKsGiftCatalog();
    assert.equal(catalog.nameFor('12'), '礼物#12');
    assert.equal(catalog.nameFor(''), '礼物');
  });

  test('clear 后缓存清空', () => {
    const catalog = createKsGiftCatalog();
    catalog.ingestAllGifts({ data: { '456': { giftName: '棒棒糖' } } });
    catalog.clear();
    assert.equal(catalog.nameFor('456'), '礼物#456');
  });

  test('预拉成功灌入目录', async () => {
    const catalog = createKsGiftCatalog();
    const fakeFetch = async () =>
      new Response(JSON.stringify({ data: { '456': { giftName: '棒棒糖' } } }));
    await preloadKsGiftCatalog(catalog, fakeFetch);
    assert.equal(catalog.nameFor('456'), '棒棒糖');
  });

  test('预拉失败不阻断，名称回落兜底', async () => {
    const catalog = createKsGiftCatalog();
    const fakeFetch = async () => {
      throw new Error('network down');
    };
    await preloadKsGiftCatalog(catalog, fakeFetch);
    assert.equal(catalog.nameFor('456'), '礼物#456');
  });
});
