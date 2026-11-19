/**
 * B 站直连 WSS 弹幕解码（对齐 danmuapp `src/platforms/biliDanmaku.js`）。
 *
 * 帧为定长 16 字节头 + body：ver=2 业务包 zlib 解压（可嵌套）；op=5 MESSAGE 为 JSON，
 * 按 cmd 分发。入库弹幕 `DANMU_MSG`、礼物 `SEND_GIFT` / `GUARD_BUY` 与在线人数
 * `ONLINE_RANK_COUNT`；进场 / 关注 / 点赞 / 醒目留言等本轮留样本不入库。
 * @module dsh-pet/src/host/danmaku/bilibili/bili-danmaku
 */
import { inflate } from 'pako';

/** B 站直播 WS 包头长度。 */
export const BILI_HEADER_LEN = 16;

export const BILI_OP = {
  HEARTBEAT: 2,
  HEARTBEAT_REPLY: 3,
  MESSAGE: 5,
  AUTH: 7,
  AUTH_REPLY: 8,
} as const;

/** 认证用 protover=2 → 业务包 zlib（项目已有 pako，无需 brotli）。 */
export const BILI_AUTH_PROTOVER = 2;

/** 归一到展示口径的一条消息。 */
export type BiliParsedItem = {
  kind: 'chat' | 'gift' | 'online';
  nick: string;
  text: string;
  /** 礼物件数；聊天为 0；online 为在线人数。 */
  count: number;
  giftName: string;
  /** 礼物原始 id；聊天为空。 */
  giftId: string;
  principalId: string;
};

/** 解码出的一条原始业务包（未入库的 cmd 由 monitor 留样本）。 */
export type BiliPacket =
  | { kind: 'auth_ok' }
  | { kind: 'popularity'; value: number }
  | { kind: 'cmd'; cmd: string; raw: Record<string, unknown> };

function writeU32BE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false);
}

function writeU16BE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, false);
}

function readU32BE(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readU16BE(view: DataView, offset: number): number {
  return view.getUint16(offset, false);
}

/** 组装二进制包：16 字节头 + body。 */
export function encodeBiliPacket(
  op: number,
  body: Uint8Array | string = new Uint8Array(0),
  ver = 1,
  seq = 1,
): Uint8Array {
  const payload =
    typeof body === 'string' ? new TextEncoder().encode(body) : body || new Uint8Array(0);
  const packetLen = BILI_HEADER_LEN + payload.length;
  const buf = new Uint8Array(packetLen);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  writeU32BE(view, 0, packetLen);
  writeU16BE(view, 4, BILI_HEADER_LEN);
  writeU16BE(view, 6, ver);
  writeU32BE(view, 8, op);
  writeU32BE(view, 12, seq);
  buf.set(payload, BILI_HEADER_LEN);
  return buf;
}

/** 认证包：uid / roomid / protover=2 / platform=web / type=2 / key=token。 */
export function encodeBiliAuthPacket({
  roomId,
  token,
  uid = 0,
}: {
  roomId: number | string;
  token: string;
  uid?: number | string;
}): Uint8Array {
  const body = JSON.stringify({
    uid: Number(uid) || 0,
    roomid: Number(roomId),
    protover: BILI_AUTH_PROTOVER,
    platform: 'web',
    type: 2,
    key: String(token || ''),
  });
  return encodeBiliPacket(BILI_OP.AUTH, body, 1, 1);
}

/** 心跳包：空 body。 */
export function encodeBiliHeartbeatPacket(): Uint8Array {
  return encodeBiliPacket(BILI_OP.HEARTBEAT, new Uint8Array(0), 1, 1);
}

function parseBuffer(data: Uint8Array, out: BiliPacket[]): void {
  let offset = 0;
  while (offset + BILI_HEADER_LEN <= data.length) {
    const view = new DataView(data.buffer, data.byteOffset + offset, data.length - offset);
    const packetLen = readU32BE(view, 0);
    const headerLen = readU16BE(view, 4);
    const ver = readU16BE(view, 6);
    const op = readU32BE(view, 8);
    if (packetLen < headerLen || offset + packetLen > data.length) break;

    const body = data.subarray(offset + headerLen, offset + packetLen);
    offset += packetLen;

    if (ver === 2) {
      try {
        parseBuffer(inflate(body), out);
      } catch {
        /* zlib 解压失败的一包跳过 */
      }
      continue;
    }
    // ver=3 为 brotli；本客户端鉴权用 protover=2，一般不会收到
    if (ver === 3) continue;

    if (op === BILI_OP.AUTH_REPLY) {
      out.push({ kind: 'auth_ok' });
      continue;
    }
    if (op === BILI_OP.HEARTBEAT_REPLY) {
      let value = 0;
      if (body.length >= 4) {
        value = new DataView(body.buffer, body.byteOffset, body.length).getUint32(0, false);
      }
      out.push({ kind: 'popularity', value });
      continue;
    }
    if (op === BILI_OP.MESSAGE) {
      const text = new TextDecoder().decode(body);
      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const cmd = String(json?.cmd || '').split(':')[0];
        out.push({ kind: 'cmd', cmd, raw: json });
      } catch {
        /* 偶发非 JSON 一包跳过 */
      }
    }
  }
}

/** 解析一帧（可能含多包 / zlib 嵌套），返回业务对象列表。 */
export function decodeBiliPackets(raw: Uint8Array): BiliPacket[] {
  const data = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  const out: BiliPacket[] = [];
  parseBuffer(data, out);
  return out;
}

/** DANMU_MSG 去重键：优先 msg_id，否则 uid + 内容 + 发送时间 + 随机数。 */
export function biliDanmakuDedupKey(raw: Record<string, unknown>): string {
  const top = raw.msg_id ?? raw.msgId ?? raw.id_str ?? raw.idStr;
  if (top != null && String(top).trim()) return `m:${String(top).trim()}`;

  const info = raw.info;
  if (!Array.isArray(info)) return '';
  const meta = Array.isArray(info[0]) ? info[0] : null;
  const user = Array.isArray(info[2]) ? info[2] : [];
  const uid = user[0] != null ? String(user[0]) : '';
  const content = String(info[1] ?? '').trim();
  const ts = meta && meta[4] != null ? String(meta[4]) : '';
  const rnd = meta && meta[5] != null ? String(meta[5]) : '';
  if (!uid && !content) return '';
  return `f:${uid}|${content}|${ts}|${rnd}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** DANMU_MSG → 展示字段。头像 / 粉丝牌 / 荣誉等级最小链路不解析。 */
export function parseBiliDanmaku(raw: Record<string, unknown>): BiliParsedItem | null {
  const info = raw.info;
  if (!Array.isArray(info)) return null;
  const content = String(info[1] ?? '').trim();
  if (!content) return null;
  const user = Array.isArray(info[2]) ? info[2] : [];
  const uid = user[0] != null ? String(user[0]) : '';
  const nickname = String(user[1] || '匿名').trim() || '匿名';
  return {
    kind: 'chat',
    nick: nickname,
    text: content,
    count: 0,
    giftName: '',
    giftId: '',
    principalId: uid,
  };
}

/** SEND_GIFT / GUARD_BUY → 礼物字段。单价 / 图标最小链路不解析。 */
export function parseBiliGift(raw: Record<string, unknown>): BiliParsedItem | null {
  const data = asRecord(raw.data) ?? {};
  const nickname = String(data.uname || data.username || '匿名').trim() || '匿名';
  const giftName = String(data.giftName || data.gift_name || data.giftName || '礼物').trim() || '礼物';
  const count = Math.max(1, Number(data.num ?? data.giftNum) || 1);
  const giftId =
    data.giftId != null ? String(data.giftId) : data.gift_id != null ? String(data.gift_id) : '';
  const uid = data.uid != null ? String(data.uid) : '';
  return {
    kind: 'gift',
    nick: nickname,
    text: giftName,
    count,
    giftName,
    giftId,
    principalId: uid,
  };
}

/**
 * ONLINE_RANK_COUNT → 直播间在线人数（高能用户数，与直播页右上角同口径）。
 * 非该 cmd 或缺字段返回 -1。
 */
export function parseBiliOnlineCount(raw: Record<string, unknown>): number {
  const data = asRecord(raw.data) ?? {};
  const n = Number(data.online_count ?? data.onlineCount);
  if (!Number.isFinite(n) || n < 0) return -1;
  return Math.floor(n);
}

/**
 * 解析一帧 WS 二进制，返回归一后的弹幕 / 礼物 / 在线人数条目（其余 cmd 忽略）。
 * `seen` 为跨帧去重集合。
 */
export function parseBiliWsFrame(raw: Uint8Array, seen: Set<string>): BiliParsedItem[] {
  const items: BiliParsedItem[] = [];
  for (const packet of decodeBiliPackets(raw)) {
    if (packet.kind !== 'cmd') continue;
    if (packet.cmd === 'DANMU_MSG') {
      const key = biliDanmakuDedupKey(packet.raw);
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const item = parseBiliDanmaku(packet.raw);
      if (item) items.push(item);
      continue;
    }
    if (packet.cmd === 'SEND_GIFT' || packet.cmd === 'GUARD_BUY') {
      const item = parseBiliGift(packet.raw);
      if (item) items.push(item);
      continue;
    }
    if (packet.cmd === 'ONLINE_RANK_COUNT') {
      const online = parseBiliOnlineCount(packet.raw);
      if (online >= 0) {
        items.push({
          kind: 'online',
          nick: '',
          text: '',
          count: online,
          giftName: '',
          giftId: '',
          principalId: '',
        });
      }
    }
  }
  return items;
}
