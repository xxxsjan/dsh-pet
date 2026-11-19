/**
 * 礼物图标表的契约测试：名字归一、平台隔离与页面注入的映射。
 *
 * 只测纯函数：取图走网络，测试里不碰。
 * @module dsh-pet/src/standalone/live-gift-icon.test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  giftIconProxyPath,
  giftIconUrlMapJson,
  resolveGiftIconUrl,
} from './live-gift-icon.ts';
import { consoleScript } from './console-page.ts';

const DY_LAMP = 'https://p3-webcast.douyinpic.com/img/webcast/722e56b42551d6490e5ebd9521287c67.png~tplv-obj.png';
const DY_HEART = 'https://p3-webcast.douyinpic.com/img/webcast/154c9946db73cba98529ab66792e5385.png~tplv-obj.png';

test('抖音灯牌与小心心：命中官方图', () => {
  assert.equal(resolveGiftIconUrl('douyin', '粉丝团灯牌'), DY_LAMP);
  assert.equal(resolveGiftIconUrl('douyin', '小心心'), DY_HEART);
  assert.match(resolveGiftIconUrl('douyin', '入团卡'), /698373dfdac86a90b54facdc38698cbc/, '入团卡路径不带 .png 段');
});

test('站内同义写法走别名：小星星 → 小心心，灯牌 → 粉丝团灯牌', () => {
  assert.equal(resolveGiftIconUrl('douyin', '小星星'), DY_HEART);
  assert.equal(resolveGiftIconUrl('douyin', '灯牌'), DY_LAMP);
  assert.equal(resolveGiftIconUrl('douyin', ' 粉色小星星 '), '', '别名外的写法不猜图');
});

test('平台各用各的表：同名灯牌在快手取快手图', () => {
  const ks = resolveGiftIconUrl('kuaishou', '粉丝团灯牌');
  assert.match(ks, /^https:\/\/p66-live\.wskwai\.com\//);
  assert.notEqual(ks, DY_LAMP);
  assert.match(resolveGiftIconUrl('bilibili', '辣条'), /^https:\/\/s1\.hdslb\.com\//);
});

test('未收录的礼物与无名字的兜底名一律不给图', () => {
  assert.equal(resolveGiftIconUrl('douyin', '神秘礼物'), '');
  assert.equal(resolveGiftIconUrl('douyin', '礼物#12345'), '');
  assert.equal(resolveGiftIconUrl('douyin', ''), '');
  assert.equal(resolveGiftIconUrl('xiaohongshu', '小红花'), '', '小红书暂无图源');
  assert.equal(resolveGiftIconUrl('douyin', '粉丝团灯牌'), DY_LAMP, '平台参数缺失时不越界');
  assert.equal(resolveGiftIconUrl('', '粉丝团灯牌'), '');
});

test('代理路径：同源、参数编码、未收录为空', () => {
  const path = giftIconProxyPath('douyin', '粉丝团灯牌');
  assert.match(path, /^\/standalone-console\/gift-icon\?p=douyin&n=/);
  assert.equal(decodeURIComponent(path.split('&n=')[1]), '粉丝团灯牌');
  assert.equal(giftIconProxyPath('douyin', '神秘礼物'), '');
});

test('页面注入的映射：标准名与别名都在，且只指向同源代理', () => {
  const map = JSON.parse(giftIconUrlMapJson()) as Record<string, string>;
  assert.ok(Object.keys(map).length > 20, '至少覆盖三个平台的常见礼物');
  assert.match(map['douyin|粉丝团灯牌'], /^\/standalone-console\/gift-icon/);
  assert.match(map['douyin|灯牌'], /^\/standalone-console\/gift-icon/, '别名写法也要有');
  assert.match(map['kuaishou|粉丝团灯牌'], /^\/standalone-console\/gift-icon/);
  for (const value of Object.values(map)) {
    assert.ok(value.startsWith('/standalone-console/gift-icon'), '不允许出现外链直连');
  }
});

test('控制台脚本接线：注入映射表，四个平台的礼物行都按名字取图', () => {
  assert.match(consoleScript, /var GIFT_ICON_URLS = \{/);
  for (const platform of ['douyin', 'xiaohongshu', 'kuaishou', 'bilibili']) {
    assert.match(
      consoleScript,
      new RegExp(`row\\.appendChild\\(dmGiftTile\\(item\\.text, '${platform}'\\)\\)`),
      `${platform} 礼物行应把礼物名交给礼物托`,
    );
  }
  assert.match(consoleScript, /dmGiftReal/, '取到图时切真实图样式');
});
