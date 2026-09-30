import { flattenRows, type Row } from '../layout/flatten'
import {
  clampViewport,
  fitViewport,
  panByPx,
  revealRange,
  zoomAt,
  type Viewport,
} from '../layout/viewport'
import type { SpanId, TraceData } from '../model/types'
import { ancestorsOf } from './selectors'

export interface ViewState {
  viewport: Viewport
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  collapsed: ReadonlySet<SpanId>
}

export interface ReducerCtx {
  trace: TraceData

  width: number
}


export interface ReducerEffects {

  scrollToRow?: number
}

export type Action =
  | { type: 'setViewport'; viewport: Viewport }
  | { type: 'zoom'; anchorPx: number; factor: number }
  | { type: 'zoomBy'; factor: number }
  | { type: 'pan'; dxPx: number }
  | { type: 'panByFraction'; fraction: number }
  | { type: 'fit' }
  | { type: 'select'; spanId: SpanId | null }
  | { type: 'hover'; spanId: SpanId | null }
  | { type: 'toggleCollapse'; spanId: SpanId }
  | { type: 'setCollapsed'; spanId: SpanId; collapsed: boolean }
  | { type: 'collapseAll' }
  | { type: 'expandAll' }
  | { type: 'expandTo'; spanId: SpanId }
  | { type: 'focusSpan'; spanId: SpanId }

const NO_EFFECTS: ReducerEffects = {}

export function initViewState(trace: TraceData): ViewState {
  return {
    viewport: fitViewport(trace.durationUs),
    selectedSpanId: null,
    hoveredSpanId: null,
    collapsed: new Set(),
  }
}

export function rowsOf(state: ViewState, trace: TraceData): Row[] {
  return flattenRows(trace, state.collapsed)
}

function indexOfSpan(trace: TraceData, spanId: SpanId | null): number {
  if (spanId === null) return -1
  return trace.index.get(spanId) ?? -1
}

function withViewport(state: ViewState, next: Viewport): [ViewState, ReducerEffects] {
  return next === state.viewport ? [state, NO_EFFECTS] : [{ ...state, viewport: next }, NO_EFFECTS]
}


function expandAncestors(state: ViewState, trace: TraceData, spanIndex: number): ViewState | null {
  const next = new Set(state.collapsed)
  let changed = false
  for (const id of ancestorsOf(trace, spanIndex)) {
    if (next.delete(id)) changed = true
  }
  return changed ? { ...state, collapsed: next } : null
}

function sameCollapsed(a: ReadonlySet<SpanId>, b: ReadonlySet<SpanId>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}

export function traceReducer(
  state: ViewState,
  action: Action,
  ctx: ReducerCtx,
): [ViewState, ReducerEffects] {
  const { trace } = ctx
  const durationUs = trace.durationUs

  switch (action.type) {
    case 'setViewport':
      return withViewport(state, clampViewport(action.viewport, durationUs))

    case 'zoom':
      return withViewport(
        state,
        zoomAt(state.viewport, action.anchorPx, action.factor, ctx.width, durationUs),
      )

    case 'zoomBy':
      return withViewport(
        state,
        zoomAt(state.viewport, ctx.width / 2, action.factor, ctx.width, durationUs),
      )

    case 'pan':
      return withViewport(state, panByPx(state.viewport, action.dxPx, ctx.width, durationUs))

    case 'panByFraction':

      if (ctx.width <= 0) return [state, NO_EFFECTS]
      return withViewport(
        state,
        panByPx(state.viewport, -action.fraction * ctx.width, ctx.width, durationUs),
      )

    case 'fit':
      return withViewport(state, fitViewport(durationUs))

    case 'select': {
      if (action.spanId !== null && indexOfSpan(trace, action.spanId) === -1) {
        return [state, NO_EFFECTS]
      }
      if (state.selectedSpanId === action.spanId) return [state, NO_EFFECTS]
      return [{ ...state, selectedSpanId: action.spanId }, NO_EFFECTS]
    }

    case 'hover': {
      if (action.spanId !== null && indexOfSpan(trace, action.spanId) === -1) {
        return [state, NO_EFFECTS]
      }
      if (state.hoveredSpanId === action.spanId) return [state, NO_EFFECTS]
      return [{ ...state, hoveredSpanId: action.spanId }, NO_EFFECTS]
    }

    case 'toggleCollapse': {
      const spanIndex = indexOfSpan(trace, action.spanId)
      if (spanIndex === -1) return [state, NO_EFFECTS]
      if (trace.children[spanIndex]!.length === 0) return [state, NO_EFFECTS]
      const next = new Set(state.collapsed)
      if (!next.delete(action.spanId)) next.add(action.spanId)
      return [{ ...state, collapsed: next }, NO_EFFECTS]
    }

    case 'setCollapsed': {

      const spanIndex = indexOfSpan(trace, action.spanId)
      if (spanIndex === -1) return [state, NO_EFFECTS]
      if (!action.collapsed && trace.children[spanIndex]!.length === 0) return [state, NO_EFFECTS]
      if (state.collapsed.has(action.spanId) === action.collapsed) return [state, NO_EFFECTS]
      const next = new Set(state.collapsed)
      if (action.collapsed) next.add(action.spanId)
      else next.delete(action.spanId)
      return [{ ...state, collapsed: next }, NO_EFFECTS]
    }

    case 'collapseAll': {
      const next = new Set<SpanId>()
      for (let i = 0; i < trace.children.length; i++) {
        if (trace.children[i]!.length > 0) next.add(trace.spans[i]!.spanId)
      }
      if (sameCollapsed(next, state.collapsed)) return [state, NO_EFFECTS]
      return [{ ...state, collapsed: next }, NO_EFFECTS]
    }

    case 'expandAll':
      if (state.collapsed.size === 0) return [state, NO_EFFECTS]
      return [{ ...state, collapsed: new Set() }, NO_EFFECTS]

    case 'expandTo': {
      const spanIndex = indexOfSpan(trace, action.spanId)
      if (spanIndex === -1) return [state, NO_EFFECTS]
      const next = expandAncestors(state, trace, spanIndex)
      return next === null ? [state, NO_EFFECTS] : [next, NO_EFFECTS]
    }

    case 'focusSpan': {
      const spanIndex = indexOfSpan(trace, action.spanId)
      if (spanIndex === -1) return [state, NO_EFFECTS]
      const span = trace.spans[spanIndex]!
      let next = expandAncestors(state, trace, spanIndex) ?? state
      const viewport = revealRange(next.viewport, span.startUs, span.endUs, durationUs)
      if (viewport !== next.viewport) next = { ...next, viewport }
      if (next.selectedSpanId !== action.spanId) next = { ...next, selectedSpanId: action.spanId }
      const rowIndex = rowsOf(next, trace).findIndex((row) => row.spanIndex === spanIndex)
      return [next, rowIndex === -1 ? NO_EFFECTS : { scrollToRow: rowIndex }]
    }

    default:
      return [state, NO_EFFECTS]
  }
}
