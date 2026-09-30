import { normalizeTrace } from '../../src/headless/model/normalize'
import type { RawSpan, TraceData } from '../../src/headless/model/types'

export const BASE_NS = 1_700_000_000_000_000_000n


export const at = (offsetUs: number) => (BASE_NS + BigInt(Math.round(offsetUs)) * 1000n).toString()

export const RESOURCES = [{ attributes: { 'service.name': 'svc' }, serviceName: 'svc' }]

export function rawSpan(
  spanId: string,
  startUs: number,
  endUs: number,
  parentSpanId: string | null = null,
): RawSpan {
  return {
    spanId,
    parentSpanId,
    name: `op-${spanId}`,
    kind: 'internal',
    startTimeUnixNano: at(startUs),
    endTimeUnixNano: at(endUs),
    attributes: {},
    events: [],
    links: [],
    status: { code: 'unset' },
    resourceIndex: 0,
  }
}

export function toTraceData(
  spans: RawSpan[],
  traceId = 'ab'.repeat(16),
  resources = RESOURCES,
): TraceData {
  return normalizeTrace({ traceId, spans, resources })
}


export function multiServiceTrace(names: string[]): TraceData {
  const resources = names.map((serviceName) => ({
    attributes: { 'service.name': serviceName },
    serviceName,
  }))
  const spans = names.map((_, index) => ({
    ...rawSpan(`s${index}`, index * 10, index * 10 + 5),
    resourceIndex: index,
  }))
  return toTraceData(spans, undefined, resources)
}


export function makeTraceData(count = 5000): TraceData {
  const spans: RawSpan[] = []
  for (let i = 0; i < count; i++) {
    const startUs = (i % 500) * 1000
    spans.push(
      rawSpan(spanIdOf(i), startUs, startUs + 500, i === 0 ? null : spanIdOf(Math.floor(i / 2))),
    )
  }
  return toTraceData(spans)
}

export const spanIdOf = (i: number) => `s${String(i).padStart(6, '0')}`


export function makeDeepChain(depth: number): TraceData {
  const spans: RawSpan[] = []
  for (let i = 0; i < depth; i++) {
    spans.push(rawSpan(`d${i}`, i, depth * 2, i === 0 ? null : `d${i - 1}`))
  }
  return toTraceData(spans)
}


export function shuffle<T>(input: T[]): T[] {
  const out = input.slice()
  const random = makeRandom(42)
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i]!
    out[i] = out[j]!
    out[j] = a
  }
  return out
}

export function makeRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
