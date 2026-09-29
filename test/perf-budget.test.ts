import { describe, expect, it } from 'vitest'
import { flattenRows } from '../src/headless/layout/flatten'
import { resolveTimeAxis } from '../src/headless/layout/axis'
import { DEFAULT_METRICS } from '../src/headless/layout/metrics'
import { hitTest } from '../src/headless/interaction/hit-test'
import { clampViewport, zoomAt } from '../src/headless/layout/viewport'
import { precomputeDurations } from '../src/headless/interaction/selectors'
import { normalizeTrace } from '../src/headless/model/normalize'
import type { RawSpan } from '../src/headless/model/types'
import { buildServiceColors } from '../src/render/colors'
import { drawTimeline } from '../src/render/draw-timeline'
import type { TimelineScene } from '../src/render/scene'
import { DEFAULT_THEME } from '../src/headless/theme/tokens'
import { createNullCtx } from './fake-ctx'
import { at, makeTraceData, rawSpan } from './helpers/trace-factory'

/**
 * 性能**护栏**，不是基准。基准（`pnpm bench`，tinybench）给人看中位数；
 * 这里的作用是：谁把某个 O(1)/O(n) 写成了 O(n²)，CI 会直接红。
 *
 * 阈值一律留 10–80 倍余量 —— 共享 CI 机器的噪音可以轻松把单次测量放大几倍，
 * 但算法级退化（比如 hitTest 改成遍历所有行、flattenRows 改成递归拼数组）会轻松冲破这些线。
 * 真实预算（一帧 < 8ms）看 `test/bench/draw.bench.ts` 打出的表。
 */

/** 跑 repeats 轮，每轮 iterations 次，取每轮单次耗时的中位数（ms） */
function medianPerOp(run: () => void, iterations: number, repeats = 5): number {
  const samples: number[] = []
  for (let round = 0; round < repeats; round++) {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) run()
    samples.push((performance.now() - start) / iterations)
  }
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted 需要 ES2023，产物目标是 es2020
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]!
}

const trace = makeTraceData(5000)
const emptyCollapsed = new Set<string>()
const rows = flattenRows(trace, emptyCollapsed)
const durations = precomputeDurations(trace)
const serviceColors = buildServiceColors(trace)
const viewport = { startUs: 0, spanUs: trace.durationUs }
const axis = resolveTimeAxis(1440, DEFAULT_METRICS)

const scene: TimelineScene = {
  trace,
  rows,
  viewport,
  metrics: DEFAULT_METRICS,
  theme: DEFAULT_THEME,
  width: 1440,
  axis,
  height: 800,
  scrollTop: 0,
  selectedSpanId: null,
  hoveredSpanId: null,
  spanColorMode: 'service',
  durations,
  serviceColors,
}

/** 32 个 service、5k span 的规整输入，用来量 normalizeTrace */
const rawSpans: RawSpan[] = Array.from({ length: 5000 }, (_, i) => ({
  ...rawSpan(`s${String(i).padStart(6, '0')}`, i * 20, i * 20 + 15, null),
  startTimeUnixNano: at(i * 20),
  endTimeUnixNano: at(i * 20 + 15),
}))
const resources = Array.from({ length: 32 }, (_, i) => ({
  attributes: { 'service.name': `svc-${i}` },
  serviceName: `svc-${i}`,
}))

describe('性能护栏 · 5k span', () => {
  it('flattenRows：单次中位数 < 3ms（目标 0.5ms，实测 ~0.08ms）', () => {
    expect(medianPerOp(() => flattenRows(trace, emptyCollapsed), 100)).toBeLessThan(3)
  })

  it('hitTest：10 万次 < 150ms（O(1) 命中，实测 ~60ns/次）', () => {
    const point = { x: 300, y: DEFAULT_METRICS.rulerHeight + 20 * DEFAULT_METRICS.rowHeight }
    const start = performance.now()
    for (let i = 0; i < 100_000; i++) {
      hitTest(point, rows, trace, viewport, DEFAULT_METRICS, axis, 0)
    }
    expect(performance.now() - start).toBeLessThan(150)
  })

  it('zoomAt + clampViewport：10 万次 < 150ms（实测 ~30ns/次）', () => {
    const start = performance.now()
    for (let i = 0; i < 100_000; i++) {
      clampViewport(zoomAt(viewport, 700, 1.1, 1440, trace.durationUs), trace.durationUs)
    }
    expect(performance.now() - start).toBeLessThan(150)
  })

  it('drawTimeline 一帧几何：中位数 < 25ms（预算 8ms，实测 ~2.5ms）', () => {
    const ctx = createNullCtx()
    expect(medianPerOp(() => drawTimeline(ctx, scene), 20)).toBeLessThan(25)
  })

  it('normalizeTrace 5k：单次 < 60ms（目标 30ms，实测 ~2.3ms）', () => {
    expect(
      medianPerOp(
        () => normalizeTrace({ traceId: 'ab'.repeat(16), spans: rawSpans, resources }),
        5,
        3,
      ),
    ).toBeLessThan(60)
  })

  it('一帧只画可见行（不是 5000 行）', () => {
    const ops: number[] = []
    const ctx = createNullCtx()
    const counting = new Proxy(ctx, {
      get: (target, key) =>
        key === 'fillRect'
          ? (...args: number[]) => {
              ops.push(args[3]!)
              return undefined
            }
          : Reflect.get(target, key),
    }) as CanvasRenderingContext2D

    drawTimeline(counting, scene)
    const bars = ops.filter((height) => height === DEFAULT_METRICS.barHeight)
    expect(bars.length).toBeLessThan(60)
  })
})
