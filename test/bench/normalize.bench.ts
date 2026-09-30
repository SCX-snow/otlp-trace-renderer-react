import { Bench } from 'tinybench'
import { describe, expect, it } from 'vitest'
import { normalizeTrace } from '../../src/headless/model/normalize'
import type { RawSpan } from '../../src/headless/model/types'
import { shuffle } from '../helpers/trace-factory'

const BASE = 1_700_000_000_000_000_000n
const at = (ns: number) => (BASE + BigInt(ns)).toString()
const id = (i: number) => `s${String(i).padStart(6, '0')}`

function build(withSelfCycles: boolean): RawSpan[] {
  const spans: RawSpan[] = []
  for (let i = 0; i < 5000; i++) {
    const start = (i % 500) * 1_000_000
    const parentIndex = i === 0 ? null : Math.floor(i / 2)
    spans.push({
      spanId: id(i),

      parentSpanId:
        parentIndex === null ? null : id(withSelfCycles && i % 7 === 0 ? i : parentIndex),
      name: `op-${i}`,
      kind: 'internal',
      startTimeUnixNano: at(start),
      endTimeUnixNano: at(start + 500_000),
      attributes: { 'span.index': i },
      events: [],
      links: [],
      status: { code: 'unset' },
      resourceIndex: 0,
    })
  }
  return spans
}

const resources = [{ attributes: { 'service.name': 'svc' }, serviceName: 'svc' }]
const wellFormed = build(false)
const messy = shuffle(build(true))

describe('normalizeTrace · 5k span', () => {
  it('基线', async () => {
    const bench = new Bench({ time: 500, warmupIterations: 5 })
    bench
      .add('规整输入', () => {
        normalizeTrace({ traceId: 'ab'.repeat(16), spans: wellFormed, resources })
      })
      .add('乱序 + 自环', () => {
        normalizeTrace({ traceId: 'ab'.repeat(16), spans: messy, resources })
      })

    await bench.run()
    console.table(bench.table())

    expect(bench.tasks).toHaveLength(2)
    expect(bench.tasks.every((task) => task.result.state === 'completed')).toBe(true)
  })
})
