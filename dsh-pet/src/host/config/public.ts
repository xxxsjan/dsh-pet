/**
 * 对外配置视图：把磁盘成品里的密钥字段换成布尔存在性标记。
 *
 * GET / PUT / POST /config 的响应都走这里——密钥只落盘，不进 HTTP 响应体。
 * @module dsh-pet/src/host/config/public
 */

/** 成品聚合里需要脱敏的密钥字段 → 对外布尔字段。 */
const SECRET_FLAGS: ReadonlyArray<{ secret: string; flag: string }> = [
  { secret: 'fishApiKey', flag: 'hasFishApiKey' },
];

/**
 * 去掉成品聚合里的密钥明文，改成 `hasXxx` 布尔。
 *
 * 深拷贝顶层条目后再改：调用方可能还要拿原对象去合成（speak 读盘不经本函数）。
 * @param merged - {@link readAllConfig} 的成品。
 * @returns 可直接作为 HTTP 响应体的脱敏副本。
 */
export function redactConfigSecrets(
  merged: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [entryKey, entry] of Object.entries(merged)) {
    const copy: Record<string, unknown> = { ...entry };
    for (const { secret, flag } of SECRET_FLAGS) {
      if (!(secret in copy)) continue;
      const value = copy[secret];
      copy[flag] = typeof value === 'string' && value.trim() !== '';
      delete copy[secret];
    }
    out[entryKey] = copy;
  }
  return out;
}
