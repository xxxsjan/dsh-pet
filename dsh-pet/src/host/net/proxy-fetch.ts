/**
 * 可选 HTTP 代理的 HTTPS 请求：有代理时走 CONNECT，避开本机被污染的 DNS。
 *
 * 供 Fish 等必须出网的上游使用；本机回环接口不要走这里。
 * 无代理时退回全局 `fetch`（与原先行为一致）。
 * @module dsh-pet/src/host/net/proxy-fetch
 */
import http from 'node:http';
import tls from 'node:tls';
import { URL } from 'node:url';

import { resolveOutboundProxyUrl } from './system-proxy.ts';

/** 与 `fetch` 相近的入参子集。 */
export interface ProxyFetchInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

/**
 * 发 HTTPS 请求；若解析到出站代理则经 CONNECT 转发。
 *
 * @param url - 必须是 https URL。
 * @param init - method / headers / body / signal。
 */
export async function fetchViaOutboundProxy(url: string, init: ProxyFetchInit = {}): Promise<Response> {
  const proxy = resolveOutboundProxyUrl();
  if (!proxy) {
    return fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    });
  }
  return httpsThroughHttpProxy(url, proxy, init);
}

/**
 * `CONNECT host:443` → TLS → 手写 HTTP/1.1（不让 https.request 再解析目标 DNS）。
 */
function httpsThroughHttpProxy(targetUrl: string, proxyUrl: string, init: ProxyFetchInit): Promise<Response> {
  const target = new URL(targetUrl);
  if (target.protocol !== 'https:') {
    return Promise.reject(new Error('proxy-fetch only supports https targets'));
  }
  const proxy = new URL(proxyUrl);
  if (proxy.protocol !== 'http:' && proxy.protocol !== 'https:') {
    return Promise.reject(new Error(`unsupported proxy protocol: ${proxy.protocol}`));
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Host: target.host, Connection: 'close', ...(init.headers ?? {}) };
  const body = init.body ?? '';
  if (body && !hasHeader(headers, 'content-length')) {
    headers['Content-Length'] = String(Buffer.byteLength(body));
  }

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let tlsSocket: tls.TLSSocket | undefined;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener('abort', onAbort);
      tlsSocket?.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const ok = (response: Response) => {
      if (settled) return;
      settled = true;
      init.signal?.removeEventListener('abort', onAbort);
      resolve(response);
    };
    const onAbort = () => {
      fail(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    };
    if (init.signal?.aborted) {
      onAbort();
      return;
    }
    init.signal?.addEventListener('abort', onAbort, { once: true });

    const connectReq = http.request({
      host: proxy.hostname,
      port: proxy.port ? Number(proxy.port) : 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || '443'}`,
      headers: {
        Host: `${target.hostname}:${target.port || '443'}`,
        ...(proxy.username
          ? {
              'Proxy-Authorization':
                'Basic ' +
                Buffer.from(
                  `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
                ).toString('base64'),
            }
          : {}),
      },
    });

    connectReq.once('connect', (res, socket, head) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        fail(new Error(`proxy CONNECT failed: ${res.statusCode ?? 0}`));
        return;
      }
      if (head.length > 0) socket.unshift(head);

      tlsSocket = tls.connect({
        socket,
        servername: target.hostname,
      });
      tlsSocket.once('error', fail);
      tlsSocket.once('secureConnect', () => {
        const lines = [`${method} ${target.pathname}${target.search} HTTP/1.1`];
        for (const [key, value] of Object.entries(headers)) {
          lines.push(`${key}: ${value}`);
        }
        lines.push('', '');
        tlsSocket!.write(lines.join('\r\n'));
        if (body) tlsSocket!.write(body);

        const chunks: Buffer[] = [];
        tlsSocket!.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        tlsSocket!.on('end', () => {
          try {
            ok(parseHttpResponse(Buffer.concat(chunks)));
          } catch (error) {
            fail(error);
          }
        });
        tlsSocket!.on('error', fail);
      });
    });

    connectReq.on('error', fail);
    connectReq.end();
  });
}

/** 解析代理隧道里读到的原始 HTTP/1.1 响应。 */
function parseHttpResponse(raw: Buffer): Response {
  const sep = raw.indexOf('\r\n\r\n');
  if (sep < 0) throw new Error('proxy response missing header separator');
  const head = raw.subarray(0, sep).toString('latin1');
  let body = raw.subarray(sep + 4);
  const lines = head.split('\r\n');
  const statusLine = lines[0] ?? '';
  const match = /^HTTP\/\d\.\d\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
  if (!match) throw new Error(`proxy response bad status line: ${statusLine}`);
  const status = Number(match[1]);
  const statusText = match[2] ?? '';
  const outHeaders = new Headers();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    outHeaders.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  // Fish 经代理常回 Transfer-Encoding: chunked；若不解码，分块长度行会掺进 mp3，听感卡顿。
  if (/chunked/i.test(outHeaders.get('transfer-encoding') ?? '')) {
    body = decodeChunkedBody(body);
    outHeaders.delete('transfer-encoding');
    outHeaders.set('content-length', String(body.length));
  }
  return new Response(body, { status, statusText, headers: outHeaders });
}

/**
 * 解码 HTTP/1.1 chunked body（不含 trailers 语义，够音频字节流使用）。
 * @param raw - 仍带 `size\\r\\n data \\r\\n` 的原始缓冲。
 */
export function decodeChunkedBody(raw: Buffer): Buffer {
  const parts: Buffer[] = [];
  let offset = 0;
  while (offset < raw.length) {
    const lineEnd = raw.indexOf('\r\n', offset);
    if (lineEnd < 0) throw new Error('chunked body missing size line');
    const sizeLine = raw.subarray(offset, lineEnd).toString('ascii').trim();
    // 忽略 chunk extension：`1b6f;foo=bar`
    const sizeToken = sizeLine.split(';', 1)[0]?.trim() ?? '';
    const size = Number.parseInt(sizeToken, 16);
    if (!Number.isFinite(size) || size < 0) throw new Error(`chunked body bad size: ${sizeLine}`);
    offset = lineEnd + 2;
    if (size === 0) break;
    if (offset + size > raw.length) throw new Error('chunked body truncated');
    parts.push(raw.subarray(offset, offset + size));
    offset += size;
    if (raw[offset] === 0x0d && raw[offset + 1] === 0x0a) offset += 2;
  }
  return Buffer.concat(parts);
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const needle = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === needle);
}
