import { describe, expect, it } from 'vitest'
import { normalizeTrace } from '../src/headless/model/normalize'
import type { NormalizeWarning, RawSpan, RawTrace } from '../src/headless/model/types'

const BASE = 1_700_000_000_000_000_000n
const at = (offsetNs: bigint | number) => (BASE + BigInt(offsetNs)).toString()

function span(
  spanId: string,
  startOffsetNs: bigint | number,
  endOffsetNs: bigint | number,
  rest: Partial<RawSpan> = {},
): RawSpan {
  return {
    spanId,
    parentSpanId: null,
    name: `span ${spanId}`,
    kind: 'internal',
    startTimeUnixNano: at(startOffsetNs),
    endTimeUnixNano: at(endOffsetNs),
    attributes: {},
    events: [],
    links: [],
    status: { code: 'unset' },
    resourceIndex: 0,
    ...rest,
  }
}

const RESOURCES = [{ attributes: { 'service.name': 'svc' }, serviceName: 'svc' }]

function traceOf(spans: RawSpan[], resources = RESOURCES): RawTrace {
  return { traceId: 'ab'.repeat(16), spans, resources }
}

const codes = (warnings: NormalizeWarning[]) => warnings.map((w) => w.code)

const startUsOf = (offsetNs: number) => {
  const trace = normalizeTrace(traceOf([span('a', 0n, 1n), span('b', offsetNs, offsetNs + 1)]))
  return trace.spans[1]!.startUs
}

const spanIdOf = (i: number) => `s${String(i).padStart(6, '0')}`

describe('nanos → µs 精度', () => {
  it('1ns 的差距不会被抬成 1µs', () => {
    const trace = normalizeTrace(traceOf([span('a', 0n, 1_000_000n), span('b', 1n, 2n)]))
    expect(trace.spans[0]!.startUs).toBe(0)
    expect(trace.spans[1]!.startUs).toBe(0)
  })

  it('取整稳定，不随绝对时间戳的量级漂移', () => {
    expect(startUsOf(499)).toBe(0)
    expect(startUsOf(500)).toBe(1)
    expect(startUsOf(999)).toBe(1)
    expect(startUsOf(1001)).toBe(1)
    expect(startUsOf(1499)).toBe(1)
    expect(startUsOf(1500)).toBe(2)
    expect(startUsOf(1_700_000_000_123)).toBe(1_700_000_000)
  })

  it('基点是所有 span 里最早的 start，不是第一条', () => {
    const trace = normalizeTrace(
      traceOf([span('late', 5_000_000n, 6_000_000n), span('early', 0n, 1_000_000n)]),
    )
    expect(trace.startTimeUnixNano).toBe(BASE.toString())
    expect(trace.spans[0]!.spanId).toBe('early')
    expect(trace.spans[0]!.startUs).toBe(0)
    expect(trace.spans[1]!.startUs).toBe(5_000)
  })
})

describe('树结构', () => {
  const spans = [
    span('root', 0n, 1_000_000_000n),
    span('c1', 100_000_000n, 200_000_000n, { parentSpanId: 'root' }),
    span('c2', 300_000_000n, 400_000_000n, { parentSpanId: 'root' }),
    span('g1', 150_000_000n, 180_000_000n, { parentSpanId: 'c1' }),
  ]
  const trace = normalizeTrace(traceOf(spans))

  it('扁平数组按 startUs 全局升序', () => {
    expect(trace.spans.map((s) => s.spanId)).toEqual(['root', 'c1', 'g1', 'c2'])
  })

  it('children 用排序后的下标，且已按 startUs 升序', () => {
    const rootIdx = trace.index.get('root')!
    expect(trace.children[rootIdx]).toEqual([trace.index.get('c1'), trace.index.get('c2')])
    expect(trace.roots).toEqual([rootIdx])
  })

  it('index 反查一致', () => {
    trace.spans.forEach((s, i) => expect(trace.index.get(s.spanId)).toBe(i))
  })

  it('durationUs 取最晚的 endUs', () => {
    expect(trace.durationUs).toBe(1_000_000)
  })

  it('子区间始终落在父区间内（这是 µs 取整不能破坏的不变式）', () => {
    for (let i = 0; i < trace.spans.length; i++) {
      const owner = trace.spans[trace.index.get(trace.spans[i]!.parentSpanId ?? '') ?? -1]
      if (!owner) continue
      expect(trace.spans[i]!.startUs).toBeGreaterThanOrEqual(owner.startUs)
      expect(trace.spans[i]!.endUs).toBeLessThanOrEqual(owner.endUs)
    }
    expect(trace.warnings).toEqual([])
  })

  it('serviceName 从 resource 提升到 span 上', () => {
    expect(trace.spans.every((s) => s.serviceName === 'svc')).toBe(true)
  })
})

describe('畸形数据：报 warning，不改坏数据结构', () => {
  it('end < start → 时长归零', () => {
    const trace = normalizeTrace(traceOf([span('bad', 5_000_000n, 4_000_000n)]))
    expect(trace.spans[0]!.durationUs).toBe(0)
    expect(codes(trace.warnings)).toEqual(['negative-duration'])
  })

  it('父不存在 → 提升为根并记 warning', () => {
    const trace = normalizeTrace(traceOf([span('orphan', 0n, 1_000n, { parentSpanId: 'nope' })]))
    expect(trace.roots).toEqual([0])
    expect(trace.spans[0]!.parentSpanId).toBe('nope')
    expect(codes(trace.warnings)).toEqual(['parent-not-found'])
  })

  it('父子成环 → 断环、提升为根、不死循环', () => {
    const trace = normalizeTrace(
      traceOf([
        span('a', 0n, 1_000n, { parentSpanId: 'b' }),
        span('b', 10n, 2_000n, { parentSpanId: 'a' }),
      ]),
    )
    expect(trace.roots).toHaveLength(2)
    expect(codes(trace.warnings)).toEqual(['cycle'])
    expect(trace.children[0]).toEqual([])
    expect(trace.children[1]).toEqual([])
  })

  it('自己是自己的父 → 按根处理', () => {
    const trace = normalizeTrace(traceOf([span('self', 0n, 1_000n, { parentSpanId: 'self' })]))
    expect(trace.roots).toEqual([0])
    expect(codes(trace.warnings)).toEqual(['cycle'])
  })

  it('重复 spanId → 只留第一条', () => {
    const trace = normalizeTrace(
      traceOf([
        span('dup', 0n, 1_000n, { name: 'first' }),
        span('dup', 2_000n, 3_000n, { name: 'second' }),
      ]),
    )
    expect(trace.spans).toHaveLength(1)
    expect(trace.spans[0]!.name).toBe('first')
    expect(codes(trace.warnings)).toEqual(['duplicate-span-id'])
  })

  it('空 trace → empty-trace 且结构完整', () => {
    const trace = normalizeTrace(traceOf([]))
    expect(trace.spans).toEqual([])
    expect(trace.durationUs).toBe(0)
    expect(trace.index.size).toBe(0)
    expect(codes(trace.warnings)).toEqual(['empty-trace'])
  })

  it('子 span 落在父区间外 → clock-skew，但数据不动', () => {
    const trace = normalizeTrace(
      traceOf([
        span('parent', 100_000_000n, 1_100_000_000n),
        span('child', 0n, 50_000_000n, { parentSpanId: 'parent' }),
      ]),
    )
    const child = trace.spans[trace.index.get('child')!]!
    expect(child.startUs).toBe(0)
    expect(codes(trace.warnings)).toEqual(['clock-skew'])
  })

  it('非整数时间戳 → bad-timestamp，按 0 处理', () => {
    const trace = normalizeTrace(
      traceOf([span('weird', 0n, 1_000n, { startTimeUnixNano: 'not-a-number' })]),
    )
    expect(trace.spans[0]!.startUs).toBe(0)
    expect(codes(trace.warnings)).toEqual(['bad-timestamp'])
  })
})

describe('规模', () => {
  it('5k span 能跑完且结构正确（宽松阈值防回归，真实基线在 bench 里）', () => {
    const spans: RawSpan[] = []
    for (let i = 0; i < 5000; i++) {
      const start = (i % 500) * 1_000_000
      spans.push(
        span(spanIdOf(i), start, start + 500_000, {
          parentSpanId: i === 0 ? null : spanIdOf(Math.floor(i / 2)),
        }),
      )
    }
    const t0 = performance.now()
    const trace = normalizeTrace(traceOf(spans))
    const elapsed = performance.now() - t0
    expect(trace.spans).toHaveLength(5000)
    expect(trace.roots).toHaveLength(1)
    expect(elapsed).toBeLessThan(200)
  })
})
