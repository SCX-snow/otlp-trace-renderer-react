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

export function themeVar(token: ThemeToken): string {
  return `var(${TOKENS[token]}, ${DEFAULT_THEME[token]})`
}
