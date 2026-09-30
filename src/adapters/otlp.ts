import { UNKNOWN_SERVICE, normalizeTrace } from '../headless/model/normalize'
import type {
  RawSpan,
  ResourceData,
  SpanKind,
  SpanLink,
  StatusCode,
  TraceData,
  TraceId,
} from '../headless/model/types'
import { asArray, base64ToHex, flattenAttributes } from './any-value'

export interface NormalizeOtlpOptions {

  traceId?: TraceId
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function pick(obj: Record<string, unknown>, camel: string, snake: string): unknown {
  return obj[camel] !== undefined ? obj[camel] : obj[snake]
}

const HEX = /^[0-9a-f]+$/i





function toHexId(value: unknown, bytes: number): string {
  if (typeof value !== 'string') return ''
  const id = value.trim()
  const want = bytes * 2
  if (id.length === want && HEX.test(id)) return id.toLowerCase()
  return base64ToHex(id).slice(0, want)
}

const KINDS: Record<number, SpanKind> = {
  1: 'internal',
  2: 'server',
  3: 'client',
  4: 'producer',
  5: 'consumer',
}

function mapKind(value: unknown): SpanKind {
  if (typeof value === 'number') return KINDS[value] ?? 'unspecified'
  if (typeof value === 'string') {
    const name = value.toLowerCase().replace(/^span_kind_/, '')
    if (
      name === 'internal' ||
      name === 'server' ||
      name === 'client' ||
      name === 'producer' ||
      name === 'consumer'
    ) {
      return name
    }
  }
  return 'unspecified'
}

function mapStatus(value: unknown): { code: StatusCode; message?: string } {
  if (!isObj(value)) return { code: 'unset' }
  const raw = value['code']
  let code: StatusCode = 'unset'
  if (raw === 1 || raw === 'STATUS_CODE_OK' || raw === 'OK') code = 'ok'
  else if (raw === 2 || raw === 'STATUS_CODE_ERROR' || raw === 'ERROR') code = 'error'
  const message =
    typeof value['message'] === 'string' && value['message'] !== '' ? value['message'] : undefined
  return message === undefined ? { code } : { code, message }
}

function toResource(value: unknown): ResourceData {
  if (!isObj(value)) return { attributes: {}, serviceName: UNKNOWN_SERVICE }
  const attributes = flattenAttributes(pick(value, 'attributes', 'attributes'))
  const name = attributes['service.name']
  return {
    attributes,
    serviceName: typeof name === 'string' && name !== '' ? name : UNKNOWN_SERVICE,
  }
}

function toStringField(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toSpan(
  raw: unknown,
  resourceIndex: number,
  scopeName: string | undefined,
): RawSpan | null {
  if (!isObj(raw)) return null
  const spanId = toHexId(raw['spanId'] ?? raw['span_id'], 8)
  if (spanId === '') return null
  const parentRaw = raw['parentSpanId'] ?? raw['parent_span_id']
  const parentSpanId =
    parentRaw === undefined || parentRaw === null || parentRaw === ''
      ? null
      : toHexId(parentRaw, 8) || null

  const events = asArray(raw['events']).flatMap((event) => {
    if (!isObj(event)) return []
    return [
      {
        name: toStringField(event['name']),
        timeUnixNano: toStringField(event['timeUnixNano'] ?? event['time_unix_nano']),
        attributes: flattenAttributes(event['attributes']),
      },
    ]
  })

  const links: SpanLink[] = asArray(raw['links']).flatMap((link) => {
    if (!isObj(link)) return []
    return [
      {
        traceId: toHexId(link['traceId'] ?? link['trace_id'], 16),
        spanId: toHexId(link['spanId'] ?? link['span_id'], 8),
        attributes: flattenAttributes(link['attributes']),
      },
    ]
  })

  return {
    spanId,
    parentSpanId,
    name: toStringField(raw['name']),
    kind: mapKind(raw['kind']),
    startTimeUnixNano: toStringField(raw['startTimeUnixNano'] ?? raw['start_time_unix_nano']),
    endTimeUnixNano: toStringField(raw['endTimeUnixNano'] ?? raw['end_time_unix_nano']),
    attributes: flattenAttributes(raw['attributes']),
    events,
    links,
    status: mapStatus(raw['status']),
    resourceIndex,
    ...(scopeName === undefined ? {} : { scopeName }),
  }
}

interface Bucket {
  spans: RawSpan[]
  resources: ResourceData[]
}







export function normalizeOtlpTrace(json: unknown, opts: NormalizeOtlpOptions = {}): TraceData {
  if (!isObj(json)) throw new TypeError('normalizeOtlpTrace: 期望一个 OTLP JSON 对象')

  const buckets = new Map<TraceId, Bucket>()

  for (const resourceSpan of asArray(pick(json, 'resourceSpans', 'resource_spans'))) {
    if (!isObj(resourceSpan)) continue
    const resource = toResource(resourceSpan['resource'])
    for (const scopeSpan of asArray(pick(resourceSpan, 'scopeSpans', 'scope_spans'))) {
      if (!isObj(scopeSpan)) continue
      const scope = scopeSpan['scope']
      const scopeName =
        isObj(scope) && typeof scope['name'] === 'string' && scope['name'] !== ''
          ? scope['name']
          : undefined
      for (const rawSpan of asArray(scopeSpan['spans'])) {
        if (!isObj(rawSpan)) continue
        const traceId = toHexId(rawSpan['traceId'] ?? rawSpan['trace_id'], 16)
        let bucket = buckets.get(traceId)
        if (bucket === undefined) {
          bucket = { spans: [], resources: [] }
          buckets.set(traceId, bucket)
        }

        let resourceIndex = bucket.resources.indexOf(resource)
        if (resourceIndex === -1) {
          resourceIndex = bucket.resources.length
          bucket.resources.push(resource)
        }
        const span = toSpan(rawSpan, resourceIndex, scopeName)
        if (span !== null) bucket.spans.push(span)
      }
    }
  }

  if (buckets.size === 0) {
    return normalizeTrace({ traceId: opts.traceId ?? '', spans: [], resources: [] })
  }

  let chosenId: TraceId
  let chosen: Bucket
  if (opts.traceId !== undefined) {
    const wanted = opts.traceId.toLowerCase()
    const found = buckets.get(wanted)
    if (found === undefined) {
      throw new Error(`normalizeOtlpTrace: 输入里没有 traceId=${opts.traceId} 的 span`)
    }
    chosenId = wanted
    chosen = found
  } else {

    const entries = [...buckets.entries()].sort(
      (a, b) => b[1].spans.length - a[1].spans.length || (a[0] < b[0] ? -1 : 1),
    )
    chosenId = entries[0]![0]
    chosen = entries[0]![1]
  }

  const trace = normalizeTrace({
    traceId: chosenId,
    spans: chosen.spans,
    resources: chosen.resources,
  })

  if (buckets.size > 1) {
    trace.warnings = [
      ...trace.warnings,
      {
        code: 'multiple-traces',
        traceCount: buckets.size,
        chosenTraceId: chosenId,
        spanCount: chosen.spans.length,
      },
    ]
  }

  return trace
}
