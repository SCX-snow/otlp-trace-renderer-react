// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_METRICS } from '../src/headless/layout/metrics'
import { DEFAULT_THEME } from '../src/headless/theme/tokens'
import { TraceTimeline } from '../src/react/TraceTimeline'
import { type CtxOp } from './fake-ctx'
import { installDomShims } from './dom-shims'
import { makeTraceData, rawSpan, toTraceData } from './helpers/trace-factory'

const NAME_COLUMN = DEFAULT_METRICS.nameColumnWidth
const CANVAS_WIDTH = 620
const CANVAS_HEIGHT = 400
const ROW_ORIGIN = DEFAULT_METRICS.rulerHeight + DEFAULT_METRICS.paddingTop

let ctx: ReturnType<typeof installDomShims>['ctx']

beforeEach(() => {
  ctx = installDomShims(NAME_COLUMN + CANVAS_WIDTH, CANVAS_HEIGHT).ctx
  // 时间轴只占右边一列，canvas 自己的尺寸和位置要单独覆盖
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => CANVAS_WIDTH,
  })
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({
      left: NAME_COLUMN,
      top: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      right: NAME_COLUMN + CANVAS_WIDTH,
      bottom: CANVAS_HEIGHT,
      x: NAME_COLUMN,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 100, 400, 'root'),
  rawSpan('b', 500, 600, 'root'),
])

const rulerLabels = (ops: CtxOp[]) => ops.filter((op) => op.op === 'fillText').map((op) => op.text)
const nameRows = () => screen.getAllByTitle(/svc · op-/)

/**
 * 最近一帧的刻度标签。
 * fillText 只用于标尺；最后一个刻度正好落在 x = width，会被 drawRuler 跳过（不然文字会溢出）。
 * 620px 宽 → computeDivisions 算出 4 格 → 5 个刻度 → 实画 4 条。
 */
const lastFrameLabels = () => rulerLabels(ctx.ops).slice(-4)

const tickUs = (label: string | undefined) => {
  const matched = /^([\d.]+)(µs|ms|s)$/.exec(label ?? '')
  if (!matched) return Number.NaN
  const value = Number(matched[1])
  return matched[2] === 's' ? value * 1e6 : matched[2] === 'ms' ? value * 1e3 : value
}

/** canvas 是渲染目标，不给它 role，用 tag 查更稳 */
const canvasElement = () => document.querySelector('canvas') as HTMLCanvasElement

describe('TraceTimeline · 渲染', () => {
  it('名称列渲染出所有可见行，canvas 也拿到了尺寸', () => {
    render(<TraceTimeline trace={trace} />)
    expect(nameRows()).toHaveLength(3)
    expect(canvasElement().width).toBe(CANVAS_WIDTH)
    expect(canvasElement().height).toBe(CANVAS_HEIGHT)
  })

  it('首帧同步画出标尺，不留空白帧', () => {
    render(<TraceTimeline trace={trace} />)
    expect(rulerLabels(ctx.ops).length).toBeGreaterThan(0)
  })

  it('空 trace 不崩', () => {
    render(<TraceTimeline trace={toTraceData([])} />)
    expect(screen.queryAllByTitle(/svc · op-/)).toHaveLength(0)
  })

  it('5000 行只渲染可见的那几十行', () => {
    render(<TraceTimeline trace={makeTraceData(5000)} />)
    const rendered = nameRows().length
    expect(rendered).toBeGreaterThan(10)
    expect(rendered).toBeLessThan(60)
  })
})

describe('TraceTimeline · 交互', () => {
  it('点名称列选中该 span', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(<TraceTimeline trace={trace} onSelectedSpanIdChange={onSelectedSpanIdChange} />)
    fireEvent.click(nameRows()[1]!)
    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('a')
  })

  it('点时间轴上的长条选中对应 span', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(<TraceTimeline trace={trace} onSelectedSpanIdChange={onSelectedSpanIdChange} />)
    // 第二行（span a）长条的起点：paddingX + toX(100)（横坐标只由时间决定，不含缩进）
    const viewport = { startUs: 0, spanUs: trace.durationUs * 1.02 }
    const x = DEFAULT_METRICS.paddingX + (100 / viewport.spanUs) * CANVAS_WIDTH
    const y = ROW_ORIGIN + DEFAULT_METRICS.rowHeight + DEFAULT_METRICS.rowHeight / 2
    fireEvent.pointerDown(canvasElement(), { clientX: NAME_COLUMN + x, clientY: y, pointerId: 1 })
    fireEvent.pointerUp(canvasElement(), { clientX: NAME_COLUMN + x, clientY: y, pointerId: 1 })
    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('a')
  })

  it('点名称列里的三角折叠子树，再点一次展开', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(<TraceTimeline trace={trace} onSelectedSpanIdChange={onSelectedSpanIdChange} />)

    const caret = screen.getByTestId('otlp-toggle-root')
    expect(caret.getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(caret)
    expect(nameRows()).toHaveLength(1)
    expect(screen.getByTestId('otlp-toggle-root').getAttribute('aria-expanded')).toBe('false')
    // 点三角不应该连带选中该行（stopPropagation）
    expect(onSelectedSpanIdChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('otlp-toggle-root'))
    expect(nameRows()).toHaveLength(3)
    expect(screen.getByTestId('otlp-toggle-root').getAttribute('aria-expanded')).toBe('true')
  })

  it('名称列里悬停和选中是两档底色，选中另有左侧色条', () => {
    render(<TraceTimeline trace={trace} selectedSpanId="a" />)
    const [root, a, b] = nameRows() as HTMLElement[]
    fireEvent.mouseEnter(b!) // 悬停是内部状态，只能靠事件触发

    expect(DEFAULT_THEME.rowHover).not.toBe(DEFAULT_THEME.rowSelected)
    expect(root!.style.background).toBe('')
    expect(a!.style.background).toContain(DEFAULT_THEME.rowSelected)
    expect(b!.style.background).toContain(DEFAULT_THEME.rowHover)
    // 选中额外给一条左侧色条（focusRing），悬停没有
    expect(a!.style.boxShadow).toContain(DEFAULT_THEME.focusRing)
    expect(b!.style.boxShadow).toBe('')
  })

  it('叶子节点没有三角，但留同样宽的空槽（同级文字对齐）', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(<TraceTimeline trace={trace} onSelectedSpanIdChange={onSelectedSpanIdChange} />)

    // span a / span b 都是叶子
    expect(screen.queryByTestId('otlp-toggle-a')).toBeNull()
    expect(screen.queryByTestId('otlp-toggle-b')).toBeNull()
    // 空槽宽度 = toggleWidth，所以同一深度的文字起点一致
    const slot = nameRows()[1]!.firstElementChild as HTMLElement
    expect(slot.style.width).toBe(`${DEFAULT_METRICS.toggleWidth}px`)
    expect(slot.childElementCount).toBe(0)
    // 点空槽 = 点这一行 → 选中
    fireEvent.click(slot)
    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('a')
  })

  it('双击长条折叠该节点，再双击展开', () => {
    render(<TraceTimeline trace={trace} />)
    // 第一行（root）长条内部
    const x = DEFAULT_METRICS.paddingX + 30
    const y = ROW_ORIGIN + DEFAULT_METRICS.rowHeight / 2

    fireEvent.doubleClick(canvasElement(), { clientX: NAME_COLUMN + x, clientY: y })
    expect(nameRows()).toHaveLength(1)

    fireEvent.doubleClick(canvasElement(), { clientX: NAME_COLUMN + x, clientY: y })
    expect(nameRows()).toHaveLength(3)
  })

  it('双击名称列的行同样切换展开状态', () => {
    const onCollapsedSpanIdsChange = vi.fn()
    render(<TraceTimeline trace={trace} onCollapsedSpanIdsChange={onCollapsedSpanIdsChange} />)

    fireEvent.doubleClick(nameRows()[0]!)
    expect(nameRows()).toHaveLength(1)
    expect(onCollapsedSpanIdsChange).toHaveBeenLastCalledWith(new Set(['root']))

    fireEvent.doubleClick(nameRows()[0]!)
    expect(nameRows()).toHaveLength(3)
    expect(onCollapsedSpanIdsChange).toHaveBeenLastCalledWith(new Set())
  })

  it('双击叶子节点什么都不做（不会把叶子写进 collapsed）', () => {
    const onCollapsedSpanIdsChange = vi.fn()
    render(<TraceTimeline trace={trace} onCollapsedSpanIdsChange={onCollapsedSpanIdsChange} />)

    fireEvent.doubleClick(nameRows()[1]!) // span a：没有子节点

    expect(nameRows()).toHaveLength(3)
    expect(onCollapsedSpanIdsChange).not.toHaveBeenCalled()
  })

  it('拖动平移，视口跟着走', async () => {
    render(<TraceTimeline trace={trace} />)
    const element = canvasElement()

    // 先在中间放大，否则 fit 视口已经铺满整条 trace，平移会被 clamp 掉（这是对的）
    const zoomIn = () =>
      element.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -100,
          ctrlKey: true,
          clientX: NAME_COLUMN + 300,
          cancelable: true,
          bubbles: true,
        }),
      )
    zoomIn()
    zoomIn()
    await waitFor(() => expect(ctx.ops.length).toBeGreaterThan(0))

    ctx.reset()
    fireEvent.pointerDown(element, { clientX: NAME_COLUMN + 300, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: NAME_COLUMN + 250, clientY: 100, pointerId: 1 })
    fireEvent.pointerUp(element, { clientX: NAME_COLUMN + 250, clientY: 100, pointerId: 1 })

    await waitFor(() => expect(lastFrameLabels().length).toBe(4))
    // 向左拖 → 时间窗口右移 → 第一个刻度不再是 0
    expect(tickUs(lastFrameLabels()[0])).toBeGreaterThan(0)
  })

  it('Ctrl + 滚轮缩放，并把滚动事件吃掉', async () => {
    render(<TraceTimeline trace={trace} />)
    const element = canvasElement()
    const before = tickUs(lastFrameLabels().at(-1))

    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      clientX: NAME_COLUMN + 300,
      cancelable: true,
      bubbles: true,
    })
    element.dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)

    await waitFor(() => expect(tickUs(lastFrameLabels().at(-1))).toBeLessThan(before))
  })

  it('不按修饰键的滚轮不动视口，留给页面正常滚动', () => {
    render(<TraceTimeline trace={trace} />)
    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: NAME_COLUMN + 300,
      cancelable: true,
      bubbles: true,
    })
    canvasElement().dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(false)
  })

  it('zoomOnWheel 打开后纯滚轮也缩放', () => {
    render(<TraceTimeline trace={trace} zoomOnWheel />)
    const wheel = new WheelEvent('wheel', {
      deltaY: -100,
      clientX: NAME_COLUMN + 300,
      cancelable: true,
      bubbles: true,
    })
    canvasElement().dispatchEvent(wheel)
    expect(wheel.defaultPrevented).toBe(true)
  })

  it('换 trace 会重置视口与折叠', () => {
    const { rerender } = render(<TraceTimeline trace={trace} />)
    fireEvent.click(screen.getByTestId('otlp-toggle-root'))
    expect(nameRows()).toHaveLength(1)

    rerender(<TraceTimeline trace={toTraceData([rawSpan('only', 0, 10)])} />)
    expect(nameRows()).toHaveLength(1)
    expect(screen.getAllByTitle(/op-only/)).toHaveLength(1)
  })
})

/** 名字列某一行在**内容坐标**里的 top（屏幕位置 = 它减去 scrollTop） */
const nameRowTop = (spanId: string) =>
  Number.parseFloat(screen.getByTitle(`svc · op-${spanId}`).style.top)

describe('TraceTimeline · 滚动对齐', () => {
  // 40 条平铺 span（无嵌套 → 行号 == span 序号），足够滚起来
  const many = toTraceData(
    Array.from({ length: 40 }, (_, i) => rawSpan(`s${i}`, i * 10, i * 10 + 5)),
  )
  const ROW_HEIGHT = DEFAULT_METRICS.rowHeight

  /** 选中行的整行高亮填充：canvas 用的必须是视口坐标（选中一档底色、悬停另有一档） */
  const rowHighlight = () =>
    ctx.ops
      .filter(
        (op) =>
          op.op === 'fillRect' &&
          op.fillStyle === DEFAULT_THEME.rowSelected &&
          op.args[3] === ROW_HEIGHT &&
          op.args[2] === CANVAS_WIDTH,
      )
      .at(-1)

  it('滚过之后名字列的行仍留在视口里，且与 canvas 画在同一行', async () => {
    render(<TraceTimeline trace={many} defaultSelectedSpanId="s10" />)

    const scroller = screen.getByRole('application')
    scroller.scrollTop = 240
    fireEvent.scroll(scroller)

    // 名字列在滚动内容里，所以 top 是内容坐标：第 11 行 = origin + 11 * rowHeight
    await waitFor(() => expect(nameRowTop('s11')).toBe(ROW_ORIGIN + 11 * ROW_HEIGHT))
    expect(nameRowTop('s10')).toBe(ROW_ORIGIN + 10 * ROW_HEIGHT)

    // 屏幕位置 = 内容坐标 - scrollTop，必须落在视口高度内（否则就是「左侧内容丢失」）
    const viewportY = nameRowTop('s11') - 240
    expect(viewportY).toBeGreaterThanOrEqual(ROW_ORIGIN)
    expect(viewportY).toBeLessThan(ROW_ORIGIN + CANVAS_HEIGHT)

    // canvas 画同一个选中行时用的是视口坐标：两边必须重合
    await waitFor(() => expect(rowHighlight()).toBeTruthy())
    expect(rowHighlight()?.args[1]).toBe(nameRowTop('s10') - 240)
  })

  it('滚动后点长条，选中的是鼠标底下那一行', async () => {
    const onSelectedSpanIdChange = vi.fn()
    render(<TraceTimeline trace={many} onSelectedSpanIdChange={onSelectedSpanIdChange} />)

    const scroller = screen.getByRole('application')
    scroller.scrollTop = 240
    fireEvent.scroll(scroller)
    // 等到真的按 scrollTop 重算过可见窗口（滚出去的 s0 不再渲染）
    await waitFor(() => expect(screen.queryByTitle('svc · op-s0')).toBeNull())

    // 内容第 15 行（s15）在视口里的 y = 内容坐标 − scrollTop
    const targetRow = 15
    const y = ROW_ORIGIN + targetRow * ROW_HEIGHT - 240 + 8
    // 自检：这个 y 确实落在名字列第 15 行的行带里
    expect(y).toBeGreaterThanOrEqual(nameRowTop('s15') - 240)
    expect(y).toBeLessThan(nameRowTop('s15') - 240 + ROW_HEIGHT)
    const canvas = canvasElement()
    fireEvent.pointerDown(canvas, { clientX: NAME_COLUMN + 300, clientY: y, pointerId: 1 })
    fireEvent.pointerUp(canvas, { clientX: NAME_COLUMN + 300, clientY: y, pointerId: 1 })

    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('s15')
  })

  it('滚动后悬停高亮的也是鼠标底下那一行', async () => {
    render(<TraceTimeline trace={many} />)
    const scroller = screen.getByRole('application')
    scroller.scrollTop = 240
    fireEvent.scroll(scroller)
    // 等到真的按 scrollTop 重算过可见窗口（滚出去的 s0 不再渲染）
    await waitFor(() => expect(screen.queryByTitle('svc · op-s0')).toBeNull())

    const y = ROW_ORIGIN + 15 * ROW_HEIGHT - 240 + 8
    fireEvent.pointerMove(canvasElement(), { clientX: NAME_COLUMN + 300, clientY: y, pointerId: 1 })

    // 高亮走的是名字列那一行的背景（hoveredSpanId 由 canvas 的命中测试给出）
    await waitFor(() =>
      expect(screen.getByTitle('svc · op-s15').style.background).toContain('row-hover'),
    )
    expect(screen.getByTitle('svc · op-s12').style.background).toBe('')
  })
})

describe('TraceTimeline · 悬停', () => {
  it('悬停名称列高亮，移开取消', () => {
    render(<TraceTimeline trace={trace} />)
    const row = nameRows()[1]!
    fireEvent.mouseEnter(row)
    expect(row.style.background).not.toBe('')
    fireEvent.mouseLeave(row)
    expect(row.style.background).toBe('')
  })
})
