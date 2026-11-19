/**
 * 小红书弹幕表情的契约测试：token 归一、地址拼装、同源代理与内置兜底图。
 *
 * 外链取图走网络，测试里不碰；只验证不联网也能成立的部分。
 * @module dsh-pet/src/standalone/xhs-emoji.test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearXhsEmojiCache,
  loadXhsEmoji,
  normalizeXhsEmojiName,
  resolveXhsEmojiUrl,
  xhsEmojiProxyPath,
  xhsEmojiUrlMapJson,
} from './xhs-emoji.ts';

test('token 归一：去方括号、补站内 R/H 后缀、认别名', () => {
  assert.equal(normalizeXhsEmojiName('[微笑R]'), '微笑R');
  assert.equal(normalizeXhsEmojiName('[微笑r]'), '微笑R', '后缀大小写都要认');
  assert.equal(normalizeXhsEmojiName('[微笑]'), '微笑R', '漏了后缀也要能补上');
  assert.equal(normalizeXhsEmojiName('微笑'), '微笑R', '带不带方括号等价');
  assert.equal(normalizeXhsEmojiName('[蹲后续H]'), '蹲后续H', 'H 后缀不是 R 的别名，原样保留');
  assert.equal(normalizeXhsEmojiName('[扯脸H]'), '扯脸H');
  assert.equal(normalizeXhsEmojiName('[doge]'), 'doge');
  assert.equal(normalizeXhsEmojiName('[点赞]'), '点赞R');
  assert.equal(normalizeXhsEmojiName('[红花]'), '小红花');
});

test('官方码主表覆盖常见表情，不再只剩几十张脸', () => {
  for (const code of ['[鼓掌R]', '[玫瑰R]', '[爱心R]', '[拥抱R]', '[加油R]', '[生日蛋糕R]', '[购物车R]', '[飞机R]']) {
    assert.notEqual(normalizeXhsEmojiName(code), '', `${code} 应在主表内`);
  }
});

test('主表缺图的码回落到 PNG 合集，名字不带后缀', () => {
  assert.equal(normalizeXhsEmojiName('[笑哭了R]'), '笑哭了');
  assert.equal(normalizeXhsEmojiName('[心心眼R]'), '心心眼');
});

test('未收录 token 与空值一律归一为空串', () => {
  assert.equal(normalizeXhsEmojiName('[比心R]'), '');
  assert.equal(normalizeXhsEmojiName('[不存在的表情]'), '');
  assert.equal(normalizeXhsEmojiName('[不存在的表情R]'), '');
  assert.equal(normalizeXhsEmojiName('[]'), '');
  assert.equal(normalizeXhsEmojiName(''), '');
  assert.equal(normalizeXhsEmojiName(null), '');
  assert.equal(normalizeXhsEmojiName(undefined), '');
});

test('主表出 webp 小图，回落表出 png，中文名都要 URL 编码', () => {
  assert.equal(resolveXhsEmojiUrl('[微笑R]'), 'https://sticker.sokoko.org/assets/rednote/%E5%BE%AE%E7%AC%91R.webp');
  assert.equal(resolveXhsEmojiUrl('[doge]'), 'https://sticker.sokoko.org/assets/rednote/doge.webp');
  const fallbackUrl = resolveXhsEmojiUrl('[笑哭了R]');
  assert.match(fallbackUrl, /^https:\/\/wsrv\.nl\/\?url=/, '回落图要先过缩图代理，别把几 MB 原图甩给页面');
  assert.ok(
    fallbackUrl.includes(encodeURIComponent('https://cdn.jsdelivr.net/gh/Augenstern-O/Stickers/RedNote/笑哭了.png')),
    '缩图代理要指向合集里的原始 PNG',
  );
  assert.match(fallbackUrl, /w=96/, '缩到 96px');
  assert.equal(resolveXhsEmojiUrl('[不存在的表情]'), '');
});

test('只有内置图的表情不给外链，避免页面去取一张必然 404 的图', () => {
  assert.equal(normalizeXhsEmojiName('[小红花]'), '小红花');
  assert.equal(resolveXhsEmojiUrl('[小红花]'), '');
});

test('同源代理路径按资源名归一：同一张图的不同写法共用一条地址', () => {
  const path = xhsEmojiProxyPath('[微笑R]');
  assert.match(path, /^\/standalone-console\/emoji\?p=xhs&n=/);
  assert.equal(decodeURIComponent(path.split('&n=')[1]), '微笑R');
  assert.equal(xhsEmojiProxyPath('[微笑]'), path);
  assert.equal(xhsEmojiProxyPath('[点赞R]'), xhsEmojiProxyPath('[点赞]'));
  assert.equal(xhsEmojiProxyPath('[不存在的表情]'), '');
});

test('页面映射：主表名、裸名字、回落名与别名都在，值全是同源取图路径', () => {
  const map = JSON.parse(xhsEmojiUrlMapJson()) as Record<string, string>;
  assert.equal(map['微笑R'], xhsEmojiProxyPath('[微笑R]'));
  assert.equal(map['微笑'], xhsEmojiProxyPath('[微笑]'), '裸名字也要能直接查表');
  assert.equal(map['鼓掌R'], xhsEmojiProxyPath('[鼓掌R]'));
  assert.equal(map['点赞'], xhsEmojiProxyPath('[点赞R]'));
  assert.equal(map['小红花'], xhsEmojiProxyPath('[小红花]'));
  assert.ok(Object.keys(map).length > 150, `页面表应覆盖主表与回落表，实际只有 ${Object.keys(map).length} 条`);
  for (const [name, path] of Object.entries(map)) {
    assert.ok(path.startsWith('/standalone-console/emoji?p=xhs&n='), `${name} 的取图地址必须是同源路径`);
  }
});

test('内置兜底图不联网即可取回，别名写法命中同一份缓存', async () => {
  clearXhsEmojiCache();
  const first = await loadXhsEmoji('[小红花]');
  assert.ok(first, '内置图应能取回');
  assert.equal(first.contentType, 'image/svg+xml');
  assert.match(first.body.toString('utf8'), /^<svg /);
  const second = await loadXhsEmoji('[红花]');
  assert.equal(second, first, '归一到同一资源名后应命中缓存');
  clearXhsEmojiCache();
  assert.notEqual(await loadXhsEmoji('[小红花]'), first, '清缓存后应重新构建');
});

test('未收录表情取图返回 null，不发请求', async () => {
  assert.equal(await loadXhsEmoji('[不存在的表情]'), null);
  assert.equal(await loadXhsEmoji(''), null);
});
