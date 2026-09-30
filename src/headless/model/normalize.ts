import type { NormalizeWarning, RawSpan, RawTrace, SpanData, SpanId, TraceData } from './types'

export const UNKNOWN_SERVICE = 'unknown_service'








function nsToUs(deltaNs: bigint): number {
  return Math.round(Number(deltaNs) / 1000)
}

function parseNanos(value: string, warnings: NormalizeWarning[], spanId: SpanId): bigint {
  const trimmed = String(value).trim()
  if (!/^-?\d+$/.test(trimmed)) {
    warnings.push({ code: 'bad-timestamp', spanId, value: String(value) })
    return 0n
  }
  return BigInt(trimmed)
}

export function normalizeTrace(raw: RawTrace): TraceData {
  const warnings: NormalizeWarning[] = []
  const resources =
    raw.resources.length > 0 ? raw.resources : [{ attributes: {}, serviceName: UNKNOWN_SERVICE }]


  const seen = new Set<SpanId>()
  const unique: RawSpan[] = []
  for (const span of raw.spans) {
    if (seen.has(span.spanId)) {
      warnings.push({ code: 'duplicate-span-id', spanId: span.spanId })
      continue
    }
    seen.add(span.spanId)
    unique.push(span)
  }

  if (unique.length === 0) {
    warnings.push({ code: 'empty-trace' })
    return {
      traceId: raw.traceId,
      startTimeUnixNano: '0',
      durationUs: 0,
      spans: [],
      resources,
      roots: [],
      children: [],
      index: new Map(),
      warnings,
    }
  }


  const parsed = unique.map((span) => ({
    raw: span,
    startNs: parseNanos(span.startTimeUnixNano, warnings, span.spanId),
    endNs: parseNanos(span.endTimeUnixNano, warnings, span.spanId),
  }))

  let base = parsed[0]!.startNs
  for (const p of parsed) if (p.startNs < base) base = p.startNs


  const spans: SpanData[] = parsed.map((p) => {
    const startUs = nsToUs(p.startNs - base)
    let endUs = nsToUs(p.endNs - base)
    if (endUs < startUs) {
      warnings.push({
        code: 'negative-duration',
        spanId: p.raw.spanId,
        startTimeUnixNano: p.raw.startTimeUnixNano,
        endTimeUnixNano: p.raw.endTimeUnixNano,
      })
      endUs = startUs
    }
    const resourceIndex =
      p.raw.resourceIndex >= 0 && p.raw.resourceIndex < resources.length ? p.raw.resourceIndex : 0
    const resource = resources[resourceIndex]!
    return {
      spanId: p.raw.spanId,
      parentSpanId: p.raw.parentSpanId,
      name: p.raw.name,
      serviceName: resource.serviceName,
      kind: p.raw.kind,
      startUs,
      endUs,
      durationUs: endUs - startUs,
      startTimeUnixNano: p.raw.startTimeUnixNano,
      attributes: p.raw.attributes,
      events: p.raw.events.map((event) => ({
        name: event.name,
        timeUs: nsToUs(parseNanos(event.timeUnixNano, warnings, p.raw.spanId) - base),
        attributes: event.attributes,
      })),
      links: p.raw.links,
      status: p.raw.status,
      resourceIndex,
      ...(p.raw.scopeName === undefined ? {} : { scopeName: p.raw.scopeName }),
    }
  })


  const order = spans.map((_, i) => i)
  order.sort((a, b) => {
    const sa = spans[a]!
    const sb = spans[b]!
    if (sa.startUs !== sb.startUs) return sa.startUs - sb.startUs
    if (sa.durationUs !== sb.durationUs) return sb.durationUs - sa.durationUs
    return sa.spanId < sb.spanId ? -1 : sa.spanId > sb.spanId ? 1 : 0
  })
  const sorted = order.map((i) => spans[i]!)
  const index = new Map<SpanId, number>()
  for (let i = 0; i < sorted.length; i++) index.set(sorted[i]!.spanId, i)


  const n = sorted.length
  const parent = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    const parentId = sorted[i]!.parentSpanId
    if (parentId === null) continue
    const p = index.get(parentId)
    if (p === undefined) {
      warnings.push({ code: 'parent-not-found', spanId: sorted[i]!.spanId, parentSpanId: parentId })
      continue
    }
    if (p === i) {
      warnings.push({ code: 'cycle', spanId: sorted[i]!.spanId, cycleLength: 1 })
      continue
    }
    parent[i] = p
  }


  const color = new Uint8Array(n)
  const path: number[] = []
  for (let i = 0; i < n; i++) {
    if (color[i] !== 0) continue
    path.length = 0
    let cur = i
    while (cur !== -1 && color[cur] === 0) {
      color[cur] = 1
      path.push(cur)
      cur = parent[cur]!
    }
    if (cur !== -1 && color[cur] === 1) {
      const cycle = path.slice(path.indexOf(cur))
      for (const node of cycle) parent[node] = -1
      warnings.push({
        code: 'cycle',
        spanId: sorted[cycle[0]!]!.spanId,
        cycleLength: cycle.length,
      })
    }
    for (const node of path) color[node] = 2
  }


  const children: number[][] = Array.from({ length: n }, () => [])
  const roots: number[] = []
  for (let i = 0; i < n; i++) {
    const p = parent[i]!
    if (p === -1) roots.push(i)
    else children[p]!.push(i)
  }


  for (let i = 0; i < n; i++) {
    const p = parent[i]!
    if (p === -1) continue
    const child = sorted[i]!
    const owner = sorted[p]!
    if (child.startUs < owner.startUs || child.endUs > owner.endUs) {
      warnings.push({
        code: 'clock-skew',
        spanId: child.spanId,
        startUs: child.startUs,
        endUs: child.endUs,
        parentStartUs: owner.startUs,
        parentEndUs: owner.endUs,
      })
    }
  }

  let durationUs = 0
  for (const span of sorted) if (span.endUs > durationUs) durationUs = span.endUs

  return {
    traceId: raw.traceId,
    startTimeUnixNano: base.toString(),
    durationUs,
    spans: sorted,
    resources,
    roots,
    children,
    index,
    warnings,
  }
}
