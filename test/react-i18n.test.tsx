import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES } from '../src/headless/i18n/messages'
import { SpanDetailPanel } from '../src/react/SpanDetailPanel'
import { TraceDetailView } from '../src/react/TraceDetailView'
import { useTraceMessages } from '../src/react/messages-context'
import { installDomShims } from './dom-shims'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const trace = toTraceData([rawSpan('root', 0, 1000), rawSpan('a', 100, 400, 'root')])

let shims: ReturnType<typeof installDomShims>
function Slot() {
  const messages = useTraceMessages()
  return <div data-testid="slot">{`${messages.zoomIn}/${messages.copyJson}`}</div>
}

const rulerLabels = () =>
  shims.ctx.ops.filter((op) => op.op === 'fillText').map((op) => op.text ?? '')

beforeEach(() => {
  shims = installDomShims(900, 400, 'zh-CN')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('默认语言', () => {
  it('不传 locale 时读 navigator.language', () => {
    render(<TraceDetailView trace={trace} />)
    expect(screen.getByRole('button', { name: '放大' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '适应窗口' })).toBeTruthy()
  })
})

describe('locale prop', () => {
  it.each([
    ['en', 'Zoom in', 'Fit'],
    ['ja', '拡大', '全体表示'],
    ['zh-TW', '放大', '符合視窗'],
    ['zh-CN', '放大', '适应窗口'],
  ])('%s → %s', (locale, zoomIn, fit) => {
    render(<TraceDetailView trace={trace} locale={locale} />)
    expect(screen.getByRole('button', { name: zoomIn })).toBeTruthy()
    expect(screen.getByRole('button', { name: fit })).toBeTruthy()
  })

  it('详情面板也跟着切', () => {
    render(<TraceDetailView trace={trace} locale="ja" defaultSelectedSpanId="root" />)
    expect(screen.getByText(/^タグ \(/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'JSON をコピー' })).toBeTruthy()
  })

  it('locale 也影响 canvas 刻度里的数字格式', () => {
    const longTrace = toTraceData([rawSpan('root', 0, 100_000)])
    render(<TraceDetailView trace={longTrace} locale="de-DE" />)
    expect(rulerLabels().some((label) => label.includes(','))).toBe(true)

    cleanup()
    shims = installDomShims(900, 400, 'en-US')
    render(<TraceDetailView trace={longTrace} locale="en-US" />)
    expect(rulerLabels().some((label) => label.includes('.'))).toBe(true)
  })
})

describe('messages 覆盖', () => {
  it('只改给到的那几条，其余仍用当前语言', () => {
    render(
      <TraceDetailView
        trace={trace}
        locale="zh-CN"
        messages={{ zoomIn: '放大一点点', copied: '妥了' }}
      />,
    )
    expect(screen.getByRole('button', { name: '放大一点点' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '缩小' })).toBeTruthy()
  })

  it('不认识的语言 + 一整套字典 = 加了一门新语言，漏掉的 key 回退英文', () => {
    render(
      <TraceDetailView trace={trace} locale="ko" messages={{ zoomIn: '확대', zoomOut: '축소' }} />,
    )
    expect(screen.getByRole('button', { name: '확대' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '축소' })).toBeTruthy()

    expect(screen.getByRole('button', { name: MESSAGES.en.fit })).toBeTruthy()
  })

  it('整个界面都可以只靠 messages 换掉（不依赖内置语言）', () => {
    const custom = Object.fromEntries(
      Object.keys(MESSAGES.en).map((key) => [key, `x-${key}`]),
    ) as unknown as typeof MESSAGES.en
    render(<TraceDetailView trace={trace} locale="xx" messages={custom} />)
    expect(screen.getByRole('button', { name: 'x-zoomIn' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'x-collapseAll' })).toBeTruthy()
  })
})

describe('单独使用子组件', () => {
  it('SpanDetailPanel 不套 Provider 也能按 locale 显示', () => {
    render(<SpanDetailPanel trace={trace} spanId="root" locale="en" />)
    expect(screen.getByText(/^Tags \(/)).toBeTruthy()
    expect(screen.getByText(/root span/)).toBeTruthy()
  })

  it('SpanDetailPanel 的 messages 覆盖生效', () => {
    render(
      <SpanDetailPanel
        trace={trace}
        spanId="root"
        locale="en"
        messages={{ tagsSection: 'ATTRS ({count})' }}
      />,
    )
    expect(screen.getByText('ATTRS (0)')).toBeTruthy()
  })
})

describe('自定义插槽能拿到当前语言的文案', () => {
  it('renderToolbar 里的组件跟着 locale 走', () => {
    render(<TraceDetailView trace={trace} locale="ja" renderToolbar={() => <Slot />} />)
    expect(screen.getByTestId('slot').textContent).toBe('拡大/JSON をコピー')
  })

  it('renderSpanDetail 里的组件也跟着走，并且能读到 messages 覆盖', () => {
    render(
      <TraceDetailView
        trace={trace}
        locale="en"
        messages={{ zoomIn: 'ZOOM' }}
        defaultSelectedSpanId="root"
        renderSpanDetail={() => <Slot />}
      />,
    )
    expect(screen.getByTestId('slot').textContent).toBe('ZOOM/Copy JSON')
  })
})

describe('占位符与交互', () => {
  it('工具栏读数按语言拼', () => {
    render(<TraceDetailView trace={trace} locale="en" />)
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).toContain('2 spans')

    cleanup()
    render(<TraceDetailView trace={trace} locale="ja" />)
    expect(screen.getByTestId('otlp-toolbar-viewport').textContent).toContain('2 スパン')
  })

  it('切语言后按钮文案立即变，交互仍然可用', () => {
    const { rerender } = render(<TraceDetailView trace={trace} locale="en" />)
    expect(screen.getByRole('button', { name: 'Collapse all' })).toBeTruthy()

    rerender(<TraceDetailView trace={trace} locale="ja" />)
    fireEvent.click(screen.getByRole('button', { name: 'すべて折りたたむ' }))
    expect(screen.getAllByTitle(/svc · op-/)).toHaveLength(1)
  })
})
