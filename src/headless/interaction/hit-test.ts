import type { TraceData } from '../model/types'
import type { Row } from '../layout/flatten'
import { toX, type Viewport } from '../layout/viewport'
import type { TimeAxis } from '../layout/axis'
import type { Metrics } from '../layout/metrics'

export type HitZone = 'bar' | 'gutter'

export type HitTarget =
  { type: 'none' } | { type: 'row'; rowIndex: number; spanIndex: number; zone: HitZone }

export interface Point {
  x: number
  y: number
}

/**
 * 视口 y → rowIndex（行等高，O(1)）。
 *
 * ⚠️ `y` 是**视口坐标**（canvas 局部坐标：canvas 用 `position: sticky` 钉在视口里，高度 = 视口高），
 * 而行排在内容里，所以必须把 `scrollTop` 加回去才能和行号对上。
 * 漏掉它（或恒传 0）的表现：滚动之后所有命中整体偏移 `scrollTop / rowHeight` 行 ——
 * 鼠标底下的行和点中的行对不上。见 `PITFALLS.md` 坑 #18。
 */
export function rowAtY(y: number, rowCount: number, metrics: Metrics, scrollTop: number): number {
  // 标尺带是 sticky 的，盖在行上面：点它不该命中任何行（不然滚动后点标尺会选中一行）
  if (y < metrics.rulerHeight) return -1
  const contentY = y + scrollTop
  const rowIndex = Math.floor(
    (contentY - metrics.rulerHeight - metrics.paddingTop) / metrics.rowHeight,
  )
  return rowIndex >= 0 && rowIndex < rowCount ? rowIndex : -1
}

/**
 * span 条的横向区间（CSS 像素，相对时间轴 canvas 左边）。
 *
 * 横坐标**只由时间决定** —— 左侧那点 `paddingX` 是留白，不是缩进：树深度不参与横向定位，
 * 否则同一时刻在不同深度的行上会落在不同的 x（网格线只能对上一种），见 `layout/axis.ts`。
 */
export function barRange(
  row: Row,
  trace: TraceData,
  viewport: Viewport,
  metrics: Metrics,
  axis: TimeAxis,
): { x0: number; x1: number } {
  const span = trace.spans[row.spanIndex]!
  const x0 = metrics.paddingX + toX(span.startUs, viewport, axis.timeWidth)
  const x1 = Math.max(
    x0 + metrics.minBarWidth,
    metrics.paddingX + toX(span.endUs, viewport, axis.timeWidth),
  )
  return { x0, x1 }
}

/** `point` 是 canvas 局部坐标（= 视口坐标，因为 canvas sticky 且高等于视口高） */
export function hitTest(
  point: Point,
  rows: Row[],
  trace: TraceData,
  viewport: Viewport,
  metrics: Metrics,
  axis: TimeAxis,
  scrollTop: number,
): HitTarget {
  const rowIndex = rowAtY(point.y, rows.length, metrics, scrollTop)
  if (rowIndex === -1) return { type: 'none' }

  const row = rows[rowIndex]!
  const { x0, x1 } = barRange(row, trace, viewport, metrics, axis)

  // 长条左边（含以前那个折叠三角命中区）都算行内空白：点它 = 选中该行。
  // 折叠三角已经搬到左侧名称列（那里才是树结构的位置），canvas 上不再有第二套命中语义
  if (point.x >= x0 && point.x <= x1) {
    return { type: 'row', rowIndex, spanIndex: row.spanIndex, zone: 'bar' }
  }
  return { type: 'row', rowIndex, spanIndex: row.spanIndex, zone: 'gutter' }
}
