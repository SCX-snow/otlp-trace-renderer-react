import { useEffect, useLayoutEffect, useState } from 'react'

export interface ElementSize {
  width: number
  height: number
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const EMPTY: ElementSize = { width: 0, height: 0 }

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
