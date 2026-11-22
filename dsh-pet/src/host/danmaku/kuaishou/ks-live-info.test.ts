/**
 * 快手进房解析纯函数测试：Cookie 清洗/登录判定、URL 归一化、jar、页面字段提取、换票 JSON。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-live-info.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  cookieHasKsLogin,
  extractKsEmojiPanel,
  extractKsLiveStreamId,
  extractKsPrincipalId,
  extractKsRateLimit,
  extractKsTitle,
  extractKsWsBundle,
  normalizeKsRoomUrl,
  parseKsWebsocketInfo,
  sanitizeKsCookie,
  createKsCookieJar,
} from './ks-live-info.ts';

describe('快手 Cookie 清洗与登录判定', () => {
  test('sanitizeKsCookie 去掉 Cookie: 前缀与换行', () => {
    assert.equal(
      sanitizeKsCookie('Cookie: userId=123; web_st=abc\r\nwebday7_st=zz'),
      'userId=123; web_st=abcwebday7_st=zz',
    );
  });

  test('userId + passToken 视为已登录', () => {
    assert.equal(cookieHasKsLogin('userId=123; passToken=tok'), true);
  });

  test('userId + web_st 视为已登录', () => {
    assert.equal(cookieHasKsLogin('userId=123; kuaishou.server.web_st=st'), true);
  });

  test('只有 userId 或缺会话都不算登录', () => {
    assert.equal(cookieHasKsLogin('userId=123'), false);
    assert.equal(cookieHasKsLogin('passToken=tok'), false);
    assert.equal(cookieHasKsLogin(''), false);
  });
});

describe('快手 URL 归一化', () => {
  test('裸 id 补成主播短链', () => {
    assert.equal(normalizeKsRoomUrl('abc123'), 'https://live.kuaishou.com/u/abc123');
  });

  test('已有 http 原样返回', () => {
    assert.equal(normalizeKsRoomUrl('https://live.kuaishou.com/u/abc123'), 'https://live.kuaishou.com/u/abc123');
  });

  test('live. 域名片段补 https', () => {
    assert.equal(normalizeKsRoomUrl('live.kuaishou.com/u/abc'), 'https://live.kuaishou.com/u/abc');
  });

  test('空地址抛错', () => {
    assert.throws(() => normalizeKsRoomUrl('   '), /快手直播间地址/);
  });

  test('从短链提取 principalId', () => {
    assert.equal(extractKsPrincipalId('https://live.kuaishou.com/u/abc_123/'), 'abc_123');
    assert.equal(extractKsPrincipalId('https://live.kuaishou.com/r/999'), '');
  });

  test('无 Cookie 页面内的 liveStreamId 也能提取', () => {
    assert.equal(extractKsLiveStreamId('{"liveStreamId":"stream_123456"}'), 'stream_123456');
    assert.equal(extractKsLiveStreamId('{\\"liveStreamId\\":\\"stream_654321\\"}'), 'stream_654321');
  });
});

describe('快手页面限流识别', () => {
  test('playList 里的「请求过快」应被识别为限流', () => {
    const body =
      '"playList":[{"liveStream":{},"isLiving":false,"errorType":{"type":2,"title":"请求过快，请稍后重试","content":"浏览其他内容"}}]';
    assert.equal(extractKsRateLimit(body), '请求过快，请稍后重试');
  });

  test('其它 errorType 不算限流', () => {
    const body = '"errorType":{"type":9,"title":"主播暂时离开","content":"稍后再来"}';
    assert.equal(extractKsRateLimit(body), '');
    assert.equal(extractKsRateLimit(''), '');
  });
});

describe('快手 Cookie jar', () => {
  test('merge 重复键覆盖并组装请求头', () => {
    const jar = createKsCookieJar('a=1; b=2; a=10');
    jar.merge('b=20; c=3');
    assert.equal(jar.header(), 'a=10; b=20; c=3');
  });

  test('applySetCookie 从数组收集覆盖', () => {
    const jar = createKsCookieJar('a=1');
    jar.applySetCookie(['b=2; Path=/; HttpOnly', 'c=3; Max-Age=60']);
    assert.equal(jar.header(), 'a=1; b=2; c=3');
  });
});

describe('快手页面字段提取', () => {
  test('extractKsTitle 优先 caption 兜底 title', () => {
    assert.equal(extractKsTitle('{"caption":"今晚开播"}'), '今晚开播');
    assert.equal(extractKsTitle('<title>  直播标题  </title>'), '直播标题');
  });

  test('extractKsLiveStreamId 取 JSON 字段', () => {
    assert.equal(extractKsLiveStreamId('{"liveStreamId":"stream-777","x":1}'), 'stream-777');
  });

  test('extractKsWsBundle 解析内嵌 wsFeedInfo', () => {
    const body =
      '{"wsFeedInfo":{"liveStreamId":"s-1","token":"t-abcdefghijklmnop","websocketUrls":["wss://ks.example/feed"]}}';
    const bundle = extractKsWsBundle(body);
    assert.ok(bundle);
    assert.equal(bundle?.liveStreamId, 's-1');
    assert.equal(bundle?.token, 't-abcdefghijklmnop');
    assert.equal(bundle?.websocketUrl, 'wss://ks.example/feed');
  });

  test('extractKsWsBundle 信息不全返回 null', () => {
    assert.equal(extractKsWsBundle('{"wsFeedInfo":{"liveStreamId":"s-1"}}'), null);
  });
});

describe('快手表情表提取', () => {
  test('从 webConfig.emojiPanel 取 token→图片，并补全 https', () => {
    const body = [
      '{"pcLive.webConfig":{}}',
      '{"pcLive.webConfig.emojiPanel":{"[666]":"\\u002F\\u002Fali2.a.yximgs.com\\u002Fbs2\\u002Femotion\\/e.png",',
      '"[捂脸]":"https://bd.a.yximgs.com/bs2/emotion/b.png","坏键":"//x.png"}}',
    ].join('');
    const panel = extractKsEmojiPanel(body);
    assert.equal(panel['[666]'], 'https://ali2.a.yximgs.com/bs2/emotion/e.png');
    assert.equal(panel['[捂脸]'], 'https://bd.a.yximgs.com/bs2/emotion/b.png');
    assert.equal(panel['坏键'], undefined);
  });

  test('页面没有表情表时返回空对象', () => {
    assert.deepEqual(extractKsEmojiPanel('<html></html>'), {});
  });
});

describe('快手 websocketinfo 换票 JSON', () => {
  test('解析 data.token 与 websocketUrls[0]', () => {
    const parsed = parseKsWebsocketInfo({
      data: { token: 't-123', websocketUrls: ['wss://ks.example/a', 'wss://ks.example/b'] },
    });
    assert.deepEqual(parsed, { token: 't-123', websocketUrl: 'wss://ks.example/a' });
  });

  test('缺 token 或 ws 返回 null', () => {
    assert.equal(parseKsWebsocketInfo({ data: { websocketUrls: ['wss://x'] } }), null);
    assert.equal(parseKsWebsocketInfo(null), null);
    assert.equal(parseKsWebsocketInfo({ data: {} }), null);
  });
});
