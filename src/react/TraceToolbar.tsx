import type { CSSProperties, ReactNode } from 'react'
import { formatDurationUs } from '../headless/format'
import { format, formatWarning, type Messages } from '../headless/i18n/messages'
import type { Action } from '../headless/interaction/reducer'
import type { Viewport } from '../headless/layout/viewport'
import type { TraceData } from '../headless/model/types'
import { themeVar } from '../headless/theme/tokens'
import { useResolvedMessages } from './messages-context'

export interface TraceToolbarProps {
  trace: TraceData
  viewport: Viewport
  onAction: (action: Action) => void
  /** 不传就读上层 Provider 或 navigator.language */
  locale?: string
  /** 只覆盖想改的那几条 */
  messages?: Partial<Messages>
  /** 右侧追加内容 */
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: '2px 10px',
  border: `1px solid ${themeVar('border')}`,
  borderRadius: 6,
  background: 'transparent',
  color: themeVar('text'),
  cursor: 'pointer',
}

export function TraceToolbar({
  trace,
  viewport,
  onAction,
  locale,
  messages: messagesOverrides,
  children,
  className,
  style,
}: TraceToolbarProps) {
  const messages = useResolvedMessages(locale, messagesOverrides)

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
        padding: '6px 12px',
        borderBottom: `1px solid ${themeVar('border')}`,
        color: themeVar('text'),
        fontSize: 13,
        ...style,
      }}
    >
      <button
        type="button"
        style={buttonStyle}
        onClick={() => onAction({ type: 'zoomBy', factor: 1.5 })}
      >
        {messages.zoomIn}
      </button>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => onAction({ type: 'zoomBy', factor: 1 / 1.5 })}
      >
        {messages.zoomOut}
      </button>
      <button type="button" style={buttonStyle} onClick={() => onAction({ type: 'fit' })}>
        {messages.fit}
      </button>
      <button type="button" style={buttonStyle} onClick={() => onAction({ type: 'collapseAll' })}>
        {messages.collapseAll}
      </button>
      <button type="button" style={buttonStyle} onClick={() => onAction({ type: 'expandAll' })}>
        {messages.expandAll}
      </button>

      <code
        data-testid="otlp-toolbar-viewport"
        style={{
          marginLeft: 6,
          color: themeVar('textMuted'),
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
        }}
      >
        {`[${formatDurationUs(viewport.startUs, locale)}, ${formatDurationUs(
          viewport.startUs + viewport.spanUs,
          locale,
        )}] · ${format(messages.spansCount, { count: trace.spans.length })}`}
      </code>

      {trace.warnings.length > 0 && (
        <span
          style={{ color: '#b45309', fontSize: 12 }}
          title={trace.warnings.map((warning) => formatWarning(warning, messages)).join('\n')}
        >
          {`⚠ ${format(messages.warningsCount, { count: trace.warnings.length })}`}
        </span>
      )}

      {children}
    </div>
  )
}
