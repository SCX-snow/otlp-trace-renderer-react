import { durationPercentile } from '../headless/interaction/selectors'
import type { SpanData, TraceData } from '../headless/model/types'

/**
 * service 色板。
 *
 * 色板里**没有红**：红是 error span 的专用色。用 HSL 色相轮转（137.5° 黄金角）时第一个色相就是
 * 0° = 红，`hsl(0 62% 48%)` 和 error 的 `#dc2626` 在屏幕上分不出来 —— examples 第一次截图踩到过。
 */
export const SERVICE_PALETTE = [
  '#2563eb',
  '#0d9488',
  '#7c3aed',
  '#db2777',
  '#ca8a04',
  '#0891b2',
  '#4d7c0f',
  '#64748b',
] as const

/**
 * 深色底用的 service 色板（配 `DEFAULT_DARK_THEME` / `spanColorMode="service"`）。
 *
 * 亮色那 8 个色是照着白底挑的（其中 `#4d7c0f`、`#7c3aed` 在深底上只有 3.3–3.8:1，偏暗），
 * 所以深色另给一套：清一色的高亮度色，相对 `#0b1220` 全部 ≥ 6.9:1，同样**不含红**
 * （红留给 error：深色下 error 是 `#f87171`）。色相也尽量拉开，避免同一屏里几个 service 看着像一家。
 */
export const SERVICE_PALETTE_DARK = [
  '#60a5fa',
  '#2dd4bf',
  '#a78bfa',
  '#22d3ee',
  '#fbbf24',
  '#a3e635',
  '#f0abfc',
  '#94a3b8',
] as const

export type SpanColorMode = 'service' | 'duration'

function hashIndex(serviceName: string, paletteSize: number): number {
  let hash = 0
  for (let i = 0; i < serviceName.length; i++) {
    hash = (hash * 31 + serviceName.charCodeAt(i)) % 100_000
  }
  return hash % paletteSize
}

/**
 * 按 service 分配颜色。
 *
 * 只用哈希的话 8 色板下 3 个 service 就撞色的概率约 1/3（order-service 和 payment-service
 * 第一次截图就撞了，两条绿得一模一样）。所以：**哈希定序 + 同一条 trace 内线性探测去重**，
 * 既保持「同一 service 颜色稳定」，又保证同一屏里不会有两个 service 同色。
 */
export function buildServiceColors(
  trace: TraceData,
  palette: readonly string[] = SERVICE_PALETTE,
): ReadonlyMap<string, string> {
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted 需要 ES2023，产物目标是 es2020
  const names = [...new Set(trace.spans.map((span) => span.serviceName))].sort()
  const used = new Set<number>()
  const colors = new Map<string, string>()
  for (const name of names) {
    let index = hashIndex(name, palette.length)
    for (let guard = 0; guard < palette.length && used.has(index); guard++) {
      index = (index + 1) % palette.length
    }
    used.add(index)
    colors.set(name, palette[index]!)
  }
  return colors
}

/**
 * 单个 service 的颜色，适合没有 trace 上下文的场合。
 *
 * 色板走 options 对象而不是第二个位置参数：`names.map(serviceColor)` 这种写法会把数组下标
 * 当成色板传进来，位置参数下是静默取到 `undefined`，options 对象下则自然回退到默认色板。
 */
export function serviceColor(
  serviceName: string,
  options: { palette?: readonly string[] } = {},
): string {
  const palette = options.palette ?? SERVICE_PALETTE
  return palette[hashIndex(serviceName, palette.length)]!
}

/** 时长分位 → 颜色。冷（短）到暖（长），终点停在天蓝~琥珀之间，同样避开纯红。 */
export function durationColor(percentile: number): string {
  const p = Math.min(Math.max(percentile, 0), 1)
  return `hsl(${215 - 175 * p} 68% 46%)`
}

export function spanBarColor(
  span: SpanData,
  serviceColors: ReadonlyMap<string, string>,
  durations: Float64Array,
  mode: SpanColorMode,
  theme: { errorBar: string },
): string {
  if (span.status.code === 'error') return theme.errorBar
  if (mode === 'duration') return durationColor(durationPercentile(durations, span.durationUs))
  return serviceColors.get(span.serviceName) ?? serviceColor(span.serviceName)
}
