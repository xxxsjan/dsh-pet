/**
 * 出站代理解析：环境变量优先，Windows 上回落到系统代理（与 reqwest 默认口径接近）。
 *
 * 只负责算出代理 URL；真正发请求见 ./proxy-fetch。
 * 不处理 PAC 脚本；Clash 一类本地 HTTP 代理（ProxyServer=host:port）可覆盖。
 * @module dsh-pet/src/host/net/system-proxy
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * 解析当前进程应用的出站 HTTP(S) 代理。
 *
 * 优先 `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`（大小写皆可），
 * 未设时在 Windows 上读 WinINET（`ProxyEnable` + `ProxyServer`）。
 *
 * @returns 形如 `http://127.0.0.1:7897`；无代理时 `undefined`。
 */
export function resolveOutboundProxyUrl(): string | undefined {
  const fromEnv =
    firstNonEmpty(
      process.env.HTTPS_PROXY,
      process.env.https_proxy,
      process.env.HTTP_PROXY,
      process.env.http_proxy,
      process.env.ALL_PROXY,
      process.env.all_proxy,
    ) ?? undefined;
  if (fromEnv) return normalizeProxyUrl(fromEnv);

  // 测试可关系统代理探测，强制走直连路径（再由用例 mock fetch）。
  if (process.env.DSH_PET_DISABLE_SYSTEM_PROXY === '1') return undefined;

  if (process.platform === 'win32') return readWindowsSystemProxyUrl();
  return undefined;
}

/** 取第一个非空 trim 串。 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/**
 * 把 `host:port` / `http://…` / `https=…;http=…` 收成单一 `http(s)://` URL。
 * @param raw - 环境变量或 WinINET ProxyServer 原文。
 */
export function normalizeProxyUrl(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;

  // WinINET 多协议：http=127.0.0.1:7897;https=127.0.0.1:7897
  if (text.includes('=') && (text.includes(';') || /^(https?|socks)=/i.test(text))) {
    const map = new Map<string, string>();
    for (const part of text.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const scheme = part.slice(0, idx).trim().toLowerCase();
      const endpoint = part.slice(idx + 1).trim();
      if (scheme && endpoint) map.set(scheme, endpoint);
    }
    const picked = map.get('https') ?? map.get('http') ?? map.get('socks') ?? map.get('socks5');
    if (!picked) return undefined;
    if (map.get('https') === picked || map.get('http') === picked) {
      return ensureHttpScheme(picked);
    }
    // socks 暂不支持：Node fetch/CONNECT 路径只接 HTTP 代理
    return undefined;
  }

  return ensureHttpScheme(text);
}

/** 无 scheme 时补 `http://`（本地 Clash 端口通常是 HTTP CONNECT）。 */
function ensureHttpScheme(endpoint: string): string | undefined {
  const value = endpoint.trim();
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (/^socks/i.test(value)) return undefined;
    return value;
  }
  return `http://${value}`;
}

/**
 * 读 HKCU WinINET 系统代理；失败或未启用返回 undefined。
 * 用 `reg query`，避免再拉起易超时的 PowerShell。
 */
function readWindowsSystemProxyUrl(): string | undefined {
  try {
    const enableOut = execFileSync(
      joinSystem32('reg.exe'),
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyEnable'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 },
    );
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enableOut)) return undefined;

    const serverOut = execFileSync(
      joinSystem32('reg.exe'),
      ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'],
      { encoding: 'utf8', windowsHide: true, timeout: 3000 },
    );
    const match = serverOut.match(/ProxyServer\s+REG_SZ\s+(.+)\r?\n/i);
    const server = match?.[1]?.trim();
    if (!server) return undefined;
    return normalizeProxyUrl(server);
  } catch {
    return undefined;
  }
}

/** `%SystemRoot%\System32\reg.exe`，避免 PATH 被改坏时找不到。 */
function joinSystem32(exe: string): string {
  const root = process.env.SystemRoot ?? 'C:\\Windows';
  return join(root, 'System32', exe);
}
