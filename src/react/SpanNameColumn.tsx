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

  collapsed: ReadonlySet<SpanId>
  metrics: Metrics

  nameWidth?: number
  scrollTop: number
  height: number
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  onSelect: (spanId: SpanId) => void
  onHover: (spanId: SpanId | null) => void

  onToggleCollapse?: (spanId: SpanId) => void
}

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
            {}
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
