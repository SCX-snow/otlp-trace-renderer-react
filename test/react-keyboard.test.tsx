
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_METRICS, MIN_PLOT_WIDTH } from '../src/headless/layout/metrics'
import { TraceDetailView } from '../src/react/TraceDetailView'
import { TraceTimeline } from '../src/react/TraceTimeline'
import { installDomShims } from './dom-shims'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 100, 400, 'root'),
  rawSpan('b', 500, 600, 'root'),
])

const panel = () => screen.getByTestId('otlp-span-detail')
const timeline = () => screen.getByRole('application')
const nameColumn = () => screen.getByTestId('otlp-name-column')
const canvas = () => document.querySelector('canvas') as HTMLCanvasElement
const announce = () => document.querySelector('[aria-live="polite"]')?.textContent ?? ''
const rulerLabels = () =>
  shims.ctx.ops.filter((op) => op.op === 'fillText').map((op) => op.text ?? '')
const nameRows = () => screen.queryAllByTitle(/svc · op-/)

const press = (key: string, modifiers: Record<string, boolean> = {}) =>
  fireEvent.keyDown(timeline(), { key, ...modifiers })

let shims: ReturnType<typeof installDomShims>

beforeEach(() => {
  shims = installDomShims(900, 400, 'zh-CN')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('可聚焦与语义', () => {
  it('时间轴容器可聚焦，带 role 与 aria-label', () => {
    render(<TraceDetailView trace={trace} />)
    const element = timeline()
    expect(element.getAttribute('tabindex')).toBe('0')
    expect(element.getAttribute('aria-label')).toBe('调用链时间轴')
  })

  it('选中变化会写进 aria-live 播报区', () => {
    render(<TraceDetailView trace={trace} />)
    expect(announce()).toBe('')

    press('ArrowDown')
    expect(announce()).toContain('已选中 op-root')
    expect(announce()).toContain('时长 1ms')
  })
})

describe('方向键移动选中', () => {
  it('↓ 从没有选中开始选第一行，再按往下走', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowDown')
    expect(panel().textContent).toContain('op-root')

    press('ArrowDown')
    expect(panel().textContent).toContain('op-a')

    press('ArrowDown')
    expect(panel().textContent).toContain('op-b')
  })

  it('到底 / 到顶不会越界', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowUp')
    expect(panel().textContent).toContain('op-b')

    press('ArrowDown')
    press('ArrowDown')
    expect(panel().textContent).toContain('op-b')
  })

  it('↑ 在没选中时选最后一行', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowUp')
    expect(panel().textContent).toContain('op-b')
  })
})

describe('折叠与展开', () => {
  it('← 折叠选中行，→ 展开', () => {
    render(<TraceDetailView trace={trace} />)
    expect(nameRows()).toHaveLength(3)

    press('ArrowDown')
    press('ArrowLeft')
    expect(nameRows()).toHaveLength(1)

    press('ArrowLeft')
    expect(nameRows()).toHaveLength(1)

    press('ArrowRight')
    expect(nameRows()).toHaveLength(3)
  })

  it('叶子节点按 ← 不报错也无变化', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowLeft')
    expect(nameRows()).toHaveLength(3)
  })

  it('没有选中时按 ← / → 什么都不做', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowLeft')
    press('ArrowRight')
    expect(nameRows()).toHaveLength(3)
  })
})

describe('缩放、平移、重置', () => {
  it('+ 放大 / - 缩小改变刻度', async () => {
    render(<TraceDetailView trace={trace} />)
    const before = rulerLabels().slice(-5).join()
    press('+')

    await waitFor(() => expect(rulerLabels().slice(-5).join()).not.toBe(before))
  })

  it('Shift + → 把窗口往后推（刻度起点变大）', () => {
    render(<TraceDetailView trace={trace} />)
    press('+')
    press('+')
    const before = screen.getByTestId('otlp-toolbar-viewport').textContent

    press('ArrowRight', { shiftKey: true })
    const after = screen.getByTestId('otlp-toolbar-viewport').textContent
    expect(after).not.toBe(before)
    expect(after!.startsWith('[0')).toBe(false)
  })

  it('F 回到适配窗口', () => {
    render(<TraceDetailView trace={trace} />)
    const fitted = screen.getByTestId('otlp-toolbar-viewport').textContent
    press('+')
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).not.toBe(fitted)
    press('f')
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).toBe(fitted)
  })

  it('0 重置：视口回到 fit 且全部展开', () => {
    render(<TraceDetailView trace={trace} />)
    press('+')
    press('ArrowDown')
    press('ArrowLeft')
    expect(nameRows()).toHaveLength(1)

    press('0')
    expect(nameRows()).toHaveLength(3)
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).toContain('1.02ms')
  })

  it('Esc 取消选中', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowDown')
    expect(panel().textContent).toContain('op-root')
    press('Escape')
    expect(panel().textContent).toContain('点时间轴上的长条')
  })

  it('Enter 把焦点移进详情面板', () => {
    render(<TraceDetailView trace={trace} />)
    press('ArrowDown')
    press('Enter')
    expect(document.activeElement).toBe(panel())
  })

  it('Cmd / Ctrl 组合键不接管', () => {
    render(<TraceDetailView trace={trace} />)
    const before = screen.getByTestId('otlp-toolbar-viewport').textContent
    press('f', { ctrlKey: true })
    press('+', { metaKey: true })
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).toBe(before)
  })

  it('没有映射的键不 preventDefault（页面还能正常滚）', () => {
    render(<TraceDetailView trace={trace} />)
    const event = new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true })
    timeline().dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('空态', () => {
  it('没有 span 时只渲染 DOM 空态，不画 canvas', () => {
    render(<TraceDetailView trace={toTraceData([])} />)
    expect(screen.getByTestId('otlp-trace-empty').textContent).toBe('这条 trace 里没有 span。')
    expect(canvas()).toBeNull()
    expect(screen.queryByTestId('otlp-name-column')).toBeNull()
  })

  it('空态不渲染工具栏与详情面板', () => {
    render(<TraceDetailView trace={toTraceData([])} />)
    expect(screen.queryByTestId('otlp-toolbar-viewport')).toBeNull()
    expect(screen.queryByTestId('otlp-span-detail')).toBeNull()
  })

  it('空态文案可本地化', () => {
    render(<TraceDetailView trace={toTraceData([])} locale="ja" />)
    expect(screen.getByTestId('otlp-trace-empty').textContent).toBe(
      'このトレースにはスパンがありません。',
    )
  })
})

describe('窄容器', () => {
  it('容器够宽时名称列保持 DEFAULT_METRICS 宽度', () => {
    render(<TraceTimeline trace={trace} />)
    expect(nameColumn().style.width).toBe(`${DEFAULT_METRICS.nameColumnWidth}px`)
    expect(canvas().width).toBe(900 - DEFAULT_METRICS.nameColumnWidth)
  })

  it('容器 300px 时名称列收窄，时间轴留够最小宽度，不横向溢出', () => {
    cleanup()
    installDomShims(300, 400, 'zh-CN')
    render(<TraceTimeline trace={trace} />)

    const nameWidth = Number.parseFloat(nameColumn().style.width)
    expect(nameWidth).toBe(300 - MIN_PLOT_WIDTH)
    expect(nameWidth + canvas().width).toBe(300)
  })

  it('极窄容器名称列归零，也不出现负宽度', () => {
    cleanup()
    installDomShims(80, 400, 'zh-CN')
    render(<TraceTimeline trace={trace} />)
    expect(Number.parseFloat(nameColumn().style.width)).toBe(0)
    expect(canvas().width).toBe(80)
  })
})
