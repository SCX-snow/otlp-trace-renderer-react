import { describe, expect, it } from 'vitest'
import {
  ancestorsOf,
  durationPercentile,
  flattenRows,
  precomputeDurations,
  rowOfSpan,
  spanAt,
} from '../src/headless/index'
import type { TraceData } from '../src/headless/model/types'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 100, 500, 'root'),
  rawSpan('b', 200, 400, 'a'),
  rawSpan('c', 300, 350, 'b'),
])
const rows = flattenRows(trace, new Set())
const rowOf = (spanId: string) =>
  rows.findIndex((row) => row.spanIndex === trace.index.get(spanId)!)

describe('spanAt', () => {
  it('null / undefined 直接给 null（清空选中时的常态）', () => {
    expect(spanAt(trace, null)).toBeNull()
    expect(spanAt(trace, undefined)).toBeNull()
  })

  it('找得到给 SpanData，找不到给 null，不抛', () => {
    expect(spanAt(trace, 'b')!.name).toBe('op-b')
    expect(spanAt(trace, 'nope')).toBeNull()
  })
})

describe('rowOfSpan', () => {
  it('null / 未知 id 都给 -1', () => {
    expect(rowOfSpan(rows, trace, null)).toBe(-1)
    expect(rowOfSpan(rows, trace, 'nope')).toBe(-1)
  })

  it('给出行号；行被折叠掉时也给 -1', () => {
    expect(rowOfSpan(rows, trace, 'b')).toBe(rowOf('b'))
    const collapsedRows = flattenRows(trace, new Set(['a']))
    expect(rowOfSpan(collapsedRows, trace, 'b')).toBe(-1)
  })
})

describe('ancestorsOf', () => {
  it('自顶向下给祖先，不含自己；根是空数组', () => {
    expect(ancestorsOf(trace, trace.index.get('c')!)).toEqual(['root', 'a', 'b'])
    expect(ancestorsOf(trace, trace.index.get('root')!)).toEqual([])
  })

  it('parentSpanId 成环也不会死循环（守卫：同一个 index 只走一次）', () => {
    const cyclic = {
      ...trace,
      spans: [
        { ...trace.spans[0]!, spanId: 'x', parentSpanId: 'y' },
        { ...trace.spans[0]!, spanId: 'y', parentSpanId: 'x' },
      ],
      index: new Map([
        ['x', 0],
        ['y', 1],
      ]),
    } as TraceData

    expect(ancestorsOf(cyclic, 0)).toEqual(['x', 'y'])
  })
})

describe('precomputeDurations / durationPercentile', () => {
  it('时长排一次序；百分位落在 [0, 1]，空数组给 0', () => {
    const sorted = precomputeDurations(trace)
    expect([...sorted]).toEqual([50, 200, 400, 1000])
    expect(durationPercentile(sorted, -1)).toBe(0)
    expect(durationPercentile(sorted, Number.MAX_SAFE_INTEGER)).toBe(1)
    expect(durationPercentile(new Float64Array(0), 5)).toBe(0)
  })

  it('中位数落在中间那档（二分边界）', () => {
    const sorted = precomputeDurations(trace)
    expect(durationPercentile(sorted, 200)).toBe(0.5)
    expect(durationPercentile(sorted, 199)).toBe(0.25)
  })
})
