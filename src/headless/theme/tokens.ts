/** CSS 变量名。用户在任何作用域（`:root` 或容器）覆盖同名变量即可，DOM 和 Canvas 同时生效。 */
export const TOKENS = {
  bg: '--otlp-trace-bg',
  rowBgAlt: '--otlp-trace-row-bg-alt',
  gridLine: '--otlp-trace-grid-line',
  rulerText: '--otlp-trace-ruler-text',
  bar: '--otlp-trace-bar',
  barSelected: '--otlp-trace-bar-selected',
  rowHover: '--otlp-trace-row-hover',
  rowSelected: '--otlp-trace-row-selected',
  errorBar: '--otlp-trace-bar-error',
  text: '--otlp-trace-text',
  textMuted: '--otlp-trace-text-muted',
  border: '--otlp-trace-border',
  focusRing: '--otlp-trace-focus-ring',
  fontFamily: '--otlp-trace-font',
} as const

export type ThemeToken = keyof typeof TOKENS
export type ThemeTokens = Record<ThemeToken, string>

export const DEFAULT_THEME: ThemeTokens = {
  bg: '#ffffff',
  rowBgAlt: '#fafafa',
  gridLine: '#f1f5f9',
  rulerText: '#94a3b8',
  bar: '#2563eb',
  barSelected: '#1d4ed8',
  rowHover: '#f1f5f9',
  rowSelected: '#bfdbfe',
  errorBar: '#dc2626',
  text: '#0f172a',
  textMuted: '#64748b',
  border: '#e2e8f0',
  focusRing: '#2563eb',
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
}

/**
 * 深色预设。最省事的接法：`<TraceDetailView theme={DEFAULT_DARK_THEME} />`
 * （走 theme prop 的内联变量路径，不污染全局），或者自己写一份 `html.dark { --otlp-trace-*: … }`。
 *
 * 对比度（WCAG，脚本算过，相对 bg `#0b1220`）：text 15.2:1、textMuted 7.3:1、rulerText 5.4:1、
 * bar / errorBar 7.4 / 6.8:1 —— 都过 4.5:1 正文、3:1 图形对象门槛；gridLine / border / rowHover /
 * rowSelected 故意贴着底色（1.1–1.6:1），它们是分隔线和面，不是内容（正文压在上面仍有 9.3:1）。
 * `test/theme.test.ts` 会盯着这组数字。
 *
 * service 色板另有深色版（`SERVICE_PALETTE_DARK`），因为它不走 CSS 变量、由 JS 算，
 * 见 `spanColorMode="service"` + `servicePalette`。
 */
export const DEFAULT_DARK_THEME: ThemeTokens = {
  bg: '#0b1220',
  rowBgAlt: '#101a2c',
  gridLine: '#1e293b',
  rulerText: '#7c8ba1',
  bar: '#60a5fa',
  barSelected: '#93c5fd',
  rowHover: '#16233a',
  rowSelected: '#1e3a5f',
  errorBar: '#f87171',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  border: '#1e293b',
  focusRing: '#60a5fa',
  fontFamily: DEFAULT_THEME.fontFamily,
}

/**
 * DOM 侧取色：`var(--otlp-trace-x, 默认值)`。
 *
 * 带上 fallback 是为了「即使自动注入没跑成（SSR、被 CSP 拦掉）也还有颜色」。
 * Canvas 侧拿不到 CSS 变量，只能走 getComputedStyle，见 useThemeTokens。
 */
export function themeVar(token: ThemeToken): string {
  return `var(${TOKENS[token]}, ${DEFAULT_THEME[token]})`
}
