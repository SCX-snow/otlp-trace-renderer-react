import { formatDurationUs } from '../headless/format'
import type { Viewport } from '../headless/layout/viewport'
import type { TimelineScene } from './scene'

export interface Tick {
  /** CSS 像素，相对时间轴左边 */
  x: number
  timeUs: number
  label: string
}

/**
 * 刻度分几格。窄容器上固定 5 格会让标签互相压字（120px 宽塞 5 个 "261ms" 必然重叠），
 * 所以按宽度算，至少 1 格。
 */
/** 标签与它那条网格线之间留的空隙 */
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

/** 刻度位置（CSS 像素）：和 bar 用同一套横向映射，见 layout/axis.ts */
function tickXs(scene: TimelineScene): { ticks: Tick[]; x: (tick: Tick) => number } {
  const ticks = computeTicks(
    scene.viewport,
    scene.axis.timeWidth,
    computeDivisions(scene.axis.timeWidth),
    scene.locale,
  )
  return { ticks, x: (tick) => scene.metrics.paddingX + tick.x }
}

/**
 * 竖向网格线：整高的**背景**，画在 bar 之前（顶部那一段稍后会被 `drawRuler` 的标尺带盖掉）。
 */
export function drawGrid(ctx: CanvasRenderingContext2D, scene: TimelineScene): void {
  const { theme, width, height } = scene
  const { ticks, x } = tickXs(scene)

  ctx.fillStyle = theme.gridLine
  for (const tick of ticks) {
    const px = Math.round(x(tick))
    if (px >= 0 && px <= width) ctx.fillRect(px, 0, 1, height)
  }
}

/**
 * 标尺带 + 边框 + 刻度标签。
 *
 * ⚠️ 必须在 bar **之后**画：标尺是 sticky 的，盖在行上面（`rowAtY` 也这么判定 —— 点标尺带不命中任何行）。
 * 画在 bar 之前的话，滚动到半行位置时，被标尺盖住的那半行长条会画到标尺上面去（用户看得到）。
 */
export function drawRuler(ctx: CanvasRenderingContext2D, scene: TimelineScene): void {
  const { metrics, theme, width } = scene
  const { ticks, x } = tickXs(scene)

  // 标尺区把网格线盖掉，否则文字压在竖线上没法看
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
    // 标签默认贴在网格线**右边**（和线不会互相压）。视口末端那一条右边只剩 paddingX 几个像素，
    // 再左对齐就一定会被画布右边缘切掉 —— 改成右对齐、放到网格线**左边**，标签与线的相对关系不变。
    const alignRight = px + LABEL_GAP + labelWidth > width
    const anchor = alignRight ? px - LABEL_GAP : px + LABEL_GAP
    const from = alignRight ? anchor - labelWidth : anchor
    const to = alignRight ? anchor : anchor + labelWidth
    // 连换一种对齐都放不下（画布窄到几十像素）就干脆不画，免得留半个字
    if (from < 0 || to > width) continue
    ctx.textAlign = alignRight ? 'right' : 'left'
    ctx.fillText(tick.label, anchor, labelY)
  }
}
