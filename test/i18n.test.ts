import { describe, expect, it } from 'vitest'
import {
  LOCALE_LABELS,
  MESSAGES,
  describeWarning,
  format,
  formatDurationUs,
  formatWarning,
  resolveLocale,
  resolveMessages,
  type Messages,
} from '../src/headless/index'
import type { NormalizeWarning } from '../src/headless/model/types'

const KEYS = Object.keys(MESSAGES.en) as (keyof Messages)[]
const PLACEHOLDER = /\{(\w+)\}/g
// eslint-disable-next-line unicorn/no-array-sort -- toSorted 需要 ES2023，产物目标是 es2020
const placeholders = (text: string) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).sort()

describe('resolveLocale', () => {
  it('内置语言与地区变体都能认', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('en-GB')).toBe('en')
    expect(resolveLocale('zh-CN')).toBe('zh-CN')
    expect(resolveLocale('zh-cn')).toBe('zh-CN')
    expect(resolveLocale('zh-Hans')).toBe('zh-CN')
    expect(resolveLocale('zh-TW')).toBe('zh-TW')
    expect(resolveLocale('zh-Hant-HK')).toBe('zh-TW')
    expect(resolveLocale('zh-MO')).toBe('zh-TW')
    expect(resolveLocale('ja')).toBe('ja')
    expect(resolveLocale('ja-JP')).toBe('ja')
  })

  it('不认识的语言回退英文，而不是崩', () => {
    expect(resolveLocale('ko')).toBe('en')
    expect(resolveLocale('de-DE')).toBe('en')
    expect(resolveLocale('not a locale')).toBe('en')
    expect(resolveLocale('')).not.toBe('')
  })

  it("'auto' / undefined 读 navigator（SSR 时退回 en）", () => {
    const detected = resolveLocale(undefined)
    expect(['en', 'zh-CN', 'zh-TW', 'ja']).toContain(detected)
    expect(resolveLocale('auto')).toBe(detected)
  })

  it('每种内置语言都有显示名', () => {
    for (const locale of Object.keys(MESSAGES)) {
      expect(LOCALE_LABELS[locale as keyof typeof LOCALE_LABELS]).toBeTruthy()
    }
  })
})

describe('字典完整性', () => {
  it('每种语言都没有空文案，也没有拿 key 当文案', () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      for (const key of KEYS) {
        const value = messages[key]
        expect(typeof value, `${locale}.${key}`).toBe('string')
        expect(value.trim(), `${locale}.${key} 是空的`).not.toBe('')
        expect(value, `${locale}.${key} 忘了翻译`).not.toBe(key)
      }
    }
  })

  it('各语言的占位符与英文完全一致（漏一个 {count} 界面上就少个数字）', () => {
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      for (const key of KEYS) {
        expect(placeholders(messages[key]), `${locale}.${key}`).toEqual(
          placeholders(MESSAGES.en[key]),
        )
      }
    }
  })

  it('非英文语言确实和英文不一样（防复制粘贴）', () => {
    for (const locale of ['zh-CN', 'zh-TW', 'ja'] as const) {
      const identical = KEYS.filter((key) => MESSAGES[locale][key] === MESSAGES.en[key])
      expect(identical, `${locale} 有一半以上没翻`).toHaveLength(0)
    }
  })
})

describe('resolveMessages', () => {
  it('按 locale 取内置字典', () => {
    expect(resolveMessages('ja').zoomIn).toBe('拡大')
    expect(resolveMessages('zh-TW').fit).toBe('符合視窗')
    // undefined → 读环境语言，不强假定是哪一种
    expect(resolveMessages(undefined)).toBe(MESSAGES[resolveLocale(undefined)])
  })

  it('overrides 只替换给到的 key', () => {
    const messages = resolveMessages('zh-CN', { zoomIn: '放大一点', copied: '好了' })
    expect(messages.zoomIn).toBe('放大一点')
    expect(messages.copied).toBe('好了')
    expect(messages.zoomOut).toBe(MESSAGES['zh-CN'].zoomOut)
  })

  it('不认识的语言 + 一整套自定义字典 = 加了一门新语言', () => {
    const korean = { ...MESSAGES.en, zoomIn: '확대', zoomOut: '축소', fit: '맞춤' }
    const messages = resolveMessages('ko', korean)
    expect(messages.zoomIn).toBe('확대')
    expect(messages.fit).toBe('맞춤')
  })

  it('不认识的语言 + 只给几条 = 其余回退英文（不会出现 undefined）', () => {
    const messages = resolveMessages('ko', { zoomIn: '확대' })
    expect(messages.zoomIn).toBe('확대')
    expect(messages.zoomOut).toBe(MESSAGES.en.zoomOut)
    for (const key of KEYS) expect(messages[key]).toBeTruthy()
  })

  it('不传 overrides 时直接复用内置对象（不额外分配）', () => {
    expect(resolveMessages('en')).toBe(MESSAGES.en)
  })
})

describe('format', () => {
  it('替换 {key}，缺参数就原样留着', () => {
    expect(format('{count} spans', { count: 12 })).toBe('12 spans')
    expect(format('{a}-{b}', { a: 'x' })).toBe('x-{b}')
    expect(format('no placeholder')).toBe('no placeholder')
  })
})

describe('formatWarning', () => {
  const cases: [NormalizeWarning, string][] = [
    [
      { code: 'parent-not-found', spanId: 'aa', parentSpanId: 'bb' },
      '父 span bb 不在本 trace 中，aa 按根处理',
    ],
    [{ code: 'empty-trace' }, 'trace 里没有 span'],
    [
      { code: 'cycle', spanId: 'aa', cycleLength: 3 },
      '从 aa 起有 3 个 span 构成父子环，已断开并提升为根',
    ],
    [{ code: 'duplicate-span-id', spanId: 'aa' }, '重复的 spanId aa，已丢弃后出现的那条'],
    [
      {
        code: 'clock-skew',
        spanId: 'aa',
        startUs: 1,
        endUs: 2,
        parentStartUs: 3,
        parentEndUs: 4,
      },
      'span aa（1~2µs）落在父区间（3~4µs）之外',
    ],
    [
      { code: 'bad-timestamp', spanId: 'aa', value: 'nope' },
      '不是整数纳秒时间戳：「nope」，按 0 处理',
    ],
    [
      { code: 'negative-duration', spanId: 'aa', startTimeUnixNano: '9', endTimeUnixNano: '1' },
      'end < start（9 → 1），时长归零',
    ],
    [
      { code: 'multiple-traces', traceCount: 2, chosenTraceId: 'cc', spanCount: 5 },
      '输入含 2 条 trace，只归一化了 cc（5 个 span）',
    ],
  ]

  it.each(cases)('$code 拼成中文句子', (warning, expected) => {
    expect(formatWarning(warning, MESSAGES['zh-CN'])).toBe(expected)
  })

  it('同一个 warning 在不同语言下都能拼出来', () => {
    const warning: NormalizeWarning = { code: 'cycle', spanId: 'aa', cycleLength: 2 }
    for (const [locale, messages] of Object.entries(MESSAGES)) {
      const text = formatWarning(warning, messages)
      expect(text, locale).toContain('aa')
      expect(text, locale).not.toContain('{')
    }
  })

  it('describeWarning 固定英文，给日志用', () => {
    expect(describeWarning({ code: 'empty-trace' })).toBe('the trace has no spans')
  })
})

describe('formatDurationUs', () => {
  it('最多 3 位有效数字，末尾的 0 去掉', () => {
    expect(formatDurationUs(250)).toBe('250µs')
    expect(formatDurationUs(1500)).toBe('1.5ms')
    expect(formatDurationUs(65536)).toBe('65.5ms')
    expect(formatDurationUs(1234)).toBe('1.23ms')
    expect(formatDurationUs(1000)).toBe('1ms')
    expect(formatDurationUs(0)).toBe('0µs')
  })

  it('秒级不会丢精度（回归：曾经把 1.5s 显示成 2s）', () => {
    expect(formatDurationUs(1_500_000)).toBe('1.5s')
    expect(formatDurationUs(1_050_000)).toBe('1.05s')
    expect(formatDurationUs(2_000_000)).toBe('2s')
  })

  it('传 locale 后小数分隔符跟着语言走', () => {
    expect(formatDurationUs(1500, 'en-US')).toBe('1.5ms')
    expect(formatDurationUs(1500, 'de-DE')).toBe('1,5ms')
  })

  it('非法 locale tag 退回 toFixed，不抛', () => {
    expect(formatDurationUs(1500, 'not a locale')).toBe('1.5ms')
  })

  it('内置语言不改变可读性', () => {
    expect(formatDurationUs(1500, 'zh-CN')).toBe('1.5ms')
    expect(formatDurationUs(1500, 'ja')).toBe('1.5ms')
  })
})
