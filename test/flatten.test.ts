import { describe, expect, it } from 'vitest'
import { flattenRows } from '../src/headless/layout/flatten'
import { makeDeepChain, rawSpan, toTraceData } from './helpers/trace-factory'

const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 10, 100, 'root'),
  rawSpan('c', 20, 30, 'a'),
  rawSpan('b', 200, 300, 'root'),
])

const ids = (collapsed: string[] = []) =>
  flattenRows(trace, new Set(collapsed)).map((row) => trace.spans[row.spanIndex]!.spanId)

const depths = (collapsed: string[] = []) =>
  flattenRows(trace, new Set(collapsed)).map((row) => row.depth)

describe('flattenRows', () => {
  it('前序 DFS：父在前，兄弟按 startUs 排', () => {
    expect(ids()).toEqual(['root', 'a', 'c', 'b'])
  })

  it('深度就是嵌套层数', () => {
    expect(depths()).toEqual([0, 1, 2, 1])
  })

  it('折叠的节点保留，但不再下钻', () => {
    expect(ids(['a'])).toEqual(['root', 'a', 'b'])
    expect(depths(['a'])).toEqual([0, 1, 1])
  })

  it('折叠根只剩一行', () => {
    expect(ids(['root'])).toEqual(['root'])
  })

  it('重复折叠同一节点是幂等的', () => {
    expect(ids(['a', 'a'])).toEqual(['root', 'a', 'b'])
  })

  it('折叠不存在的 spanId 无影响', () => {
    expect(ids(['nope'])).toEqual(['root', 'a', 'c', 'b'])
  })

  it('缩进深度封顶，避免深树把长条挤成 0 宽', () => {
    const capped = flattenRows(trace, new Set(), 1).map((row) => row.depth)
    expect(capped).toEqual([0, 1, 1, 1])
  })

  it('空 trace 返回空数组', () => {
    expect(flattenRows(toTraceData([]), new Set())).toEqual([])
  })

  it('5000 层深链不爆栈', () => {
    const deep = makeDeepChain(5000)
    const rows = flattenRows(deep, new Set())
    expect(rows).toHaveLength(5000)
    expect(rows[4999]!.depth).toBe(20)
  })

  it('不修改传入的 collapsed 集合', () => {
    const collapsed = new Set(['a'])
    flattenRows(trace, collapsed)
    expect([...collapsed]).toEqual(['a'])
  })
})
