import type { NormalizeWarning, RawSpan, RawTrace, SpanData, SpanId, TraceData } from './types'

export const UNKNOWN_SERVICE = 'unknown_service'

/**
 * ns → µs 四舍五入。
 *
 * 只接受**差值**：单条 trace 的跨度远小于 2^53 ns（约 104 天），所以 Number(delta) 是精确的。
 * 绝对不能把绝对时间戳先转 number 再相减 —— 1.7e18 超过 Number.MAX_SAFE_INTEGER(9.007e15)，
 * double 粒度约 256ns，会在取整到 µs 后产生随机 1µs 错位。
 */
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

  // 1. 去重：同 spanId 只保留第一条
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

  // 2. 解析时间戳（BigInt），找基准
  const parsed = unique.map((span) => ({
    raw: span,
    startNs: parseNanos(span.startTimeUnixNano, warnings, span.spanId),
    endNs: parseNanos(span.endTimeUnixNano, warnings, span.spanId),
  }))

  let base = parsed[0]!.startNs
  for (const p of parsed) if (p.startNs < base) base = p.startNs

  // 3. 差值落回整数微秒
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

  // 4. 排序：start 升序，同值 duration 降序，再同值用 spanId 保证确定性
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

  // 5. 解析父子关系
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

  // 6. 断环：color 0=未访问 1=当前路径 2=已完成
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

  // 7. roots / children。sorted 已按 startUs 升序，所以 children 天然有序
  const children: number[][] = Array.from({ length: n }, () => [])
  const roots: number[] = []
  for (let i = 0; i < n; i++) {
    const p = parent[i]!
    if (p === -1) roots.push(i)
    else children[p]!.push(i)
  }

  // 8. 时钟偏移只报不改，改数据会让「渲染的和真实的不是一回事」
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
