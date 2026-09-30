export interface Metrics {

  rowHeight: number

  barHeight: number

  indentWidth: number

  maxIndentDepth: number

  nameColumnWidth: number

  rulerHeight: number

  paddingTop: number

  paddingX: number

  minBarWidth: number

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


export const MIN_PLOT_WIDTH = 120





export function resolveNameColumnWidth(
  availableWidth: number,
  desiredWidth: number = DEFAULT_METRICS.nameColumnWidth,
  minPlotWidth: number = MIN_PLOT_WIDTH,
): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 0
  return Math.max(0, Math.min(desiredWidth, availableWidth - minPlotWidth))
}
