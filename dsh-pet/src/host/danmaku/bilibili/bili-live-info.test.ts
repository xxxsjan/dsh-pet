/**
 * B 站进房解析纯函数 + resolveBiliWsInfo 流程测试：房间号提取、Cookie 登录判定、
 * buvid3 补全，以及 mock fetch 走通 nav → getInfoByRoom → getDanmuInfo 换票链路。
 * @module dsh-pet/src/host/danmaku/bilibili/bili-live-info.test
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  biliAuthUid,
  biliHasSessdata,
  ensureBuvid3,
  extractBiliRoomId,
  resolveBiliWsInfo,
} from './bili-live-info.ts';

type FetchFn = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

function jsonResponse(status: number, json: Record<string, unknown>): Response {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mockFetch(routes: Array<{ match: string; json: Record<string, unknown> }>, calls: string[] = []): FetchFn {
  return async (url) => {
    calls.push(url);
    for (const route of routes) {
      if (url.includes(route.match)) return jsonResponse(200, route.json);
    }
    throw new Error(`unexpected url: ${url}`);
  };
}

const NAV_ROUTE = {
  match: '/x/web-interface/nav',
  json: {
    code: 0,
    data: {
      wbi_img: {
        img_url: 'https://i0.hdslb.com/bfs/wbi/7cd0830bbfda92b66707849a3d39c3d.png',
        sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746e6ab724b08b210005.png',
      },
    },
  },
};

function roomRoute(liveStatus: number): { match: string; json: Record<string, unknown> } {
  return {
    match: 'getInfoByRoom',
    json: {
      code: 0,
      data: {
        room_info: { room_id: 987654321, title: '测试直播间', live_status: liveStatus },
        anchor_info: { base_info: { uname: '测试主播' } },
      },
    },
  };
}

const DANMU_ROUTE = {
  match: 'getDanmuInfo',
  json: {
    code: 0,
    data: {
      token: 'bili-token-xyz',
      host_list: [{ host: 'live-ws.bilibili.com', wss_port: 443 }],
    },
  },
};

describe('B 站房间号提取', () => {
  test('裸数字接受为房间号', () => {
    assert.equal(extractBiliRoomId('123456'), '123456');
  });

  test('标准直播间链接提取短号', () => {
    assert.equal(extractBiliRoomId('https://live.bilibili.com/123456'), '123456');
  });

  test('blanc 短链同样提取', () => {
    assert.equal(extractBiliRoomId('https://live.bilibili.com/blanc/789?live=1'), '789');
  });

  test('非直播间返回 null', () => {
    assert.equal(extractBiliRoomId('https://www.bilibili.com/video/BV1xx411c7mD'), null);
    assert.equal(extractBiliRoomId('   '), null);
  });
});

describe('B 站 Cookie 登录判定', () => {
  test('有 SESSDATA 视为登录', () => {
    assert.equal(biliHasSessdata('SESSDATA=abc; DedeUserID=42'), true);
  });

  test('仅访客键不算登录', () => {
    assert.equal(biliHasSessdata('buvid3=xxx; _uuid=yyy'), false);
  });

  test('登录态带 DedeUserID 作 uid，访客 uid 为 0', () => {
    assert.equal(biliAuthUid('SESSDATA=abc; DedeUserID=42'), '42');
    assert.equal(biliAuthUid('buvid3=xxx'), '0');
    assert.equal(biliAuthUid('SESSDATA=abc'), '0');
  });

  test('ensureBuvid3 缺省时补一段 buvid3，已有则保留', () => {
    const filled = ensureBuvid3('b_nut=123');
    assert.match(filled, /buvid3=[0-9A-F-]+infoc/);
    assert.ok(filled.includes('b_nut=123'));
    assert.equal(ensureBuvid3('buvid3=keep-me').includes('keep-me'), true);
  });
});

describe('resolveBiliWsInfo 换票链路', () => {
  test('访客空 Cookie 走通 nav → room → danmu，返回房间号/令牌/WS 地址', async () => {
    const calls: string[] = [];
    const info = await resolveBiliWsInfo(
      'https://live.bilibili.com/123456',
      '',
      mockFetch([NAV_ROUTE, roomRoute(1), DANMU_ROUTE], calls),
    );
    assert.equal(info.roomId, '987654321');
    assert.equal(info.token, 'bili-token-xyz');
    assert.equal(info.websocketUrl, 'wss://live-ws.bilibili.com:443/sub');
    assert.equal(info.title, '测试直播间');
    assert.equal(info.anchor, '测试主播');
    assert.equal(info.liveStatus, 1);
    assert.equal(info.uid, '0');
    assert.ok(calls.some((u) => u.includes('getInfoByRoom')));
    assert.ok(calls.some((u) => u.includes('getDanmuInfo')));
    assert.ok(calls.some((u) => u.includes('w_rid=')));
  });

  test('未开播抛「主播未开播」', async () => {
    await assert.rejects(
      () => resolveBiliWsInfo('https://live.bilibili.com/123456', '', mockFetch([NAV_ROUTE, roomRoute(0), DANMU_ROUTE])),
      /主播未开播/,
    );
  });

  test('无法解析房间号直接抛错', async () => {
    await assert.rejects(
      () => resolveBiliWsInfo('https://www.bilibili.com/', '', mockFetch([])),
      /房间号/,
    );
  });

  test('danmu 缺 token 抛可读错误', async () => {
    const noToken = { match: 'getDanmuInfo', json: { code: 0, data: { token: '', host_list: [] } } };
    await assert.rejects(
      () => resolveBiliWsInfo('https://live.bilibili.com/123456', '', mockFetch([NAV_ROUTE, roomRoute(1), noToken])),
      /token/,
    );
  });
});
