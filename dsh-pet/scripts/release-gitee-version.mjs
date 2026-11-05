#!/usr/bin/env node
/**
 * 发布驱动：version.json 推到远端 master 分支，win-x64 压缩包以 v{version} 标签发布，
 * 并调 Gitee Release API 创建发行版、上传 zip 附件。
 * master 上只叠加 version.json、保留远端已有文件；标签提交只含 zip，不污染分支历史。
 * git 推送凭据走本地 git 配置；创建发行版需要 .env 里的 GITEE_TOKEN（私人令牌，勾选 projects）。
 *
 * 环境变量 GITEE_REPO_URL 覆盖默认远端；--dry-run 只打印计划，不写文件、不执行 git。
 * @module dsh-pet/scripts/release-gitee-version
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const distDir = join(root, 'dist-app');
const dryRun = process.argv.includes('--dry-run');
const remote = 'gitee';
const branch = 'master';
const repoUrl = process.env.GITEE_REPO_URL || 'https://gitee.com/xxxsjan/blufs.git';

/** 令牌只经 .env / 环境变量进入内存，禁止写日志。 */
function loadDotEnv() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const i = text.indexOf('=');
    if (i <= 0) continue;
    const key = text.slice(0, i).trim();
    let value = text.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const token = String(process.env.GITEE_TOKEN || '').trim();
if (!token) {
  console.error('[release:gitee] 缺少 GITEE_TOKEN。请在 dsh-pet/.env 写入：GITEE_TOKEN=你的私人令牌');
  console.error('[release:gitee] 创建：https://gitee.com/profile/personal_access_tokens （勾选 projects）');
  process.exit(1);
}

const repoMatch = repoUrl.match(/gitee\.com\/([^/]+)\/([^/.]+?)(?:\.git)?$/);
if (!repoMatch) {
  console.error(`[release:gitee] 无法从 ${repoUrl} 解析 owner/repo`);
  process.exit(1);
}
const [, owner, repo] = repoMatch;
const webBase = `https://gitee.com/${owner}/${repo}`;
const apiBase = `https://gitee.com/api/v5/repos/${owner}/${repo}`;

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = typeof pkg.version === 'string' && pkg.version ? pkg.version : '';
if (!version) {
  console.error('[release:gitee] package.json 缺少 version');
  process.exit(1);
}

const zipName = `blue-fish-${version}-win-x64.zip`;
const zipPath = join(distDir, zipName);
if (!existsSync(zipPath)) {
  console.error(`[release:gitee] 缺少 ${zipPath}，请先打包`);
  process.exit(1);
}

const tag = `v${version}`;
const payload = { version };
const text = `${JSON.stringify(payload, null, 2)}\n`;
const downloadUrl = `${webBase}/releases/download/${tag}/${zipName}`;

if (dryRun) {
  console.log(`[release:gitee] --dry-run：将写 ${join(distDir, 'version.json')}，内容：${JSON.stringify(payload)}`);
  console.log(`[release:gitee] --dry-run：将把 version.json 提交到 ${remote}/${branch}，用 ${zipName} 打标签 ${tag}，并创建发行版上传附件`);
  process.exit(0);
}

mkdirSync(distDir, { recursive: true });
writeFileSync(join(distDir, 'version.json'), text, 'utf8');
console.log(`[release:gitee] 本地已写 ${join(distDir, 'version.json')}，内容：${JSON.stringify(payload)}`);

/**
 * 在 dist-app 内执行 git 命令，失败即退出。
 * @param {string[]} args git 子命令与参数
 * @param {{ capture?: boolean, env?: Record<string, string> }} [opts] capture 为 true 时返回 stdout；
 *   env 追加到子进程环境（配合 GIT_INDEX_FILE 使用独立索引）；否则输出透传终端并返回空串
 * @returns {string}
 */
function git(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: distDir,
    encoding: 'utf8',
    stdio: opts.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
  });
  if (res.status !== 0) {
    console.error(`[release:gitee] git ${args.join(' ')} 失败`);
    process.exit(1);
  }
  return opts.capture ? (res.stdout || '') : '';
}

/**
 * 调 Gitee API，令牌走 query 参数，返回解析后的 JSON。
 * @param {string} method HTTP 方法
 * @param {string} path 相对于仓库 API 根的路径
 * @param {Record<string, string> | FormData} [body] 表单或 multipart 请求体
 * @returns {Promise<{ ok: boolean, status: number, data: unknown }>}
 */
async function apiJson(method, path, body) {
  const url = new URL(`${apiBase}${path}`);
  url.searchParams.set('access_token', token);
  const headers = {};
  let payloadBody;
  if (method !== 'GET' && method !== 'DELETE') {
    if (body instanceof FormData) {
      // token 已在 query；部分环境仍要求表单里带一份
      if (!body.has('access_token')) body.append('access_token', token);
      payloadBody = body;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payloadBody = new URLSearchParams(body || {}).toString();
    }
  }
  const res = await fetch(url, { method, headers, body: payloadBody });
  const resText = await res.text();
  let data = null;
  try {
    data = resText ? JSON.parse(resText) : null;
  } catch {
    data = { raw: resText };
  }
  return { ok: res.ok, status: res.status, data };
}

/** 按 tag 查发行版，先走直达路径，分页兜底。 */
async function getReleaseByTag() {
  const direct = await apiJson('GET', `/releases/tags/${encodeURIComponent(tag)}`);
  if (direct.ok && /** @type {{ id?: number }} */ (direct.data)?.id) {
    return /** @type {{ id: number, tag_name: string }} */ (direct.data);
  }
  for (let page = 1; page <= 20; page += 1) {
    const list = await apiJson('GET', `/releases?page=${page}&per_page=100`);
    const items = Array.isArray(list.data) ? /** @type {unknown[]} */ (list.data) : [];
    const hit = items.find((r) => /** @type {{ tag_name?: string }} */ (r)?.tag_name === tag);
    if (hit) return /** @type {{ id: number, tag_name: string }} */ (hit);
    if (items.length < 100) break;
  }
  return null;
}

async function createRelease() {
  const r = await apiJson('POST', '/releases', {
    tag_name: tag,
    name: tag,
    body: `发布 ${tag}`,
    target_commitish: branch,
    prerelease: 'false',
  });
  const data = /** @type {{ id?: number }} */ (r.data);
  if (!r.ok || !data?.id) {
    throw new Error(`创建发行版失败 HTTP ${r.status}: ${JSON.stringify(r.data)}`);
  }
  return /** @type {{ id: number }} */ (data);
}

if (!existsSync(join(distDir, '.git'))) {
  git(['init', '-b', branch]);
  git(['remote', 'add', remote, repoUrl]);
} else {
  const remotes = git(['remote'], { capture: true }).split(/\r?\n/).filter(Boolean);
  if (!remotes.includes(remote)) git(['remote', 'add', remote, repoUrl]);
  // 每次同步远端 URL，避免换仓库后旧 remote 仍指到老地址。
  git(['remote', 'set-url', remote, repoUrl]);
}

// 远端分支已有历史（README 等）时先把本地 master 对齐过去，避免覆盖远端内容；
// 空仓库没有该分支，直接从零开始。
const remoteHeads = git(['ls-remote', '--heads', remote, branch], { capture: true }).trim();
if (remoteHeads) {
  git(['fetch', remote, branch]);
  git(['reset', 'FETCH_HEAD']);
  // reset 只改索引不落盘，把远端带来而本地缺的文件补齐，避免状态里出现假删除。
  git(['checkout', '--', '.']);
}

// ---- master：只提交 version.json，zip 不进分支 ----
git(['add', 'version.json']);
const staged = git(['status', '--porcelain'], { capture: true })
  .split(/\r?\n/)
  .filter((line) => line.length > 1 && line[0] !== ' ' && line[0] !== '?');
if (staged.length > 0) {
  git(['commit', '-m', `chore: bump version.json to ${version}`]);
  git(['push', remote, branch]);
} else {
  console.log('[release:gitee] version.json 无变化，跳过 master 提交与推送');
}

// ---- 标签：用独立索引造一个只含 zip 的提交，父提交指向 master，主索引不受影响 ----
const tagIndex = join(distDir, '.git', 'release-tag-index');
const tagEnv = { GIT_INDEX_FILE: tagIndex };
git(['read-tree', '--empty'], { env: tagEnv });
git(['add', zipName], { env: tagEnv });
const tree = git(['write-tree'], { capture: true, env: tagEnv }).trim();
const tagCommit = git(['commit-tree', tree, '-p', 'HEAD', '-m', `release ${tag}`], { capture: true }).trim();
git(['tag', '-f', tag, tagCommit]);
git(['push', remote, `refs/tags/${tag}`, '--force']);

// ---- 发行版：旧发行版整个删除后重建（附件 API 不返回 id、上传只追加不覆盖，
// 复用发行版会导致同名附件无限堆积），最后上传 zip 附件 ----
try {
  const existing = await getReleaseByTag();
  if (existing) {
    const del = await apiJson('DELETE', `/releases/${existing.id}`, {});
    if (!del.ok && del.status !== 404) {
      throw new Error(`删除旧发行版失败 HTTP ${del.status}: ${JSON.stringify(del.data)}`);
    }
    console.log(`[release:gitee] 已删除旧发行版 id=${existing.id}（含重复附件）`);
  }

  const release = await createRelease();
  console.log(`[release:gitee] 已创建发行版 id=${release.id}`);

  const form = new FormData();
  form.append('file', new Blob([readFileSync(zipPath)], { type: 'application/octet-stream' }), zipName);
  const upload = await apiJson('POST', `/releases/${release.id}/attach_files`, form);
  if (!upload.ok) {
    throw new Error(`上传附件失败 HTTP ${upload.status}: ${JSON.stringify(upload.data)}`);
  }

  console.log(`[release:gitee] 发行版: ${webBase}/releases/tag/${tag}`);
  console.log(`[release:gitee] 下载: ${downloadUrl}`);
} catch (e) {
  console.error(`[release:gitee] 发行版/上传失败: ${/** @type {Error} */ (e)?.message || e}`);
  process.exit(1);
}
