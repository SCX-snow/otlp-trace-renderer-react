import { describe, expect, it } from 'vitest'
import { DEFAULT_METRICS } from '../src/headless/layout/metrics'
import { flattenRows } from '../src/headless/layout/flatten'
import { resolveTimeAxis } from '../src/headless/layout/axis'
import { precomputeDurations } from '../src/headless/interaction/selectors'
import { DEFAULT_THEME } from '../src/headless/theme/tokens'
import type { SpanId } from '../src/headless/model/types'
import { computeDivisions, computeTicks, drawTimeline } from '../src/render'
import { computeVisibleRows } from '../src/render/draw-timeline'
import { buildServiceColors } from '../src/render/colors'
import { rowOrigin, type TimelineScene } from '../src/render/scene'
import { createFakeCtx, FAKE_CHAR_WIDTH } from './fake-ctx'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const M = DEFAULT_METRICS
const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 100, 400, 'root'),
  rawSpan('b', 500, 600, 'root'),
])

function scene(
  over: Partial<TimelineScene> = {},
  collapsed: ReadonlySet<SpanId> = new Set(),
): TimelineScene {
  const width = over.width ?? 1000
  return {
    trace,
    rows: over.rows ?? flattenRows(trace, collapsed),
    viewport: { startUs: 0, spanUs: 1000 }, // 1µs = 1px
    metrics: M,
    theme: DEFAULT_THEME,
    width,
    axis: over.axis ?? resolveTimeAxis(width, M),
    height: 200,
    scrollTop: 0,
    selectedSpanId: null,
    hoveredSpanId: null,
    spanColorMode: 'service',
    durations: precomputeDurations(trace),
    serviceColors: buildServiceColors(trace),
    ...over,
  }
}

describe('computeTicks', () => {
  it('等分视口，x 从 0 到 width，标签是绝对时间', () => {
    const ticks = computeTicks({ startUs: 0, spanUs: 1000 }, 1000, 4)
    expect(ticks.map((t) => t.x)).toEqual([0, 250, 500, 750, 1000])
    expect(ticks.map((t) => t.timeUs)).toEqual([0, 250, 500, 750, 1000])
    expect(ticks[1]!.label).toBe('250µs')
  })

  it('缩放后标签跟着视口走', () => {
    const ticks = computeTicks({ startUs: 1_000_000, spanUs: 2_000_000 }, 1000, 2)
    expect(ticks.map((t) => t.label)).toEqual(['1s', '2s', '3s'])
  })

  it('宽度为 0 时不产 tick', () => {
    expect(computeTicks({ startUs: 0, spanUs: 100 }, 0)).toEqual([])
  })
})

describe('computeDivisions', () => {
  it('宽容器最多 5 格', () => {
    expect(computeDivisions(1440)).toBe(5)
    expect(computeDivisions(2000)).toBe(5)
  })

  it('窄容器减少格数，避免标签压字（回归：320px 容器上 5 个标签互相重叠）', () => {
    expect(computeDivisions(620)).toBe(4)
    expect(computeDivisions(300)).toBe(2)
    expect(computeDivisions(120)).toBe(1)
    expect(computeDivisions(40)).toBe(1)
  })

  it('非法宽度返回 0 格', () => {
    expect(computeDivisions(0)).toBe(0)
    expect(computeDivisions(Number.NaN)).toBe(0)
  })
})

describe('computeVisibleRows', () => {
  const rows = flattenRows(trace, new Set())

  it('顶部时从第 0 行开始', () => {
    expect(computeVisibleRows(rows, M, 0, 200)).toEqual({ start: 0, end: 3 })
  })

  it('滚动后窗口跟着移动', () => {

    const { start, end } = computeVisibleRows(rows, M, 44, 100)
    expect(start).toBe(Math.max(0, Math.floor((44 - rowOrigin(M)) / M.rowHeight)))
    expect(end).toBeLessThanOrEqual(rows.length)
    expect(end).toBeGreaterThanOrEqual(start)
  })

  it('滚过内容末尾时一行都不剩', () => {
    expect(computeVisibleRows(rows, M, 32 + 3 * M.rowHeight, 200)).toEqual({ start: 3, end: 3 })
  })

  it('高度不足一行也不会返回负数区间', () => {
    const { start, end } = computeVisibleRows(rows, M, 0, 1)
    expect(end).toBeGreaterThanOrEqual(start)
    expect(start).toBe(0)
  })

  it('空 rows 返回空区间', () => {
    expect(computeVisibleRows([], M, 0, 200)).toEqual({ start: 0, end: 0 })
  })
})


function labelSpans(ops: ReturnType<typeof createFakeCtx>['ops']) {
  return ops
    .filter((op) => op.op === 'fillText')
    .map((op) => {
      const text = op.text ?? ''
      const labelWidth = text.length * FAKE_CHAR_WIDTH
      const x = op.args[0]!
      return {
        text,
        align: op.textAlign,
        from: op.textAlign === 'right' ? x - labelWidth : x,
        to: op.textAlign === 'right' ? x : x + labelWidth,
      }
    })
}

describe('drawRuler · 刻度标签完整可见', () => {
  it('最右侧那个刻度的标签右对齐，不被画布边缘切掉', () => {
    const { ctx, ops } = createFakeCtx()
    const width = 1000
    drawTimeline(ctx, scene({ width }))
    const labels = labelSpans(ops)
    const axis = resolveTimeAxis(width, M)
    const ticks = computeTicks(
      { startUs: 0, spanUs: 1000 },
      axis.timeWidth,
      computeDivisions(axis.timeWidth),
    )

    expect(labels).toHaveLength(ticks.length)
    const last = labels.at(-1)!
    expect(last.text).toBe(ticks.at(-1)!.label)
    expect(last.align).toBe('right')
    expect(last.to).toBeLessThanOrEqual(width)
    expect(last.from).toBeGreaterThan(0)

    expect(last.to).toBe(M.paddingX + axis.timeWidth - 3)
  })

  it('第一个刻度的标签仍然左对齐、贴在线右边', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ width: 1000 }))
    const first = labelSpans(ops)[0]!
    expect(first.align).toBe('left')
    expect(first.from).toBe(M.paddingX + 3)
  })

  it('任何宽度下都没有「半个字」：标签区间必须完全落在画布内', () => {
    for (const width of [120, 320, 620, 1000, 1440, 2560]) {
      const { ctx, ops } = createFakeCtx()
      drawTimeline(ctx, scene({ width }))
      const clipped = labelSpans(ops)
        .filter((label) => label.from < 0 || label.to > width)
        .map((label) => `"${label.text}" ${label.from}..${label.to}`)
      expect(clipped).toEqual([])

      expect(labelSpans(ops).length).toBeGreaterThanOrEqual(width >= 320 ? 2 : 1)
    }
  })
})

describe('drawTimeline', () => {
  it('每个可见行画一条 bar，位置来自 barRange', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene())

    const bars = ops.filter(
      (op) => op.op === 'fillRect' && op.fillStyle === buildServiceColors(trace).get('svc'),
    )
    expect(bars).toHaveLength(3)


    expect(bars[0]!.args).toEqual([8, 35, 984, M.barHeight])

    expect(bars[1]!.args).toEqual([106, 57, 296, M.barHeight])
  })

  it('靠后的 span 不会被挤出右边界', () => {

    const deep = toTraceData([
      rawSpan('root', 0, 1000),
      rawSpan('l1', 0, 990, 'root'),
      rawSpan('l2', 0, 980, 'l1'),
      rawSpan('late', 950, 1000, 'l2'),
    ])
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, {
      ...scene(),
      trace: deep,
      rows: flattenRows(deep, new Set()),
      durations: precomputeDurations(deep),
      serviceColors: buildServiceColors(deep),
      axis: resolveTimeAxis(1000, M),
    })
    const bars = ops.filter(
      (op) => op.op === 'fillRect' && op.fillStyle === buildServiceColors(deep).get('svc'),
    )
    expect(bars).toHaveLength(4)
    for (const bar of bars) {
      const [left, , barWidth] = bar.args as number[]
      expect(left).toBeGreaterThanOrEqual(M.paddingX)
      expect(left! + barWidth!).toBeLessThanOrEqual(1000 - M.paddingX)
    }
  })

  it('视口外的行被剔除，不画', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ scrollTop: 32 + 3 * M.rowHeight }))
    expect(
      ops.filter(
        (op) => op.op === 'fillRect' && op.fillStyle === buildServiceColors(trace).get('svc'),
      ),
    ).toEqual([])
  })

  it('横向出界的长条也不画', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ viewport: { startUs: 5000, spanUs: 1000 } }))
    expect(
      ops.filter(
        (op) => op.op === 'fillRect' && op.fillStyle === buildServiceColors(trace).get('svc'),
      ),
    ).toEqual([])
  })

  it('选中时描一圈 focusRing 边框', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ selectedSpanId: 'a' }))
    const outlines = ops.filter((op) => op.op === 'strokeRect')
    expect(outlines).toHaveLength(1)
    expect(outlines[0]!.strokeStyle).toBe(DEFAULT_THEME.focusRing)
  })

  it('悬停和选中是两档底色（不能长得一样）', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ hoveredSpanId: 'b', selectedSpanId: 'a' }))
    const bands = ops.filter(
      (op) =>
        op.op === 'fillRect' &&
        op.args[3] === M.rowHeight &&
        op.args[2] === 1000 &&
        (op.fillStyle === DEFAULT_THEME.rowHover || op.fillStyle === DEFAULT_THEME.rowSelected),
    )
    expect(bands).toHaveLength(2)
    const byStyle = new Map(bands.map((band) => [band.fillStyle, band.args[1] as number]))
    expect(byStyle.get(DEFAULT_THEME.rowHover)).toBeDefined()
    expect(byStyle.get(DEFAULT_THEME.rowSelected)).toBeDefined()
    expect(DEFAULT_THEME.rowHover).not.toBe(DEFAULT_THEME.rowSelected)

    expect(byStyle.get(DEFAULT_THEME.rowSelected)).toBe(rowOrigin(M) + M.rowHeight)
    expect(byStyle.get(DEFAULT_THEME.rowHover)).toBe(rowOrigin(M) + 2 * M.rowHeight)
  })

  it('同一行既被悬停又被选中时，画选中那一档', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({ hoveredSpanId: 'a', selectedSpanId: 'a' }))
    const bands = ops.filter(
      (op) =>
        op.op === 'fillRect' &&
        op.args[3] === M.rowHeight &&
        (op.fillStyle === DEFAULT_THEME.rowHover || op.fillStyle === DEFAULT_THEME.rowSelected),
    )
    expect(bands).toHaveLength(1)
    expect(bands[0]!.fillStyle).toBe(DEFAULT_THEME.rowSelected)
  })

  it('canvas 不画折叠三角（它已经搬到左侧名称列）', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene())

    expect(
      ops.filter((op) => op.op === 'closePath' || op.op === 'moveTo' || op.op === 'lineTo'),
    ).toEqual([])
  })

  it('标尺盖在网格线和长条之后（sticky 标尺必须挡住半行长条）', () => {
    const { ctx, ops } = createFakeCtx()

    drawTimeline(ctx, scene({ scrollTop: 17 }))
    const isBand = (op: (typeof ops)[number]) =>
      op.op === 'fillRect' && op.args[3] === M.rulerHeight - 1 && op.fillStyle === DEFAULT_THEME.bg
    const rulerBand = ops.findIndex(isBand)
    const lastGrid = ops.reduce(
      (acc, op, i) => (op.op === 'fillRect' && op.fillStyle === DEFAULT_THEME.gridLine ? i : acc),
      -1,
    )
    const lastBar = ops.reduce(
      (acc, op, i) => (op.op === 'fillRect' && op.args[3] === M.barHeight ? i : acc),
      -1,
    )
    expect(lastGrid).toBeGreaterThanOrEqual(0)
    expect(lastBar).toBeGreaterThanOrEqual(0)

    expect(rulerBand).toBeGreaterThan(lastGrid)
    expect(rulerBand).toBeGreaterThan(lastBar)
  })

  it('标尺带只盖顶部 rulerHeight，不涂整块画布', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene())
    const band = ops.find(
      (op) =>
        op.op === 'fillRect' &&
        op.args[3] === M.rulerHeight - 1 &&
        op.fillStyle === DEFAULT_THEME.bg,
    )
    expect(band!.args).toEqual([0, 0, 1000, M.rulerHeight - 1])
  })

  it('清屏只覆盖 canvas 自己那块区域', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene())
    expect(ops[1]).toMatchObject({ op: 'fillRect', args: [0, 0, 1000, 200] })
  })

  it('调用前后 ctx 状态成对 save/restore', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene())
    expect(ops[0]!.op).toBe('save')
    expect(ops.at(-1)!.op).toBe('restore')
  })

  it('折叠后行数变少，画出来的长条跟着变少', () => {
    const { ctx, ops } = createFakeCtx()
    drawTimeline(ctx, scene({}, new Set(['root'])))
    expect(
      ops.filter(
        (op) => op.op === 'fillRect' && op.fillStyle === buildServiceColors(trace).get('svc'),
      ),
    ).toHaveLength(1)
  })
})
