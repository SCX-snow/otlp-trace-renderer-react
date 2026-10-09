import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_THEME,
  TOKENS,
  type ThemeToken,
  type ThemeTokens,
} from '../../headless/theme/tokens'

const TOKEN_KEYS = Object.keys(TOKENS) as ThemeToken[]

function sameTokens(a: ThemeTokens, b: ThemeTokens): boolean {
  for (const key of TOKEN_KEYS) {
    if (a[key] !== b[key]) return false
  }
  return true
}

export function useThemeTokens(
  ref: { readonly current: HTMLElement | null },
  overrides?: Partial<ThemeTokens>,
): ThemeTokens {
  const [resolved, setResolved] = useState<ThemeTokens>(DEFAULT_THEME)

  useEffect(() => {
    const resolve = () => {
      const element = ref.current
      const computed = element ? getComputedStyle(element) : null
      const next: ThemeTokens = { ...DEFAULT_THEME }
      for (const key of TOKEN_KEYS) {
        const fromCss = computed?.getPropertyValue(TOKENS[key]).trim()
        if (fromCss) next[key] = fromCss
      }
      setResolved((prev) => (sameTokens(prev, next) ? prev : next))
    }

    resolve()

    if (typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', resolve)

    const observer = new MutationObserver(resolve)
    const options: MutationObserverInit = {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    }
    observer.observe(document.documentElement, options)
    if (ref.current) observer.observe(ref.current, options)

    return () => {
      media.removeEventListener('change', resolve)
      observer.disconnect()
    }
  }, [ref])

  return useMemo(
    () => (overrides === undefined ? resolved : { ...resolved, ...overrides }),
    [resolved, overrides],
  )
}
