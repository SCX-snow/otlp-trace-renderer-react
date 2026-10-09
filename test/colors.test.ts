import { describe, expect, it } from 'vitest'
import { durationPercentile } from '../src/headless/interaction/selectors'
import { DEFAULT_THEME } from '../src/headless/theme/tokens'
import {
  SERVICE_PALETTE,
  buildServiceColors,
  durationColor,
  serviceColor,
  spanBarColor,
} from '../src/render/colors'
import { hueOf, inRedBand } from './helpers/color'
import { multiServiceTrace, rawSpan, toTraceData } from './helpers/trace-factory'

const hueFromHsl = (color: string) => Number(/hsl\(([-\d.]+)/.exec(color)![1])

describe('durationPercentile', () => {
  it('正好等于某个时长时按「≤ 已计入」算（回归：边界用 < 会让分位整体偏小）', () => {
    const sorted = Float64Array.from([1, 50, 1000])
    expect(durationPercentile(sorted, 0)).toBe(0)
    expect(durationPercentile(sorted, 1)).toBeCloseTo(1 / 3, 6)
    expect(durationPercentile(sorted, 50)).toBeCloseTo(2 / 3, 6)
    expect(durationPercentile(sorted, 1000)).toBe(1)
    expect(durationPercentile(sorted, 5000)).toBe(1)
  })

  it('空数组返回 0，不产生 NaN', () => {
    expect(durationPercentile(new Float64Array(), 42)).toBe(0)
  })
})

describe('serviceColor', () => {
  it('同一个 service 永远同一个颜色', () => {
    expect(serviceColor('order-service')).toBe(serviceColor('order-service'))
  })

  it('不同 service 大概率不同色（至少不是全部撞一起）', () => {
    const names = ['api-gateway', 'order-service', 'payment-service', 'user-service', 'search']
    expect(new Set(names.map((name) => serviceColor(name))).size).toBeGreaterThan(2)
  })

  it('色板里没有红：红是 error 的专用色', () => {
    for (const color of SERVICE_PALETTE) {
      expect(inRedBand(hueOf(color))).toBe(false)
    }
    expect(inRedBand(hueOf(DEFAULT_THEME.errorBar))).toBe(true)
  })

  it('实例色不会掉进红区（回归：曾经用 HSL 黄金角轮转，第一个色相就是红）', () => {
    for (let i = 0; i < 200; i++) {
      const color = serviceColor(`svc-${i}`)
      expect(inRedBand(hueOf(color))).toBe(false)
    }
  })
})

describe('durationColor', () => {
  it('分位越界会被夹住', () => {
    expect(durationColor(-1)).toBe(durationColor(0))
    expect(durationColor(2)).toBe(durationColor(1))
  })

  it('整条色带都避开红区', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      expect(durationColor(p)).toMatch(/^hsl\(/)
      expect(inRedBand(hueFromHsl(durationColor(p)))).toBe(false)
    }
  })
})

describe('spanBarColor', () => {
  const trace = toTraceData([rawSpan('root', 0, 100, null)])
  const colors = buildServiceColors(trace)

  it('error span 用 error 色，与配色模式无关', () => {
    const span = { ...trace.spans[0]!, status: { code: 'error' as const } }
    expect(spanBarColor(span, colors, new Float64Array([1]), 'service', DEFAULT_THEME)).toBe(
      DEFAULT_THEME.errorBar,
    )
    expect(spanBarColor(span, colors, new Float64Array([1]), 'duration', DEFAULT_THEME)).toBe(
      DEFAULT_THEME.errorBar,
    )
  })

  it('service 模式按 serviceName 取色', () => {
    expect(
      spanBarColor(trace.spans[0]!, colors, new Float64Array([1]), 'service', DEFAULT_THEME),
    ).toBe(serviceColor(trace.spans[0]!.serviceName))
  })

  it('duration 模式按分位取色：100µs 在 [1, 50, 1000] 里排到 2/3', () => {
    const durations = new Float64Array([1, 50, 1000])
    expect(spanBarColor(trace.spans[0]!, colors, durations, 'duration', DEFAULT_THEME)).toBe(
      durationColor(2 / 3),
    )
    expect(spanBarColor(trace.spans[0]!, colors, durations, 'duration', DEFAULT_THEME)).not.toBe(
      durationColor(0),
    )
  })
})

describe('buildServiceColors', () => {
  it('同一条 trace 内不会有两个 service 撞色（回归：order-service 和 payment-service 曾经同绿）', () => {
    const trace = multiServiceTrace(['api-gateway', 'order-service', 'payment-service'])
    const colors = buildServiceColors(trace)
    expect(new Set(colors.values()).size).toBe(colors.size)
    expect(colors.get('order-service')).not.toBe(colors.get('payment-service'))
  })

  it('5 个 service 也不撞', () => {
    const colors = buildServiceColors(multiServiceTrace(['a', 'b', 'c', 'd', 'e']))
    expect(new Set(colors.values()).size).toBe(5)
  })

  it('超过色板容量时只能复用，但不会崩', () => {
    const names = Array.from({ length: 12 }, (_, i) => `svc-${i}`)
    const colors = buildServiceColors(multiServiceTrace(names))
    expect(colors.size).toBe(12)
    expect(new Set(colors.values()).size).toBe(SERVICE_PALETTE.length)
  })

  it('同一个 service 在任何 trace 里颜色一致', () => {
    const a = buildServiceColors(multiServiceTrace(['x', 'y'])).get('y')
    const b = buildServiceColors(multiServiceTrace(['y', 'z'])).get('y')
    expect(a).toBe(b)
  })
})
