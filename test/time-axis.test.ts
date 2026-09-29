import { describe, expect, it } from 'vitest'
import { resolveTimeAxis } from '../src/headless/layout/axis'
import { flattenRows } from '../src/headless/layout/flatten'
import { DEFAULT_METRICS, type Metrics } from '../src/headless/layout/metrics'
import { barRange } from '../src/headless/interaction/hit-test'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const m = DEFAULT_METRICS
const viewport = { startUs: 0, spanUs: 1000 }

describe('resolveTimeAxis', () => {
  it('时间映射宽度 = 画布宽 − 左右留白', () => {
    const axis = resolveTimeAxis(1000, m)
    expect(axis.timeWidth).toBe(1000 - m.paddingX * 2)
  })

  it('尊重自定义留白', () => {
    const none: Metrics = { ...m, paddingX: 0 }
    expect(resolveTimeAxis(1000, none).timeWidth).toBe(1000)
    const wide: Metrics = { ...m, paddingX: 40 }
    expect(resolveTimeAxis(1000, wide).timeWidth).toBe(920)
  })

  it('宽度为 0 / NaN / 负数时不产出 NaN，且永远 > 0（要当除数）', () => {
    for (const axis of [
      resolveTimeAxis(0, m),
      resolveTimeAxis(Number.NaN, m),
      resolveTimeAxis(-100, m),
      resolveTimeAxis(4, m), // 比左右留白还窄
    ]) {
      expect(Number.isFinite(axis.timeWidth)).toBe(true)
      expect(axis.timeWidth).toBeGreaterThan(0)
    }
  })
})

describe('bar 的横坐标只由时间决定（回归：不能按树深度右移）', () => {
  it('同一段时间、不同深度的两行，画在同一个 x 上', () => {
    // 缩进是「逐行」的偏移，而网格线是一条贯穿所有行的直线：只要每行偏移不同，
    // 刻度就必然只能对上一种深度的行，其余行读出来的时间全是错的
    const trace = toTraceData([
      rawSpan('root', 0, 1000),
      rawSpan('l1', 0, 1000, 'root'),
      rawSpan('deep', 200, 400, 'l1'),
      rawSpan('shallow', 200, 400, 'root'),
    ])
    const rows = flattenRows(trace, new Set())
    const axis = resolveTimeAxis(1000, m)
    const deepRow = rows.find((row) => trace.spans[row.spanIndex]!.spanId === 'deep')!
    const shallowRow = rows.find((row) => trace.spans[row.spanIndex]!.spanId === 'shallow')!
    expect(deepRow.depth).toBeGreaterThan(shallowRow.depth)
    expect(barRange(deepRow, trace, viewport, m, axis)).toEqual(
      barRange(shallowRow, trace, viewport, m, axis),
    )
  })

  it('x 与时间严格成正比：0 在左留白处，视口末端在 画布宽 − 左留白 处', () => {
    const trace = toTraceData([rawSpan('root', 0, 1000)])
    const rows = flattenRows(trace, new Set())
    const axis = resolveTimeAxis(1000, m)
    const range = barRange(rows[0]!, trace, viewport, m, axis)
    expect(range.x0).toBe(m.paddingX)
    expect(range.x1).toBe(1000 - m.paddingX)
  })

  it('任意宽度 / 任意深度下，长条都在画布内', () => {
    for (const width of [320, 1000, 1440, 2560]) {
      const spans = [rawSpan('root', 0, 1000)]
      for (let i = 1; i <= 20; i++) {
        spans.push(rawSpan(`l${i}`, 0, 1000, i === 1 ? 'root' : `l${i - 1}`))
      }
      spans.push(rawSpan('late', 990, 1000, 'l20'))
      const trace = toTraceData(spans)
      const rows = flattenRows(trace, new Set())
      const axis = resolveTimeAxis(width, m)
      for (const row of rows) {
        const range = barRange(row, trace, viewport, m, axis)
        expect(range.x0).toBeGreaterThanOrEqual(m.paddingX)
        expect(range.x1).toBeLessThanOrEqual(width - m.paddingX)
      }
    }
  })
})
