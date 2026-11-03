/**
 * 配置脱敏：密钥字段不得出现在对外视图里。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactConfigSecrets } from './public.ts';

test('redactConfigSecrets：去掉 fishApiKey，改成 hasFishApiKey', () => {
  const redacted = redactConfigSecrets({
    main: {
      voiceEnabled: true,
      fishApiKey: 'sk-secret',
      fishTtsModel: 's2.1-pro-free',
    },
    pack: { fishApiKey: '' },
  });
  assert.equal('fishApiKey' in redacted.main!, false);
  assert.equal(redacted.main!.hasFishApiKey, true);
  assert.equal(redacted.pack!.hasFishApiKey, false);
  assert.equal('fishApiKey' in redacted.pack!, false);
});
