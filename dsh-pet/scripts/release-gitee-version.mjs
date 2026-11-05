#!/usr/bin/env node
/**
 * 把 package.json 的 version 写成仅含 { version } 的 version.json，
 * 并通过 Gitee Contents API 更新远端文件（不推源码、不碰其它路径）。
 *
 * 环境变量：
 *   GITEE_ACCESS_TOKEN  必填（私人令牌，需 projects 权限）
 *   GITEE_OWNER         默认 xxxsjan
 *   GITEE_REPO          默认 blfs
 *   GITEE_BRANCH        默认 main
 *
 * 本地会先写出 dist-app/version.json，便于核对；加 --dry-run 则只写本地、不调 API。
 * @module dsh-pet/scripts/release-gitee-version
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dryRun = process.argv.includes('--dry-run');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = typeof pkg.version === 'string' && pkg.version ? pkg.version : '';
if (!version) {
  console.error('[release:gitee] package.json 缺少 version');
  process.exit(1);
}

const payload = { version };
const text = `${JSON.stringify(payload, null, 2)}\n`;
const outDir = join(root, 'dist-app');
const outFile = join(outDir, 'version.json');
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, text, 'utf8');
console.log(`[release:gitee] 本地已写 ${outFile}`);
console.log(`[release:gitee] 内容：${JSON.stringify(payload)}`);

if (dryRun) {
  console.log('[release:gitee] --dry-run：跳过远端上传');
  process.exit(0);
}

const token = process.env.GITEE_ACCESS_TOKEN || process.env.GITEE_TOKEN;
if (!token) {
  console.error(
    '[release:gitee] 缺少 GITEE_ACCESS_TOKEN。先导出令牌，或用 --dry-run 只生成本地文件。',
  );
  process.exit(1);
}

const owner = process.env.GITEE_OWNER || 'xxxsjan';
const repo = process.env.GITEE_REPO || 'blfs';
const branch = process.env.GITEE_BRANCH || 'main';
const path = 'version.json';
const apiBase = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${path}`;
const contentB64 = Buffer.from(text, 'utf8').toString('base64');
const message = `chore: bump version.json to ${version}`;

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function gitee(url, init = {}) {
  const res = await fetch(url, init);
  const bodyText = await res.text();
  /** @type {unknown} */
  let body;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }
  return { res, body };
}

const getUrl = `${apiBase}?access_token=${encodeURIComponent(token)}&ref=${encodeURIComponent(branch)}`;
const { res: getRes, body: getBody } = await gitee(getUrl);

/** @type {string | undefined} */
let sha;
if (getRes.ok && getBody && typeof getBody === 'object' && getBody !== null && 'sha' in getBody) {
  sha = String(/** @type {{ sha: string }} */ (getBody).sha);
} else if (getRes.status !== 404) {
  console.error(`[release:gitee] 读取远端 ${path} 失败：HTTP ${getRes.status}`, getBody);
  process.exit(1);
}

const form = new URLSearchParams();
form.set('access_token', token);
form.set('content', contentB64);
form.set('message', message);
form.set('branch', branch);
if (sha) form.set('sha', sha);

const method = sha ? 'PUT' : 'POST';
const { res: putRes, body: putBody } = await gitee(apiBase, {
  method,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form.toString(),
});

if (!putRes.ok) {
  console.error(`[release:gitee] 更新远端失败：HTTP ${putRes.status}`, putBody);
  process.exit(1);
}

console.log(
  `[release:gitee] 已${sha ? '更新' : '创建'} https://gitee.com/${owner}/${repo}/blob/${branch}/${path}`,
);
