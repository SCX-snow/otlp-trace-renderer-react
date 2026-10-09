import { Bench } from 'tinybench'
import { describe, expect, it } from 'vitest'
import { flattenRows } from '../../src/headless/layout/flatten'
import { resolveTimeAxis } from '../../src/headless/layout/axis'
import { DEFAULT_METRICS } from '../../src/headless/layout/metrics'
import { precomputeDurations } from '../../src/headless/interaction/selectors'
import { buildServiceColors } from '../../src/render/colors'
import { drawTimeline } from '../../src/render/draw-timeline'
import type { TimelineScene } from '../../src/render/scene'
import { DEFAULT_THEME } from '../../src/headless/theme/tokens'
import { createFakeCtx, createNullCtx } from '../fake-ctx'
import { makeTraceData } from '../helpers/trace-factory'

const trace = makeTraceData(5000)
const rows = flattenRows(trace, new Set())
const durations = precomputeDurations(trace)
const serviceColors = buildServiceColors(trace)
const axis = resolveTimeAxis(1440, DEFAULT_METRICS)

const VIEWPORT_HEIGHT = 800

function makeScene(scrollTop: number): TimelineScene {
  return {
    trace,
    rows,
    viewport: { startUs: 0, spanUs: trace.durationUs },
    metrics: DEFAULT_METRICS,
    theme: DEFAULT_THEME,
    width: 1440,
    axis,
    height: VIEWPORT_HEIGHT,
    scrollTop,
    selectedSpanId: null,
    hoveredSpanId: null,
    spanColorMode: 'service',
    durations,
    serviceColors,
  }
}

describe('drawTimeline · 5k span', () => {
  it('一帧的几何计算量（不含真实光栅化）', async () => {
    const ctx = createNullCtx()
    const bench = new Bench({ time: 500, warmupIterations: 5 })
    bench
      .add('首屏（scrollTop=0）', () => {
        drawTimeline(ctx, makeScene(0))
      })
      .add('滚到中间（scrollTop=44000）', () => {
        drawTimeline(ctx, makeScene(44_000))
      })

    await bench.run()
    console.table(bench.table())
    expect(bench.tasks.every((task) => task.result.state === 'completed')).toBe(true)
  })

  it('一帧只画可见的那几十行，不是 5000 行', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, makeScene(0))

    const bars = ops.filter(
      (op) => op.op === 'fillRect' && op.args[3] === DEFAULT_METRICS.barHeight,
    )
    expect(bars.length).toBeLessThan(60)
    expect(bars.length).toBeGreaterThan(30)
  })
})
