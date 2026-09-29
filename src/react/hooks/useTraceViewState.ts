import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenRows, type Row } from '../../headless/layout/flatten'
import type { Metrics } from '../../headless/layout/metrics'
import { precomputeDurations } from '../../headless/interaction/selectors'
import {
  initViewState,
  traceReducer,
  type Action,
  type ReducerEffects,
  type ViewState,
} from '../../headless/interaction/reducer'
import type { SpanId, TraceData } from '../../headless/model/types'
import type { Viewport } from '../../headless/layout/viewport'
import { buildServiceColors } from '../../render/colors'

/** 交给 UI 层消费的一份完整视图状态 */
export interface TraceView {
  state: ViewState
  dispatch: (action: Action) => void
  rows: Row[]
  durations: Float64Array
  serviceColors: ReadonlyMap<string, string>
  /** 绘制宽度只有 canvas 知道，由它回填，缩放/平移的像素→时间换算要用 */
  setWidth: (width: number) => void
  /** 取走 reducer 攒下的副作用（当前只有 scrollToRow），取完即清 */
  takeEffects: () => ReducerEffects
}

export interface TraceViewStateOptions {
  trace: TraceData
  metrics: Metrics
  /** 以下三对传了 value 就是受控 */
  viewport?: Viewport
  defaultViewport?: Viewport
  onViewportChange?: (viewport: Viewport) => void

  selectedSpanId?: SpanId | null
  defaultSelectedSpanId?: SpanId | null
  onSelectedSpanIdChange?: (spanId: SpanId | null) => void

  collapsedSpanIds?: ReadonlySet<SpanId>
  defaultCollapsedSpanIds?: ReadonlySet<SpanId>
  onCollapsedSpanIdsChange?: (collapsed: ReadonlySet<SpanId>) => void

  /** service 配色用的色板，默认 `SERVICE_PALETTE`（深色底换成 `SERVICE_PALETTE_DARK`） */
  servicePalette?: readonly string[]
}

/**
 * 交给「自定义插槽」（详情区的三个 render*）用的动作集。
 *
 * 比 `TraceView` 收敛：去掉了 rows / durations / setWidth / takeEffects 这些内部量，只留下
 * **看状态 + 跳转 + 视图控制**。`state` / `dispatch` 仍然透出，所以插槽里能做到 reducer 支持的
 * 任何事（`dispatch` 是逃生口，`select` / `focusSpan` 这些是常用写法的糖）。
 *
 * `focusSpan` 与 `select` 的区别：前者是「跳过去看它」—— 展开祖先 + 把时间段挪进视口 + 滚动到那一行；
 * 后者只是改选中，不改变视口和滚动位置。做「跳到父/子/link 目标」要用 `focusSpan`。
 */
export interface TraceDetailViewApi {
  state: ViewState
  dispatch: (action: Action) => void
  select(spanId: SpanId | null): void
  focusSpan(spanId: SpanId): void
  zoomBy(factor: number): void
  fit(): void
  collapseAll(): void
  expandAll(): void
}

export function createTraceDetailViewApi(view: TraceView): TraceDetailViewApi {
  const { dispatch } = view
  return {
    state: view.state,
    dispatch,
    select: (spanId) => dispatch({ type: 'select', spanId }),
    focusSpan: (spanId) => dispatch({ type: 'focusSpan', spanId }),
    zoomBy: (factor) => dispatch({ type: 'zoomBy', factor }),
    fit: () => dispatch({ type: 'fit' }),
    collapseAll: () => dispatch({ type: 'collapseAll' }),
    expandAll: () => dispatch({ type: 'expandAll' }),
  }
}

/**
 * 视图状态：headless 的纯 reducer + 受控/非受控组装。
 *
 * 三个字段各自独立判断受控（`value !== undefined`），所以可以只受控其中一两个。
 * 受控期间发生的交互也会写进内部 state（渲染时仍以 props 为准），所以切回非受控后那些结果还在 ——
 * 但和 React input 一样，中途切换受控/非受控本身没有明确定义的行为。
 *
 * dispatch 里**没有**在 setState 的 updater 中调用 onChange —— updater 在 StrictMode 下会被
 * 调用两次，副作用写在里面会让回调重复触发。这里先把新状态算出来、同步触发回调，再 setState。
 */
export function useTraceViewState(options: TraceViewStateOptions): TraceView {
  const { trace, metrics } = options

  const [internal, setInternal] = useState<ViewState>(() => ({
    ...initViewState(trace),
    ...(options.defaultViewport === undefined ? {} : { viewport: options.defaultViewport }),
    selectedSpanId: options.defaultSelectedSpanId ?? null,
    ...(options.defaultCollapsedSpanIds === undefined
      ? {}
      : { collapsed: options.defaultCollapsedSpanIds }),
  }))

  const internalRef = useRef(internal)
  const widthRef = useRef(0)
  const pendingEffects = useRef<ReducerEffects>({})

  // dispatch 在事件里跑，必须读到最新的 props / trace / 宽度
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })

  // 换 trace 就重置视口与折叠（React 官方的「props 变化时调整 state」写法）
  const [prevTrace, setPrevTrace] = useState(trace)
  if (prevTrace !== trace) {
    setPrevTrace(trace)
    const reset = initViewState(trace)
    internalRef.current = reset
    setInternal(reset)
  }

  const state: ViewState = {
    viewport: options.viewport ?? internal.viewport,
    selectedSpanId:
      options.selectedSpanId !== undefined ? options.selectedSpanId : internal.selectedSpanId,
    hoveredSpanId: internal.hoveredSpanId,
    collapsed: options.collapsedSpanIds ?? internal.collapsed,
  }

  const dispatch = useCallback((action: Action) => {
    const props = latest.current
    const previous = internalRef.current
    const current: ViewState = {
      viewport: props.viewport ?? previous.viewport,
      selectedSpanId:
        props.selectedSpanId !== undefined ? props.selectedSpanId : previous.selectedSpanId,
      hoveredSpanId: previous.hoveredSpanId,
      collapsed: props.collapsedSpanIds ?? previous.collapsed,
    }

    const [next, effects] = traceReducer(current, action, {
      trace: props.trace,
      width: widthRef.current,
    })
    if (next === current) return // 无变化：不 setState、不触发回调

    internalRef.current = next
    setInternal(next)
    pendingEffects.current = effects

    if (next.viewport !== current.viewport) props.onViewportChange?.(next.viewport)
    if (next.selectedSpanId !== current.selectedSpanId) {
      props.onSelectedSpanIdChange?.(next.selectedSpanId)
    }
    if (next.collapsed !== current.collapsed) props.onCollapsedSpanIdsChange?.(next.collapsed)
  }, [])

  const rows = useMemo(
    () => flattenRows(trace, state.collapsed, metrics.maxIndentDepth),
    [trace, state.collapsed, metrics.maxIndentDepth],
  )
  const durations = useMemo(() => precomputeDurations(trace), [trace])
  const { servicePalette } = options
  const serviceColors = useMemo(
    () => buildServiceColors(trace, servicePalette),
    [trace, servicePalette],
  )

  const setWidth = useCallback((width: number) => {
    widthRef.current = width
  }, [])

  const takeEffects = useCallback(() => {
    const effects = pendingEffects.current
    pendingEffects.current = {}
    return effects
  }, [])

  return { state, dispatch, rows, durations, serviceColors, setWidth, takeEffects }
}
