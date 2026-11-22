/**
 * 礼物解码：GiftMessage 与 LightGiftMessage 两套 proto 不能混用。
 * 回归用例来自线上实际消息：轻礼物被当成 GiftMessage 解，解出「礼物#1 ×7438230668013258000」。
 * @module dsh-pet/src/host/danmaku/douyin/gift-parse.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { GiftMessage, LightGiftMessage } from './proto.ts';
import { LIGHT_GIFT_NICK, parseGiftMessage, parseLightGiftMessage } from './gift-parse.ts';

/** 真实轻礼物里出现的 19 位用户 ID（int64，超过 Number 安全整数）。 */
const TO_USER_ID = '7438230668013258000';

function encodeLight(over: Record<string, unknown>): Uint8Array {
  return LightGiftMessage.encode(LightGiftMessage.create(over)).finish();
}

function encodeGift(over: Record<string, unknown>): Uint8Array {
  return GiftMessage.encode(GiftMessage.create(over)).finish();
}

describe('抖音轻礼物解码', () => {
  test('回归：group_count 不再当礼物 ID，to_user_id 不再当件数', () => {
    const item = parseLightGiftMessage(
      encodeLight({
        groupCount: 1,
        count: 1,
        toUserId: TO_USER_ID,
        sendType: 0,
        giftInfo: { giftId: 2001, diamondCount: 0 },
        giftStruct: {
          name: '小心心',
          combo: false,
          image: { urlListList: ['https://p3-webcast.douyinpic.com/img/webcast/gift.png'] },
        },
      }),
    );
    assert.equal(item.source, 'light');
    assert.equal(item.giftName, '小心心', '礼物名应来自 gift_struct（字段 13）');
    assert.equal(item.giftId, '2001', '礼物 ID 应来自 gift_info.gift_id（字段 1）');
    assert.equal(item.giftImageUrl, 'https://p3-webcast.douyinpic.com/img/webcast/gift.png');
    assert.equal(item.count, 1, '件数应来自 count（字段 10），而不是 to_user_id');
    assert.equal(item.nick, LIGHT_GIFT_NICK, '轻礼物没有送礼人，用占位昵称');
    assert.equal(item.combo, false);
  });

  test('轻礼物取不到礼物名时按 gift_info 的 id 兜底', () => {
    const item = parseLightGiftMessage(encodeLight({ count: 2, giftInfo: { giftId: 2001 } }));
    assert.equal(item.giftName, '礼物#2001');
    assert.equal(item.count, 2);
  });

  test('轻礼物只有 repeat_count 时也能拿到件数', () => {
    const item = parseLightGiftMessage(encodeLight({ repeatCount: 5, giftInfo: { giftId: 2002 } }));
    assert.equal(item.count, 5);
  });

  test('轻礼物空 payload 不当假礼物', () => {
    const item = parseLightGiftMessage(encodeLight({}));
    assert.equal(item.count, 1, '没读到件数时兜底 1，而不是 0 或天文数字');
    assert.equal(item.giftName, '礼物');
  });
});

describe('抖音正常礼物解码', () => {
  test('连击件数与定稿标记按 GiftMessage 字段读', () => {
    const item = parseGiftMessage(
      encodeGift({
        giftId: 762,
        repeatCount: 3,
        comboCount: 3,
        repeatEnd: 1,
        groupId: 99,
        user: { nickName: '阿财' },
        gift: { name: '大啤酒', combo: true, type: 1 },
      }),
    );
    assert.equal(item.source, 'gift');
    assert.equal(item.nick, '阿财');
    assert.equal(item.giftName, '大啤酒');
    assert.equal(item.count, 3);
    assert.equal(item.combo, true);
    assert.equal(item.repeatEnd, 1);
    assert.equal(item.groupId, '99');
  });

  test('combo_count 与 repeat_count 不一致时取较大可靠件数', () => {
    const item = parseGiftMessage(encodeGift({ giftId: 762, repeatCount: 5, comboCount: 1, gift: { name: '大啤酒' } }));
    assert.equal(item.count, 5, '不应只取较小的 combo_count 低估连击');
  });

  test('超大「件数」不采信：字段错位/精度丢失时兜底 1', () => {
    const item = parseGiftMessage(encodeGift({ giftId: 762, repeatCount: TO_USER_ID, gift: { name: '大啤酒' } }));
    assert.equal(item.count, 1, '超出可信范围的件数应按 1 处理');
  });

  test('无昵称回落匿名，无礼物名回落礼物#id', () => {
    const item = parseGiftMessage(encodeGift({ giftId: 762, repeatCount: 1 }));
    assert.equal(item.nick, '匿名');
    assert.equal(item.giftName, '礼物#762');
  });

  test('礼物标记缺失但件数已增长时仍识别为可连击', () => {
    const item = parseGiftMessage(encodeGift({ giftId: 762, repeatCount: 5, comboCount: 5, gift: { name: '大啤酒' } }));
    assert.equal(item.combo, true);
  });

  test('显式 group_id=0 视为无连击组，避免不同礼物被错误合并', () => {
    const encoded = encodeGift({ giftId: 762, repeatCount: 1 });
    const payload = new Uint8Array([...encoded, 0x58, 0x00]);
    const item = parseGiftMessage(payload);
    assert.equal(item.groupId, '');
  });
});
