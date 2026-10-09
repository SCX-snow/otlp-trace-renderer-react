import type { Metrics } from './metrics'

export interface TimeAxis {
  timeWidth: number
}

export function resolveTimeAxis(width: number, metrics: Metrics): TimeAxis {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  return { timeWidth: Math.max(1, safeWidth - metrics.paddingX * 2) }
}
