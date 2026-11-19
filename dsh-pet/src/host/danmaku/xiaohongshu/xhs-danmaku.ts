/**
 * 小红书中控台 longlink 弹幕解码（对齐 danmuapp `src/platforms/xhsDanmaku.js`）。
 *
 * 中控台 WS 帧是 JSON：`body.customData`，或 `b.d.b[]` 里 base64 包裹的消息体；
 * 无 protobuf、无压缩。入库「文本弹幕」「礼物」与「在线统计」，
 * 进场 / 关注 / 礼物托/结算先留样本不入库。
 *
 * 字段按实测/同类实现做兼容：`text_message` 等弹幕别名、礼物别名与数量兜底；
 * 在线人数只认 `refresh` 类统计里的 `member_count` 系列，
 * `viewer_count` 是累计观看，不能混用。
 * @module dsh-pet/src/host/danmaku/xiaohongshu/xhs-danmaku
 */

/** 事件里的用户对象（不同事件挂在不同字段，字段名也不统一）。 */
export type XhsUserInfo = {
  nickname?: string;
  nick_name?: string;
  nickName?: string;
  name?: string;
  user_name?: string;
  userName?: string;
  avatar?: string;
  user_id?: string;
  [key: string]: unknown;
};

/** 礼物基础信息。 */
export type XhsGiftInfo = {
  name?: string;
  gift_name?: string;
  giftName?: string;
  icon?: string;
  coins?: number | string;
  price?: number | string;
  count?: number | string;
  [key: string]: unknown;
};

/** 单个礼物的动作信息（连击 / 数量）。 */
export type XhsGiftActionInfo = {
  comb_count?: number | string;
  count?: number | string;
  num?: number | string;
  gift_count?: number | string;
  coins?: number | string;
  gift_extra_info?: { gift_name?: string; giftName?: string; [key: string]: unknown };
  [key: string]: unknown;
};

/** 一条中控台互动事件（customData 原样结构，仅收敛本轮用到的字段）。 */
export type XhsCustomData = {
  type?: string;
  desc?: string;
  content?: string;
  text?: string;
  comment?: string;
  message?: string;
  commentId?: string;
  comment_id?: string;
  msgId?: string;
  msg_id?: string;
  id?: string;
  current_time?: string;
  profile?: XhsUserInfo;
  send_user_info?: XhsUserInfo;
  gift_user_info?: XhsUserInfo;
  user?: XhsUserInfo;
  sender?: XhsUserInfo;
  base_gift_info?: XhsGiftInfo;
  gift_info?: XhsGiftInfo;
  gift_name?: string;
  giftName?: string;
  gift_count?: number | string;
  giftCount?: number | string;
  count?: number | string;
  gift_action_info?: XhsGiftActionInfo;
  [key: string]: unknown;
};

/** 解码后归一到展示口径的一条消息。 */
export type XhsParsedItem = {
  kind: 'chat' | 'gift' | 'online';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0；online 为在线观看人数。 */
  count: number;
  giftName: string;
};

function base64DecodeUtf8(input: string): string {
  try {
    return Buffer.from(input, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function parseCustomDataRaw(raw: unknown): XhsCustomData | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === 'object' && parsed != null ? (parsed as XhsCustomData) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as XhsCustomData;
  return null;
}

/** 正文候选键：不同版本/别名可能把内容放在不同字段。 */
const XHS_TEXT_KEYS = ['desc', 'content', 'text', 'comment', 'message', 'msg_content', 'msgContent'] as const;

/** 昵称候选键。 */
const XHS_NICK_KEYS = ['nickname', 'nick_name', 'nickName', 'name', 'user_name', 'userName'] as const;

/** 取弹幕正文；空串表示不是可展示的文本消息。 */
function pickText(cd: XhsCustomData): string {
  for (const key of XHS_TEXT_KEYS) {
    const value = cd[key];
    if (value == null || value === '') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

/** 取昵称：礼物/关注/点赞的用户对象挂在不同字段，按语义顺序兜底。 */
function pickNick(cd: XhsCustomData): string {
  for (const user of [cd.send_user_info, cd.profile, cd.gift_user_info, cd.user, cd.sender]) {
    if (!user) continue;
    for (const key of XHS_NICK_KEYS) {
      const value = user[key];
      if (value == null || value === '') continue;
      const nick = String(value).trim();
      if (nick) return nick;
    }
  }
  return '匿名';
}

/** 礼物名 / 件数：优先动作里的连击数，再回落到礼物基础信息与消息顶层。 */
function pickGift(cd: XhsCustomData): { name: string; count: number } {
  const gift = cd.base_gift_info || cd.gift_info || {};
  const action = cd.gift_action_info || {};
  const nameRaw =
    gift.name ??
    gift.gift_name ??
    gift.giftName ??
    action.gift_extra_info?.gift_name ??
    action.gift_extra_info?.giftName ??
    cd.gift_name ??
    cd.giftName;
  const name = String(nameRaw ?? '').trim() || '礼物';
  const countRaw =
    action.comb_count ??
    action.count ??
    action.num ??
    action.gift_count ??
    gift.count ??
    cd.gift_count ??
    cd.giftCount ??
    cd.count ??
    1;
  const count = Number(countRaw);
  return { name, count: Number.isFinite(count) && count > 0 ? Math.max(1, Math.floor(count)) : 1 };
}

function itemId(cd: XhsCustomData): string {
  const id = cd.commentId ?? cd.comment_id ?? cd.msgId ?? cd.msg_id ?? cd.id;
  if (id != null && String(id).trim()) return String(id);
  return `${cd.profile?.user_id || ''}:${cd.type || ''}:${pickText(cd)}:${cd.current_time || ''}`;
}

function pushUnique(out: XhsCustomData[], seen: Set<string>, cd: XhsCustomData | null): void {
  if (!cd || !cd.type) return;
  const id = itemId(cd);
  if (id && seen.has(id)) return;
  if (id) seen.add(id);
  out.push(cd);
}

/** 把入站 WS 帧（Buffer / Uint8Array / string）解码为 customData 列表。 */
export function parseXhsWsPayload(raw: unknown, seen: Set<string>): XhsCustomData[] {
  const out: XhsCustomData[] = [];
  if (raw == null) return out;

  let text: string;
  if (typeof raw === 'string') {
    text = raw;
  } else if (raw instanceof Uint8Array) {
    // Buffer 也是 Uint8Array，统一走 TextDecoder 即可。
    try {
      text = new TextDecoder('utf-8').decode(raw);
    } catch {
      return out;
    }
  } else {
    text = String(raw);
  }

  text = text.trim();
  if (!text) return out;

  let outer: Record<string, unknown>;
  try {
    outer = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const idx = text.indexOf('{"');
    if (idx < 0) return out;
    try {
      outer = JSON.parse(text.slice(idx)) as Record<string, unknown>;
    } catch {
      return out;
    }
  }

  const body = outer.body as Record<string, unknown> | undefined;
  if (body?.customData) {
    pushUnique(out, seen, parseCustomDataRaw(body.customData));
    return out;
  }

  const nested = outer.b as Record<string, unknown> | undefined;
  const items = nested?.d as Record<string, unknown> | undefined;
  const batch = items?.b as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(batch)) {
    for (const item of batch) {
      const d = item?.d;
      if (typeof d !== 'string') continue;
      try {
        const decoded = JSON.parse(base64DecodeUtf8(d)) as Record<string, unknown>;
        // longlink 里只有 command=1 是业务消息；控制帧（心跳/ack 等）不参与解析。
        const command = Number(decoded?.command);
        if (Number.isFinite(command) && command !== 1) continue;
        const cd = parseCustomDataRaw(decoded?.customData);
        if (cd) {
          if (!cd.msgId && (decoded?.msgId || decoded?.msg_id)) {
            cd.msgId = String(decoded.msgId ?? decoded.msg_id);
          }
          pushUnique(out, seen, cd);
        } else if (decoded && typeof decoded === 'object') {
          pushUnique(out, seen, decoded as XhsCustomData);
        }
      } catch {
        /* skip */
      }
    }
  }

  return out;
}

/**
 * 当前在线人数候选键：`member_count` 系列是实时在线；
 * `viewer_count` 是累计观看，不能拿来当在线人数。
 */
const XHS_ONLINE_KEYS = [
  'member_count',
  'memberCount',
  'display_member_count',
  'displayMemberCount',
  'live_member_count',
  'liveMemberCount',
  'current_member',
  'current_member_count',
  'currentMemberCount',
  'displayWatchingCount',
  'display_watching_count',
  'online_user_num',
  'online_user_count',
  'online_count',
  'online_num',
  'onlineUserNum',
  'onlineUserCount',
  'onlineCount',
  'onlineNum',
  'watch_count',
  'watchCount',
  'audience_count',
  'audienceCount',
  'user_count',
  'userCount',
  'count',
  'num',
  'value',
  'total',
];

/** 统计帧可能把数字放在这些嵌套对象里。 */
const XHS_STATS_NESTS = [
  'data',
  'room',
  'live',
  'stats',
  'room_info',
  'live_info',
  'room_data',
  'roomData',
  'live_room',
];

/** 房间统计类 type：`refresh` 是实测主类型，其余为版本别名。 */
const XHS_REFRESH_TYPES = new Set(['refresh', 'letter_refresh', 'room_refresh', 'room_info', 'room_stat']);

/** 类型名兜底：含在线 / 观看 / 统计语义才按在线统计处理，其余类型继续留样本。 */
const XHS_ONLINE_TYPE_RE = /online|viewer|watching|audience|statistic|stats|room_stat/i;

/**
 * 「1234」/「1.2万」/「3千」/「1.2亿」→ 整数；解析不出返回 -1。
 * 纯数字之外只放行 人 / 位 / 观众 / 在线 / 在看 / 观看 这类尾缀。
 */
export function parseXhsCountText(value: unknown): number {
  if (value == null) return -1;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : -1;
  }
  const s = String(value)
    .replace(/[,，\s]/g, '')
    .trim();
  if (!s) return -1;
  const m = /^(\d+(?:\.\d+)?)(亿|万|千|w|W)?/.exec(s);
  if (!m) return -1;
  const rest = s.slice(m[0].length);
  if (rest && !/^(?:人|位|观众|在线|在看|观看|观看中|人数|正在|中)+$/.test(rest)) return -1;
  const base = Number(m[1]);
  if (!Number.isFinite(base) || base < 0) return -1;
  const unit = m[2];
  const scale = unit === '亿' ? 1e8 : unit === '万' || unit === 'w' || unit === 'W' ? 1e4 : unit === '千' ? 1e3 : 1;
  return Math.max(0, Math.floor(base * scale));
}

/** 从对象本身按候选键取在线人数；取不到返回 -1。 */
function pickOnlineCount(obj: Record<string, unknown> | undefined): number {
  if (!obj) return -1;
  for (const key of XHS_ONLINE_KEYS) {
    const n = parseXhsCountText(obj[key]);
    if (n >= 0) return n;
  }
  return -1;
}

/**
 * 在线统计类 customData → 在线人数；非统计类 / 取不到数值返回 -1。
 *
 * 实测 `refresh` 帧把当前在线放在 `member_count`，而 `viewer_count` 是累计观看；
 * 这里优先 member 系列，再兼容各版本别名，最后才看通用 count/num。
 */
export function parseXhsOnlineCount(cd: XhsCustomData): number {
  const type = String(cd.type || '').trim();
  if (!type) return -1;
  if (!XHS_REFRESH_TYPES.has(type) && !XHS_ONLINE_TYPE_RE.test(type)) return -1;

  const direct = pickOnlineCount(cd as Record<string, unknown>);
  if (direct >= 0) return direct;

  for (const key of XHS_STATS_NESTS) {
    const nested = (cd as Record<string, unknown>)[key];
    if (!nested || typeof nested !== 'object') continue;
    const n = pickOnlineCount(nested as Record<string, unknown>);
    if (n >= 0) return n;
  }

  // 少数版本把数字塞进展示文案（如「1.2万人正在观看」）。
  const desc = String(cd.desc || '');
  if (!/在线|在看|观看|观众|人数/.test(desc)) return -1;
  return parseXhsCountText(desc);
}

/** 弹幕 type 别名：`text` 是实测主类型，其余为不同版本/端上的写法。 */
const XHS_CHAT_TYPES = new Set(['text', 'text_message', 'comment', 'live_comment', 'chat']);

/** 礼物 type 别名。 */
const XHS_GIFT_TYPES = new Set(['gift_comment', 'gift', 'live_gift', 'send_gift', 'gift_send']);

/** 把单条 customData 归一为展示项；非弹幕 / 礼物 / 在线统计返回 null。 */
export function classifyXhsItem(cd: XhsCustomData): XhsParsedItem | null {
  const type = String(cd.type || '').trim();
  if (XHS_CHAT_TYPES.has(type)) {
    const text = pickText(cd);
    if (!text) return null;
    return { kind: 'chat', nick: pickNick(cd), text, count: 0, giftName: '' };
  }
  if (XHS_GIFT_TYPES.has(type)) {
    const gift = pickGift(cd);
    return { kind: 'gift', nick: pickNick(cd), text: gift.name, count: gift.count, giftName: gift.name };
  }
  // 在线统计：type 语义命中且取到数值才入库；进场 / 关注 / 礼物托与结算继续留样本。
  const online = parseXhsOnlineCount(cd);
  if (online >= 0) return { kind: 'online', nick: '', text: '', count: online, giftName: '' };
  return null;
}
