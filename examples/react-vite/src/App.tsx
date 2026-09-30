import { type CSSProperties, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DARK_THEME,
  SERVICE_PALETTE,
  SERVICE_PALETTE_DARK,
  TraceDetailView,
  TraceToolbar,
  type TraceDetailViewApi,
} from '@slcomplex/otlp-trace-renderer'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import {
  LOCALE_LABELS,
  normalizeTrace,
  type Locale,
  type RawSpan,
  type SpanData,
  type TraceData,
} from '@slcomplex/otlp-trace-renderer/headless'
import rawOtlp from './trace.json'


const realTrace = normalizeOtlpTrace(rawOtlp)

const BASE_NS = 1_700_000_000_000_000_000n
const ns = (us: number) => (BASE_NS + BigInt(us) * 1000n).toString()
const pad = (i: number) => `s${String(i).padStart(6, '0')}`


function syntheticTrace(count: number): TraceData {
  const services = ['api-gateway', 'order-service', 'payment-service', 'search', 'inventory']
  const resources = services.map((serviceName) => ({
    attributes: { 'service.name': serviceName },
    serviceName,
  }))
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
      resourceIndex: i % services.length,
    })
  }
  return normalizeTrace({ traceId: 'ab'.repeat(16), spans, resources })
}

const DATASETS = [
  { label: '真实数据 (12)', build: () => realTrace },
  { label: '100', build: () => syntheticTrace(100) },
  { label: '5000', build: () => syntheticTrace(5000) },
]


const initialDataset = () => {
  const wanted = Number(new URLSearchParams(location.search).get('spans'))
  if (!Number.isFinite(wanted)) return 0
  const index = DATASETS.findIndex((item) => item.build().spans.length === wanted)
  return index === -1 ? 0 : index
}


const LOCALES = Object.keys(LOCALE_LABELS) as Locale[]

const switchButton = (active: boolean) => ({
  fontSize: 12,
  fontWeight: active ? 700 : 400,
  padding: '2px 10px',
  border: '1px solid var(--app-border)',
  borderRadius: 6,
  background: active ? 'var(--app-surface-strong)' : 'transparent',
  color: 'inherit',
  cursor: 'pointer',
})

const separator = { width: 1, background: 'var(--app-border)', margin: '0 4px' }





const slotButton: CSSProperties = {
  fontSize: 12,
  padding: '1px 8px',
  marginRight: 6,
  border: '1px solid var(--app-border)',
  borderRadius: 6,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
}

const slotLink: CSSProperties = { ...slotButton, display: 'inline-block', textDecoration: 'none' }

const slotHint: CSSProperties = { color: 'var(--otlp-trace-text-muted)', fontWeight: 400 }

const spanById = (trace: TraceData, spanId: string): SpanData | null => {
  const index = trace.index.get(spanId)
  return index === undefined ? null : (trace.spans[index] ?? null)
}

const childIdsOf = (trace: TraceData, spanId: string): string[] => {
  const index = trace.index.get(spanId)
  if (index === undefined) return []
  return (trace.children[index] ?? []).map((childIndex) => trace.spans[childIndex]!.spanId)
}


const detailActions = (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => {
  const parent = span.parentSpanId === null ? null : spanById(trace, span.parentSpanId)
  return (
    <>
      <button
        type="button"
        style={{ ...slotButton, opacity: parent === null ? 0.5 : 1 }}
        disabled={parent === null}
        title={parent === null ? '根 span 没有父节点' : `跳到 ${parent.name}`}
        onClick={() => parent !== null && api.focusSpan(parent.spanId)}
      >
        ↑ 父 span
      </button>
      <a
        style={slotLink}
        href={`https://jaeger.example.com/trace/${trace.traceId}?span=${span.spanId}`}
        target="_blank"
        rel="noreferrer"
      >
        在 Jaeger 打开
      </a>
    </>
  )
}


const detailExtra = (span: SpanData, trace: TraceData, api: TraceDetailViewApi) => {
  const childIds = childIdsOf(trace, span.spanId)
  return (
    <div style={{ marginTop: 10, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        子 span ({childIds.length}) <span style={slotHint}>· renderSpanDetailExtra 渲染</span>
      </div>
      {childIds.length === 0 ? (
        <span style={slotHint}>叶子节点，没有子 span</span>
      ) : (
        childIds.map((childId) => {
          const child = spanById(trace, childId)
          return (
            <button
              key={childId}
              type="button"
              style={slotButton}
              onClick={() => api.focusSpan(childId)}
            >
              {child === null ? childId : `${child.serviceName} · ${child.name}`}
            </button>
          )
        })
      )}
    </div>
  )
}

type ColorScheme = 'light' | 'dark'

const SCHEME_STORAGE_KEY = 'otlp-example-theme'


const initialScheme = (): ColorScheme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'


const hasExplicitScheme = (): boolean => {
  if (new URLSearchParams(location.search).has('theme')) return true
  try {
    return localStorage.getItem(SCHEME_STORAGE_KEY) !== null
  } catch {
    return false
  }
}

const switchTrack: CSSProperties = {
  position: 'relative',
  flex: 'none',
  width: 32,
  height: 18,
  borderRadius: 999,
  background: 'var(--app-switch-track)',
  transition: 'background 150ms',
}

const switchKnob = (dark: boolean): CSSProperties => ({
  position: 'absolute',
  top: 2,
  left: 2,
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: 'var(--app-switch-knob)',
  transform: `translateX(${dark ? 14 : 0}px)`,
  transition: 'transform 150ms',
})

export function App() {
  const [dataset, setDataset] = useState(initialDataset)
  const [locale, setLocale] = useState(
    () => new URLSearchParams(location.search).get('locale') ?? 'zh-CN',
  )
  const [scheme, setScheme] = useState<ColorScheme>(initialScheme)
  const [followSystem, setFollowSystem] = useState(() => !hasExplicitScheme())
  const trace = useMemo(() => DATASETS[dataset]!.build(), [dataset])

  const preselected = new URLSearchParams(location.search).get('span')


  useEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark')
    if (followSystem) return
    try {
      localStorage.setItem(SCHEME_STORAGE_KEY, scheme)
    } catch {
      // 隐私模式下写 localStorage 会抛，忽略即可
    }
  }, [scheme, followSystem])


  useEffect(() => {
    if (!followSystem) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setScheme(media.matches ? 'dark' : 'light')
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [followSystem])

  const dark = scheme === 'dark'


  const toggleScheme = () => {
    setFollowSystem(false)
    setScheme(dark ? 'light' : 'dark')
    const url = new URL(location.href)
    if (url.searchParams.has('theme')) {
      url.searchParams.delete('theme')
      history.replaceState(null, '', url)
    }
  }

  return (
    <TraceDetailView
      trace={trace}
      locale={locale}
      zoomOnWheel={false}

      {...(dark
        ? { theme: DEFAULT_DARK_THEME, servicePalette: SERVICE_PALETTE_DARK }
        : { servicePalette: SERVICE_PALETTE })}

      detailPanelHeight={300}
      style={{ height: '100vh' }}
      {...(preselected === null ? {} : { defaultSelectedSpanId: preselected })}

      renderSpanDetailActions={detailActions}
      renderSpanDetailExtra={detailExtra}

      renderToolbar={(view) => (
        <TraceToolbar trace={trace} viewport={view.state.viewport} onAction={view.dispatch}>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {DATASETS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                style={switchButton(index === dataset)}
                onClick={() => setDataset(index)}
              >
                {item.label}
              </button>
            ))}
            <span style={separator} />
            {LOCALES.map((item) => (
              <button
                key={item}
                type="button"
                style={switchButton(item === locale)}
                onClick={() => setLocale(item)}
              >
                {LOCALE_LABELS[item]}
              </button>
            ))}
            <span style={separator} />
            { }
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              title="深色模式"
              onClick={toggleScheme}
              style={{
                ...switchButton(false),
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px',
              }}
            >
              <span style={switchTrack}>
                <span style={switchKnob(dark)} />
              </span>
              深色
            </button>
          </span>
        </TraceToolbar>
      )}
    />
  )
}
