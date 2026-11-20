/**
 * 抖音进房纯函数：房间号解析与在播判定。
 * @module dsh-pet/src/host/danmaku/douyin/live-info.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkDyCookie, extractWebRid, isDyRoomLiving, normalizeLiveUrl } from './live-info.ts';

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
  test('Cookie 自带 uid 与服务端回显一致 → ok', () => {
    assert.deepEqual(checkDyCookie('sessionid=s; uid_tt=123', '123'), { ok: true });
  });

  test('备选会话/uid 键（sessionid_ss、sid_tt、uid_ss、uid）同样识别', () => {
    assert.deepEqual(checkDyCookie('sessionid_ss=s; uid_ss=456', '456'), { ok: true });
    assert.deepEqual(checkDyCookie('sid_tt=s; uid=789', '789'), { ok: true });
    assert.deepEqual(checkDyCookie('sessionid=s; uid_tt_ss=321', '321'), { ok: true });
  });

  test('容忍多余空格与分号写法', () => {
    assert.deepEqual(checkDyCookie(' sessionid=s ; uid_tt=123 ; ', '123'), { ok: true });
  });

  test('无任何会话键（如只有 ttwid）→ no-session', () => {
    assert.deepEqual(checkDyCookie('ttwid=t; uid_tt=123', '123'), {
      ok: false,
      reason: 'no-session',
    });
  });

  test('有会话键但缺 uid → no-uid', () => {
    assert.deepEqual(checkDyCookie('sessionid=s', '123'), { ok: false, reason: 'no-uid' });
  });

  test('Cookie 完整但服务端没回显 uid → no-server-uid', () => {
    assert.deepEqual(checkDyCookie('sessionid=s; uid_tt=123', ''), {
      ok: false,
      reason: 'no-server-uid',
    });
  });

  test('Cookie uid 与服务端回显不一致 → mismatch', () => {
    assert.deepEqual(checkDyCookie('sessionid=s; uid_tt=123', '999'), {
      ok: false,
      reason: 'mismatch',
    });
  });

  test('Cookie 过期被打回游客占位账号 → mismatch（不能误判为有效）', () => {
    assert.deepEqual(checkDyCookie('sessionid=s; uid_tt=123', DY_GUEST_PLACEHOLDER_UID), {
      ok: false,
      reason: 'mismatch',
    });
  });

  test('多个 uid 键时按优先级取第一个非空值', () => {
    // uid_tt 优先级最高，即使后面还有别的 uid，也以 uid_tt 为准。
    assert.deepEqual(checkDyCookie('sessionid=s; uid=1; uid_tt=555', '555'), { ok: true });
    assert.deepEqual(checkDyCookie('sessionid=s; uid=1; uid_tt=555', '1'), {
      ok: false,
      reason: 'mismatch',
    });
  });
});
