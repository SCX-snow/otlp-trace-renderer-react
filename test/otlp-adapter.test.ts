import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeOtlpTrace } from '../src/adapters/otlp'
import { base64ToHex } from '../src/adapters/any-value'

const kv = (key: string, value: object) => ({ key, value })

const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

const small = load('otlp-small.json')
const broken = load('otlp-broken.json')

const TRACE_HEX = '5b8efff798038103d269b633813fc60c'
const ID_HEX = 'eee19b7ec3c1b174'
const toB64 = (hex: string) => Buffer.from(hex, 'hex').toString('base64')


function doc(ids: { traceId: string; spanId: string }, snake = false) {
  const spanObj: Record<string, unknown> = {
    [snake ? 'trace_id' : 'traceId']: ids.traceId,
    [snake ? 'span_id' : 'spanId']: ids.spanId,
    name: 'op',
    ...(snake
      ? { start_time_unix_nano: '1700000000000000000', end_time_unix_nano: '1700000000500000000' }
      : { startTimeUnixNano: '1700000000000000000', endTimeUnixNano: '1700000000500000000' }),
  }
  return {
    [snake ? 'resource_spans' : 'resourceSpans']: [
      {
        resource: { attributes: [kv('service.name', { stringValue: 'svc' })] },
        [snake ? 'scope_spans' : 'scopeSpans']: [{ spans: [spanObj] }],
      },
    ],
  }
}

describe('normalizeOtlpTrace', () => {
  it('解析出正确的模型', () => {
    const trace = normalizeOtlpTrace(small)
    expect(trace.traceId).toBe(TRACE_HEX)
    expect(trace.spans).toHaveLength(3)
    expect(trace.durationUs).toBe(500_000)
    expect(trace.roots).toHaveLength(1)
    expect(trace.resources.map((r) => r.serviceName)).toEqual(['frontend', 'orders'])
    expect(trace.warnings).toEqual([])

    const root = trace.spans[trace.index.get(ID_HEX)!]!
    expect(root.serviceName).toBe('frontend')
    expect(root.kind).toBe('server')
    expect(root.startUs).toBe(0)
    expect(root.durationUs).toBe(500_000)
    expect(root.status).toEqual({ code: 'error', message: 'upstream timeout' })
    expect(root.attributes['http.request.method']).toBe('GET')
    expect(root.attributes['http.response.status_code']).toBe(500)
    expect(root.scopeName).toBe('@opentelemetry/instrumentation-http')
    expect(root.events).toEqual([
      {
        name: 'exception',
        timeUs: 450_000,
        attributes: { 'exception.type': 'TimeoutError' },
      },
    ])

    const charge = trace.spans[trace.index.get('bbb19b7ec3c1b222')!]!
    expect(charge.serviceName).toBe('orders')
    expect(charge.parentSpanId).toBe(ID_HEX)
    expect(charge.kind).toBe('client')
    expect(charge.links).toEqual([
      { traceId: '00000000000000000000000000000001', spanId: '1111111111111111', attributes: {} },
    ])
    expect(trace.children[trace.index.get(ID_HEX)!]).toHaveLength(2)
  })

  it('base64 与 hex 两种 id 编码产出完全相同的模型', () => {
    const fromHex = normalizeOtlpTrace(doc({ traceId: TRACE_HEX, spanId: ID_HEX }))
    const fromB64 = normalizeOtlpTrace(doc({ traceId: toB64(TRACE_HEX), spanId: toB64(ID_HEX) }))
    expect(fromB64.traceId).toBe(TRACE_HEX)
    expect(fromB64).toEqual(fromHex)
  })

  it('snake_case 与 camelCase 等价', () => {
    expect(normalizeOtlpTrace(doc({ traceId: TRACE_HEX, spanId: ID_HEX }, true))).toEqual(
      normalizeOtlpTrace(doc({ traceId: TRACE_HEX, spanId: ID_HEX })),
    )
  })

  it('属性值覆盖 AnyValue 的各种分支', () => {
    const trace = normalizeOtlpTrace({
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: TRACE_HEX,
                  spanId: ID_HEX,
                  name: 'op',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000000000001',
                  attributes: [
                    { key: 's', value: { stringValue: 'x' } },
                    { key: 'b', value: { boolValue: false } },
                    { key: 'd', value: { doubleValue: 1.5 } },
                    { key: 'big', value: { intValue: '9007199254740993' } },
                    { key: 'bytes', value: { bytesValue: 'AQID' } },
                    {
                      key: 'arr',
                      value: {
                        arrayValue: { values: [{ intValue: '1' }, { stringValue: 'two' }] },
                      },
                    },
                    {
                      key: 'kv',
                      value: {
                        kvlistValue: { values: [{ key: 'inner', value: { boolValue: true } }] },
                      },
                    },
                    { key: 'nothing', value: {} },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const attrs = trace.spans[0]!.attributes
    expect(attrs['s']).toBe('x')
    expect(attrs['b']).toBe(false)
    expect(attrs['d']).toBe(1.5)
    expect(attrs['big']).toBe('9007199254740993')
    expect(attrs['bytes']).toBe('AQID')
    expect(attrs['arr']).toEqual([1, 'two'])
    expect(attrs['kv']).toEqual({ inner: true })
    expect(attrs['nothing']).toBeNull()
  })

  it('多条 trace → 取 span 最多的那条并记 warning，可显式指定', () => {
    const other = '0000000000000000000000000000000f'
    const multi = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: TRACE_HEX,
                  spanId: ID_HEX,
                  name: 'a',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000010000000',
                },
                {
                  traceId: other,
                  spanId: '1111111111111111',
                  name: 'b',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000010000000',
                },
                {
                  traceId: other,
                  spanId: '2222222222222222',
                  name: 'c',
                  startTimeUnixNano: '1700000000000000000',
                  endTimeUnixNano: '1700000000010000000',
                },
              ],
            },
          ],
        },
      ],
    }
    const picked = normalizeOtlpTrace(multi)
    expect(picked.traceId).toBe(other)
    expect(picked.spans).toHaveLength(2)
    expect(picked.warnings.map((w) => w.code)).toEqual(['multiple-traces'])

    const explicit = normalizeOtlpTrace(multi, { traceId: TRACE_HEX })
    expect(explicit.traceId).toBe(TRACE_HEX)
    expect(explicit.spans).toHaveLength(1)
    expect(explicit.warnings.map((w) => w.code)).toEqual(['multiple-traces'])

    expect(() => normalizeOtlpTrace(multi, { traceId: 'ff'.repeat(16) })).toThrow(/没有 traceId/)
  })

  it('畸形数据走 normalizeTrace 的同一套降级', () => {
    const trace = normalizeOtlpTrace(broken)
    expect(trace.spans).toHaveLength(6)
    expect(new Set(trace.warnings.map((w) => w.code))).toEqual(
      new Set(['parent-not-found', 'negative-duration', 'cycle', 'clock-skew']),
    )
  })

  it('非对象输入直接抛错', () => {
    expect(() => normalizeOtlpTrace(null)).toThrow(TypeError)
    expect(() => normalizeOtlpTrace('nope')).toThrow(TypeError)
  })

  it('空输入返回空 trace 而不是崩', () => {
    const trace = normalizeOtlpTrace({ resourceSpans: [] })
    expect(trace.spans).toEqual([])
    expect(trace.warnings.map((w) => w.code)).toEqual(['empty-trace'])
  })
})

describe('base64ToHex', () => {
  it('解出正确的字节序', () => {
    expect(base64ToHex('AQID')).toBe('010203')
    expect(base64ToHex(toB64(ID_HEX))).toBe(ID_HEX)
    expect(base64ToHex('')).toBe('')
  })
})
