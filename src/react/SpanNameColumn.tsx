import type { CSSProperties } from 'react'
import type { Row } from '../headless/layout/flatten'
import type { Metrics } from '../headless/layout/metrics'
import type { SpanId, TraceData } from '../headless/model/types'
import { themeVar } from '../headless/theme/tokens'
import { computeVisibleRows } from '../render/draw-timeline'
import { rowOrigin } from '../render/scene'
import { useTraceMessages } from './messages-context'

export interface SpanNameColumnProps {
  trace: TraceData
  rows: Row[]
  /** 已折叠的 span；决定三角的朝向（展开 ▾ / 折叠 ▸） */
  collapsed: ReadonlySet<SpanId>
  metrics: Metrics
  /** 容器窄时会小于 metrics.nameColumnWidth，默认用它 */
  nameWidth?: number
  scrollTop: number
  height: number
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  onSelect: (spanId: SpanId) => void
  onHover: (spanId: SpanId | null) => void
  /** 点三角（或双击行）切换该节点展开/折叠（叶子节点由 reducer 短路） */
  onToggleCollapse?: (spanId: SpanId) => void
}

/** 三角：CSS 边框拼的实心小三角，不引图标依赖；折叠时转 90° 指向右侧 */
function caretStyle(collapsed: boolean): CSSProperties {
  return {
    width: 0,
    height: 0,
    borderLeft: '4px solid transparent',
    borderRight: '4px solid transparent',
    borderTop: '5px solid currentColor',
    transform: collapsed ? 'rotate(-90deg)' : undefined,
  }
}

/**
 * 左侧名称列：DOM 虚拟行。
 *
 * 颜色一律走 `var(--otlp-trace-*)`（themeVar 带默认值兜底），这样用户在任意作用域覆盖变量时，
 * 这里和 canvas 会同时变色 —— canvas 读不到 CSS 变量，只能 getComputedStyle。
 */
export function SpanNameColumn({
  trace,
  rows,
  collapsed,
  metrics,
  nameWidth,
  scrollTop,
  height,
  selectedSpanId,
  hoveredSpanId,
  onSelect,
  onHover,
  onToggleCollapse,
}: SpanNameColumnProps) {
  const messages = useTraceMessages()
  const { start, end } = computeVisibleRows(rows, metrics, scrollTop, height)
  const origin = rowOrigin(metrics)

  return (
    <div
      data-testid="otlp-name-column"
      style={{
        position: 'relative',
        width: nameWidth ?? metrics.nameColumnWidth,
        flexShrink: 0,
        height: '100%',
        borderRight: `1px solid ${themeVar('border')}`,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          height: metrics.rulerHeight,
          background: themeVar('bg'),
          borderBottom: `1px solid ${themeVar('border')}`,
          zIndex: 1,
        }}
      />
      {rows.slice(start, end).map((row, offset) => {
        const index = start + offset
        const span = trace.spans[row.spanIndex]!
        const isSelected = span.spanId === selectedSpanId
        const isHovered = span.spanId === hoveredSpanId
        const hasChildren = trace.children[row.spanIndex]!.length > 0
        const isCollapsed = collapsed.has(span.spanId)
        const rowStyle: CSSProperties = {
          position: 'absolute',
          left: 0,
          right: 0,
          // 内容坐标，**不减 scrollTop**：这一列在滚动容器里，滚动由容器自己负责。
          // 减了就是双重偏移（滚 240px 行就上移 480px），而且屏幕位置会和 canvas 差一个 scrollTop
          // —— 表现为「滚动后左侧内容丢失 + 两侧鼠标/选中不一致」。
          // scrollTop 只用来算可见窗口（computeVisibleRows），不参与定位。
          top: origin + index * metrics.rowHeight,
          height: metrics.rowHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 8 + row.depth * metrics.indentWidth,
          paddingRight: 8,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          // 与 canvas 同一套语义：选中一档、悬停一档（见 draw-timeline 里同样的三元）
          background: isSelected
            ? themeVar('rowSelected')
            : isHovered
              ? themeVar('rowHover')
              : undefined,
          boxShadow: isSelected ? `inset 3px 0 0 ${themeVar('focusRing')}` : undefined,
          color: themeVar('text'),
        }
        return (
          <div
            key={span.spanId}
            style={rowStyle}
            onClick={() => onSelect(span.spanId)}
            onDoubleClick={() => onToggleCollapse?.(span.spanId)}
            onMouseEnter={() => onHover(span.spanId)}
            onMouseLeave={() => onHover(null)}
            title={`${span.serviceName} · ${span.name}`}
          >
            {/* 折叠三角放在文字左边（树形控件的惯例位置），不再画在 canvas 的长条旁边：
                它是「树结构」的操作，而 canvas 现在是纯时间轴；叶子留同样宽的空槽保证同级文字对齐 */}
            <span
              style={{
                width: metrics.toggleWidth,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {hasChildren && (
                <button
                  type="button"
                  data-testid={`otlp-toggle-${span.spanId}`}
                  aria-expanded={!isCollapsed}
                  aria-label={messages.toggleSubtree}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: metrics.toggleWidth,
                    height: metrics.toggleWidth,
                    padding: 0,
                    border: 'none',
                    borderRadius: 3,
                    background: 'transparent',
                    color: themeVar('textMuted'),
                    cursor: 'pointer',
                  }}
                  // 别让点击冒泡到行上（那会连带选中该行），双击同理
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleCollapse?.(span.spanId)
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <span style={caretStyle(isCollapsed)} />
                </button>
              )}
            </span>
            <span style={{ flexShrink: 0, fontSize: 11, color: themeVar('textMuted') }}>
              {span.serviceName}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{span.name}</span>
          </div>
        )
      })}
    </div>
  )
}
