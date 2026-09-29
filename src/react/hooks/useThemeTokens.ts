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

/**
 * CSS 变量 → 实际颜色值。Canvas 拿不到 CSS 变量，只能读计算样式。
 *
 * **只在 4 个时机解析**：挂载 / 容器或根节点 class·style·data-theme 变化 / prefers-color-scheme 变化 /
 * 组件重挂载。绝不能放进渲染循环 —— 每次 getComputedStyle 都可能强制样式重算，
 * 这是这类组件最常见的掉帧原因。
 *
 * theme prop 的覆盖不参与解析：它直接叠在结果上，改 prop 不用重新读样式。
 */
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
    // 用户在祖先节点上换主题时也要重新解析。三种都认：class（Tailwind 系）、style（内联变量）、
    // data-theme（Bootstrap / MUI 系的开关）—— 少认一种，用户换个写法 canvas 就悄悄不跟了。
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
