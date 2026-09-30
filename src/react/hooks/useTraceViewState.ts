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


export interface TraceView {
  state: ViewState
  dispatch: (action: Action) => void
  rows: Row[]
  durations: Float64Array
  serviceColors: ReadonlyMap<string, string>

  setWidth: (width: number) => void

  takeEffects: () => ReducerEffects
}

export interface TraceViewStateOptions {
  trace: TraceData
  metrics: Metrics

  viewport?: Viewport
  defaultViewport?: Viewport
  onViewportChange?: (viewport: Viewport) => void

  selectedSpanId?: SpanId | null
  defaultSelectedSpanId?: SpanId | null
  onSelectedSpanIdChange?: (spanId: SpanId | null) => void

  collapsedSpanIds?: ReadonlySet<SpanId>
  defaultCollapsedSpanIds?: ReadonlySet<SpanId>
  onCollapsedSpanIdsChange?: (collapsed: ReadonlySet<SpanId>) => void


  servicePalette?: readonly string[]
}











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


  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })


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
    if (next === current) return

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
