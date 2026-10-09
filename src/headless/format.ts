const formatterCache = new Map<string, Intl.NumberFormat | null>()

function numberFormatter(locale: string, maxDecimals: number): Intl.NumberFormat | null {
  const key = `${locale}|${maxDecimals}`
  const cached = formatterCache.get(key)
  if (cached !== undefined) return cached
  let formatter: Intl.NumberFormat | null
  try {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    })
  } catch {
    formatter = null
  }
  formatterCache.set(key, formatter)
  return formatter
}

function decimalsFor(value: number, significantDigits = 3): number {
  const magnitude = Math.abs(value)
  if (magnitude === 0) return 0
  const decimals = significantDigits - 1 - Math.floor(Math.log10(magnitude))
  return Math.max(0, Math.min(decimals, 6))
}

function trimTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

function fixed(value: number, decimals: number, locale?: string): string {
  const formatter = locale === undefined ? null : numberFormatter(locale, decimals)
  if (formatter !== null) return formatter.format(value)
  return trimTrailingZeros(value.toFixed(decimals))
}

export function formatDurationUs(us: number, locale?: string): string {
  const abs = Math.abs(us)
  if (abs >= 1_000_000) return `${fixed(us / 1_000_000, decimalsFor(us / 1_000_000), locale)}s`
  if (abs >= 1000) return `${fixed(us / 1000, decimalsFor(us / 1000), locale)}ms`
  return `${fixed(us, decimalsFor(us), locale)}µs`
}

export function absoluteTime(startTimeUnixNano: string, offsetUs: number): Date | null {
  if (startTimeUnixNano.trim() === '') return null

  try {
    return new Date(
      Number((BigInt(startTimeUnixNano) + BigInt(Math.round(offsetUs)) * 1000n) / 1_000_000n),
    )
  } catch {
    return null
  }
}
