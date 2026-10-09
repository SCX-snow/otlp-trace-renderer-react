import { describe, expect, it } from 'vitest'
import { normalizeTrace } from '../src/headless/model/normalize'
import type { SpanId } from '../src/headless/model/types'
import { flattenRows } from '../src/headless/layout/flatten'
import { at, makeTraceData, rawSpan, toTraceData } from './helpers/trace-factory'

const serializable = <T>(value: T): T => structuredClone(value)

describe('TraceData · structuredClone 友好', () => {
  it('5k span 的 trace 能直接克隆', () => {
    const trace = makeTraceData(5000)
    expect(() => serializable(trace)).not.toThrow()
  })

  it('克隆体形状不变：spans / children / roots / index 都能照常用', () => {
    const trace = toTraceData([
      rawSpan('root', 0, 1000),
      { ...rawSpan('a', 100, 400, 'root'), events: [], links: [] },
      rawSpan('b', 500, 600, 'root'),
    ])
    const clone = serializable(trace)

    expect(clone.traceId).toBe(trace.traceId)
    expect(clone.spans.map((span) => span.spanId)).toEqual(trace.spans.map((span) => span.spanId))
    expect(clone.spans[0]!.startTimeUnixNano).toBe(trace.spans[0]!.startTimeUnixNano)
    expect(clone.children).toEqual(trace.children)
    expect(clone.roots).toEqual(trace.roots)

    expect(clone.index).toBeInstanceOf(Map)
    const index = clone.index.get('a' as SpanId)
    expect(index).toBe(trace.index.get('a' as SpanId))
    expect(clone.spans[index!]!.name).toBe('op-a')

    expect(flattenRows(clone, new Set()).length).toBe(flattenRows(trace, new Set()).length)
  })

  it('克隆是深拷贝：改克隆体不影响原对象', () => {
    const trace = toTraceData([rawSpan('root', 0, 1000)])
    const clone = serializable(trace)
    clone.spans[0]!.name = '改过了'
    clone.warnings.push({ code: 'empty-trace' })

    expect(trace.spans[0]!.name).toBe('op-root')
    expect(trace.warnings).toEqual([])
  })

  it('normalizeTrace 的产物同样可克隆', () => {
    const trace = normalizeTrace({
      traceId: 'ab'.repeat(16),
      spans: [rawSpan('root', 0, 100)],
      resources: [{ attributes: {}, serviceName: 'svc' }],
    })
    expect(() => serializable(trace)).not.toThrow()
  })

  it('大整数用字符串保存，克隆不会掉精度', () => {
    const trace = toTraceData([{ ...rawSpan('root', 0, 1000), startTimeUnixNano: at(0) }])
    const clone = serializable(trace)
    expect(clone.startTimeUnixNano).toBe(trace.startTimeUnixNano)
    expect(typeof clone.startTimeUnixNano).toBe('string')
  })
})
