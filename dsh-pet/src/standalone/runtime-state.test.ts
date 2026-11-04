import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { RUNTIME_STATE_FILE, appRuntimeStateDir, cliRuntimeStateDir, writeStandaloneRuntime } from './runtime-state.ts';

test('launcher runtime capability is private and only its owning process removes it', () => {
  const home = mkdtempSync(join(tmpdir(), 'pet-runtime-'));
  try {
    const details = {
      port: 31380,
      token: 'test-only-capability',
      settingsUrl: 'http://127.0.0.1:31380/standalone-ai/#token=test-only-capability',
      pluginRoot: '/test/plugin',
    };
    const stateDir = cliRuntimeStateDir(home);
    const release = writeStandaloneRuntime(stateDir, details);
    const file = join(stateDir, RUNTIME_STATE_FILE);
    const state = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(state.name, 'blue-fish6');
    assert.equal(state.pid, process.pid);
    assert.equal(state.token, details.token);
    assert.equal(state.pluginRoot, details.pluginRoot);
    assert.equal(typeof state.startedAt, 'string');
    writeFileSync(file, JSON.stringify({ ...state, pid: process.pid + 1000 }));
    release();
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).pid, process.pid + 1000);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runtime cleanup is idempotent and removes its own manifest', () => {
  const home = mkdtempSync(join(tmpdir(), 'pet-runtime-'));
  try {
    const stateDir = cliRuntimeStateDir(home);
    const release = writeStandaloneRuntime(stateDir, {
      port: 31380,
      token: 'test-only',
      settingsUrl: 'http://127.0.0.1:31380/standalone-ai/',
      pluginRoot: '/test/plugin',
    });
    release();
    release();
    assert.throws(() => readFileSync(join(stateDir, RUNTIME_STATE_FILE)), /ENOENT/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('desktop and CLI resolve different state directories', () => {
  const home = join(tmpdir(), 'fake-dsh-home');
  assert.equal(cliRuntimeStateDir(home), join(home, 'blue-fish6'));
  assert.match(appRuntimeStateDir(), /[/\\]\.blue-fish6$/);
});
