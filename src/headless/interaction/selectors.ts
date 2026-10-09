import type { SpanData, SpanId, TraceData } from '../model/types'
import type { Row } from '../layout/flatten'

export function spanAt(trace: TraceData, spanId: SpanId | null | undefined): SpanData | null {
  if (spanId === null || spanId === undefined) return null
  const index = trace.index.get(spanId)
  return index === undefined ? null : trace.spans[index]!
}

export function rowOfSpan(rows: Row[], trace: TraceData, spanId: SpanId | null): number {
  if (spanId === null) return -1
  const spanIndex = trace.index.get(spanId)
  if (spanIndex === undefined) return -1
  for (let i = 0; i < rows.length; i++) if (rows[i]!.spanIndex === spanIndex) return i
  return -1
}

export function ancestorsOf(trace: TraceData, spanIndex: number): SpanId[] {
  const out: SpanId[] = []
  const guard = new Set<number>()
  let current = trace.spans[spanIndex]?.parentSpanId ?? null
  while (current !== null) {
    const index = trace.index.get(current)
    if (index === undefined || guard.has(index)) break
    guard.add(index)
    out.push(current)
    current = trace.spans[index]!.parentSpanId
  }

  return out.reverse()
}

export function precomputeDurations(trace: TraceData): Float64Array {
  const durations = new Float64Array(trace.spans.length)
  for (let i = 0; i < trace.spans.length; i++) durations[i] = trace.spans[i]!.durationUs
  durations.sort()
  return durations
}

export function durationPercentile(sortedDurations: Float64Array, durationUs: number): number {
  const n = sortedDurations.length
  if (n === 0) return 0
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedDurations[mid]! <= durationUs) lo = mid + 1
    else hi = mid
  }
  return lo / n
}
