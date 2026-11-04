/**
 * 抖音进房纯函数：房间号解析与在播判定。
 * @module dsh-pet/src/host/danmaku/douyin/live-info.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { extractWebRid, isDyRoomLiving, normalizeLiveUrl } from './live-info.ts';

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
