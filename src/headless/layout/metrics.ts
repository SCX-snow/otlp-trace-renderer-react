export interface Metrics {
  /** 行高（CSS 像素） */
  rowHeight: number
  /** span 条高度，居中于行 */
  barHeight: number
  /** 左侧名称列每层树深度的缩进（时间轴不缩进：bar 的横坐标只由时间决定） */
  indentWidth: number
  /** 名称列缩进封顶层数（更深的树不再继续往右推文字） */
  maxIndentDepth: number
  /** 左侧名称列宽度（DOM 列，不参与 canvas 绘制） */
  nameColumnWidth: number
  /** 顶部时间标尺高度 */
  rulerHeight: number
  /** 标尺与第一行之间的空隙，命中测试也必须带上它 */
  paddingTop: number
  /** 时间轴左右留白 */
  paddingX: number
  /** 极短 span 的最小可见宽度 */
  minBarWidth: number
  /** 折叠三角命中区宽度，向左扩展 */
  toggleWidth: number
}

export const DEFAULT_METRICS: Metrics = {
  rowHeight: 22,
  barHeight: 16,
  indentWidth: 12,
  maxIndentDepth: 20,
  nameColumnWidth: 280,
  rulerHeight: 28,
  paddingTop: 4,
  paddingX: 8,
  minBarWidth: 2,
  toggleWidth: 14,
}

/** 时间轴至少要留这么宽，否则刻度挤成一团 */
export const MIN_PLOT_WIDTH = 120

/**
 * 容器窄的时候按比例收窄名称列，保证时间轴还剩 MIN_PLOT_WIDTH。
 * 容器极窄时名称列可以为 0（宁可看不见名字，也不要横向溢出）。
 */
export function resolveNameColumnWidth(
  availableWidth: number,
  desiredWidth: number = DEFAULT_METRICS.nameColumnWidth,
  minPlotWidth: number = MIN_PLOT_WIDTH,
): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 0
  return Math.max(0, Math.min(desiredWidth, availableWidth - minPlotWidth))
}
