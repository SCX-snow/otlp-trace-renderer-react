import { barRange } from '../headless/interaction/hit-test'
import type { Row } from '../headless/layout/flatten'
import type { Metrics } from '../headless/layout/metrics'
import { spanBarColor } from './colors'
import { drawGrid, drawRuler } from './draw-ruler'
import { rowOrigin, type TimelineScene } from './scene'

/** 只画看得见的行。行等高，一次除法就够，不需要二分。 */
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

/**
 * 只吃 ctx + scene，除了往 ctx 上画之外没有副作用。
 *
 * DPR 由调用方通过 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` 处理，这里所有坐标一律是 CSS 像素 ——
 * 所以单测可以塞一个假的 ctx 进来断言几何，不需要真 canvas。
 */
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
    // 选中与悬停是两档底色：以前两处都用 rowHover，鼠标停在 A 行、选中 B 行时两条带子一模一样，
    // 分不出哪条是选中（选中另有长条上的 focusRing 描边 + 名称列的左侧色条）。
    // 同一行既被悬停又被选中时，选中优先。
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

  // 标尺带最后画：它是 sticky 的、盖在行上面（rowAtY 也这么判定），
  // 画在 bar 之前的话，滚到半行位置时被盖住的半行长条会跑到标尺上面
  drawRuler(ctx, scene)

  ctx.restore()
}
