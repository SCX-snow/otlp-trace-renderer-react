import { describe, expect, it } from 'vitest'
import {
  MIN_SPAN_US,
  clampViewport,
  fitViewport,
  maxSpanUs,
  panByPx,
  revealRange,
  toT,
  toX,
  zoomAt,
} from '../src/headless/layout/viewport'
import { makeRandom } from './helpers/trace-factory'

const D = 1_000_000
const W = 1000

describe('toX / toT', () => {
  it('互为逆变换', () => {
    const viewport = { startUs: 123, spanUs: 4567 }
    for (const x of [0, 1, 250.5, 999, 1000]) {
      expect(toX(toT(x, viewport, W), viewport, W)).toBeCloseTo(x, 9)
    }
  })

  it('宽度为 0 不产生 NaN', () => {
    expect(toT(10, { startUs: 5, spanUs: 10 }, 0)).toBe(5)
  })
})

describe('clampViewport', () => {
  it('spanUs 夹到 [1µs, 105% 总时长]', () => {
    expect(clampViewport({ startUs: 0, spanUs: 1e12 }, D).spanUs).toBe(maxSpanUs(D))
    expect(clampViewport({ startUs: 0, spanUs: 0.0001 }, D).spanUs).toBe(MIN_SPAN_US)
    expect(clampViewport({ startUs: 0, spanUs: 1e12 }, D).spanUs).toBe(D * 1.05)
  })

  it('startUs 夹到 [0, duration*1.02 - spanUs]', () => {
    const wide = clampViewport({ startUs: 500, spanUs: D * 1.02 }, D)
    expect(wide.startUs).toBe(0)
    expect(clampViewport({ startUs: -999, spanUs: 1000 }, D).startUs).toBe(0)
    expect(clampViewport({ startUs: 1e9, spanUs: 1000 }, D).startUs).toBe(D * 1.02 - 1000)
  })

  it('NaN / Infinity 被夹回合法值而不是传染下去', () => {
    expect(clampViewport({ startUs: Number.NaN, spanUs: 100 }, D)).toEqual({
      startUs: 0,
      spanUs: 100,
    })
    expect(clampViewport({ startUs: 0, spanUs: Number.POSITIVE_INFINITY }, D).spanUs).toBe(
      maxSpanUs(D),
    )
  })

  it('值没变时返回原对象引用', () => {
    const viewport = { startUs: 0, spanUs: D * 1.02 }
    expect(clampViewport(viewport, D)).toBe(viewport)
  })
})

describe('fitViewport', () => {
  it('整条 trace 铺满并留 2% 余量', () => {
    expect(fitViewport(D)).toEqual({ startUs: 0, spanUs: D * 1.02 })
  })

  it('零长度 trace（单 span / 空 trace）退回默认 1ms 窗口，不会缩成 1µs', () => {
    expect(fitViewport(0)).toEqual({ startUs: 0, spanUs: 1000 })
  })
})

describe('zoomAt', () => {
  it('锚点处的时间在缩放前后完全不变（窗口没顶到边界时）', () => {
    const viewport = { startUs: 400_000, spanUs: 100_000 }
    for (const anchor of [0, 123.4, 500, 999.9, 1000]) {
      for (const factor of [1.2, 1.5, 4]) {
        const next = zoomAt(viewport, anchor, factor, W, D)
        expect(next.startUs).toBeGreaterThan(0)
        expect(next.startUs + next.spanUs).toBeLessThan(D * 1.02)
        expect(toT(anchor, next, W)).toBeCloseTo(toT(anchor, viewport, W), 6)
      }
    }
  })

  it('窗口顶到边界时锚点不变量让位于边界，不会把窗口推到 trace 外面', () => {
    const next = zoomAt({ startUs: 100, spanUs: 1000 }, 1000, 0.1, W, D)
    expect(next.startUs).toBe(0)
  })

  it('放大 = factor > 1（spanUs 变小）', () => {
    expect(zoomAt({ startUs: 0, spanUs: 1000 }, 500, 2, W, D).spanUs).toBe(500)
  })

  it('到达缩放上下限后再缩放返回原引用', () => {
    const maxed = clampViewport({ startUs: 0, spanUs: 1e12 }, D)
    expect(zoomAt(maxed, 500, 0.5, W, D)).toBe(maxed)

    const minned = clampViewport({ startUs: 0, spanUs: 0.0001 }, D)
    expect(zoomAt(minned, 500, 2, W, D)).toBe(minned)
  })

  it('非法 factor / width 直接返回原引用', () => {
    const viewport = { startUs: 0, spanUs: 1000 }
    expect(zoomAt(viewport, 500, 0, W, D)).toBe(viewport)
    expect(zoomAt(viewport, 500, Number.NaN, W, D)).toBe(viewport)
    expect(zoomAt(viewport, 500, 2, 0, D)).toBe(viewport)
  })
})

describe('panByPx', () => {
  it('向右拖 dxPx 让时间窗口左移', () => {
    expect(panByPx({ startUs: 100_000, spanUs: 1000 }, 100, W, D).startUs).toBe(99_900)
  })

  it('拖到边界就停住，不做橡皮筋', () => {
    const maxed = clampViewport({ startUs: 0, spanUs: 1e12 }, D)
    expect(panByPx(maxed, 50, W, D)).toBe(maxed)
    expect(panByPx(maxed, -50, W, D)).toBe(maxed)

    const atLeft = { startUs: 0, spanUs: 1000 }
    expect(panByPx(atLeft, 10, W, D)).toBe(atLeft)
  })
})

describe('revealRange', () => {
  it('已经在视野里（含 10% 余量）就返回原引用', () => {
    const viewport = { startUs: 0, spanUs: 10_000 }
    expect(revealRange(viewport, 1000, 2000, D)).toBe(viewport)
  })

  it('在视野外时把区间完整摆进来', () => {
    const next = revealRange({ startUs: 0, spanUs: 10_000 }, 500_000, 600_000, D)
    expect(next.startUs).toBeLessThanOrEqual(500_000)
    expect(next.startUs + next.spanUs).toBeGreaterThanOrEqual(600_000)
  })

  it('零长度 span 也不会退化成 0 宽度窗口', () => {
    const next = revealRange({ startUs: 0, spanUs: 10_000 }, 900_000, 900_000, D)
    expect(next.spanUs).toBeGreaterThan(0)
  })
})

describe('属性测试：随机操作 5000 次始终落在合法区间', () => {
  it('不变量恒成立', () => {
    const random = makeRandom(7)
    let viewport = fitViewport(D)
    for (let i = 0; i < 5000; i++) {
      viewport =
        random() < 0.5
          ? zoomAt(viewport, random() * W, 0.2 + random() * 4, W, D)
          : panByPx(viewport, (random() - 0.5) * 2000, W, D)

      const max = maxSpanUs(D)
      expect(viewport.spanUs).toBeGreaterThanOrEqual(MIN_SPAN_US)
      expect(viewport.spanUs).toBeLessThanOrEqual(max)
      expect(viewport.startUs).toBeGreaterThanOrEqual(0)
      expect(viewport.startUs).toBeLessThanOrEqual(Math.max(0, D * 1.02 - viewport.spanUs) + 1e-6)
    }
  })
})
