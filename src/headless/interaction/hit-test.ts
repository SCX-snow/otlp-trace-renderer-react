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

export function rowAtY(y: number, rowCount: number, metrics: Metrics, scrollTop: number): number {
  if (y < metrics.rulerHeight) return -1
  const contentY = y + scrollTop
  const rowIndex = Math.floor(
    (contentY - metrics.rulerHeight - metrics.paddingTop) / metrics.rowHeight,
  )
  return rowIndex >= 0 && rowIndex < rowCount ? rowIndex : -1
}

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

  if (point.x >= x0 && point.x <= x1) {
    return { type: 'row', rowIndex, spanIndex: row.spanIndex, zone: 'bar' }
  }
  return { type: 'row', rowIndex, spanIndex: row.spanIndex, zone: 'gutter' }
}
