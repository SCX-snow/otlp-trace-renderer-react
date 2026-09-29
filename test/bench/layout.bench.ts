import { Bench } from 'tinybench'
import { describe, expect, it } from 'vitest'
import { flattenRows } from '../../src/headless/layout/flatten'
import { resolveTimeAxis } from '../../src/headless/layout/axis'
import { DEFAULT_METRICS } from '../../src/headless/layout/metrics'
import { fitViewport, zoomAt } from '../../src/headless/layout/viewport'
import { hitTest } from '../../src/headless/interaction/hit-test'
import {
  initViewState,
  traceReducer,
  type ReducerCtx,
} from '../../src/headless/interaction/reducer'
import { makeTraceData, spanIdOf } from '../helpers/trace-factory'

const trace = makeTraceData(5000)
const collapsed = new Set(Array.from({ length: 100 }, (_, i) => spanIdOf(i)))
const rows = flattenRows(trace, new Set())
const narrowRows = flattenRows(trace, collapsed)
const viewport = fitViewport(trace.durationUs)
const width = 1200
const axis = resolveTimeAxis(width, DEFAULT_METRICS)
const ctx: ReducerCtx = { trace, width }
const state = initViewState(trace)
const point = { x: 600, y: DEFAULT_METRICS.rulerHeight + DEFAULT_METRICS.paddingTop + 20 * 22 + 8 }

const bench = new Bench({ time: 500, warmupIterations: 5 })

describe('布局 / 视口 / 命中 · 5k span', () => {
  it('基线', async () => {
    bench
      .add('flattenRows 5k', () => {
        flattenRows(trace, new Set())
      })
      .add('flattenRows 5k（折叠 100 个节点）', () => {
        flattenRows(trace, collapsed)
      })
      .add('hitTest（5000 行中的第 20 行）', () => {
        hitTest(point, rows, trace, viewport, DEFAULT_METRICS, axis, 0)
      })
      .add('hitTest（折叠后）', () => {
        hitTest(point, narrowRows, trace, viewport, DEFAULT_METRICS, axis, 0)
      })
      .add('zoomAt + clamp', () => {
        zoomAt(viewport, 500, 1.1, width, trace.durationUs)
      })
      .add('reducer: pan（未触边）', () => {
        traceReducer(state, { type: 'pan', dxPx: -20 }, ctx)
      })
      .add('reducer: zoom（触上限，应短路返回）', () => {
        traceReducer(state, { type: 'zoom', anchorPx: 500, factor: 0.5 }, ctx)
      })

    await bench.run()
    console.table(bench.table())

    expect(bench.tasks).toHaveLength(7)
    expect(bench.tasks.every((task) => task.result.state === 'completed')).toBe(true)
  })
})
