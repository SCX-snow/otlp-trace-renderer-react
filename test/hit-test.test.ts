import { describe, expect, it } from 'vitest'
import { barRange, hitTest, rowAtY } from '../src/headless/interaction/hit-test'
import { resolveTimeAxis } from '../src/headless/layout/axis'
import { flattenRows } from '../src/headless/layout/flatten'
import { DEFAULT_METRICS } from '../src/headless/layout/metrics'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const m = DEFAULT_METRICS
const W = 1000
const trace = toTraceData([rawSpan('root', 0, 1000), rawSpan('child', 200, 400, 'root')])
const rows = flattenRows(trace, new Set())
const viewport = { startUs: 0, spanUs: 1000 } // 1µs = 1px
// 时间映射宽度 = 1000 - 左右留白 16 = 984（树深度不再影响横坐标）
const axis = resolveTimeAxis(W, m)
const rowY = (rowIndex: number) => m.rulerHeight + m.paddingTop + rowIndex * m.rowHeight + 8

const hit = (x: number, y: number, scrollTop = 0) =>
  hitTest({ x, y }, rows, trace, viewport, m, axis, scrollTop)

describe('rowAtY', () => {
  it('行是等高的，y 一次除法定位', () => {
    expect(rowAtY(rowY(0), rows.length, m, 0)).toBe(0)
    expect(rowAtY(rowY(1), rows.length, m, 0)).toBe(1)
  })

  it('标尺区、行区上方与下方都是 -1', () => {
    expect(rowAtY(m.rulerHeight, rows.length, m, 0)).toBe(-1)
    expect(rowAtY(m.rulerHeight + m.paddingTop - 1, rows.length, m, 0)).toBe(-1)
    expect(rowAtY(-5, rows.length, m, 0)).toBe(-1)
    expect(rowAtY(rowY(1) + m.rowHeight, rows.length, m, 0)).toBe(-1)
  })
})

describe('rowAtY · 滚动后（y 是视口坐标）', () => {
  // 10 条平铺 span，滚 3 行
  const many = toTraceData(
    Array.from({ length: 10 }, (_, i) => rawSpan(`s${i}`, i * 10, i * 10 + 5)),
  )
  const manyRows = flattenRows(many, new Set())
  const SCROLL = 3 * m.rowHeight

  it('视口第一行对应内容里的第 3 行', () => {
    expect(rowAtY(rowY(0), manyRows.length, m, SCROLL)).toBe(3)
    expect(rowAtY(rowY(4), manyRows.length, m, SCROLL)).toBe(7)
  })

  it('标尺带（sticky，盖在行上面）不算命中', () => {
    expect(rowAtY(m.rulerHeight - 1, manyRows.length, m, SCROLL)).toBe(-1)
    expect(rowAtY(0, manyRows.length, m, SCROLL)).toBe(-1)
    // 标尺下面一个像素就落在被它盖住的那一行上（滚动后不再是第 0 行）
    expect(rowAtY(m.rulerHeight, manyRows.length, m, SCROLL)).toBe(2)
  })

  it('hitTest 同样按视口坐标定位（缺 scrollTop 时会整体偏 scrollTop/rowHeight 行）', () => {
    const point = { x: 8, y: rowY(0) }
    expect(hitTest(point, manyRows, many, viewport, m, axis, SCROLL)).toMatchObject({
      type: 'row',
      rowIndex: 3,
      spanIndex: 3,
    })
  })
})

describe('barRange', () => {
  it('起点 = 左留白 + 时间映射（和树深度无关）', () => {
    expect(barRange(rows[0]!, trace, viewport, m, axis)).toEqual({ x0: 8, x1: 992 })
    // 第二行虽然深度是 1，横坐标也只按时间算（1µs = 0.984px）
    const child = barRange(rows[1]!, trace, viewport, m, axis)
    expect(child.x0).toBeCloseTo(8 + 200 * 0.984)
    expect(child.x1).toBeCloseTo(8 + 400 * 0.984)
  })

  it('极短 span 至少有 minBarWidth 宽，否则点不中', () => {
    const flat = toTraceData([rawSpan('zero', 100, 100)])
    const flatRows = flattenRows(flat, new Set())
    const range = barRange(flatRows[0]!, flat, viewport, m, resolveTimeAxis(W, m))
    expect(range.x1 - range.x0).toBe(m.minBarWidth)
  })

  it('深处的 span 落在 trace 末尾时，右边缘仍在画布内', () => {
    // 回归：横坐标曾经把树深度缩进加在时间映射之外，靠后 + 深的 span 会被推到画布外（看不见）
    const deep = toTraceData([
      rawSpan('root', 0, 1000),
      rawSpan('l1', 0, 1000, 'root'),
      rawSpan('l2', 0, 1000, 'l1'),
      rawSpan('late', 990, 1000, 'l2'),
    ])
    const deepRows = flattenRows(deep, new Set())
    const deepAxis = resolveTimeAxis(W, m)
    const range = barRange(deepRows[3]!, deep, viewport, m, deepAxis)
    expect(range.x0).toBeLessThan(W)
    expect(range.x1).toBeLessThanOrEqual(W - m.paddingX)
  })
})

describe('hitTest', () => {
  it('长条区间两端都算 bar（闭区间）', () => {
    expect(hit(8, rowY(0))).toEqual({ type: 'row', rowIndex: 0, spanIndex: 0, zone: 'bar' })
    expect(hit(992, rowY(0))).toEqual({ type: 'row', rowIndex: 0, spanIndex: 0, zone: 'bar' })
  })

  it('长条左边一律算 gutter（折叠三角已搬到名称列，canvas 没有第二套命中语义）', () => {
    expect(hit(7, rowY(0))).toMatchObject({ zone: 'gutter' })
    expect(hit(-6, rowY(0))).toMatchObject({ zone: 'gutter' })
    expect(hit(150, rowY(1))).toMatchObject({ zone: 'gutter' })
  })

  it('长条右边界外 1px 就是 gutter', () => {
    expect(hit(993, rowY(0))).toMatchObject({ zone: 'gutter' })
    expect(hit(403, rowY(1))).toMatchObject({ zone: 'gutter' })
  })

  it('第二行不会命中第一行的长条', () => {
    expect(hit(8, rowY(1))).toMatchObject({ rowIndex: 1, zone: 'gutter' })
  })

  it('行区之外一律 none', () => {
    expect(hit(500, m.rulerHeight)).toEqual({ type: 'none' })
    expect(hit(500, -1)).toEqual({ type: 'none' })
    expect(hit(500, rowY(1) + m.rowHeight)).toEqual({ type: 'none' })
  })

  it('空 rows 不会崩', () => {
    expect(hitTest({ x: 1, y: 1 }, [], trace, viewport, m, axis, 0)).toEqual({ type: 'none' })
  })

  it('折叠后命中行数跟着变', () => {
    const collapsed = flattenRows(trace, new Set(['root']))
    expect(hitTest({ x: 230, y: rowY(1) }, collapsed, trace, viewport, m, axis, 0)).toEqual({
      type: 'none',
    })
  })
})
