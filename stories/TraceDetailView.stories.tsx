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

/** 真实形状的小 trace：3 service、4 层、1 个 error */
export const Realistic: Story = {
  args: { trace: realisticTrace() },
}

export const HundredSpans: Story = {
  args: { trace: syntheticTrace(100) },
}

/** 规模验收：5k span 下滚动、缩放、折叠都不该掉帧 */
export const FiveThousandSpans: Story = {
  args: { trace: syntheticTrace(5000) },
}

/** 零长度 span：minBarWidth 兜底，不能消失 */
export const SingleSpan: Story = {
  args: { trace: singleSpanTrace() },
}

export const Empty: Story = {
  args: { trace: emptyTrace() },
}

/**
 * 深色：直接用库自带的预设（theme prop 会变成根节点的内联 CSS 变量，DOM 和 canvas 一起变）。
 *
 * service 色板不走 CSS 变量（颜色是 JS 按 service 名算的），所以深色底要另外传 `SERVICE_PALETTE_DARK`；
 * 只写 `theme` 不传色板的话，长条还是亮色那套（在深底上偏暗）。
 */
export const DarkTheme: Story = {
  args: {
    trace: realisticTrace(),
    theme: DEFAULT_DARK_THEME,
    servicePalette: SERVICE_PALETTE_DARK,
  },
}

/** 受控视口：viewport 传进去就由外部管，缩放只回调不落地 */
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

/** 内置语言之一：ja */
export const Japanese: Story = {
  args: { trace: realisticTrace(), locale: 'ja', defaultSelectedSpanId: 's000004' },
}

/** 只覆盖想改的那几条，其余仍用当前语言 */
export const CustomMessages: Story = {
  args: {
    trace: realisticTrace(),
    locale: 'zh-CN',
    messages: { zoomIn: '放大一点点', copyJson: '拷走', tagsSection: '属性（{count}）' },
  },
}

/** 加一门内置之外的语言：locale 传任意字符串 + messages 传一整套 */
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

/** 窄容器：名称列自动让位，时间轴至少留 MIN_PLOT_WIDTH，不出现横向溢出 */
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

/**
 * 详情区插槽：标题栏右侧（`renderSpanDetailActions`）+ 内置分区之后（`renderSpanDetailExtra`）。
 * 插槽拿到的第三个参数是 `TraceDetailViewApi`（`focusSpan` 是「跳过去看它」，`select` 只改选中）。
 */
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

/** 扩展点：工具栏和详情面板整体替换 */
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
