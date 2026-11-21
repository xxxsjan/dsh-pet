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
 * 发 HTTPS 请求并保留流式响应体：有代理时边收边转，无代理时直接用 `fetch` 的 body 流。
 *
 * 与 {@link fetchViaOutboundProxy} 的区别只在「拿到响应头的时机」：这里一旦解析完响应头
 * 就 resolve，正文随上游继续到达（音频首包即刻可用）；错误分支的响应体同样按流返回，
 * 调用方可以照常 `text()` 读错误详情。
 *
 * @param url - 必须是 https URL。
 * @param init - method / headers / body / signal。
 */
export async function fetchStreamViaOutboundProxy(url: string, init: ProxyFetchInit = {}): Promise<Response> {
  const proxy = resolveOutboundProxyUrl();
  if (!proxy) {
    return fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: init.signal,
    });
  }
  return httpsStreamThroughHttpProxy(url, proxy, init);
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
                Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString(
                  'base64',
                ),
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

/** 响应头最大字节数：超过视为不是合法 HTTP 响应，直接失败而不是无限攒内存。 */
const MAX_RESPONSE_HEAD_BYTES = 64 * 1024;

/** HTTP 头与正文的分隔。 */
const HEAD_SEPARATOR = Buffer.from('\r\n\r\n', 'latin1');

/**
 * 流式版本的代理隧道：解析完响应头立刻返回，正文按到达顺序推入 ReadableStream。
 *
 * 与缓冲版共用 CONNECT / TLS 流程；差异只在 body 处理——这里不攒整包，
 * chunked 交给 {@link createChunkedStreamDecoder} 增量解码，Content-Length 按剩余量截取，
 * 两者都没有就一直读到连接结束（请求头带了 `Connection: close`）。
 */
function httpsStreamThroughHttpProxy(
  targetUrl: string,
  proxyUrl: string,
  init: ProxyFetchInit,
): Promise<Response> {
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
    let headParsed = false;
    let tlsSocket: tls.TLSSocket | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;

    const cleanup = (): void => {
      init.signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown): void => {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!settled) {
        settled = true;
        cleanup();
        tlsSocket?.destroy();
        reject(err);
        return;
      }
      try {
        controller?.error(err);
      } catch {
        /* 已经关闭 */
      }
      tlsSocket?.destroy();
    };
    const onAbort = (): void => {
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
                Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString(
                  'base64',
                ),
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

      tlsSocket = tls.connect({ socket, servername: target.hostname });
      tlsSocket.once('error', fail);
      tlsSocket.once('secureConnect', () => {
        const lines = [`${method} ${target.pathname}${target.search} HTTP/1.1`];
        for (const [key, value] of Object.entries(headers)) {
          lines.push(`${key}: ${value}`);
        }
        lines.push('', '');
        tlsSocket!.write(lines.join('\r\n'));
        if (body) tlsSocket!.write(body);

        let headBuffer = Buffer.alloc(0);
        /** 正文推送策略：chunked 解码器 / 定长剩余量 / 读到断开。 */
        let pushBody: (chunk: Buffer) => void = () => undefined;
        let finishBody: () => void = () => undefined;

        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            controller = c;
          },
          pull() {
            // 消费方要数据了：恢复上游读取（emit 里按 desiredSize 暂停过）
            tlsSocket?.resume();
          },
          cancel() {
            tlsSocket?.destroy();
          },
        });

        const emit = (chunk: Buffer): void => {
          if (chunk.length === 0 || !controller) return;
          try {
            controller.enqueue(new Uint8Array(chunk));
          } catch {
            /* 客户端已取消 */
            return;
          }
          // 消费方跟不上（例如渲染端刚在解码）就别继续攒内存，等 pull 再恢复
          if ((controller.desiredSize ?? 1) <= 0) tlsSocket?.pause();
        };

        tlsSocket!.on('data', (chunk: Buffer) => {
          if (!headParsed) {
            headBuffer = headBuffer.length ? Buffer.concat([headBuffer, chunk]) : chunk;
            const sep = headBuffer.indexOf(HEAD_SEPARATOR);
            if (sep < 0) {
              if (headBuffer.length > MAX_RESPONSE_HEAD_BYTES) fail(new Error('proxy response head too large'));
              return;
            }
            const rawHead = headBuffer.subarray(0, sep);
            const rest = headBuffer.subarray(sep + HEAD_SEPARATOR.length);
            headBuffer = Buffer.alloc(0);
            let parsed: { status: number; statusText: string; headers: Headers };
            try {
              parsed = parseResponseHead(rawHead);
            } catch (error) {
              fail(error);
              return;
            }
            headParsed = true;
            const chunked = /chunked/i.test(parsed.headers.get('transfer-encoding') ?? '');
            const lengthText = parsed.headers.get('content-length');
            const expected = lengthText === null ? Number.NaN : Number(lengthText);
            if (chunked) {
              const decoder = createChunkedStreamDecoder(emit);
              pushBody = (part) => {
                try {
                  decoder.push(part);
                } catch (error) {
                  fail(error);
                }
              };
              finishBody = () => {
                try {
                  decoder.finish();
                } catch (error) {
                  fail(error);
                }
              };
            } else if (Number.isFinite(expected) && expected >= 0) {
              let remaining = expected;
              pushBody = (part) => {
                if (remaining <= 0) return;
                const take = Math.min(remaining, part.length);
                remaining -= take;
                emit(part.subarray(0, take));
              };
              finishBody = () => undefined;
            } else {
              pushBody = emit;
              finishBody = () => undefined;
            }
            // chunked 的 body 已由解码器还原，转发层不再声明编码
            parsed.headers.delete('transfer-encoding');
            parsed.headers.delete('content-length');
            settled = true;
            cleanup();
            resolve(
              new Response(stream, {
                status: parsed.status,
                statusText: parsed.statusText,
                headers: parsed.headers,
              }),
            );
            if (rest.length > 0) pushBody(rest);
            return;
          }
          pushBody(chunk);
        });

        tlsSocket!.on('end', () => {
          finishBody();
          try {
            controller?.close();
          } catch {
            /* 已错误关闭 */
          }
        });
      });
    });

    connectReq.on('error', fail);
    connectReq.end();
  });
}

/**
 * HTTP/1.1 响应头解析（不含正文）。
 * @param raw - 头块（到 `\r\n\r\n` 之前）。
 * @returns 状态行与头集合。
 * @throws {Error} 状态行或头格式非法时。
 */
function parseResponseHead(raw: Buffer): { status: number; statusText: string; headers: Headers } {
  const lines = raw.toString('latin1').split('\r\n');
  const statusLine = lines[0] ?? '';
  const match = /^HTTP\/\d\.\d\s+(\d{3})(?:\s+(.*))?$/.exec(statusLine);
  if (!match) throw new Error(`proxy response bad status line: ${statusLine}`);
  const outHeaders = new Headers();
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    outHeaders.append(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return { status: Number(match[1]), statusText: match[2] ?? '', headers: outHeaders };
}

/**
 * 增量解码 HTTP/1.1 chunked 正文：每次 `push` 只吐出已经完整到达的字节，
 * 分块头 / 数据 / 结尾 CRLF 可以任意跨 `push` 边界。
 *
 * @param emit - 每解出一段正文时调用。
 * @returns `push(chunk)` 与收尾 `finish()`。
 * @throws {Error} 分块长度非法、缺 CRLF 或尾块之后的残片不完整时。
 */
export function createChunkedStreamDecoder(emit: (chunk: Buffer) => void): {
  push(chunk: Buffer): void;
  finish(): void;
} {
  let buffer = Buffer.alloc(0);
  let state: 'size' | 'data' | 'crlf' | 'done' = 'size';
  let remaining = 0;

  return {
    push(chunk: Buffer): void {
      if (state === 'done') return;
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      for (;;) {
        if (state === 'size') {
          const lineEnd = buffer.indexOf('\r\n');
          if (lineEnd < 0) return;
          const sizeLine = buffer.subarray(0, lineEnd).toString('ascii');
          buffer = buffer.subarray(lineEnd + 2);
          const size = Number.parseInt(sizeLine.split(';', 1)[0]?.trim() ?? '', 16);
          if (!Number.isFinite(size) || size < 0) throw new Error(`chunked body bad size: ${sizeLine}`);
          if (size === 0) {
            state = 'done';
            return;
          }
          remaining = size;
          state = 'data';
          continue;
        }
        if (state === 'data') {
          if (buffer.length === 0) return;
          const take = Math.min(remaining, buffer.length);
          if (take > 0) emit(buffer.subarray(0, take));
          buffer = buffer.subarray(take);
          remaining -= take;
          if (remaining > 0) return;
          state = 'crlf';
          continue;
        }
        // crlf：数据块之间的分隔
        if (buffer.length < 2) return;
        if (buffer[0] !== 0x0d || buffer[1] !== 0x0a) throw new Error('chunked body missing CRLF');
        buffer = buffer.subarray(2);
        state = 'size';
      }
    },
    finish(): void {
      if (state !== 'done' && state !== 'size') throw new Error('chunked body truncated');
    },
  };
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
