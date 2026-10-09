import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeOtlpTrace } from '../src/adapters/otlp'
import { normalizeTempoTrace } from '../src/adapters/tempo'

const kv = (key: string, value: object) => ({ key, value })

const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const TRACE_HEX = '5b8efff798038103d269b633813fc60c'
const ID_HEX = 'eee19b7ec3c1b174'
const b64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64')

function span(overrides: Record<string, unknown> = {}) {
  return {
    traceId: b64(TRACE_HEX),
    spanId: b64(ID_HEX),
    name: 'op',
    kind: 'SPAN_KIND_SERVER',
    startTimeUnixNano: '1700000000000000000',
    endTimeUnixNano: '1700000000500000000',
    ...overrides,
  }
}

const resource = (service: string) => ({
  resource: { attributes: [kv('service.name', { stringValue: service })] },
})

const snakeSpan = (spanIdHex: string, name: string) => ({
  trace_id: b64(TRACE_HEX),
  span_id: b64(spanIdHex),
  name,
  start_time_unix_nano: '1700000000000000000',
  end_time_unix_nano: '1700000000500000000',
})

describe('normalizeTempoTrace', () => {
  it('Tempo ≥2.x 的真实响应（jsonpb：base64 id + 字符串时间 + enum 名字）与同一条 trace 的 OTLP 输入结果完全一致', () => {
    const tempo = normalizeTempoTrace(load('tempo-small.json'))
    const otlp = normalizeOtlpTrace(load('otlp-small.json'))

    expect(tempo.spans.map((s) => s.spanId)).toEqual([
      'eee19b7ec3c1b174',
      'aaa19b7ec3c1b111',
      'bbb19b7ec3c1b222',
    ])
    expect(tempo.traceId).toBe(TRACE_HEX)
    expect(tempo.warnings).toEqual([])
    expect(tempo).toEqual(otlp)
  })

  it('Tempo ≤1.x：batches + instrumentationLibrarySpans，scope 名走 instrumentationLibrary', () => {
    const trace = normalizeTempoTrace({
      trace: {
        batches: [
          {
            ...resource('legacy-svc'),
            instrumentationLibrarySpans: [
              { instrumentationLibrary: { name: 'legacy-instr' }, spans: [span()] },
            ],
          },
        ],
      },
    })

    expect(trace.spans).toHaveLength(1)
    expect(trace.spans[0]!.scopeName).toBe('legacy-instr')
    expect(trace.resources[0]!.serviceName).toBe('legacy-svc')
  })

  it('裸信封（没有 trace 壳）也照收：resourceSpans 与 batches 都认', () => {
    const modern = normalizeTempoTrace({
      resourceSpans: [{ ...resource('svc'), scopeSpans: [{ spans: [span()] }] }],
    })
    const legacy = normalizeTempoTrace({
      batches: [{ ...resource('svc'), instrumentationLibrarySpans: [{ spans: [span()] }] }],
    })

    expect(modern.spans.map((s) => s.spanId)).toEqual(['eee19b7ec3c1b174'])
    expect(legacy).toEqual(modern)
  })

  it('两代 scope 容器同时出现时两边都收（同 startUs/时长按 spanId 升序定行序）', () => {
    const trace = normalizeTempoTrace({
      trace: {
        resourceSpans: [
          {
            ...resource('mixed'),
            scopeSpans: [{ spans: [span({ name: 'modern' })] }],
            instrumentationLibrarySpans: [
              { spans: [span({ spanId: b64('aaa19b7ec3c1b111'), name: 'legacy' })] },
            ],
          },
        ],
      },
    })

    expect(trace.spans.map((s) => s.name)).toEqual(['legacy', 'modern'])
  })

  it('opts.traceId 透传：多 trace 输入里挑指定那条', () => {
    const other = b64('11111111111111111111111111111111')
    const trace = normalizeTempoTrace(
      {
        trace: {
          resourceSpans: [
            { ...resource('a'), scopeSpans: [{ spans: [span(), span()] }] },
            { ...resource('b'), scopeSpans: [{ spans: [span({ traceId: other })] }] },
          ],
        },
      },
      { traceId: '11111111111111111111111111111111' },
    )

    expect(trace.traceId).toBe('11111111111111111111111111111111')
    expect(trace.resources[0]!.serviceName).toBe('b')
  })

  it('空输入：不抛，交给 empty-trace warning（与 OTLP adapter 行为一致）', () => {
    const trace = normalizeTempoTrace({ trace: { resourceSpans: [] }, status: 'COMPLETE' })
    expect(trace.spans).toEqual([])
    expect(trace.warnings.map((w) => w.code)).toContain('empty-trace')
  })

  it('非对象输入报自己的错，不冒名成 OTLP', () => {
    expect(() => normalizeTempoTrace(null)).toThrowError(/normalizeTempoTrace/)
  })

  it('batches + 现代 scopeSpans + 无 trace 壳（推送格式）：四条 span 组成一条完整调用链', () => {
    const trace = normalizeTempoTrace(load('tempo-push.json'))

    expect(trace.traceId).toBe('b9571a1a358315ed814798710259b2e3')
    expect(trace.warnings).toEqual([])
    expect(
      trace.spans.map((s) => [s.serviceName, s.name, s.kind, s.startUs, s.durationUs]),
    ).toEqual([
      ['agent', 'agent.handle_request', 'server', 0, 300_000],
      ['mcp-gateway', 'mcp.route', 'client', 50_000, 200_000],
      ['meta-service', 'meta.process', 'client', 80_000, 140_000],
      ['device', 'device.execute', 'client', 100_000, 100_000],
    ])
    expect(trace.spans.map((s) => s.parentSpanId)).toEqual([
      null,
      '16db75faeb3d3678',
      'bfc65f9207d569bb',
      'cd1c8405b7a39419',
    ])
    expect(trace.spans.every((s) => s.scopeName === 'simulate-trace')).toBe(true)
    expect(trace.spans.every((s) => s.status.code === 'ok')).toBe(true)
    expect(trace.resources.map((r) => r.serviceName)).toEqual([
      'agent',
      'mcp-gateway',
      'meta-service',
      'device',
    ])
    expect(trace.roots).toEqual([0])
    expect(trace.spans[0]!.attributes['http.status_code']).toBe(200)
  })

  it('整条链路都是 snake_case（resource_spans / scope_spans / instrumentation_library_spans）也认', () => {
    const trace = normalizeTempoTrace({
      trace: {
        resource_spans: [
          {
            ...resource('snake-svc'),
            scope_spans: [
              { scope: { name: 'modern-scope' }, spans: [snakeSpan(ID_HEX, 'modern')] },
            ],
            instrumentation_library_spans: [
              {
                instrumentation_library: { name: 'snake-instr' },
                spans: [snakeSpan('aaa19b7ec3c1b111', 'legacy')],
              },
            ],
          },
        ],
      },
    })

    expect(
      Object.fromEntries(trace.spans.map((s) => [s.name, [s.spanId, s.scopeName, s.durationUs]])),
    ).toEqual({
      modern: ['eee19b7ec3c1b174', 'modern-scope', 500_000],
      legacy: ['aaa19b7ec3c1b111', 'snake-instr', 500_000],
    })
    expect(trace.resources[0]!.serviceName).toBe('snake-svc')
  })

  it('两条 trace 同在：取 span 最多的那条，并记 multiple-traces（Tempo 路径同样带出 warning）', () => {
    const other = b64('11111111111111111111111111111111')
    const trace = normalizeTempoTrace({
      trace: {
        batches: [
          {
            ...resource('two'),
            scopeSpans: [{ spans: [span(), span({ spanId: b64('aaa19b7ec3c1b111') })] }],
          },
          { ...resource('one'), scopeSpans: [{ spans: [span({ traceId: other })] }] },
        ],
      },
    })

    expect(trace.resources[0]!.serviceName).toBe('two')
    expect(trace.warnings.map((w) => w.code)).toContain('multiple-traces')
  })

  it('畸形批次条目只跳过，不抛（null / 数字 / spans 不是数组）', () => {
    const trace = normalizeTempoTrace({
      batches: [
        null,
        42,
        { ...resource('ok'), scopeSpans: [{ spans: 'nope' }, { spans: [span()] }] },
      ],
    })

    expect(trace.spans.map((s) => s.spanId)).toEqual(['eee19b7ec3c1b174'])
    expect(trace.warnings).toEqual([])
  })

  it('trace 壳不是对象时当「没有壳」处理，退回外层取值', () => {
    const trace = normalizeTempoTrace({
      trace: 'not-an-object',
      batches: [{ ...resource('outer'), scopeSpans: [{ spans: [span()] }] }],
    })

    expect(trace.spans).toHaveLength(1)
    expect(trace.resources[0]!.serviceName).toBe('outer')
  })

  it('opts.traceId 在输入里不存在时报错，且消息前缀换成自己的函数名', () => {
    expect(() =>
      normalizeTempoTrace(
        { batches: [{ ...resource('a'), scopeSpans: [{ spans: [span()] }] }] },
        { traceId: 'deadbeefdeadbeefdeadbeefdeadbeef' },
      ),
    ).toThrowError(/^normalizeTempoTrace: 输入里没有 traceId/)
  })

  it('老命名容器里混进非对象条目 → 只跳过那一条', () => {
    const trace = normalizeTempoTrace({
      batches: [
        {
          ...resource('mixed-bad'),
          instrumentationLibrarySpans: [null, 42, { spans: [span()] }],
        },
      ],
    })

    expect(trace.spans).toHaveLength(1)
    expect(trace.resources[0]!.serviceName).toBe('mixed-bad')
  })
})
