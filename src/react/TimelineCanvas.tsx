import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { hitTest, type HitTarget } from '../headless/interaction/hit-test'
import type { Action } from '../headless/interaction/reducer'
import type { TimeAxis } from '../headless/layout/axis'
import type { Row } from '../headless/layout/flatten'
import type { Metrics } from '../headless/layout/metrics'
import type { SpanId, TraceData } from '../headless/model/types'
import type { Viewport } from '../headless/layout/viewport'
import type { ThemeTokens } from '../headless/theme/tokens'
import type { SpanColorMode } from '../render/colors'
import { drawTimeline } from '../render/draw-timeline'
import type { TimelineScene } from '../render/scene'
import { useCanvasDraw } from './hooks/useCanvasDraw'

export interface TimelineCanvasProps {
  trace: TraceData
  rows: Row[]
  viewport: Viewport
  metrics: Metrics
  theme: ThemeTokens
  width: number

  axis: TimeAxis
  height: number
  scrollTop: number
  selectedSpanId: SpanId | null
  hoveredSpanId: SpanId | null
  spanColorMode: SpanColorMode

  locale?: string
  durations: Float64Array
  serviceColors: ReadonlyMap<string, string>
  zoomOnWheel: boolean
  onAction: (action: Action) => void
  onHover: (spanId: SpanId | null) => void
}

function localPoint(element: HTMLElement, clientX: number, clientY: number) {
  const rect = element.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}


const CLICK_SLOP_PX = 3
const WHEEL_ZOOM_STEP = 1.15

export function TimelineCanvas(props: TimelineCanvasProps) {
  const {
    trace,
    rows,
    viewport,
    metrics,
    theme,
    width,
    axis,
    height,
    scrollTop,
    selectedSpanId,
    hoveredSpanId,
    spanColorMode,
    locale,
    durations,
    serviceColors,
    zoomOnWheel,
    onAction,
    onHover,
  } = props

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ pointerId: number; lastX: number; moved: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  useCanvasDraw(
    canvasRef,
    (ctx, size) => {
      const scene: TimelineScene = {
        trace,
        rows,
        viewport,
        metrics,
        theme,
        width: size.width,
        axis,
        height: size.height,
        scrollTop,
        selectedSpanId,
        hoveredSpanId,
        spanColorMode,
        durations,
        serviceColors,
        ...(locale === undefined ? {} : { locale }),
      }
      drawTimeline(ctx, scene)
    },
    [
      trace,
      rows,
      viewport,
      metrics,
      theme,
      width,
      axis,
      height,
      scrollTop,
      selectedSpanId,
      hoveredSpanId,
      spanColorMode,
      locale,
      durations,
      serviceColors,
    ],

    [theme],
  )


  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent) => {
      if (!zoomOnWheel && !event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      onAction({
        type: 'zoom',
        anchorPx: event.clientX - rect.left,
        factor: event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomOnWheel, onAction])

  const hitAt = (point: { x: number; y: number }): HitTarget =>
    hitTest(point, rows, trace, viewport, metrics, axis, scrollTop)

  const spanIdAt = (hit: HitTarget): SpanId | null =>
    hit.type === 'row' ? trace.spans[hit.spanIndex]!.spanId : null

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, moved: 0 }
    setDragging(true)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (drag !== null && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.lastX
      drag.lastX = event.clientX
      drag.moved += Math.abs(dx)
      if (dx !== 0) onAction({ type: 'pan', dxPx: dx })
      return
    }
    onHover(spanIdAt(hitAt(localPoint(event.currentTarget, event.clientX, event.clientY))))
  }

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setDragging(false)
    if (drag === null || drag.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved < CLICK_SLOP_PX) {
      onAction({
        type: 'select',
        spanId: spanIdAt(hitAt(localPoint(event.currentTarget, event.clientX, event.clientY))),
      })
    }
  }





  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const hit = hitAt(localPoint(event.currentTarget, event.clientX, event.clientY))
    if (hit.type === 'row') {
      onAction({ type: 'toggleCollapse', spanId: trace.spans[hit.spanIndex]!.spanId })
    }
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
      onPointerLeave={() => {
        if (dragRef.current === null) onHover(null)
      }}
      style={{
        display: 'block',
        width,
        height,
        touchAction: 'none',
        cursor: dragging ? 'grabbing' : 'default',
      }}
    />
  )
}
