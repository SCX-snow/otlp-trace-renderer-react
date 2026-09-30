import { useEffect, useState } from 'react'

const initial = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)






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
