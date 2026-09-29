import { describe, expect, it } from 'vitest'
import { normalizeTrace } from '../src/headless/model/normalize'
import type { SpanId } from '../src/headless/model/types'
import { flattenRows } from '../src/headless/layout/flatten'
import { at, makeTraceData, rawSpan, toTraceData } from './helpers/trace-factory'

/**
 * `TraceData` 必须一直是 **structuredClone 友好** 的 —— 这是「将来把 headless 计算搬进 Worker」
 * （D4/D6 留的口子）的**前置条件**。真搬 Worker 是另一件事（要把 normalize 变成异步、定消息协议，
 * 目前没做也不急着做），但这条不变式必须现在就有测试守着：
 *
 * 谁往模型里塞了函数、类实例（自定义 class）、DOM 节点或者循环引用，postMessage 就会炸 —— 那时候
 * 才发现代价很大。这里用 `structuredClone` 当替身（Worker 的 postMessage 走的就是同一套算法）。
 */
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

    // index 是 Map：克隆后 still 是 Map，而且能查
    expect(clone.index).toBeInstanceOf(Map)
    const index = clone.index.get('a' as SpanId)
    expect(index).toBe(trace.index.get('a' as SpanId))
    expect(clone.spans[index!]!.name).toBe('op-a')

    // 换掉 trace 后 flattenRows 照样跑（Worker 里就是这么用的）
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
