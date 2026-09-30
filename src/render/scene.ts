import type { Row } from '../headless/layout/flatten'
import type { TimeAxis } from '../headless/layout/axis'
import type { Metrics } from '../headless/layout/metrics'
import type { Viewport } from '../headless/layout/viewport'
import type { SpanId, TraceData } from '../headless/model/types'
import type { ThemeTokens } from '../headless/theme/tokens'
import type { SpanColorMode } from './colors'


export type ResolvedTheme = ThemeTokens

export interface TimelineScene {
  trace: TraceData
  rows: Row[]
  viewport: Viewport
  metrics: Metrics
  theme: ResolvedTheme

  width: number

  axis: TimeAxis
  height: number

  scrollTop: number
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  spanColorMode: SpanColorMode

  durations: Float64Array

  locale?: string

  serviceColors: ReadonlyMap<string, string>
}


export const rowOrigin = (metrics: Metrics) => metrics.rulerHeight + metrics.paddingTop
