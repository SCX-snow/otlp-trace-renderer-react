import { DEFAULT_THEME, TOKENS, type ThemeToken, type ThemeTokens } from '../headless/theme/tokens'

const STYLE_ID = 'otlp-trace-tokens'
const TOKEN_KEYS = Object.keys(TOKENS) as ThemeToken[]

let refCount = 0

export function themeToCss(theme: Partial<ThemeTokens>): string {
  return TOKEN_KEYS.filter((key) => theme[key] !== undefined)
    .map((key) => `${TOKENS[key]}:${theme[key]}`)
    .join(';')
}

/**
 * 注入默认值，引用计数归零时移除。
 *
 * 用 `:where(:root)` 而不是 `:root`：`:where()` 特异度为 0，用户在任何地方写的
 * `--otlp-trace-*` 都能盖住它，不需要 `!important` 或者更长的选择器打架。
 *
 * StrictMode 下 mount → unmount → mount 会走一遍 1 → 0 → 1，结果同样只有一个 style 元素。
 */
export function acquireThemeDefaults(): () => void {
  if (typeof document === 'undefined') return () => {}
  refCount += 1
  if (refCount === 1 && document.getElementById(STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `:where(:root){${themeToCss(DEFAULT_THEME)}}`
    document.head.appendChild(style)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    refCount -= 1
    if (refCount <= 0) {
      refCount = 0
      document.getElementById(STYLE_ID)?.remove()
    }
  }
}

/** 只给测试和调试用 */
export function themeRefCount(): number {
  return refCount
}
