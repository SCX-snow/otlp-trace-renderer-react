export interface Viewport {
  /** 可见窗口起点（相对 trace 起点，微秒） */
  startUs: number
  /** 可见窗口宽度（微秒） */
  spanUs: number
}

/** 最小可视窗口 1µs；1px 已经远超这个精度，再放大没有意义 */
export const MIN_SPAN_US = 1
/** fit 时留 2% 余量，避免长条贴着边框 */
export const OVERSCROLL_RATIO = 0.02
/** 缩放上限：最多看到 105% 的 trace */
export const MAX_SPAN_RATIO = 1.05
/** 零长度 trace（单 span / 空 trace）的默认窗口宽度 */
const IDENTITY_MAX_US = 1000

export function toX(timeUs: number, viewport: Viewport, width: number): number {
  return ((timeUs - viewport.startUs) / viewport.spanUs) * width
}

export function toT(x: number, viewport: Viewport, width: number): number {
  if (width <= 0) return viewport.startUs
  return viewport.startUs + (x / width) * viewport.spanUs
}

export function maxSpanUs(durationUs: number): number {
  return Math.max(durationUs, IDENTITY_MAX_US) * MAX_SPAN_RATIO
}

const sameViewport = (a: Viewport, b: Viewport) => a.startUs === b.startUs && a.spanUs === b.spanUs

/**
 * 夹紧到合法区间。值没变时返回**原对象引用** —— reducer 靠 `===` 判断要不要重渲染。
 *
 * NaN / ±Infinity 一律夹回边界值，不让它传染到后续所有计算。
 */
export function clampViewport(viewport: Viewport, durationUs: number): Viewport {
  let spanUs = viewport.spanUs
  const max = maxSpanUs(durationUs)
  if (Number.isNaN(spanUs) || spanUs < MIN_SPAN_US) spanUs = MIN_SPAN_US
  else if (!Number.isFinite(spanUs) || spanUs > max) spanUs = max

  const upper = Math.max(0, durationUs * (1 + OVERSCROLL_RATIO) - spanUs)
  let startUs = viewport.startUs
  if (Number.isNaN(startUs) || startUs < 0) startUs = 0
  else if (!Number.isFinite(startUs) || startUs > upper) startUs = upper

  return sameViewport(viewport, { startUs, spanUs }) ? viewport : { startUs, spanUs }
}

export function fitViewport(durationUs: number): Viewport {
  const target = durationUs > 0 ? durationUs * (1 + OVERSCROLL_RATIO) : IDENTITY_MAX_US
  const spanUs = Math.min(Math.max(target, MIN_SPAN_US), maxSpanUs(durationUs))
  return { startUs: 0, spanUs }
}

/**
 * 以 anchorPx 处的时间为锚点缩放，factor > 1 为放大。
 *
 * 先夹紧 spanUs 再算 startUs：否则夹紧会让锚点漂移。窗口顶到边界时锚点不变量让位于边界
 * （和地图缩放一样，不会为了守住锚点把窗口推到 trace 外面）。
 */
export function zoomAt(
  viewport: Viewport,
  anchorPx: number,
  factor: number,
  width: number,
  durationUs: number,
): Viewport {
  if (!Number.isFinite(anchorPx) || !Number.isFinite(factor) || factor <= 0 || width <= 0) {
    return viewport
  }
  const anchorT = toT(anchorPx, viewport, width)
  const zoomed = clampViewport({ startUs: 0, spanUs: viewport.spanUs / factor }, durationUs)
  const next = clampViewport(
    { startUs: anchorT - (anchorPx / width) * zoomed.spanUs, spanUs: zoomed.spanUs },
    durationUs,
  )
  return sameViewport(viewport, next) ? viewport : next
}

/** dxPx > 0 表示把内容向右拖，时间窗口往左走 */
export function panByPx(
  viewport: Viewport,
  dxPx: number,
  width: number,
  durationUs: number,
): Viewport {
  if (!Number.isFinite(dxPx) || width <= 0) return viewport
  const next = clampViewport(
    { startUs: viewport.startUs - (dxPx / width) * viewport.spanUs, spanUs: viewport.spanUs },
    durationUs,
  )
  return sameViewport(viewport, next) ? viewport : next
}

/** 把 [startUs, endUs] 摆进视野，两侧各留 marginRatio 余量；已经在视野里就原样返回 */
export function revealRange(
  viewport: Viewport,
  startUs: number,
  endUs: number,
  durationUs: number,
  marginRatio = 0.1,
): Viewport {
  const spanUs = Math.max(endUs - startUs, 1)
  const margin = spanUs * marginRatio
  const visibleStart = viewport.startUs
  const visibleEnd = viewport.startUs + viewport.spanUs
  if (startUs - margin >= visibleStart && endUs + margin <= visibleEnd) return viewport
  return clampViewport({ startUs: startUs - margin, spanUs: spanUs + margin * 2 }, durationUs)
}
