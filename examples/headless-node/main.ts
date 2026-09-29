/**
 * headless 层的用法：不装 React、不过打包器，Node 直接跑。
 * `pnpm example:headless`（会先 build 出 dist）
 */
import { readFileSync } from 'node:fs'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import {
  DEFAULT_METRICS,
  fitViewport,
  flattenRows,
  hitTest,
  initViewState,
  panByPx,
  traceReducer,
  zoomAt,
} from '@slcomplex/otlp-trace-renderer/headless'

const raw = JSON.parse(
  readFileSync(new URL('../react-vite/src/trace.json', import.meta.url), 'utf8'),
) as unknown

const trace = normalizeOtlpTrace(raw)

console.log(
  `trace ${trace.traceId} · ${trace.spans.length} spans · ${trace.durationUs}µs · ` +
    `${trace.resources.length} services · warnings=[${trace.warnings.map((w) => w.code).join(', ')}]`,
)

console.table(
  trace.spans.map((span, index) => ({
    index,
    service: span.serviceName,
    name: span.name,
    startUs: span.startUs,
    durationUs: span.durationUs,
    children: trace.children[index]!.length,
    status: span.status.code,
  })),
)

const rows = flattenRows(trace, new Set())
console.log(`\nflattenRows → ${rows.length} 行，前 6 行：`, rows.slice(0, 6))

const viewport = fitViewport(trace.durationUs)
console.log('\nfitViewport      ', viewport)
console.log('zoomAt(×2)       ', zoomAt(viewport, 400, 2, 800, trace.durationUs))
console.log('panByPx(+100)    ', panByPx(viewport, 100, 800, trace.durationUs))

const firstRowY = DEFAULT_METRICS.rulerHeight + DEFAULT_METRICS.paddingTop + 4
console.log(
  '\nhitTest(第一行长条上) ',
  // 最后一个参数是 scrollTop：y 是视口坐标，没滚动就是 0
  hitTest({ x: 20, y: firstRowY }, rows, trace, viewport, DEFAULT_METRICS, 800, 0),
)

const state = initViewState(trace)
const [collapsed] = traceReducer(state, { type: 'collapseAll' }, { trace, width: 800 })
console.log(
  `\ncollapseAll → collapsed=${collapsed.collapsed.size} 个节点，` +
    `flattenRows 后剩 ${flattenRows(trace, collapsed.collapsed).length} 行`,
)
