/**
 * 抖音礼物消息解码：`GiftMessage` 与 `LightGiftMessage` 是两套互不相干的 proto，
 * 必须按 method 分开解。混用 schema 会把 LightGiftMessage 的 group_count 当成礼物 ID、
 * 把 to_user_id（19 位用户 ID）当成连击件数，解出「礼物#1 ×7438230668013258000」这种假数量。
 *
 * 另外 int64 超过 JS `Number` 安全整数（2^53）会丢精度（尾部抹零），
 * 所以件数统一过一道上限保护，明显不像件数的值不采信。
 * @module dsh-pet/src/host/danmaku/douyin/gift-parse
 */
import { GiftMessage, LightGiftMessage } from './proto.ts';

/** 归一后的礼物事件。 */
export type DyGiftItem = {
  /** 来源：gift = 正常礼物；light = 轻礼物（免费动画/点赞类）。 */
  source: 'gift' | 'light';
  nick: string;
  giftName: string;
  giftId: string;
  giftImageUrl: string;
  count: number;
  /** 连击定稿标记；轻礼物恒为 1。 */
  repeatEnd: number;
  /** 是否可连击。 */
  combo: boolean;
  groupId: string;
};

type GiftImage = { urlListList?: string[]; uri?: string };
type GiftVisual = { image?: GiftImage; icon?: GiftImage };

/**
 * 单次礼物件数上限：真人连击/组刷远低于此值，
 * 超过基本可判定是字段错位或 int64 精度丢失，按 1 处理。
 */
const MAX_GIFT_COUNT = 100_000;

/** 轻礼物没有送礼人字段时的占位昵称。 */
export const LIGHT_GIFT_NICK = '神秘人';

/** 把 protobufjs 的 uint64（number / Long / bigint / string）折成数字。 */
export function numish(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (
    v &&
    typeof v === 'object' &&
    'toNumber' in v &&
    typeof (v as { toNumber: () => number }).toNumber === 'function'
  ) {
    try {
      const n = (v as { toNumber: () => number }).toNumber();
      return Number.isFinite(n) ? n : fallback;
    } catch {
      return fallback;
    }
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 件数兜底：0/负数/超大一律不采信，返回 0 表示「没读到可信件数」。 */
function safeCount(v: unknown): number {
  const n = numish(v, 0);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_GIFT_COUNT) return 0;
  return Math.floor(n);
}

/** `送出xxx` 这种 describe 兜底名去掉前缀。 */
function nameFromDescribe(describe: unknown): string {
  return String(describe || '')
    .replace(/^送出?/, '')
    .trim();
}

/** protobuf 会显式携带 group_id=0；0 不是有效连击组，不能拿它合并所有礼物。 */
function parseGroupId(value: unknown): string {
  const groupId = String(value ?? '').trim();
  return /^0+$/.test(groupId) ? '' : groupId;
}

function readGiftImageUrl(gift: GiftVisual): string {
  return String(gift.image?.urlListList?.[0] || gift.image?.uri || gift.icon?.urlListList?.[0] || gift.icon?.uri || '');
}

/**
 * 解 `WebcastGiftMessage`（正常礼物，带送礼人 User 与连击信息）。
 */
export function parseGiftMessage(payload: Uint8Array): DyGiftItem {
  const giftMsg = GiftMessage.decode(payload) as {
    giftId?: unknown;
    repeatCount?: unknown;
    comboCount?: unknown;
    repeatEnd?: unknown;
    groupId?: unknown;
    user?: { nickName?: string };
    gift?: {
      name?: string;
      describe?: string;
      combo?: boolean;
      type?: number;
      id?: unknown;
      image?: GiftImage;
      icon?: GiftImage;
    };
  };
  const nick = String(giftMsg.user?.nickName || '').trim() || '匿名';
  const giftObj = giftMsg.gift || {};
  let giftName = String(giftObj.name || '').trim();
  if (!giftName) giftName = nameFromDescribe(giftObj.describe);
  const giftId = String(giftMsg.giftId ?? giftObj.id ?? '').trim();
  if (!giftName) giftName = giftId ? `礼物#${giftId}` : '礼物';
  // 两个字段可能分别表示连击累计与本段件数：取较大且可信值，避免只取较小字段低估连击。
  const comboCount = safeCount(giftMsg.comboCount);
  const repeatCount = safeCount(giftMsg.repeatCount);
  const count = Math.max(comboCount, repeatCount, 1);
  const repeatEnd = numish(giftMsg.repeatEnd, 0);
  const giftType = numish(giftObj.type, 0);
  const combo = !!giftObj.combo || giftType === 1 || comboCount > 1 || repeatCount > 1;
  return {
    source: 'gift',
    nick,
    giftName,
    giftId,
    giftImageUrl: readGiftImageUrl(giftObj),
    count,
    repeatEnd,
    combo,
    groupId: parseGroupId(giftMsg.groupId),
  };
}

/**
 * 解 `WebcastLightGiftMessage`（轻礼物）：结构里只有收礼人 to_user_id、没有送礼人，
 * 也没有连击与会话组，按一次性事件处理，件数取 count / repeat_count。
 */
export function parseLightGiftMessage(payload: Uint8Array): DyGiftItem {
  const m = LightGiftMessage.decode(payload) as {
    groupCount?: unknown;
    repeatCount?: unknown;
    comboCount?: unknown;
    count?: unknown;
    giftInfo?: { giftId?: unknown };
    giftStruct?: {
      name?: string;
      describe?: string;
      id?: unknown;
      image?: GiftImage;
      icon?: GiftImage;
    };
  };
  const giftObj = m.giftStruct || {};
  let giftName = String(giftObj.name || '').trim();
  if (!giftName) giftName = nameFromDescribe(giftObj.describe);
  const giftId = String(m.giftInfo?.giftId ?? giftObj.id ?? '').trim();
  if (!giftName) giftName = giftId ? `礼物#${giftId}` : '礼物';
  // 多个字段可能分别表示总数、段数或分组数；取可靠最大值，避免低估轻礼物件数。
  const count = Math.max(safeCount(m.count), safeCount(m.repeatCount), safeCount(m.groupCount), 1);
  return {
    source: 'light',
    nick: LIGHT_GIFT_NICK,
    giftName,
    giftId,
    giftImageUrl: readGiftImageUrl(giftObj),
    count,
    repeatEnd: 1,
    combo: false,
    groupId: '',
  };
}
