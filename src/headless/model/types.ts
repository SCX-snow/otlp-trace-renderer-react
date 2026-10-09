export type TraceId = string
export type SpanId = string

export type AttrValue =
  string | number | boolean | null | AttrValue[] | { [key: string]: AttrValue }

export type SpanKind = 'unspecified' | 'internal' | 'server' | 'client' | 'producer' | 'consumer'

export type StatusCode = 'unset' | 'ok' | 'error'

export interface SpanEvent {
  name: string

  timeUs: number
  attributes: Readonly<Record<string, AttrValue>>
}

export interface SpanLink {
  traceId: TraceId
  spanId: SpanId
  attributes: Readonly<Record<string, AttrValue>>
}

export interface SpanData {
  spanId: SpanId

  parentSpanId: SpanId | null
  name: string
  serviceName: string
  kind: SpanKind

  startUs: number

  durationUs: number

  endUs: number

  startTimeUnixNano: string
  attributes: Readonly<Record<string, AttrValue>>
  events: readonly SpanEvent[]
  links: readonly SpanLink[]
  status: { code: StatusCode; message?: string }
  resourceIndex: number
  scopeName?: string
}

export interface ResourceData {
  attributes: Readonly<Record<string, AttrValue>>
  serviceName: string
}

export type NormalizeWarningCode = NormalizeWarning['code']

export type NormalizeWarning =
  | { code: 'parent-not-found'; spanId: SpanId; parentSpanId: SpanId }
  | {
      code: 'negative-duration'
      spanId: SpanId
      startTimeUnixNano: string
      endTimeUnixNano: string
    }
  | { code: 'cycle'; spanId: SpanId; cycleLength: number }
  | { code: 'empty-trace' }
  | { code: 'duplicate-span-id'; spanId: SpanId }
  | {
      code: 'clock-skew'
      spanId: SpanId
      startUs: number
      endUs: number
      parentStartUs: number
      parentEndUs: number
    }
  | { code: 'bad-timestamp'; spanId: SpanId; value: string }
  | {
      code: 'multiple-traces'
      traceCount: number
      chosenTraceId: TraceId
      spanCount: number
    }

export interface TraceData {
  traceId: TraceId

  startTimeUnixNano: string

  durationUs: number

  spans: SpanData[]
  resources: ResourceData[]
  roots: number[]

  children: number[][]
  index: Map<SpanId, number>
  warnings: NormalizeWarning[]
}

export interface RawSpanEvent {
  name: string
  timeUnixNano: string
  attributes: Record<string, AttrValue>
}

export interface RawSpan {
  spanId: SpanId
  parentSpanId: SpanId | null
  name: string
  kind: SpanKind
  startTimeUnixNano: string
  endTimeUnixNano: string
  attributes: Record<string, AttrValue>
  events: RawSpanEvent[]
  links: SpanLink[]
  status: { code: StatusCode; message?: string }
  resourceIndex: number
  scopeName?: string
}

export interface RawTrace {
  traceId: TraceId
  spans: RawSpan[]
  resources: ResourceData[]
}
