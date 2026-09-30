import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { Viewport } from '../src/headless/layout/viewport'
import {
  DEFAULT_DARK_THEME,
  SERVICE_PALETTE_DARK,
  TraceDetailView,
  type TraceView,
} from '../src/index'
import { emptyTrace, realisticTrace, singleSpanTrace, syntheticTrace } from './fixtures'

const meta = {
  title: 'TraceDetailView',
  component: TraceDetailView,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TraceDetailView>

export default meta
type Story = StoryObj<typeof meta>


export const Realistic: Story = {
  args: { trace: realisticTrace() },
}

export const HundredSpans: Story = {
  args: { trace: syntheticTrace(100) },
}


export const FiveThousandSpans: Story = {
  args: { trace: syntheticTrace(5000) },
}


export const SingleSpan: Story = {
  args: { trace: singleSpanTrace() },
}

export const Empty: Story = {
  args: { trace: emptyTrace() },
}







export const DarkTheme: Story = {
  args: {
    trace: realisticTrace(),
    theme: DEFAULT_DARK_THEME,
    servicePalette: SERVICE_PALETTE_DARK,
  },
}


export const ControlledViewport: Story = {
  args: { trace: realisticTrace() },
  render: () => {
    const [viewport, setViewport] = useState<Viewport>({ startUs: 0, spanUs: 150_000 })
    return (
      <TraceDetailView
        trace={realisticTrace()}
        viewport={viewport}
        onViewportChange={(next) => setViewport(next)}
        style={{ height: '100vh' }}
      />
    )
  },
}


export const Japanese: Story = {
  args: { trace: realisticTrace(), locale: 'ja', defaultSelectedSpanId: 's000004' },
}


export const CustomMessages: Story = {
  args: {
    trace: realisticTrace(),
    locale: 'zh-CN',
    messages: { zoomIn: '放大一点点', copyJson: '拷走', tagsSection: '属性（{count}）' },
  },
}


export const CustomLocale: Story = {
  args: {
    trace: realisticTrace(),
    locale: 'ko',
    messages: {
      zoomIn: '확대',
      zoomOut: '축소',
      fit: '맞춤',
      collapseAll: '모두 접기',
      expandAll: '모두 펼치기',
      tagsSection: '태그 ({count})',
      emptyHint: '타임라인에서 스팬을 선택하세요.',
    },
  },
}


export const NarrowContainer: Story = {
  args: { trace: realisticTrace() },
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 360, border: '1px solid #e2e8f0' }}>
        <Story />
      </div>
    ),
  ],
}





export const DetailSlots: Story = {
  args: {
    trace: realisticTrace(),
    renderSpanDetailActions: (span, trace, api) => (
      <span style={{ display: 'inline-flex', gap: 6, fontSize: 12 }}>
        <button
          type="button"
          disabled={span.parentSpanId === null}
          onClick={() => span.parentSpanId !== null && api.focusSpan(span.parentSpanId)}
        >
          ↑ 父 span
        </button>
        <a
          href={`https://jaeger.example.com/trace/${trace.traceId}?span=${span.spanId}`}
          target="_blank"
          rel="noreferrer"
        >
          在 Jaeger 打开
        </a>
      </span>
    ),
    renderSpanDetailExtra: (span, trace, api) => {
      const index = trace.index.get(span.spanId)
      const children = index === undefined ? [] : (trace.children[index] ?? [])
      return (
        <div style={{ marginTop: 10, fontSize: 12 }}>
          <b>子 span（{children.length}）</b>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {children.map((childIndex) => {
              const child = trace.spans[childIndex]!
              return (
                <button
                  key={child.spanId}
                  type="button"
                  onClick={() => api.focusSpan(child.spanId)}
                >
                  {child.serviceName} · {child.name}
                </button>
              )
            })}
          </div>
        </div>
      )
    },
  },
}


export const CustomSlots: Story = {
  args: {
    trace: realisticTrace(),
    renderToolbar: (view: TraceView) => (
      <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0' }}>
        自定义工具栏 · 当前窗口 {Math.round(view.state.viewport.spanUs)}µs
      </div>
    ),
    renderSpanDetail: (span) => (
      <div style={{ padding: 12, borderTop: '1px solid #e2e8f0' }}>
        自定义详情：{span.serviceName} / {span.name}
      </div>
    ),
  },
}
