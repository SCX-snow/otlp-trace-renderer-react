import { type DependencyList, useRef, useState } from 'react'
import { useDevicePixelRatio } from './useDevicePixelRatio'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect'

export interface CanvasPaintSize {
  /** CSS 像素 */
  width: number
  height: number
  dpr: number
}

/**
 * Canvas 绘制调度：管 DPR、管缓冲区尺寸、管「什么时候画」。
 *
 * 两条路径，缺一不可：
 *
 * 1. **缓冲区尺寸变了 → 当帧同步画**。挂载后第一帧、拖到外接屏、容器 resize 都属于这种。
 *    如果这时候还走 rAF，第一次绘制会被推到下一帧，屏幕上先出现一帧空白 ——
 *    肉眼看不见，但 headless 截图、打印、截图工具都会稳定地拍到那张空白。
 * 2. **其它变化 → rAF 合并成一帧一次绘制**。拖动平移时 pointermove 可能一帧来好几次，
 *    每次都画会白烧 CPU。
 *
 * 调用方只负责提供 `paint`，不用关心 setTransform / canvas.width / rAF。
 */
export function useCanvasDraw(
  canvasRef: { readonly current: HTMLCanvasElement | null },
  paint: (ctx: CanvasRenderingContext2D, size: CanvasPaintSize) => void,
  deps: DependencyList,
  /**
   * 这些依赖变化时必须**当帧同步**画，不能等 rAF。
   *
   * 尺寸变化已经走同步路径；颜色（主题）变化同样不能晚一帧 —— 首帧拿 DEFAULT_THEME 画、
   * 主题解析出来再合并到下一帧，深色模式下就是肉眼可见的**白闪**（headless 截图必拍到）。
   * 拖动/缩放这类高频变化仍走 rAF 合并。
   */
  syncDeps: DependencyList = [],
): void {
  const dpr = useDevicePixelRatio()
  const paintRef = useRef(paint)
  // 元素自己尺寸变了也算一次「要重画」：调用方忘了把宽高放进 deps 也不会画错
  const [resizeVersion, setResizeVersion] = useState(0)
  // null = 还没画过第一帧，第一次一律同步（否则 300×150 这种「尺寸正好没变」的容器会漏掉首帧）
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
    // 只观察 CSS 尺寸：canvas.width/height 变了不影响元素布局，不会自激
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
