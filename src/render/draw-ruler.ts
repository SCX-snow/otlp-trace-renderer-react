import { formatDurationUs } from '../headless/format'
import type { Viewport } from '../headless/layout/viewport'
import type { TimelineScene } from './scene'

export interface Tick {

  x: number
  timeUs: number
  label: string
}






const LABEL_GAP = 3

export function computeDivisions(width: number, maxDivisions = 5, minLabelWidth = 140): number {
  if (!Number.isFinite(width) || width <= 0) return 0
  return Math.max(1, Math.min(maxDivisions, Math.round(width / minLabelWidth)))
}

export function computeTicks(
  viewport: Viewport,
  width: number,
  divisions = 5,
  locale?: string,
): Tick[] {
  if (width <= 0 || divisions <= 0) return []
  const ticks: Tick[] = []
  for (let i = 0; i <= divisions; i++) {
    const ratio = i / divisions
    const timeUs = viewport.startUs + ratio * viewport.spanUs
    ticks.push({ x: ratio * width, timeUs, label: formatDurationUs(timeUs, locale) })
  }
  return ticks
}


function tickXs(scene: TimelineScene): { ticks: Tick[]; x: (tick: Tick) => number } {
  const ticks = computeTicks(
    scene.viewport,
    scene.axis.timeWidth,
    computeDivisions(scene.axis.timeWidth),
    scene.locale,
  )
  return { ticks, x: (tick) => scene.metrics.paddingX + tick.x }
}




export function drawGrid(ctx: CanvasRenderingContext2D, scene: TimelineScene): void {
  const { theme, width, height } = scene
  const { ticks, x } = tickXs(scene)

  ctx.fillStyle = theme.gridLine
  for (const tick of ticks) {
    const px = Math.round(x(tick))
    if (px >= 0 && px <= width) ctx.fillRect(px, 0, 1, height)
  }
}







export function drawRuler(ctx: CanvasRenderingContext2D, scene: TimelineScene): void {
  const { metrics, theme, width } = scene
  const { ticks, x } = tickXs(scene)


  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, width, Math.max(metrics.rulerHeight - 1, 0))
  ctx.fillStyle = theme.border
  ctx.fillRect(0, metrics.rulerHeight - 1, width, 1)

  ctx.fillStyle = theme.rulerText
  ctx.font = `11px ${theme.fontFamily}`
  ctx.textBaseline = 'middle'
  const labelY = Math.floor(metrics.rulerHeight / 2)
  for (const tick of ticks) {
    const px = x(tick)
    const labelWidth = ctx.measureText(tick.label).width


    const alignRight = px + LABEL_GAP + labelWidth > width
    const anchor = alignRight ? px - LABEL_GAP : px + LABEL_GAP
    const from = alignRight ? anchor - labelWidth : anchor
    const to = alignRight ? anchor : anchor + labelWidth

    if (from < 0 || to > width) continue
    ctx.textAlign = alignRight ? 'right' : 'left'
    ctx.fillText(tick.label, anchor, labelY)
  }
}
