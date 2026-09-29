import type { Row } from '../headless/layout/flatten'
import type { TimeAxis } from '../headless/layout/axis'
import type { Metrics } from '../headless/layout/metrics'
import type { Viewport } from '../headless/layout/viewport'
import type { SpanId, TraceData } from '../headless/model/types'
import type { ThemeTokens } from '../headless/theme/tokens'
import type { SpanColorMode } from './colors'

/** 解析后的主题（CSS 变量已经读成真实值）。render 层不碰 DOM，只消费这个对象。 */
export type ResolvedTheme = ThemeTokens

export interface TimelineScene {
  trace: TraceData
  rows: Row[]
  viewport: Viewport
  metrics: Metrics
  theme: ResolvedTheme
  /** 时间轴那一列的宽度（CSS 像素） */
  width: number
  /** 时间轴的横向几何（时间映射宽度 + 生效缩进）：bar、刻度、命中测试共用一份，别各自算 */
  axis: TimeAxis
  height: number
  /** 外层滚动容器的 scrollTop，canvas 固定不滚，靠它换算行位置 */
  scrollTop: number
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  spanColorMode: SpanColorMode
  /** 时长分位用的排序数组，见 precomputeDurations */
  durations: Float64Array
  /** 刻度标签的数字格式（Intl）。不传就用 toFixed */
  locale?: string
  /** service → 颜色，见 buildServiceColors（同一 trace 内保证不撞色） */
  serviceColors: ReadonlyMap<string, string>
}

/** 行区的起点：标尺 + 上留白 */
export const rowOrigin = (metrics: Metrics) => metrics.rulerHeight + metrics.paddingTop
