/**
 * 抖音进房纯函数：房间号解析与在播判定。
 * @module dsh-pet/src/host/danmaku/douyin/live-info.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkDyCookie, checkDyCookieShape, extractWebRid, isDyRoomLiving, normalizeLiveUrl } from './live-info.ts';

describe('douyin live-info helpers', () => {
  test('extractWebRid 认链接与纯数字', () => {
    assert.equal(extractWebRid('https://live.douyin.com/123456789'), '123456789');
    assert.equal(extractWebRid('123456789'), '123456789');
    assert.equal(extractWebRid('https://www.douyin.com/user/x'), undefined);
  });

  test('normalizeLiveUrl 收成标准 live URL', () => {
    assert.equal(normalizeLiveUrl('987654321'), 'https://live.douyin.com/987654321');
    assert.throws(() => normalizeLiveUrl('not-a-room'), /live\.douyin\.com/);
  });

  test('isDyRoomLiving：status=2 且无 finish/reflow 视为在播', () => {
    assert.equal(isDyRoomLiving({ status: 2, id_str: '1' }, 0), true);
    assert.equal(isDyRoomLiving({ status: 2, finish_time: 1, id_str: '1' }, 0), false);
    assert.equal(isDyRoomLiving({ status: 2, id_str: '1' }, 2), false);
    assert.equal(isDyRoomLiving({ status: 4, id_str: '1' }, 0), false);
  });
});

/** 游客态 enter 回显的固定占位账号 uid；过期 Cookie 被服务端打回游客时会回显它。 */
const DY_GUEST_PLACEHOLDER_UID = '3677211856479552';

describe('checkDyCookie 登录态校验', () => {
  test('有 session + 真实服务端 uid → ok', () => {
    assert.deepEqual(checkDyCookie('sessionid=s', '1234567890'), { ok: true });
  });

  test('备选会话键（sessionid_ss、sid_tt）同样识别', () => {
    assert.deepEqual(checkDyCookie('sessionid_ss=s', '456'), { ok: true });
    assert.deepEqual(checkDyCookie('sid_tt=s', '789'), { ok: true });
  });

  test('Cookie 里的 uid_tt（加密 hash）不再参与校验，不影响结果', () => {
    // 以前 Cookie 里的 uid_tt 和服务端 uid 必须完全一致才过——但抖音现在 uid_tt 是加密 hash，
    // 根本没法和明文 uid 比对。现在只看 session + 服务端回显即可。
    assert.deepEqual(
      checkDyCookie('sessionid=s; uid_tt=771b6d43cd6c4878ddfeb5a153f6757f', '3943302109342269'),
      { ok: true },
    );
  });

  test('无任何会话键（如只有 ttwid）→ no-session', () => {
    assert.deepEqual(checkDyCookie('ttwid=t', '123'), {
      ok: false,
      reason: 'no-session',
    });
  });

  test('Cookie 完整但服务端没回显 uid → no-server-uid', () => {
    assert.deepEqual(checkDyCookie('sessionid=s', ''), {
      ok: false,
      reason: 'no-server-uid',
    });
  });

  test('服务端回显游客占位 uid → guest-placeholder（Cookie 被打回游客）', () => {
    assert.deepEqual(checkDyCookie('sessionid=s', DY_GUEST_PLACEHOLDER_UID), {
      ok: false,
      reason: 'guest-placeholder',
    });
  });

  test('容忍多余空格与分号写法', () => {
    assert.deepEqual(checkDyCookie(' sessionid=s ; uid_tt=123 ; ', '456'), { ok: true });
  });
});

describe('checkDyCookieShape 本地结构预检', () => {
  test('完整登录 Cookie（有 sessionid）：不发请求也判 ok', () => {
    assert.deepEqual(checkDyCookieShape('sessionid=s; uid_tt=abc'), { ok: true });
  });

  test('只有 ttwid / 只有 uid_tt、没有 session → no-session', () => {
    assert.deepEqual(checkDyCookieShape('ttwid=t'), { ok: false, reason: 'no-session' });
    assert.deepEqual(checkDyCookieShape('uid_tt=abc'), { ok: false, reason: 'no-session' });
  });

  test('有 session 就够了，Cookie 里缺 uid 也过预检（抖音已把明文 uid 从 Cookie 移除）', () => {
    assert.deepEqual(checkDyCookieShape('sessionid=s'), { ok: true });
  });
});
