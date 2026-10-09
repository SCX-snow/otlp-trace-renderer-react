import { durationPercentile } from '../headless/interaction/selectors'
import type { SpanData, TraceData } from '../headless/model/types'

export const SERVICE_PALETTE = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ca8a04',
  '#0891b2',
  '#4d7c0f',
  '#64748b',
] as const

export const SERVICE_PALETTE_DARK = [
  '#60a5fa',
  '#2dd4bf',
  '#a78bfa',
  '#22d3ee',
  '#fbbf24',
  '#a3e635',
  '#f0abfc',
  '#94a3b8',
] as const

export type SpanColorMode = 'service' | 'duration'

function hashIndex(serviceName: string, paletteSize: number): number {
  let hash = 0
  for (let i = 0; i < serviceName.length; i++) {
    hash = (hash * 31 + serviceName.charCodeAt(i)) % 100_000
  }
  return hash % paletteSize
}

export function buildServiceColors(
  trace: TraceData,
  palette: readonly string[] = SERVICE_PALETTE,
): ReadonlyMap<string, string> {
  const names = [...new Set(trace.spans.map((span) => span.serviceName))].sort()
  const used = new Set<number>()
  const colors = new Map<string, string>()
  for (const name of names) {
    let index = hashIndex(name, palette.length)
    for (let guard = 0; guard < palette.length && used.has(index); guard++) {
      index = (index + 1) % palette.length
    }
    used.add(index)
    colors.set(name, palette[index]!)
  }
  return colors
}

export function serviceColor(
  serviceName: string,
  options: { palette?: readonly string[] } = {},
): string {
  const palette = options.palette ?? SERVICE_PALETTE
  return palette[hashIndex(serviceName, palette.length)]!
}

export function durationColor(percentile: number): string {
  const p = Math.min(Math.max(percentile, 0), 1)
  return `hsl(${215 - 175 * p} 68% 46%)`
}

export function spanBarColor(
  span: SpanData,
  serviceColors: ReadonlyMap<string, string>,
  durations: Float64Array,
  mode: SpanColorMode,
  theme: { errorBar: string },
): string {
  if (span.status.code === 'error') return theme.errorBar
  if (mode === 'duration') return durationColor(durationPercentile(durations, span.durationUs))
  return serviceColors.get(span.serviceName) ?? serviceColor(span.serviceName)
}
