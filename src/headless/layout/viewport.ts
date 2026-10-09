export interface Viewport {
  startUs: number

  spanUs: number
}

export const MIN_SPAN_US = 1

export const OVERSCROLL_RATIO = 0.02

export const MAX_SPAN_RATIO = 1.05

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
