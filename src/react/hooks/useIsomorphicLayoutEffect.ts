import { useEffect, useLayoutEffect } from 'react'

/** SSR 下 useLayoutEffect 会警告，但组件挂载才碰 DOM，降级成 useEffect 即可 */
export const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
