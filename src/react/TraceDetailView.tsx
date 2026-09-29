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

  // 视图状态：传了 value 就是受控，三个字段各自独立
  viewport?: Viewport
  defaultViewport?: Viewport
  onViewportChange?: (viewport: Viewport) => void

  selectedSpanId?: SpanId | null
  defaultSelectedSpanId?: SpanId | null
  onSelectedSpanIdChange?: (spanId: SpanId | null) => void

  collapsedSpanIds?: ReadonlySet<SpanId>
  defaultCollapsedSpanIds?: ReadonlySet<SpanId>
  onCollapsedSpanIdsChange?: (collapsed: ReadonlySet<SpanId>) => void

  // 外观
  metrics?: Partial<Metrics>
  theme?: Partial<ThemeTokens>
  spanColorMode?: SpanColorMode
  /** service 配色的色板（默认 `SERVICE_PALETTE`；配 `DEFAULT_DARK_THEME` 时传 `SERVICE_PALETTE_DARK`） */
  servicePalette?: readonly string[]
  zoomOnWheel?: boolean
  height?: number | string

  /**
   * `'auto'` / 不传 → 读 navigator.language；内置 en / zh-CN / zh-TW / ja；
   * 其它任何值（比如 'ko'）按英文打底，配合 messages 就能加一门新语言。
   */
  locale?: string
  /** 只覆盖想改的那几条；加新语言就传一整套（漏掉的 key 自动回退英文） */
  messages?: Partial<Messages>

  showToolbar?: boolean
  showDetailPanel?: boolean
  detailPanelHeight?: number | string

  // 扩展点
  renderToolbar?: (view: TraceView) => ReactNode
  /** 整块替换详情内容（span 未选中时不调用） */
  renderSpanDetail?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode
  /**
   * 详情面板标题栏右侧的自定义内容（跳转按钮、徽标、开关…），渲染在「复制 JSON」左边。
   * 库不预设任何按钮 —— 这里只留位置。
   */
  renderSpanDetailActions?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode
  /** 内置分区（tags / process / events / links）之后的自定义内容 */
  renderSpanDetailExtra?: (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => ReactNode
  /** 详情面板下方追加内容 */
  children?: ReactNode

  className?: string
  style?: CSSProperties
}

/** theme prop → 根节点上的内联 CSS 变量，DOM（var()）和 canvas（getComputedStyle）因此一致 */
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

  // 默认值注入一次，引用计数归零时移除（StrictMode 的双挂载也只会留下一个 style）
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
  // 插槽用的动作集：随 view 变（state 是新的，方法只是 dispatch 的糖）
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
          // 容器矮到装不下「工具栏 + 时间轴 + 详情面板」时，滚动整个视图，
          // 而不是让 flex 把时间轴压成 0（minHeight 兜底见下面那层）
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

            {/* flex-basis 必须是 0（不能用 auto）：时间轴是滚动容器，`auto` 会让它的基准尺寸
                变成内容高度（行数 × rowHeight，5k 行 ≈ 11 万 px），于是 flex 收缩量按内容大小
                摊派，详情面板被一起压扁。basis 0 后它只吃剩余空间，行数再多也不参与收缩计算 */}
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
                // 插槽统一把 api 绑在闭包里：SpanDetailPanel 单独用时没有 view，
                // 所以它自己的 render* 只收 (span, trace)，api 是 TraceDetailView 这一层的事
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
