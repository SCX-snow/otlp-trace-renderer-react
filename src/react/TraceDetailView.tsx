import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef } from 'react'
import { resolveMessages, type Messages } from '../headless/i18n/messages'
import { DEFAULT_METRICS, type Metrics } from '../headless/layout/metrics'
import type { Viewport } from '../headless/layout/viewport'
import type { SpanData, SpanId, TraceData } from '../headless/model/types'
import { TOKENS, themeVar, type ThemeToken, type ThemeTokens } from '../headless/theme/tokens'
import type { SpanColorMode } from '../render/colors'
import { SpanDetailPanel } from './SpanDetailPanel'
import { TraceTimeline } from './TraceTimeline'
import { TraceToolbar } from './TraceToolbar'
import {
  createTraceDetailViewApi,
  useTraceViewState,
  type TraceDetailViewApi,
  type TraceView,
} from './hooks/useTraceViewState'
import { MessagesProvider } from './messages-context'
import { acquireThemeDefaults } from './theme-inject'

export interface TraceDetailViewProps {
  trace: TraceData


  viewport?: Viewport
  defaultViewport?: Viewport
  onViewportChange?: (viewport: Viewport) => void

  selectedSpanId?: SpanId | null
  defaultSelectedSpanId?: SpanId | null
  onSelectedSpanIdChange?: (spanId: SpanId | null) => void

  collapsedSpanIds?: ReadonlySet<SpanId>
  defaultCollapsedSpanIds?: ReadonlySet<SpanId>
  onCollapsedSpanIdsChange?: (collapsed: ReadonlySet<SpanId>) => void


  metrics?: Partial<Metrics>
  theme?: Partial<ThemeTokens>
  spanColorMode?: SpanColorMode

  servicePalette?: readonly string[]
  zoomOnWheel?: boolean
  height?: number | string





  locale?: string

  messages?: Partial<Messages>

  showToolbar?: boolean
  showDetailPanel?: boolean
  detailPanelHeight?: number | string


  renderToolbar?: (view: TraceView) => ReactNode

  renderSpanDetail?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode




  renderSpanDetailActions?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode

  renderSpanDetailExtra?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode

  children?: ReactNode

  className?: string
  style?: CSSProperties
}


function themeToInlineVars(theme: Partial<ThemeTokens> | undefined): CSSProperties {
  if (theme === undefined) return {}
  const style: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme)) {
    const token = TOKENS[key as ThemeToken]
    if (token !== undefined && typeof value === 'string' && value !== '') style[token] = value
  }
  return style as CSSProperties
}

export function TraceDetailView(props: TraceDetailViewProps) {
  const {
    trace,
    metrics: metricsProp,
    theme,
    spanColorMode,
    servicePalette,
    zoomOnWheel,
    locale,
    messages: messagesOverrides,
    height = '100%',
    showToolbar = true,
    showDetailPanel = true,
    detailPanelHeight = 240,
    renderToolbar,
    renderSpanDetail,
    renderSpanDetailActions,
    renderSpanDetailExtra,
    children,
    className,
    style,
  } = props

  const metrics = useMemo(() => ({ ...DEFAULT_METRICS, ...metricsProp }), [metricsProp])
  const messages = useMemo(
    () => resolveMessages(locale, messagesOverrides),
    [locale, messagesOverrides],
  )


  useEffect(() => acquireThemeDefaults(), [])

  const view = useTraceViewState({
    trace,
    metrics,
    ...(props.viewport === undefined ? {} : { viewport: props.viewport }),
    ...(props.defaultViewport === undefined ? {} : { defaultViewport: props.defaultViewport }),
    ...(props.onViewportChange === undefined ? {} : { onViewportChange: props.onViewportChange }),
    ...(props.selectedSpanId === undefined ? {} : { selectedSpanId: props.selectedSpanId }),
    ...(props.defaultSelectedSpanId === undefined
      ? {}
      : { defaultSelectedSpanId: props.defaultSelectedSpanId }),
    ...(props.onSelectedSpanIdChange === undefined
      ? {}
      : { onSelectedSpanIdChange: props.onSelectedSpanIdChange }),
    ...(props.collapsedSpanIds === undefined ? {} : { collapsedSpanIds: props.collapsedSpanIds }),
    ...(props.defaultCollapsedSpanIds === undefined
      ? {}
      : { defaultCollapsedSpanIds: props.defaultCollapsedSpanIds }),
    ...(props.onCollapsedSpanIdsChange === undefined
      ? {}
      : { onCollapsedSpanIdsChange: props.onCollapsedSpanIdsChange }),
    ...(servicePalette === undefined ? {} : { servicePalette }),
  })

  const themeVars = useMemo(() => themeToInlineVars(theme), [theme])

  const api = useMemo(() => createTraceDetailViewApi(view), [view])
  const detailRef = useRef<HTMLDivElement>(null)
  const isEmpty = trace.spans.length === 0

  return (
    <MessagesProvider value={messages}>
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          height,
          minHeight: 0,


          overflow: 'auto',
          background: themeVar('bg'),
          color: themeVar('text'),
          ...themeVars,
          ...style,
        }}
      >
        {isEmpty ? (
          <div
            data-testid="otlp-trace-empty"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: themeVar('textMuted'),
              padding: 24,
              textAlign: 'center',
            }}
          >
            {messages.noSpans}
          </div>
        ) : (
          <>
            {showToolbar &&
              (renderToolbar ? (
                renderToolbar(view)
              ) : (
                <TraceToolbar
                  trace={trace}
                  viewport={view.state.viewport}
                  onAction={view.dispatch}
                  locale={locale}
                  messages={messages}
                />
              ))}

            {

}
            <div style={{ flex: '1 1 0%', minHeight: 80, overflow: 'hidden' }}>
              <TraceTimeline
                trace={trace}
                view={view}
                metrics={metrics}
                theme={theme}
                spanColorMode={spanColorMode}
                {...(servicePalette === undefined ? {} : { servicePalette })}
                zoomOnWheel={zoomOnWheel}
                locale={locale}
                height="100%"
                onActivateDetail={() => detailRef.current?.focus()}
              />
            </div>

            {showDetailPanel && (
              <SpanDetailPanel
                ref={detailRef}
                trace={trace}
                spanId={view.state.selectedSpanId}
                locale={locale}
                messages={messages}
                height={detailPanelHeight}
                {...(servicePalette === undefined ? {} : { servicePalette })}
                onSelectSpan={(spanId) => view.dispatch({ type: 'focusSpan', spanId })}


                {...(renderSpanDetail === undefined
                  ? {}
                  : {
                      renderSpanDetail: (span: SpanData, t: TraceData) =>
                        renderSpanDetail(span, t, api),
                    })}
                {...(renderSpanDetailActions === undefined
                  ? {}
                  : {
                      renderActions: (span: SpanData, t: TraceData) =>
                        renderSpanDetailActions(span, t, api),
                    })}
                {...(renderSpanDetailExtra === undefined
                  ? {}
                  : {
                      renderExtra: (span: SpanData, t: TraceData) =>
                        renderSpanDetailExtra(span, t, api),
                    })}
              />
            )}
          </>
        )}

        {children}
      </div>
    </MessagesProvider>
  )
}
