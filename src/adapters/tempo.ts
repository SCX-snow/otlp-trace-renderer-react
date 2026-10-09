import type { TraceData } from '../headless/model/types'
import { asArray, pick } from './any-value'
import { normalizeOtlpTrace, type NormalizeOtlpOptions } from './otlp'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function toOtlpScopeSpans(entries: unknown[]): unknown[] {
  return entries.map((entry) => {
    if (!isObj(entry)) return entry
    const library = pick(entry, 'instrumentationLibrary', 'instrumentation_library')
    return library === undefined ? entry : { ...entry, scope: library }
  })
}

function toOtlpResourceSpans(batch: unknown): unknown {
  if (!isObj(batch)) return batch
  const legacy = asArray(
    pick(batch, 'instrumentationLibrarySpans', 'instrumentation_library_spans'),
  )
  if (legacy.length === 0) return batch
  const modern = asArray(pick(batch, 'scopeSpans', 'scope_spans'))
  return { ...batch, scopeSpans: [...modern, ...toOtlpScopeSpans(legacy)] }
}

export function normalizeTempoTrace(json: unknown, opts: NormalizeOtlpOptions = {}): TraceData {
  if (!isObj(json)) throw new TypeError('normalizeTempoTrace: 期望一个 Tempo JSON 对象')

  const trace = isObj(json['trace']) ? json['trace'] : json
  const batches = pick(trace, 'resourceSpans', 'resource_spans') ?? trace['batches']

  try {
    return normalizeOtlpTrace({ resourceSpans: asArray(batches).map(toOtlpResourceSpans) }, opts)
  } catch (error) {
    throw error instanceof Error
      ? new Error(error.message.replace(/^normalizeOtlpTrace/, 'normalizeTempoTrace'))
      : error
  }
}
