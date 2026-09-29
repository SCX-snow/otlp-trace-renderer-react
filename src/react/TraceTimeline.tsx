import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { formatDurationUs } from '../headless/format'
import { format } from '../headless/i18n/messages'
import { resolveTimeAxis } from '../headless/layout/axis'
import { DEFAULT_METRICS, resolveNameColumnWidth, type Metrics } from '../headless/layout/metrics'
import { spanAt } from '../headless/interaction/selectors'
import { resolveKeyCommand } from '../headless/interaction/keyboard'
import type { Viewport } from '../headless/layout/viewport'
import type { SpanId, TraceData } from '../headless/model/types'
import { themeVar, type ThemeTokens } from '../headless/theme/tokens'
import type { SpanColorMode } from '../render/colors'
import { rowOrigin } from '../render/scene'
import { SpanNameColumn } from './SpanNameColumn'
import { TimelineCanvas } from './TimelineCanvas'
import { useElementSize } from './hooks/useElementSize'
import { useIsomorphicLayoutEffect } from './hooks/useIsomorphicLayoutEffect'
import { useThemeTokens } from './hooks/useThemeTokens'
import { useTraceMessages } from './messages-context'
import { useTraceViewState, type TraceView } from './hooks/useTraceViewState'

export interface TraceTimelineProps {
  trace: TraceData
  /** 外部托管的视图状态（TraceDetailView 用）。不传就自己建一份 */
  view?: TraceView
  /** 与 DEFAULT_METRICS 合并 */
  metrics?: Partial<Metrics>
  /** 覆盖 CSS 变量解析出来的颜色 */
  theme?: Partial<ThemeTokens>
  /** service 配色的色板（默认 `SERVICE_PALETTE`；深色底传 `SERVICE_PALETTE_DARK`） */
  servicePalette?: readonly string[]
  spanColorMode?: SpanColorMode
  /** 默认 false：需要 ctrl/meta + 滚轮才缩放，纯滚轮留给页面 */
  zoomOnWheel?: boolean
  /** 刻度标签与详情面板的数字格式。不传就读 navigator.language */
  locale?: string
  height?: number | string
  /** 按 Enter 时触发（TraceDetailView 用它把焦点移到详情面板） */
  onActivateDetail?: () => void

  // 只在「没传 view」时生效的受控 props
  viewport?: Viewport
  defaultViewport?: Viewport
  onViewportChange?: (viewport: Viewport) => void
  selectedSpanId?: SpanId | null
  defaultSelectedSpanId?: SpanId | null
  onSelectedSpanIdChange?: (spanId: SpanId | null) => void
  collapsedSpanIds?: ReadonlySet<SpanId>
  defaultCollapsedSpanIds?: ReadonlySet<SpanId>
  onCollapsedSpanIdsChange?: (collapsed: ReadonlySet<SpanId>) => void

  className?: string
  style?: CSSProperties
}

export function TraceTimeline(props: TraceTimelineProps) {
  const {
    trace,
    view: externalView,
    metrics: metricsProp,
    theme: themeProp,
    spanColorMode = 'service',
    servicePalette,
    zoomOnWheel = false,
    locale,
    height = '100%',
    onActivateDetail,
    className,
    style,
  } = props

  const messages = useTraceMessages()
  const metrics = useMemo(() => ({ ...DEFAULT_METRICS, ...metricsProp }), [metricsProp])
  const scrollRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(scrollRef)
  const theme = useThemeTokens(scrollRef, themeProp)
  const [scrollTop, setScrollTop] = useState(0)
  // 容器窄的时候名称列让位，时间轴至少留 MIN_PLOT_WIDTH
  const nameColumnWidth = resolveNameColumnWidth(size.width, metrics.nameColumnWidth)
  const plotWidth = Math.max(0, size.width - nameColumnWidth)
  // 时间轴的横向尺度：bar 的横坐标只有时间和左右留白，树深度不参与（否则刻度对不上，见 layout/axis.ts）
  const axis = useMemo(() => resolveTimeAxis(plotWidth, metrics), [plotWidth, metrics])

  // hooks 不能条件调用，所以内部这份永远建；传了 view 就用外部的，这份自然被忽略
  const internalView = useTraceViewState({
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
  const view = externalView ?? internalView

  useIsomorphicLayoutEffect(() => {
    // 给 reducer 的是**时间映射**宽度（不是画布宽度）：缩放/平移要把像素换算成时间，
    // 得跟画出来的那套一致，否则拖动时长条跟不上鼠标
    view.setWidth(axis.timeWidth)
  }, [view, axis])

  // focusSpan 之类的 action 只能靠 effect 落地：reducer 里不许有副作用
  useEffect(() => {
    const effects = view.takeEffects()
    if (effects.scrollToRow === undefined) return
    const element = scrollRef.current
    if (!element) return
    const target =
      rowOrigin(metrics) +
      effects.scrollToRow * metrics.rowHeight -
      (element.clientHeight - metrics.rowHeight) / 2
    element.scrollTop = Math.max(0, target)
  }, [view, metrics, view.state])

  const onScroll = useCallback(() => {
    const element = scrollRef.current
    if (element) setScrollTop(element.scrollTop)
  }, [])

  const { state, rows, durations, serviceColors } = view

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      // 输入法组合中的按键不抢
      if (event.nativeEvent.isComposing) return
      const command = resolveKeyCommand(event)
      if (command === null) return
      event.preventDefault()

      switch (command.type) {
        case 'moveSelection': {
          const current = rows.findIndex(
            (row) => trace.spans[row.spanIndex]!.spanId === view.state.selectedSpanId,
          )
          const nextIndex =
            current === -1
              ? command.delta > 0
                ? 0
                : rows.length - 1
              : Math.min(rows.length - 1, Math.max(0, current + command.delta))
          const row = rows[nextIndex]
          if (row !== undefined) {
            view.dispatch({ type: 'focusSpan', spanId: trace.spans[row.spanIndex]!.spanId })
          }
          return
        }
        case 'setCollapsed':
          if (view.state.selectedSpanId !== null) {
            view.dispatch({
              type: 'setCollapsed',
              spanId: view.state.selectedSpanId,
              collapsed: command.collapsed,
            })
          }
          return
        case 'zoom':
          view.dispatch({ type: 'zoomBy', factor: command.factor })
          return
        case 'panByFraction':
          view.dispatch({ type: 'panByFraction', fraction: command.fraction })
          return
        case 'fit':
          view.dispatch({ type: 'fit' })
          return
        case 'reset':
          view.dispatch({ type: 'fit' })
          view.dispatch({ type: 'expandAll' })
          return
        case 'clearSelection':
          view.dispatch({ type: 'select', spanId: null })
          return
        case 'activateSelection':
          onActivateDetail?.()
          return
      }
    },
    [rows, trace, view, onActivateDetail],
  )

  const onHover = useCallback(
    (spanId: SpanId | null) => view.dispatch({ type: 'hover', spanId }),
    [view],
  )
  const onSelect = useCallback(
    (spanId: SpanId) => view.dispatch({ type: 'select', spanId }),
    [view],
  )
  const onToggleCollapse = useCallback(
    (spanId: SpanId) => view.dispatch({ type: 'toggleCollapse', spanId }),
    [view],
  )

  const selectedSpan = spanAt(trace, state.selectedSpanId)

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      tabIndex={0}
      className={className}
      role="application"
      aria-label={messages.timelineLabel}
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        width: '100%',
        height,
        background: themeVar('bg'),
        color: themeVar('text'),
        fontSize: 13,
        lineHeight: 1.5,
        fontFamily: themeVar('fontFamily'),
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          height: rowOrigin(metrics) + rows.length * metrics.rowHeight + 12,
        }}
      >
        <SpanNameColumn
          trace={trace}
          rows={rows}
          collapsed={state.collapsed}
          metrics={metrics}
          nameWidth={nameColumnWidth}
          scrollTop={scrollTop}
          height={size.height}
          selectedSpanId={state.selectedSpanId}
          hoveredSpanId={state.hoveredSpanId}
          onSelect={onSelect}
          onHover={onHover}
          onToggleCollapse={onToggleCollapse}
        />
        {/* sticky：canvas 钉在视口里，所以它用视口坐标画（减 scrollTop）；
            名字列在滚动内容里，用内容坐标（不减）—— 两者屏幕位置重合，所以左右天然对齐 */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            width: plotWidth,
            height: size.height,
            flexShrink: 0,
          }}
        >
          <TimelineCanvas
            trace={trace}
            rows={rows}
            viewport={state.viewport}
            metrics={metrics}
            theme={theme}
            width={plotWidth}
            axis={axis}
            height={size.height}
            scrollTop={scrollTop}
            selectedSpanId={state.selectedSpanId}
            hoveredSpanId={state.hoveredSpanId}
            spanColorMode={spanColorMode}
            locale={locale}
            durations={durations}
            serviceColors={serviceColors}
            zoomOnWheel={zoomOnWheel}
            onAction={view.dispatch}
            onHover={onHover}
          />
        </div>
      </div>
      <div aria-live="polite" style={visuallyHidden}>
        {selectedSpan === null
          ? ''
          : format(messages.selectionAnnouncement, {
              name: selectedSpan.name,
              service: selectedSpan.serviceName,
              duration: formatDurationUs(selectedSpan.durationUs, locale),
            })}
      </div>
    </div>
  )
}

/** 只给读屏用：视觉上不可见，但不能 display:none（那样读屏也读不到） */
const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}
