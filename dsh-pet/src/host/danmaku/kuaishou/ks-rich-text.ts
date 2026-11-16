/**
 * 快手 829 / 112 富文本弹幕分段解码（对齐 danmuapp `src/platforms/ksDanmaku.js` 224-366, 372-405）。
 *
 * 829 = 进场 / 富文本区（repeated 富文本消息）；112 = 独立富文本消息。
 * 进场项标 `isEnter=true`，由调用方按口径跳过；普通弹幕入库 chat。
 * 字段号：RichTextMessage id=1(string)、userId=2(varint)、texts=7(repeated 富文本段)；
 * 富文本段 text_segment=1；文本段 text=1(string)。
 * @module dsh-pet/src/host/danmaku/kuaishou/ks-rich-text
 */
import { Reader } from 'protobufjs/minimal.js';

/** 归一到展示口径的一条富文本消息。 */
export type KsRichItem = {
  id: string;
  nickname: string;
  content: string;
  principalId: string;
  /** 是否进场提示（本轮不入库，仅留样本）。 */
  isEnter: boolean;
};

const ENTER_RE = /^(来了|加入|进入|进来了?|光临|进房|抵达|进入直播间)[!！.。~～]?$/;
const ENTER_PREFIX_RE = /^(来了|加入|进入|进来了?|光临|进房|抵达|进入直播间)/;
const MOD_RE = /禁言|踢出|警告|封禁|屏蔽|违规/;
const ZERO_WIDTH_RE = /[\u200b-\u200d\ufeff\u00a0]/g;

/** 文本段：field1 = 纯文本。 */
function readTextSegment(bytes: Uint8Array): string {
  const r = Reader.create(bytes);
  let text = '';
  while (r.pos < r.len) {
    const tag = r.uint32();
    if ((tag >>> 3) === 1 && (tag & 7) === 2) text = r.string();
    else r.skipType(tag & 7);
  }
  return text;
}

/** 富文本段：field1 = 文本段（icon 段的灯牌名本轮忽略）。 */
function readRichSegment(bytes: Uint8Array): string {
  const r = Reader.create(bytes);
  let text = '';
  while (r.pos < r.len) {
    const tag = r.uint32();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) text = readTextSegment(r.bytes()) || text;
    else r.skipType(wire);
  }
  return text;
}

type RichMessage = { id: string; userId: string; texts: string[] };

/** 读一条富文本消息体。 */
function readRichMessage(bytes: Uint8Array): RichMessage {
  const r = Reader.create(bytes);
  const out: RichMessage = { id: '', userId: '', texts: [] };
  while (r.pos < r.len) {
    const tag = r.uint32();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      out.id = r.string();
    } else if (field === 2 && wire === 0) {
      out.userId = String(r.uint64());
    } else if (field === 7 && wire === 2) {
      const t = readRichSegment(r.bytes());
      if (t) out.texts.push(t);
    } else {
      r.skipType(wire);
    }
  }
  return out;
}

function looksModeration(content: string): boolean {
  return MOD_RE.test(content);
}

/** 是否像进场正文：整句「加入 / 来了」或「加入，来自 搜索」；禁言/踢出等管理词排除。 */
export function isKsEnterContent(content: string): boolean {
  const t = String(content || '')
    .trim()
    .replace(ZERO_WIDTH_RE, '');
  if (!t || looksModeration(t)) return false;
  if (ENTER_RE.test(t)) return true;
  return ENTER_PREFIX_RE.test(t) && /来自/.test(t);
}

/** 从富文本段拆昵称与进场正文；拆不出返回 null。 */
function splitEnterTexts(texts: string[]): { nickname: string; content: string } | null {
  const list = texts.map((t) => String(t || '').trim()).filter(Boolean);
  if (!list.length) return null;

  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (i === 0) {
      const raw = list[0];
      const m = raw.match(/^(.+?)\s+((?:来了|加入|进入|进来了?|光临|进房|抵达|进入直播间)(?:.*))$/);
      if (m && isKsEnterContent(m[2].trim())) {
        return {
          nickname: (m[1] ?? '').replace(/[:：]\s*$/, '').trim() || '匿名',
          content: m[2].trim(),
        };
      }
      if (isKsEnterContent(raw)) return { nickname: '匿名', content: raw };
      continue;
    }
    if (!isKsEnterContent(list[i])) continue;
    const nickname = list[i - 1].replace(/[:：]\s*$/, '').trim();
    return { nickname: nickname || '匿名', content: list[i] };
  }
  return null;
}

/** 富文本消息 → 归一 item；无文本返回 null。 */
function richMessageToItem(msg: RichMessage): KsRichItem | null {
  const texts = msg.texts;
  if (!texts.length) return null;

  const enter = splitEnterTexts(texts);
  if (enter) {
    return {
      id: msg.id,
      nickname: enter.nickname,
      content: enter.content,
      principalId: msg.userId,
      isEnter: true,
    };
  }
  if (texts.length === 1) {
    return {
      id: msg.id,
      nickname: '匿名',
      content: String(texts[0] || '').trim(),
      principalId: msg.userId,
      isEnter: false,
    };
  }
  let nickname = String(texts[0] || '').trimEnd();
  if (nickname.endsWith(':') || nickname.endsWith('：')) nickname = nickname.slice(0, -1).trimEnd();
  return {
    id: msg.id,
    nickname: nickname || '匿名',
    content: texts.slice(1).join('').trim(),
    principalId: msg.userId,
    isEnter: false,
  };
}

/**
 * 解码 829（SC_COMMENT_ZONE_RICH_TEXT）：repeated 富文本消息。
 * 解码失败返回空数组，不抛到帧循环。
 */
export function parseCommentZoneRichText(payload: Uint8Array): KsRichItem[] {
  if (!payload || payload.length === 0) return [];
  try {
    const r = Reader.create(payload);
    const items: KsRichItem[] = [];
    while (r.pos < r.len) {
      const tag = r.uint32();
      const field = tag >>> 3;
      const wire = tag & 7;
      if (field === 1 && wire === 2) {
        const item = richMessageToItem(readRichMessage(r.bytes()));
        if (item) items.push(item);
      } else {
        r.skipType(wire);
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** 解码 112（SC_WEB_COMMENT_RICH_TEXT_MESSAGE）：单条富文本消息。 */
export function parseCommentRichTextMessage(payload: Uint8Array): KsRichItem[] {
  if (!payload || payload.length === 0) return [];
  try {
    const item = richMessageToItem(readRichMessage(payload));
    return item ? [item] : [];
  } catch {
    return [];
  }
}
