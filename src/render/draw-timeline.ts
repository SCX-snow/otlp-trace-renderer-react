import { barRange } from '../headless/interaction/hit-test'
import type { Row } from '../headless/layout/flatten'
import type { Metrics } from '../headless/layout/metrics'
import { spanBarColor } from './colors'
import { drawGrid, drawRuler } from './draw-ruler'
import { rowOrigin, type TimelineScene } from './scene'


export function computeVisibleRows(
  rows: Row[],
  metrics: Metrics,
  scrollTop: number,
  height: number,
): { start: number; end: number } {
  const origin = rowOrigin(metrics)
  const start = Math.max(0, Math.floor((scrollTop - origin) / metrics.rowHeight))
  const end = Math.min(rows.length, Math.ceil((scrollTop + height - origin) / metrics.rowHeight))
  return { start, end: Math.max(start, end) }
}







export function drawTimeline(ctx: CanvasRenderingContext2D, scene: TimelineScene): void {
  const { trace, rows, metrics, theme, viewport, scrollTop, width, height } = scene
  const origin = rowOrigin(metrics)
  const { start, end } = computeVisibleRows(rows, metrics, scrollTop, height)

  ctx.save()
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, width, height)

  for (let i = start; i < end; i++) {
    const span = trace.spans[rows[i]!.spanIndex]!
    const isSelected = span.spanId === scene.selectedSpanId
    const isHovered = span.spanId === scene.hoveredSpanId
    if (!isSelected && !isHovered) continue



    ctx.fillStyle = isSelected ? theme.rowSelected : theme.rowHover
    ctx.fillRect(0, origin + i * metrics.rowHeight - scrollTop, width, metrics.rowHeight)
  }

  drawGrid(ctx, scene)

  for (let i = start; i < end; i++) {
    const row = rows[i]!
    const span = trace.spans[row.spanIndex]!
    const { x0, x1 } = barRange(row, trace, viewport, metrics, scene.axis)
    if (x1 < 0 || x0 > width) continue

    const top = origin + i * metrics.rowHeight - scrollTop
    const barTop = Math.round(top + (metrics.rowHeight - metrics.barHeight) / 2)
    const left = Math.round(x0)
    const barWidth = Math.max(Math.round(x1) - left, metrics.minBarWidth)

    ctx.fillStyle = spanBarColor(
      span,
      scene.serviceColors,
      scene.durations,
      scene.spanColorMode,
      theme,
    )
    ctx.fillRect(left, barTop, barWidth, metrics.barHeight)

    if (span.spanId === scene.selectedSpanId) {
      ctx.strokeStyle = theme.focusRing
      ctx.lineWidth = 2
      ctx.strokeRect(left - 1, barTop - 1, barWidth + 2, metrics.barHeight + 2)
    }
  }



  drawRuler(ctx, scene)

  ctx.restore()
}
