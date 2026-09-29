// @vitest-environment jsdom
import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawSpan } from '../src/headless/model/types'
import { SpanDetailPanel } from '../src/react/SpanDetailPanel'
import { type CtxOp } from './fake-ctx'
import type { TraceDetailViewApi } from '../src/react/hooks/useTraceViewState'
import { TraceDetailView } from '../src/react/TraceDetailView'
import { installDomShims } from './dom-shims'
import { at, rawSpan, toTraceData } from './helpers/trace-factory'

const LONG_VALUE = 'x'.repeat(200)

const spans: RawSpan[] = [
  {
    ...rawSpan('root', 0, 1000),
    attributes: { 'http.method': 'GET', 'db.statement': LONG_VALUE, 'http.status_code': 500 },
    status: { code: 'error', message: 'boom' },
    events: [
      { name: 'exception', timeUnixNano: at(500), attributes: { 'exception.type': 'Boom' } },
    ],
  },
  {
    ...rawSpan('a', 100, 400, 'root'),
    links: [{ traceId: 'ab'.repeat(16), spanId: 'b', attributes: {} }],
  },
  rawSpan('b', 500, 600, 'root'),
  {
    ...rawSpan('c', 700, 800, 'root'),
    links: [{ traceId: 'ab'.repeat(16), spanId: 'nope', attributes: {} }],
  },
]
const trace = toTraceData(spans)

const viewportReadout = () => screen.getByTestId('otlp-toolbar-viewport').textContent
const nameRows = () => screen.getAllByTitle(/svc · op-/)
/** 详情面板里有和名称列重名的文字，断言一律限定在面板内 */
const panel = () => within(screen.getByTestId('otlp-span-detail'))
const styleTags = () => document.querySelectorAll('#otlp-trace-tokens')

let ctx: ReturnType<typeof installDomShims>['ctx']

beforeEach(() => {
  ctx = installDomShims(900, 400, 'zh-CN').ctx
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SpanDetailPanel', () => {
  it('没选中时给提示', () => {
    render(<SpanDetailPanel trace={trace} spanId={null} />)
    expect(panel().getByText(/点时间轴上的长条/)).toBeTruthy()
  })

  it('展示 span 概要、tags、events', () => {
    render(<SpanDetailPanel trace={trace} spanId="root" />)
    const detail = panel()
    expect(detail.getByText('op-root')).toBeTruthy()
    expect(detail.getAllByText('svc').length).toBeGreaterThan(0)
    expect(detail.getByText('· internal')).toBeTruthy()
    expect(detail.getByText(/error · boom/)).toBeTruthy()
    expect(detail.getByText(/标签 \(3\)/)).toBeTruthy()
    expect(detail.getByText('http.method')).toBeTruthy()
    expect(detail.getByText('GET')).toBeTruthy()
    expect(detail.getByText(/事件 \(1\)/)).toBeTruthy()
    expect(detail.getByText('exception')).toBeTruthy()
    expect(detail.getByText(/时长分位/)).toBeTruthy()
  })

  it('长属性值默认截断，可展开可收起', () => {
    render(<SpanDetailPanel trace={trace} spanId="root" />)
    expect(panel().queryByText(LONG_VALUE)).toBeNull()
    expect(panel().getByRole('button', { name: '展开 (200)' })).toBeTruthy()

    fireEvent.click(panel().getByRole('button', { name: '展开 (200)' }))
    expect(panel().getByText(LONG_VALUE)).toBeTruthy()

    fireEvent.click(panel().getByRole('button', { name: '收起' }))
    expect(panel().queryByText(LONG_VALUE)).toBeNull()
  })

  it('Process 段默认收起', () => {
    render(<SpanDetailPanel trace={trace} spanId="root" />)
    const process = screen.getByText(/^进程 \(/).closest('details')
    expect(process?.hasAttribute('open')).toBe(false)
    expect(
      screen
        .getByText(/^标签 \(/)
        .closest('details')
        ?.hasAttribute('open'),
    ).toBe(true)
  })

  it('link 指向本 trace 内的 span 时可以跳转', () => {
    const onSelectSpan = vi.fn()
    render(<SpanDetailPanel trace={trace} spanId="a" onSelectSpan={onSelectSpan} />)
    fireEvent.click(screen.getByRole('button', { name: 'b (op-b)' }))
    expect(onSelectSpan).toHaveBeenCalledWith('b')
  })

  it('link 指向不存在的 span 时按钮禁用', () => {
    render(<SpanDetailPanel trace={trace} spanId="c" />)
    const button = screen.getByRole('button', { name: /nope （不在本 trace 内）/ })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('没有 clipboard API 时点复制不抛', () => {
    render(<SpanDetailPanel trace={trace} spanId="root" />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: '复制 JSON' }))).not.toThrow()
  })
})

describe('TraceToolbar', () => {
  it('放大 / 缩小 / fit 改变视口读数', () => {
    render(<TraceDetailView trace={trace} />)
    const before = viewportReadout()
    expect(before).toContain('4 个 span')

    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(viewportReadout()).not.toBe(before)

    fireEvent.click(screen.getByRole('button', { name: '适应窗口' }))
    expect(viewportReadout()).toBe(before)
  })

  it('全部折叠 / 展开', () => {
    render(<TraceDetailView trace={trace} />)
    expect(nameRows()).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: '全部折叠' }))
    expect(nameRows()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(nameRows()).toHaveLength(4)
  })

  it('有数据告警时给出提示，鼠标悬停能看到明细', () => {
    const dirty = toTraceData([rawSpan('orphan', 0, 10, 'ghost')])
    render(<TraceDetailView trace={dirty} />)
    expect(screen.getByText(/1 条数据告警/).getAttribute('title')).toContain(
      '父 span ghost 不在本 trace 中',
    )
  })
})

describe('受控 / 非受控', () => {
  it('非受控：交互直接改内部状态', () => {
    render(<TraceDetailView trace={trace} />)
    fireEvent.click(nameRows()[1]!)
    expect(panel().getByText('op-a')).toBeTruthy()
  })

  it('default* 生效', () => {
    render(<TraceDetailView trace={trace} defaultSelectedSpanId="b" />)
    expect(panel().getByText('op-b')).toBeTruthy()
  })

  it('viewport 受控：交互只回调，渲染值等父组件回传', () => {
    const onViewportChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        viewport={{ startUs: 0, spanUs: 500 }}
        onViewportChange={onViewportChange}
      />,
    )
    expect(viewportReadout()).toContain('500µs')

    fireEvent.click(screen.getByRole('button', { name: '放大' }))
    expect(onViewportChange).toHaveBeenCalledTimes(1)
    expect(onViewportChange.mock.calls[0]![0].spanUs).toBeLessThan(500)
    // 受控：父组件没回传，读数不动
    expect(viewportReadout()).toContain('500µs')
  })

  it('selectedSpanId 受控：选中只回调', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        selectedSpanId="root"
        onSelectedSpanIdChange={onSelectedSpanIdChange}
      />,
    )
    fireEvent.click(nameRows()[1]!)
    expect(onSelectedSpanIdChange).toHaveBeenCalledWith('a')
    expect(panel().getByText('op-root')).toBeTruthy()
  })

  it('selectedSpanId 传 null 也算受控（区分 undefined）', () => {
    const onSelectedSpanIdChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        selectedSpanId={null}
        onSelectedSpanIdChange={onSelectedSpanIdChange}
      />,
    )
    fireEvent.click(nameRows()[1]!)
    expect(onSelectedSpanIdChange).toHaveBeenCalledWith('a')
    expect(panel().getByText(/点时间轴上的长条/)).toBeTruthy()
  })

  it('混合：collapsed 受控、selected 非受控，互不干扰', () => {
    const onCollapsedSpanIdsChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        collapsedSpanIds={new Set()}
        onCollapsedSpanIdsChange={onCollapsedSpanIdsChange}
      />,
    )
    // 折叠三角在左侧名称列里（点它不选中该行）
    fireEvent.click(screen.getByTestId('otlp-toggle-root'))
    expect(onCollapsedSpanIdsChange).toHaveBeenCalledTimes(1)
    expect([...onCollapsedSpanIdsChange.mock.calls[0]![0]]).toEqual(['root'])
    expect(nameRows()).toHaveLength(4) // 受控为空集合，行数不变

    fireEvent.click(nameRows()[1]!)
    expect(panel().getByText('op-a')).toBeTruthy() // 选中是非受控的，照样生效
  })

  it('受控期间发生的交互会写进内部 state，切回非受控后仍然保留', () => {
    const { rerender } = render(
      <TraceDetailView trace={trace} selectedSpanId={null} onSelectedSpanIdChange={() => {}} />,
    )
    fireEvent.click(nameRows()[1]!)
    // 受控值是 null，面板还是空的
    expect(panel().getByText(/点时间轴上的长条/)).toBeTruthy()

    // 撤掉受控：内部 state 里记着刚才那次交互的结果
    rerender(<TraceDetailView trace={trace} />)
    expect(panel().getByText('op-a')).toBeTruthy()
  })
})

describe('主题注入', () => {
  it('挂载注入默认变量，卸载移除', () => {
    const { unmount } = render(<TraceDetailView trace={trace} />)
    expect(styleTags()).toHaveLength(1)
    expect(styleTags()[0]!.textContent).toContain('--otlp-trace-bg')
    unmount()
    expect(styleTags()).toHaveLength(0)
  })

  it('StrictMode 双挂载后仍然只有一个 style 元素', () => {
    const { unmount } = render(
      <StrictMode>
        <TraceDetailView trace={trace} />
      </StrictMode>,
    )
    expect(styleTags()).toHaveLength(1)
    unmount()
    expect(styleTags()).toHaveLength(0)
  })

  it('多个实例共用同一个 style 元素', () => {
    render(
      <>
        <TraceDetailView trace={trace} />
        <TraceDetailView trace={trace} />
      </>,
    )
    expect(styleTags()).toHaveLength(1)
  })

  it('theme prop 变成根节点的内联 CSS 变量，DOM 与 canvas 共用一份', () => {
    const { container } = render(
      <TraceDetailView trace={trace} theme={{ bg: '#111111', text: '#eeeeee' }} />,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--otlp-trace-bg')).toBe('#111111')
    expect(root.style.getPropertyValue('--otlp-trace-text')).toBe('#eeeeee')
  })
})

describe('扩展点', () => {
  it('renderToolbar / renderSpanDetail 覆盖默认内容', () => {
    render(
      <TraceDetailView
        trace={trace}
        renderToolbar={() => <div>自定义工具栏</div>}
        renderSpanDetail={(span) => <div>自定义详情 {span.name}</div>}
      />,
    )
    expect(screen.getByText('自定义工具栏')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '放大' })).toBeNull()

    fireEvent.click(nameRows()[0]!)
    expect(panel().getByText(/自定义详情 op-root/)).toBeTruthy()
  })

  it('servicePalette 一路传到 canvas（深色色板靠这条链路生效）', () => {
    const magenta = '#ff00ff'
    render(
      <TraceDetailView trace={trace} servicePalette={[magenta]} defaultSelectedSpanId={null} />,
    )

    // 画布上所有长条都应该用这个色板（只有一个 service 名，不会被去重逻辑换掉）
    const barFills = ctx.ops.filter((op: CtxOp) => op.op === 'fillRect' && op.fillStyle === magenta)
    expect(barFills.length).toBeGreaterThan(0)
  })

  it('showToolbar / showDetailPanel 可以关掉', () => {
    render(<TraceDetailView trace={trace} showToolbar={false} showDetailPanel={false} />)
    expect(screen.queryByTestId('otlp-toolbar-viewport')).toBeNull()
    expect(screen.queryByTestId('otlp-span-detail')).toBeNull()
  })
})

/** 详情区的自定义空间：插槽渲染位置 + 插槽拿得到的动作集 */
/** a 在文档里是否排在 b 前面（插槽位置断言用） */
const before = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('详情区插槽', () => {
  it('renderSpanDetailActions 渲染在标题栏里、复制按钮之前', () => {
    render(
      <TraceDetailView
        trace={trace}
        defaultSelectedSpanId="a"
        renderSpanDetailActions={(span, t, api) => (
          <div data-testid="actions">
            {span.name}/{t.traceId.length}/{typeof api.focusSpan}
          </div>
        )}
      />,
    )

    const actions = panel().getByTestId('actions')
    const copy = panel().getByRole('button', { name: '复制 JSON' })
    expect(before(actions, copy)).toBe(true)
    expect(actions.textContent).toBe(`op-a/${'ab'.repeat(16).length}/function`)
  })

  it('renderSpanDetailExtra 渲染在内置分区之后', () => {
    render(
      <TraceDetailView
        trace={trace}
        defaultSelectedSpanId="a"
        renderSpanDetailExtra={() => <div data-testid="extra">我的内容</div>}
      />,
    )

    const extra = panel().getByTestId('extra')
    const sections = screen.getByTestId('otlp-span-detail').querySelectorAll('details')
    const lastSection = sections[sections.length - 1]!
    expect(sections.length).toBeGreaterThan(0)
    expect(before(lastSection, extra)).toBe(true)
  })

  it('没选中 span 时插槽不渲染（空态只有提示语）', () => {
    render(
      <TraceDetailView
        trace={trace}
        renderSpanDetailActions={() => <div data-testid="actions" />}
        renderSpanDetailExtra={() => <div data-testid="extra" />}
      />,
    )

    expect(screen.queryByTestId('actions')).toBeNull()
    expect(screen.queryByTestId('extra')).toBeNull()
    expect(panel().getByText(/点时间轴上的长条/)).toBeTruthy()
  })

  it('renderSpanDetail 也能拿到 api', () => {
    let seen: TraceDetailViewApi | undefined
    render(
      <TraceDetailView
        trace={trace}
        defaultSelectedSpanId="a"
        renderSpanDetail={(span, _trace, api) => {
          seen = api
          return <div>自定义 {span.name}</div>
        }}
      />,
    )

    expect(panel().getByText(/自定义 op-a/)).toBeTruthy()
    expect(typeof seen?.focusSpan).toBe('function')
    expect(seen?.state.selectedSpanId).toBe('a')
  })

  it('插槽里的 api.focusSpan 是完整跳转：选中 + 展开祖先', () => {
    const onSelectedSpanIdChange = vi.fn()
    const onCollapsedSpanIdsChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        defaultSelectedSpanId="a"
        defaultCollapsedSpanIds={new Set(['root'])}
        onSelectedSpanIdChange={onSelectedSpanIdChange}
        onCollapsedSpanIdsChange={onCollapsedSpanIdsChange}
        renderSpanDetailActions={(_span, _trace, api) => (
          <button type="button" onClick={() => api.focusSpan('b')}>
            跳到 b
          </button>
        )}
      />,
    )

    fireEvent.click(panel().getByRole('button', { name: '跳到 b' }))

    expect(onSelectedSpanIdChange).toHaveBeenLastCalledWith('b')
    // focusSpan 会把祖先展开（不是只改选中），所以 root 从折叠集合里消失
    expect(onCollapsedSpanIdsChange).toHaveBeenLastCalledWith(new Set())
  })

  it('插槽里的 api 能做视图控制', () => {
    const onCollapsedSpanIdsChange = vi.fn()
    render(
      <TraceDetailView
        trace={trace}
        defaultSelectedSpanId="a"
        onCollapsedSpanIdsChange={onCollapsedSpanIdsChange}
        renderSpanDetailExtra={(_span, _trace, api) => (
          <button type="button" onClick={() => api.collapseAll()}>
            全折
          </button>
        )}
      />,
    )

    fireEvent.click(panel().getByRole('button', { name: '全折' }))
    expect(onCollapsedSpanIdsChange).toHaveBeenLastCalledWith(new Set(['root']))
  })

  it('SpanDetailPanel 单独用时插槽同样可用（不需要 view）', () => {
    render(
      <SpanDetailPanel
        trace={trace}
        spanId="a"
        renderActions={() => <button type="button">我的按钮</button>}
        renderExtra={() => <div data-testid="extra">我的内容</div>}
      />,
    )

    expect(panel().getByRole('button', { name: '我的按钮' })).toBeTruthy()
    expect(panel().getByTestId('extra')).toBeTruthy()
  })
})
