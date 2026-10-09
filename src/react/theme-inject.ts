import { DEFAULT_THEME, TOKENS, type ThemeToken, type ThemeTokens } from '../headless/theme/tokens'

const STYLE_ID = 'otlp-trace-tokens'
const TOKEN_KEYS = Object.keys(TOKENS) as ThemeToken[]

let refCount = 0

export function themeToCss(theme: Partial<ThemeTokens>): string {
  return TOKEN_KEYS.filter((key) => theme[key] !== undefined)
    .map((key) => `${TOKENS[key]}:${theme[key]}`)
    .join(';')
}

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

export function themeRefCount(): number {
  return refCount
}
