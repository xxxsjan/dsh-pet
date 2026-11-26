/**
 * OBS 页面的显示选项：成品配置的默认值 + URL 参数临时覆盖。
 *
 * 覆盖只认 `pet` / `bubble` 的 `0|1` 与 0.2–3 的 `scale`，其余值忽略（OBS 地址栏手滑不该黑屏）。
 * 不读磁盘、不碰 DOM；宿主与页面共用同一份字段语义。
 * @module dsh-pet/src/obs/params
 */

/** 页面生效的显示选项。 */
export interface ObsOptions {
  /** 是否绘制宠物本体；false 时舞台仍保留尺寸，只显示气泡。 */
  readonly showPet: boolean;
  /** 是否绘制头顶气泡。 */
  readonly showBubble: boolean;
  /** 宠物尺寸倍数；0.2–3。 */
  readonly scale: number;
}

const SCALE_MIN = 0.2;
const SCALE_MAX = 3;

const clampScale = (value: number): number => Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));

/**
 * 解析页面选项。
 *
 * @param main - 成品配置的 `main` 条目（可能缺失或不是对象）。
 * @param search - 页面地址的查询参数。
 * @returns 已填默认值并应用 URL 覆盖的选项。
 */
export function parseObsOptions(main: unknown, search: URLSearchParams): ObsOptions {
  const conf = main && typeof main === 'object' ? (main as Record<string, unknown>) : {};
  const confScale = Number(conf.obsScale);
  const confShowPet = conf.obsShowPet !== false;
  const confShowBubble = conf.obsShowBubble !== false;

  const petParam = search.get('pet');
  const bubbleParam = search.get('bubble');
  const scaleParam = search.get('scale');
  const scale = scaleParam === null ? Number.NaN : Number(scaleParam);

  return {
    showPet: petParam === '0' ? false : petParam === '1' ? true : confShowPet,
    showBubble: bubbleParam === '0' ? false : bubbleParam === '1' ? true : confShowBubble,
    scale: Number.isFinite(scale) ? clampScale(scale) : Number.isFinite(confScale) ? clampScale(confScale) : 1,
  };
}
