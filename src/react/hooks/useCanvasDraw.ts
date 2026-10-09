import { type DependencyList, useRef, useState } from 'react'
import { useDevicePixelRatio } from './useDevicePixelRatio'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'

export interface CanvasPaintSize {
  width: number
  height: number
  dpr: number
}

export function useCanvasDraw(
  canvasRef: { readonly current: HTMLCanvasElement | null },
  paint: (ctx: CanvasRenderingContext2D, size: CanvasPaintSize) => void,
  deps: DependencyList,

  syncDeps: DependencyList = [],
): void {
  const dpr = useDevicePixelRatio()
  const paintRef = useRef(paint)

  const [resizeVersion, setResizeVersion] = useState(0)

  const paintedSyncDepsRef = useRef<DependencyList | null>(null)
  const syncChanged =
    paintedSyncDepsRef.current === null ||
    syncDeps.length !== paintedSyncDepsRef.current.length ||
    syncDeps.some((value, index) => !Object.is(value, paintedSyncDepsRef.current?.[index]))

  useIsomorphicLayoutEffect(() => {
    paintRef.current = paint
  })

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => setResizeVersion((v) => v + 1))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef])

  useIsomorphicLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const pixelWidth = Math.max(1, Math.round(width * dpr))
    const pixelHeight = Math.max(1, Math.round(height * dpr))
    const sizeChanged = canvas.width !== pixelWidth || canvas.height !== pixelHeight

    const render = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paintRef.current(ctx, { width, height, dpr })
    }

    if (sizeChanged || syncChanged) {
      if (sizeChanged) {
        canvas.width = pixelWidth
        canvas.height = pixelHeight
      }
      render()
      paintedSyncDepsRef.current = syncDeps
      return
    }

    const handle = requestAnimationFrame(render)
    return () => cancelAnimationFrame(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, dpr, resizeVersion])
}
