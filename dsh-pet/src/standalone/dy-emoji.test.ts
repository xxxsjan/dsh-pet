/**
 * 抖音弹幕表情的契约测试：表完整性、token 归一、同源代理与页面接线。
 *
 * 取图走网络，测试里不碰；这里只验证地址拼装和页面脚本的接线。
 * @module dsh-pet/src/standalone/dy-emoji.test
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { consoleScript, consoleStyle } from './console-page.ts';
import { createRequestSecurity } from './request-security.ts';
import { DY_EMOJI_TOKEN_RE, dyEmojiNameMapJson, dyEmojiProxyPath, resolveDyEmojiUrl } from './dy-emoji.ts';
import { DY_EMOJI_TABLE } from './dy-emoji-table.ts';

test('表情表：条目齐、键是 [名字]、值是非空的 hash+签名', () => {
  const tokens = Object.keys(DY_EMOJI_TABLE);
  assert.ok(tokens.length > 300, `表条目偏少：${tokens.length}`);
  for (const token of tokens) {
    assert.match(token, /^\[[^[\]\s]{1,20}\]$/, `${token} 不是合法的 [名字] 形式`);
    const entry = DY_EMOJI_TABLE[token];
    assert.equal(entry.length, 2, `${token} 应为 [hash, 签名]`);
    assert.match(entry[0], /^[0-9a-f]{32}$/, `${token} 的 hash 不像 32 位十六进制`);
    assert.ok(entry[1].length > 10, `${token} 的签名为空`);
  }
});

test('已知表情能拼出签名图地址', () => {
  const url = resolveDyEmojiUrl('[微笑]');
  assert.match(url, /^https:\/\/p3-pc-sign\.douyinpic\.com\/obj\/tos-cn-i-tsj2vxp0zn\//);
  assert.match(url, new RegExp(DY_EMOJI_TABLE['[微笑]'][0]));
  assert.match(url, /lk3s=343af0a2&x-expires=2086988400&from=876277922/);
  assert.match(url, /&x-signature=/);
  assert.ok(url.endsWith(encodeURIComponent(DY_EMOJI_TABLE['[微笑]'][1])), '签名要 URL 编码后拼在末尾');
  assert.equal(resolveDyEmojiUrl('微笑'), url, '带不带方括号等价');
});

test('未收录 token 与空值一律不给图', () => {
  assert.equal(resolveDyEmojiUrl('[不存在的表情]'), '');
  assert.equal(resolveDyEmojiUrl(''), '');
  assert.equal(resolveDyEmojiUrl(null), '');
  assert.equal(resolveDyEmojiUrl(undefined), '');
});

test('同源代理路径：编码 token，未收录为空', () => {
  const path = dyEmojiProxyPath('[微笑]');
  assert.match(path, /^\/standalone-console\/emoji\?n=/);
  assert.equal(decodeURIComponent(path.split('?n=')[1]), '[微笑]');
  assert.equal(dyEmojiProxyPath('[不存在的表情]'), '');
});

test('页面用的已知表情集合与表一致', () => {
  const map = JSON.parse(dyEmojiNameMapJson()) as Record<string, 1>;
  assert.equal(Object.keys(map).length, Object.keys(DY_EMOJI_TABLE).length);
  assert.equal(map['[微笑]'], 1);
});

test('控制台脚本接线：抖音弹幕正文走富文本渲染，且不含外链', () => {
  assert.match(consoleScript, /var DY_EMOJI_NAMES = {/);
  assert.ok(consoleScript.includes(DY_EMOJI_TOKEN_RE.source), '页面正则必须与后端同一套');
  assert.match(consoleScript, /bodyBox\.appendChild\(dmRichText\(item\.text\)\)/, '抖音弹幕正文换成富文本');
  assert.ok(consoleScript.includes('/standalone-console/emoji?n='), '表情图走同源路由');
  assert.match(consoleStyle, /\.dmEmoji{/, '表情图样式已进页面');
  assert.ok(!consoleScript.includes('p3-pc-sign'), '页面不许出现签名外链');
});

/** 假请求：只喂 authorize 用到的字段。 */
function fakeRequest(url: string, method = 'GET'): IncomingMessage {
  return {
    headers: { host: '127.0.0.1:3080' },
    socket: { localPort: 3080 },
    method,
    url,
  } as unknown as IncomingMessage;
}

/** 假响应：记下被拒时的状态码。 */
function fakeResponse() {
  return {
    status: 0,
    headers: {} as Record<string, string>,
    writeHead(status: number, headers: Record<string, string>) {
      this.status = status;
      Object.assign(this.headers, headers);
    },
    setHeader() {},
    end() {},
  };
}

test('取图路由公开只读：img 子资源不带令牌也能取，写方法仍被拒', () => {
  const security = createRequestSecurity();
  const paths = [
    '/standalone-console/emoji?n=%5B%E5%BE%AE%E7%AC%91%5D',
    '/standalone-console/gift-icon?p=douyin&n=%E7%B2%89%E4%B8%9D%E5%9B%A2%E7%81%AF%E7%89%8C',
  ];
  for (const path of paths) {
    // <img> 带不了 x-blue-fish-token，靠会话 cookie 也不稳，所以必须进公开只读名单。
    assert.equal(security.authorize(fakeRequest(path), fakeResponse() as unknown as ServerResponse), true, path);
    const rejected = fakeResponse();
    assert.equal(
      security.authorize(fakeRequest(path, 'POST'), rejected as unknown as ServerResponse),
      false,
      `${path} 的写方法应被拒`,
    );
    assert.equal(rejected.status, 403, path);
  }
});
