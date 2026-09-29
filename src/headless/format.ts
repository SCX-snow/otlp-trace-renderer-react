const formatterCache = new Map<string, Intl.NumberFormat | null>()

/**
 * Intl 构造器不便宜，按 (locale, 最多小数位) 缓存复用。
 *
 * 非法 locale tag 会让构造器抛 RangeError —— 这里吃掉并退回 toFixed，
 * 免得使用者的 locale 字符串写错就把整个时间轴搞崩。
 */
function numberFormatter(locale: string, maxDecimals: number): Intl.NumberFormat | null {
  const key = `${locale}|${maxDecimals}`
  const cached = formatterCache.get(key)
  if (cached !== undefined) return cached
  let formatter: Intl.NumberFormat | null
  try {
    // minimumFractionDigits 留 0：Intl 自己会把末尾的 0 去掉（1.5s 而不是 1.50s）
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

/**
 * 保留 3 位有效数字需要几位小数。按**显示单位后的量级**算 ——
 * 早先按微秒量级算，导致 1_500_000µs 显示成 "2s"。
 */
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

/**
 * 时长格式化：最多 3 位有效数字、去掉末尾的 0。传 locale 时数字部分走 Intl
 * （小数点符号随语言变），单位后缀保持 µs/ms/s —— 这几个是技术量纲，翻译了反而难认。
 */
export function formatDurationUs(us: number, locale?: string): string {
  const abs = Math.abs(us)
  if (abs >= 1_000_000) return `${fixed(us / 1_000_000, decimalsFor(us / 1_000_000), locale)}s`
  if (abs >= 1000) return `${fixed(us / 1000, decimalsFor(us / 1000), locale)}ms`
  return `${fixed(us, decimalsFor(us), locale)}µs`
}

/** 相对某个基准纳秒串的绝对时刻，ISO 8601（和日志对时间时最好用） */
export function absoluteTime(startTimeUnixNano: string, offsetUs: number): Date | null {
  try {
    return new Date(
      Number((BigInt(startTimeUnixNano) + BigInt(Math.round(offsetUs)) * 1000n) / 1_000_000n),
    )
  } catch {
    return null
  }
}
