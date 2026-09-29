export type TraceId = string
export type SpanId = string

export type AttrValue =
  string | number | boolean | null | AttrValue[] | { [key: string]: AttrValue }

export type SpanKind = 'unspecified' | 'internal' | 'server' | 'client' | 'producer' | 'consumer'

export type StatusCode = 'unset' | 'ok' | 'error'

export interface SpanEvent {
  name: string
  /** 相对 trace 起点的整数微秒 */
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
  /** 根 span 与「父不存在」都是 null，后者额外记 warning */
  parentSpanId: SpanId | null
  name: string
  serviceName: string
  kind: SpanKind
  /** 相对 trace 起点的整数微秒，>= 0 */
  startUs: number
  /** = endUs - startUs，>= 0 */
  durationUs: number
  /** = startUs + durationUs，冗余一份省得每帧加 */
  endUs: number
  /** 原始绝对值，只用于显示绝对时间，不参与任何计算 */
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

/**
 * 归一化过程中的降级记录。
 *
 * 这里**不带人话文案**：headless 层没有 locale 概念，也不该有。只给 code + 结构化参数，
 * UI 层拿 `formatWarning(warning, messages)` 拼当前语言的句子，日志里用 `describeWarning()`（英文）。
 */
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
  /** 基准 = 所有 span 的最小 startTimeUnixNano */
  startTimeUnixNano: string
  /** 整条 trace 的跨度 = max(endUs) */
  durationUs: number
  /** 索引即 SpanIndex；按 startUs 升序，同值按 durationUs 降序 */
  spans: SpanData[]
  resources: ResourceData[]
  roots: number[]
  /** children[i] = i 的子 span 索引，已按 startUs 升序 */
  children: number[][]
  index: Map<SpanId, number>
  warnings: NormalizeWarning[]
}

/** adapter 的输出，时间还是原始 nanos 字符串 */
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
