export { TraceDetailView } from './react/TraceDetailView'
export type { TraceDetailViewProps } from './react/TraceDetailView'

export { TraceTimeline } from './react/TraceTimeline'
export type { TraceTimelineProps } from './react/TraceTimeline'

export { TraceToolbar } from './react/TraceToolbar'
export type { TraceToolbarProps } from './react/TraceToolbar'

export { SpanDetailPanel } from './react/SpanDetailPanel'
export type { SpanDetailPanelProps } from './react/SpanDetailPanel'

export { SpanNameColumn } from './react/SpanNameColumn'
export type { SpanNameColumnProps } from './react/SpanNameColumn'

export type { TraceView, TraceDetailViewApi } from './react/hooks/useTraceViewState'

export { useTraceMessages } from './react/messages-context'

// 深色模式开箱用：预设主题 + 两套 service 色板（色板不走 CSS 变量，由 JS 算，所以单独导出）
export { DEFAULT_DARK_THEME, DEFAULT_THEME } from './headless/theme/tokens'
export { SERVICE_PALETTE, SERVICE_PALETTE_DARK } from './render/colors'
