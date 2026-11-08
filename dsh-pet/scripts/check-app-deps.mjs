#!/usr/bin/env node
/**
 * 桌面应用产物的依赖完整性校验：确保 asar 里不会留下解析不到的裸模块。
 *
 * electron-builder.yml 的 files 白名单刻意不带 node_modules，所以 lib/app.js 必须自带全部
 * 运行依赖；而 tsdown 默认把 package.json 的 dependencies 外部化（留成裸 import），
 * 漏配一次 noExternal 就会在双击启动时 ERR_MODULE_NOT_FOUND（pako / protobufjs 就踩过）。
 * 这里从应用真正加载的三份产物出发递归相对分块，把白名单外的裸模块全部列出来并失败退出，
 * 让漏配在 npm run build 阶段就暴露，而不是等打包后启动才弹框。
 *
 * 说明符用 rolldown 自带的 parseAst 从 AST 里取，不靠正则扫文本——产物里 React/protobufjs
 * 的报错文案和注释本身就写着 import('./MyComponent') 之类，正则会把它们误判成真导入。
 *
 * 白名单只收运行时确实能解析到的：Node 内置模块、electron（Electron 自带解析器）、
 * 应用模式永不执行的两个 Electron 下载依赖，以及 ws 的可选加速包（包在 try/catch 里，
 * 取不到会退回纯 JS 实现）。
 * @module dsh-pet/scripts/check-app-deps
 */
import { builtinModules } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';

/** 包根目录 */
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** 构建产物目录 */
const LIB = join(ROOT, 'lib');
/** 桌面应用运行时真正加载的入口：主进程、设置页外壳、设置页对话面板（后两份由本机服务按文件名读取） */
const ENTRIES = ['app.js', 'settings-shell.js', 'chat-panel.js'];

/** 包外但运行时仍可解析的说明符 */
const ALLOWED = new Set([
  'electron',
  // 只在「下载 Electron」的 helper 路径里动态 import，桌面应用模式永远走不到
  '@electron/get',
  '@electron-internal/extract-zip',
  // ws 的可选加速依赖：包在 try/catch 里，取不到会用 JS 实现
  'bufferutil',
  'utf-8-validate',
]);

/** Node 内置模块名（已去掉 node: 前缀；'fs/promises' 这类子路径也在列表里） */
const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')));

/**
 * 说明符在打包后的环境里是否可解析。
 * @param {string} spec - 模块说明符。
 * @returns {boolean} 内置模块或白名单成员时为 true。
 */
function resolvable(spec) {
  return spec.startsWith('node:') || BUILTINS.has(spec) || ALLOWED.has(spec);
}

/**
 * 取字节偏移对应的行号（1 起）。
 * @param {string} code - 文件全文。
 * @param {number} offset - AST 节点的 start 偏移。
 * @returns {number} 行号。
 */
function lineAt(code, offset) {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (code.charCodeAt(i) === 10) line += 1;
  return line;
}

/**
 * 从 AST 里收集真实存在的模块说明符：静态 import / re-export、动态 import()、require()/__require()。
 * 字符串字面量接在 require 之外（例如报错文案里的示例）不会被误判。
 * @param {object} node - 任意 AST 节点。
 * @param {{ spec: string, offset: number }[]} out - 收集结果。
 */
function collect(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (typeof node.type === 'string') {
    const source =
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportAllDeclaration'
        ? node.source
        : node.type === 'ImportExpression'
          ? node.source
          : undefined;
    if (source && typeof source.value === 'string') {
      out.push({ spec: source.value, offset: source.start ?? node.start });
    }
    if (node.type === 'CallExpression') {
      const name = node.callee && node.callee.type === 'Identifier' ? node.callee.name : undefined;
      const arg = node.arguments && node.arguments[0];
      if ((name === 'require' || name === '__require') && arg && typeof arg.value === 'string') {
        out.push({ spec: arg.value, offset: node.start });
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    collect(node[key], out);
  }
}

/**
 * 抽取一份产物里的全部模块说明符。
 * @param {string} file - 产物绝对路径。
 * @returns {{ spec: string, line: number }[]} 说明符及所在行号。
 */
function specifiersOf(file) {
  const code = readFileSync(file, 'utf8');
  const raw = [];
  collect(parseAst(code, undefined, file), raw);
  return raw.map(({ spec, offset }) => ({ spec, line: lineAt(code, offset) }));
}

/**
 * 从入口出发遍历相对分块，收集解析不到的裸模块与缺失的相对分块。
 * @param {string} entry - `lib/` 下的入口文件名。
 * @returns {{ file: string, line: number, spec: string }[]} 问题列表（空数组表示通过）。
 */
function checkEntry(entry) {
  const problems = [];
  const visited = new Set();
  const pending = [join(LIB, entry)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!existsSync(file)) {
      problems.push({ file: basename(file), line: 0, spec: '(缺失的相对分块)' });
      continue;
    }
    for (const { spec, line } of specifiersOf(file)) {
      if (spec.startsWith('./') || spec.startsWith('../')) {
        pending.push(resolve(dirname(file), spec));
      } else if (!resolvable(spec)) {
        problems.push({ file: basename(file), line, spec });
      }
    }
  }
  return problems;
}

const problems = ENTRIES.flatMap((entry) => checkEntry(entry));

if (problems.length > 0) {
  console.error('[check-app-deps] ✗ 桌面应用产物里存在解析不到的裸模块：');
  for (const { file, line, spec } of problems) console.error(`  - ${file}:${line} → ${spec}`);
  console.error('  electron-builder 的 files 不带 node_modules，启动主进程会直接 ERR_MODULE_NOT_FOUND。');
  console.error('  修法：把缺失的包加进 tsdown.config.mjs 里 app 入口的 noExternal，然后重新 npm run bundle。');
  process.exit(1);
}

console.log(`[check-app-deps] ✓ ${ENTRIES.join(' / ')} 未发现缺失依赖`);
