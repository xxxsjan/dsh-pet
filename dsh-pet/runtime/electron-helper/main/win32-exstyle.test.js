'use strict';
/**
 * win32-exstyle 纯函数：HWND buffer 解析（不调 PowerShell）。
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { hwndDecimal, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW } = require('./win32-exstyle.js');

describe('hwndDecimal', () => {
  test('8 字节小端 HWND', () => {
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64LE(0x1a2b3c4dn);
    assert.equal(hwndDecimal(buf), String(0x1a2b3c4dn));
  });

  test('4 字节回退', () => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(0x12345678);
    assert.equal(hwndDecimal(buf), String(0x12345678));
  });

  test('空 buffer → 0', () => {
    assert.equal(hwndDecimal(null), '0');
    assert.equal(hwndDecimal(Buffer.alloc(0)), '0');
  });
});

describe('exstyle masks', () => {
  test('APPWINDOW 与 TOOLWINDOW 位不重叠', () => {
    assert.equal(WS_EX_APPWINDOW & WS_EX_TOOLWINDOW, 0);
  });
});
