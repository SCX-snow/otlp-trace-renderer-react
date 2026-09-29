import type { AttrValue } from '../headless/model/types'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function pick(o: Record<string, unknown>, camel: string, snake: string): unknown {
  return o[camel] !== undefined ? o[camel] : o[snake]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 纯 JS 的 base64 → hex，避免依赖 atob（老 node / 各种运行时都有坑） */
export function base64ToHex(input: string): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const ch of input) {
    if (ch === '=') break
    const idx = B64.indexOf(ch)
    if (idx === -1) continue
    value = (value << 6) | idx
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out += ((value >> bits) & 0xff).toString(16).padStart(2, '0')
    }
  }
  return out
}

/**
 * OTLP/JSON 里 intValue 是字符串（protojson 把 64 位整数编码成 string）。
 * 超出 Number.MAX_SAFE_INTEGER 时保留字符串 —— 属性保真优先于数值方便。
 */
function parseIntValue(raw: unknown): AttrValue {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) ? raw : String(raw)
  if (typeof raw !== 'string') return null
  const n = Number(raw)
  return Number.isSafeInteger(n) ? n : raw
}

/** OTLP AnyValue → 归一化属性值，兼容 camelCase 与 snake_case */
export function parseAnyValue(value: unknown): AttrValue {
  if (!isObj(value)) return null

  const str = pick(value, 'stringValue', 'string_value')
  if (typeof str === 'string') return str

  const bool = pick(value, 'boolValue', 'bool_value')
  if (typeof bool === 'boolean') return bool

  const int = pick(value, 'intValue', 'int_value')
  if (int !== undefined) return parseIntValue(int)

  const dbl = pick(value, 'doubleValue', 'double_value')
  if (typeof dbl === 'number') return dbl

  // bytesValue 保留 base64 原文，转成 Uint8Array 只会毁掉结构化克隆和可读性
  const bytes = pick(value, 'bytesValue', 'bytes_value')
  if (typeof bytes === 'string') return bytes

  const arr = pick(value, 'arrayValue', 'array_value')
  if (isObj(arr)) return asArray(arr['values']).map(parseAnyValue)

  const kvlist = pick(value, 'kvlistValue', 'kvlist_value')
  if (isObj(kvlist)) {
    const out: { [key: string]: AttrValue } = {}
    for (const kv of asArray(kvlist['values'])) {
      if (!isObj(kv) || typeof kv['key'] !== 'string') continue
      out[kv['key']] = parseAnyValue(kv['value'])
    }
    return out
  }

  return null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** OTLP 的 attributes 是 [{ key, value: AnyValue }]，拉平成普通对象 */
export function flattenAttributes(value: unknown): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {}
  for (const kv of asArray(value)) {
    if (!isObj(kv) || typeof kv['key'] !== 'string') continue
    out[kv['key']] = parseAnyValue(kv['value'])
  }
  return out
}
