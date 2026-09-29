import { type CSSProperties, type ReactNode, forwardRef, useMemo, useState } from 'react'
import { absoluteTime, formatDurationUs } from '../headless/format'
import { format, type Messages } from '../headless/i18n/messages'
import { durationPercentile, precomputeDurations, spanAt } from '../headless/interaction/selectors'
import type { AttrValue, SpanData, SpanId, TraceData } from '../headless/model/types'
import { themeVar } from '../headless/theme/tokens'
import { buildServiceColors } from '../render/colors'
import { useResolvedMessages } from './messages-context'

export interface SpanDetailPanelProps {
  trace: TraceData
  spanId: SpanId | null
  /** 点 link 时跳转到目标 span（TraceDetailView 接的是 focusSpan） */
  onSelectSpan?: (spanId: SpanId) => void
  /** 完全替换默认内容 */
  renderSpanDetail?: (span: SpanData, trace: TraceData) => ReactNode
  /** 标题栏右侧的自定义内容，渲染在「复制 JSON」左边（跳转按钮之类的落脚点） */
  renderActions?: (span: SpanData, trace: TraceData) => ReactNode
  /** 内置分区（tags / process / events / links）之后的自定义内容 */
  renderExtra?: (span: SpanData, trace: TraceData) => ReactNode
  /** 不传就读上层 Provider 或 navigator.language */
  locale?: string
  /** 只覆盖想改的那几条 */
  messages?: Partial<Messages>
  height?: number | string
  /** 覆盖未选中时的提示语，默认取 messages.emptyHint */
  emptyHint?: string
  /** service 色点的色板（默认 `SERVICE_PALETTE`；深色底传 `SERVICE_PALETTE_DARK`） */
  servicePalette?: readonly string[]
  className?: string
  style?: CSSProperties
}

const codeStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
}

const linkButtonStyle: CSSProperties = {
  border: 'none',
  background: 'none',
  padding: '0 4px',
  color: themeVar('focusRing'),
  cursor: 'pointer',
  fontSize: 12,
}

/**
 * 详情面板。
 *
 * `ref` 指向最外层，`tabIndex={-1}` 是为了让时间轴上按 Enter 时能把焦点移进来
 * （键盘用户接着就能用 Tab 在 tags / link 之间走）。
 */
export const SpanDetailPanel = forwardRef<HTMLDivElement, SpanDetailPanelProps>(
  function SpanDetailPanel(
    {
      trace,
      spanId,
      onSelectSpan,
      renderSpanDetail,
      renderActions,
      renderExtra,
      locale,
      messages: messagesOverrides,
      height = 240,
      emptyHint,
      servicePalette,
      className,
      style,
    },
    ref,
  ) {
    const messages = useResolvedMessages(locale, messagesOverrides)
    const span = spanAt(trace, spanId)
    const durations = useMemo(() => precomputeDurations(trace), [trace])
    const serviceColors = useMemo(
      () => buildServiceColors(trace, servicePalette),
      [trace, servicePalette],
    )

    const wrapperStyle: CSSProperties = {
      // 空态不给固定高度：占着 240px 空白看着像坏了
      height: span === null ? undefined : height,
      // 配置了高度就一定是这个高度：默认的 flex-shrink: 1 会在父容器装不下时把它压扁
      // （行数一多、时间轴又占满时尤其明显）。装不下应该由父容器滚动，而不是压缩详情区
      flexShrink: 0,
      overflow: 'auto',
      padding: '10px 12px',
      borderTop: `1px solid ${themeVar('border')}`,
      background: span === null ? undefined : themeVar('bg'),
      color: span === null ? themeVar('textMuted') : themeVar('text'),
      fontSize: 13,
      ...style,
    }

    const wrap = (children: ReactNode) => (
      <div
        ref={ref}
        tabIndex={-1}
        data-testid="otlp-span-detail"
        className={className}
        style={wrapperStyle}
      >
        {children}
      </div>
    )

    if (span === null) return wrap(emptyHint ?? messages.emptyHint)
    if (renderSpanDetail) return wrap(renderSpanDetail(span, trace))

    const percentile = durationPercentile(durations, span.durationUs)
    const resource = trace.resources[span.resourceIndex]

    return wrap(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: serviceColors.get(span.serviceName),
              flexShrink: 0,
            }}
          />
          <b>{span.name}</b>
          <span style={{ color: themeVar('textMuted') }}>{span.serviceName}</span>
          <span style={{ color: themeVar('textMuted') }}>· {span.kind}</span>
          <StatusBadge code={span.status.code} message={span.status.message} />
          <span style={{ flex: 1 }} />
          {renderActions?.(span, trace)}
          <CopyButton span={span} />
        </div>

        <div style={{ color: themeVar('textMuted'), marginTop: 4, ...codeStyle }}>
          {span.spanId}
          {span.parentSpanId === null ? ` · ${messages.rootSpan}` : ` ← ${span.parentSpanId}`}
          {` · ${messages.startLabel} ${formatDurationUs(span.startUs, locale)}`}
          {` · ${messages.durationLabel} ${formatDurationUs(span.durationUs, locale)}`}
          {` · ${format(messages.durationPercentile, {
            percent: (percentile * 100).toFixed(0),
          })}`}
          {absoluteTime(trace.startTimeUnixNano, span.startUs) && (
            <> {`· ${absoluteTime(trace.startTimeUnixNano, span.startUs)!.toISOString()}`}</>
          )}
        </div>

        <Section
          title={format(messages.tagsSection, { count: Object.keys(span.attributes).length })}
        >
          <AttributeTable attributes={span.attributes} />
        </Section>

        <Section
          title={format(messages.processSection, {
            count: Object.keys(resource?.attributes ?? {}).length,
          })}
          defaultOpen={false}
        >
          <AttributeTable attributes={resource?.attributes ?? {}} />
        </Section>

        {span.events.length > 0 && (
          <Section title={format(messages.eventsSection, { count: span.events.length })}>
            {span.events.map((event) => (
              <div key={`${event.name}@${event.timeUs}`} style={{ marginTop: 4 }}>
                <code style={codeStyle}>{event.name}</code>{' '}
                <span style={{ color: themeVar('textMuted'), ...codeStyle }}>
                  @ {formatDurationUs(event.timeUs, locale)}
                </span>
                <AttributeTable attributes={event.attributes} />
              </div>
            ))}
          </Section>
        )}

        {span.links.length > 0 && (
          <Section title={format(messages.linksSection, { count: span.links.length })}>
            {span.links.map((link) => {
              const target = spanAt(trace, link.spanId)
              return (
                <div key={`${link.traceId}:${link.spanId}`} style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    disabled={target === null || onSelectSpan === undefined}
                    onClick={() => onSelectSpan?.(link.spanId)}
                    style={{
                      ...linkButtonStyle,
                      padding: 0,
                      color: target === null ? themeVar('textMuted') : themeVar('focusRing'),
                      cursor: target === null ? 'default' : 'pointer',
                    }}
                  >
                    {link.spanId}
                    {target === null ? ` ${messages.linkNotInTrace}` : ` (${target.name})`}
                  </button>
                  {link.traceId !== trace.traceId && (
                    <span style={{ color: themeVar('textMuted'), ...codeStyle }}>
                      {' '}
                      {format(messages.linkCrossTrace, { traceId: link.traceId.slice(0, 12) })}
                    </span>
                  )}
                  <AttributeTable attributes={link.attributes} />
                </div>
              )
            })}
          </Section>
        )}

        {renderExtra?.(span, trace)}
      </>,
    )
  },
)

function StatusBadge({ code, message }: { code: SpanData['status']['code']; message?: string }) {
  if (code === 'unset') return null
  const color = code === 'error' ? themeVar('errorBar') : '#16a34a'
  return (
    <span
      style={{
        padding: '0 6px',
        borderRadius: 4,
        fontSize: 11,
        lineHeight: '16px',
        color: '#fff',
        background: color,
      }}
      title={message}
    >
      {code}
      {message ? ` · ${message}` : ''}
    </span>
  )
}

function CopyButton({ span }: { span: SpanData }) {
  const messages = useResolvedMessages()
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    const text = JSON.stringify(span, null, 2)
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // 剪贴板被拒就算了：面板里的文字本来就能选中复制
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      style={{
        fontSize: 12,
        padding: '1px 8px',
        border: `1px solid ${themeVar('border')}`,
        borderRadius: 6,
        background: 'transparent',
        color: themeVar('textMuted'),
        cursor: 'pointer',
      }}
    >
      {copied ? messages.copied : messages.copyJson}
    </button>
  )
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  return (
    <details style={{ marginTop: 10 }} {...(defaultOpen ? { open: true } : {})}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{title}</summary>
      {children}
    </details>
  )
}

function AttributeTable({ attributes }: { attributes: Readonly<Record<string, AttrValue>> }) {
  const entries = Object.entries(attributes)
  if (entries.length === 0) {
    return <div style={{ color: themeVar('textMuted'), ...codeStyle }}>—</div>
  }
  return (
    <table style={{ borderCollapse: 'collapse', marginTop: 4 }}>
      <tbody>
        {entries.map(([key, value]) => (
          <tr key={key}>
            <td
              style={{
                padding: '1px 12px 1px 0',
                color: themeVar('textMuted'),
                verticalAlign: 'top',
                whiteSpace: 'nowrap',
              }}
            >
              {key}
            </td>
            <td style={{ padding: '1px 0', wordBreak: 'break-all' }}>
              <AttributeValue value={value} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const LONG_VALUE = 120

function AttributeValue({ value }: { value: AttrValue }) {
  const messages = useResolvedMessages()
  const [expanded, setExpanded] = useState(false)
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const isLong = text.length > LONG_VALUE

  return (
    <span>
      <code style={codeStyle}>{isLong && !expanded ? `${text.slice(0, LONG_VALUE)}…` : text}</code>
      {isLong && (
        <button type="button" onClick={() => setExpanded((prev) => !prev)} style={linkButtonStyle}>
          {expanded
            ? messages.collapseValue
            : format(messages.expandValue, { length: text.length })}
        </button>
      )}
    </span>
  )
}
