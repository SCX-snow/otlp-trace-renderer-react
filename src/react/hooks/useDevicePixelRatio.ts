import { useEffect, useState } from 'react'

const initial = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)

/**
 * devicePixelRatio，拖到外接屏（dpr 变化）时跟着更新。
 *
 * dpr 变了要重新设置 canvas.width 并重画，否则线条会糊成两像素。
 */
export function useDevicePixelRatio(): number {
  const [dpr, setDpr] = useState(initial)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const update = () => setDpr(window.devicePixelRatio || 1)
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [dpr])

  return dpr
}
