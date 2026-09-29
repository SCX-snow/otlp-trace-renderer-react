import { useEffect, useLayoutEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const EMPTY: ElementSize = { width: 0, height: 0 }

/**
 * 尺寸测量。
 *
 * ResizeObserver 的**首次回调是异步的**（在下一帧布局之后），只靠它的话首帧拿到的是 0×0 ——
 * 表现出来就是「组件挂载后先是空白，一帧之后才出现内容」，headless 截图里干脆一直是空白。
 * 所以先用 layout effect 同步量一次（提交后、绘制前），再由 ResizeObserver 持续跟进。
 *
 * 量的是内容盒：已经扣掉了边框、内边距和滚动条，正好是「能画东西的那块地」。
 */
export function useElementSize(ref: { readonly current: HTMLElement | null }): ElementSize {
  const [size, setSize] = useState<ElementSize>(EMPTY)

  useIsomorphicLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const apply = (width: number, height: number) => {
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    apply(element.clientWidth, element.clientHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      apply(width, height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
