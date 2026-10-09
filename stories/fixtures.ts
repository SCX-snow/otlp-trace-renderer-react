import { normalizeTrace } from '../src/headless/model/normalize'
import type { RawSpan, TraceData } from '../src/headless/model/types'

const BASE_NS = 1_700_000_000_000_000_000n
const ns = (us: number) => (BASE_NS + BigInt(us) * 1000n).toString()
const pad = (i: number, width = 6) => `s${String(i).padStart(width, '0')}`

const SERVICES = ['api-gateway', 'order-service', 'payment-service', 'search', 'inventory']

function resources(names: string[]) {
  return names.map((serviceName) => ({
    attributes: { 'service.name': serviceName },
    serviceName,
  }))
}

export function syntheticTrace(count: number): TraceData {
  const spans: RawSpan[] = []
  for (let i = 0; i < count; i++) {
    const startUs = i * 20
    const durationUs = 5 + ((i * 37) % 90)
    spans.push({
      spanId: pad(i),
      parentSpanId: i === 0 ? null : pad(Math.floor((i - 1) / 2)),
      name: `op-${i}`,
      kind: 'internal',
      startTimeUnixNano: ns(startUs),
      endTimeUnixNano: ns(startUs + durationUs),
      attributes: { 'span.index': i },
      events: [],
      links: [],
      status: { code: i % 97 === 0 ? 'error' : 'unset' },
      resourceIndex: i % SERVICES.length,
    })
  }
  return normalizeTrace({ traceId: 'ab'.repeat(16), spans, resources: resources(SERVICES) })
}

export function realisticTrace(): TraceData {
  const spec: [number, number | null, string, string, number, number, 'unset' | 'error'][] = [
    [0, null, 'api-gateway', 'GET /api/orders', 0, 320, 'unset'],
    [1, 0, 'order-service', 'OrderService.listOrders', 5, 300, 'unset'],
    [2, 1, 'order-service', 'SELECT orders', 20, 75, 'unset'],
    [3, 1, 'order-service', 'SELECT order_items', 76, 110, 'unset'],
    [4, 1, 'payment-service', 'POST /charge', 115, 270, 'unset'],
    [5, 4, 'payment-service', 'stripe.charge', 150, 250, 'error'],
    [6, 4, 'payment-service', 'SELECT payment_methods', 120, 145, 'unset'],
    [7, 1, 'order-service', 'serialize response', 280, 296, 'unset'],
  ]
  const spans: RawSpan[] = spec.map(([index, parent, service, name, startUs, endUs, status]) => ({
    spanId: pad(index),
    parentSpanId: parent === null ? null : pad(parent),
    name,
    kind: 'internal',
    startTimeUnixNano: ns(startUs),
    endTimeUnixNano: ns(endUs),
    attributes: { 'service.name': service },
    events: [],
    links: [],
    status: { code: status },
    resourceIndex: SERVICES.indexOf(service),
  }))
  return normalizeTrace({
    traceId: '5b8efff798038103d269b633813fc60c',
    spans,
    resources: resources(SERVICES),
  })
}

export const emptyTrace = (): TraceData =>
  normalizeTrace({ traceId: 'ab'.repeat(16), spans: [], resources: resources(SERVICES) })

export const singleSpanTrace = (): TraceData => {
  const spans: RawSpan[] = [
    {
      spanId: pad(0),
      parentSpanId: null,
      name: 'single instantaneous span',
      kind: 'internal',
      startTimeUnixNano: ns(0),
      endTimeUnixNano: ns(0),
      attributes: {},
      events: [],
      links: [],
      status: { code: 'unset' },
      resourceIndex: 0,
    },
  ]
  return normalizeTrace({ traceId: 'ab'.repeat(16), spans, resources: resources(SERVICES) })
}
