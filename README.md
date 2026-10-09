# @slcomplex/otlp-trace-renderer

**English** | [简体中文](./README_ZH.md)

Jaeger-style OTLP trace timeline for React.

## Install

Requires React 18+.

```bash
npm install @slcomplex/otlp-trace-renderer

```

## Quick start

```tsx
import { TraceDetailView } from '@slcomplex/otlp-trace-renderer'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import otlpJson from './trace.json'

const trace = normalizeOtlpTrace(otlpJson)

export function TracePage() {
  return <TraceDetailView trace={trace} style={{ height: 600 }} />
}
```

Data coming from Grafana Tempo uses a separate subpath. Tempo's `/api/traces/<id>` response wraps the trace in a
`trace` envelope, and the field names inside come in two generations (≥2.x `resourceSpans` + `scopeSpans`,
≤1.x `batches` + `instrumentationLibrarySpans`) — the adapter accepts both:

```tsx
import { normalizeTempoTrace } from '@slcomplex/otlp-trace-renderer/adapters/tempo'
import tempoJson from './tempo-trace.json'

const trace = normalizeTempoTrace(tempoJson)
```

Dark mode takes two props: `theme` swaps the background and text colors, `servicePalette` swaps the bar colors:

```tsx
import {
  DEFAULT_DARK_THEME,
  SERVICE_PALETTE_DARK,
  TraceDetailView,
} from '@slcomplex/otlp-trace-renderer'

const dark = (
  <TraceDetailView
    trace={trace}
    theme={DEFAULT_DARK_THEME}
    servicePalette={SERVICE_PALETTE_DARK}
    style={{ height: 600 }}
  />
)
```

Timeline only, no detail panel:

```tsx
import { TraceTimeline } from '@slcomplex/otlp-trace-renderer'

const timelineOnly = <TraceTimeline trace={trace} height={400} />
```

## Computation only, no UI

```ts
import {
  DEFAULT_METRICS,
  flattenRows,
  normalizeTrace,
  resolveTimeAxis,
} from '@slcomplex/otlp-trace-renderer/headless'

const trace = normalizeTrace({ traceId, spans, resources })
const rows = flattenRows(trace, new Set())
const axis = resolveTimeAxis(1200, DEFAULT_METRICS)
```

## Main props (`TraceDetailView`)

| prop                                                                                                    | type                      | default           | notes                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `trace`                                                                                                 | `TraceData`               | —                 | produced by `normalizeTrace` / `normalizeOtlpTrace`                       |
| `viewport` / `defaultViewport` / `onViewportChange`                                                     | `Viewport`                | fit               | visible time window                                                       |
| `selectedSpanId` / `defaultSelectedSpanId` / `onSelectedSpanIdChange`                                   | `SpanId \| null`          | `null`            | `null` is a real value (nothing selected); passing it makes it controlled |
| `collapsedSpanIds` / `defaultCollapsedSpanIds` / `onCollapsedSpanIdsChange`                             | `ReadonlySet<SpanId>`     | empty set         | collapsed nodes                                                           |
| `height`                                                                                                | `number \| string`        | `'100%'`          | the parent needs a height                                                 |
| `showToolbar` / `showDetailPanel`                                                                       | `boolean`                 | `true`            | turn them off to keep only the timeline / timeline + toolbar              |
| `detailPanelHeight`                                                                                     | `number \| string`        | `240`             | the panel is `flexShrink: 0`, so it always keeps this height              |
| `metrics`                                                                                               | `Partial<Metrics>`        | —                 | row height, paddings, indent, name column width, …                        |
| `theme`                                                                                                 | `Partial<ThemeTokens>`    | light             | written as inline CSS variables on the root node, never global            |
| `servicePalette`                                                                                        | `readonly string[]`       | `SERVICE_PALETTE` | service color palette; pass `SERVICE_PALETTE_DARK` on dark backgrounds    |
| `spanColorMode`                                                                                         | `'service' \| 'duration'` | `'service'`       | color bars per service, or by duration percentile                         |
| `zoomOnWheel`                                                                                           | `boolean`                 | `false`           | by default `Ctrl`/`Cmd` + wheel zooms and a plain wheel scrolls the page  |
| `locale`                                                                                                | `string`                  | `'auto'`          | any value; unknown falls back to `en`; unset reads `navigator.language`   |
| `messages`                                                                                              | `Partial<Messages>`       | —                 | layered on top of the built-in dictionary                                 |
| `renderToolbar` / `renderSpanDetail` / `renderSpanDetailActions` / `renderSpanDetailExtra` / `children` | render slots              | —                 | see below                                                                 |
| `className` / `style`                                                                                   | —                         | —                 | applied to the root node                                                  |

`TraceTimeline` (timeline only), `TraceToolbar`, `SpanDetailPanel` and `SpanNameColumn` are exported as well, so you can
use any one of them on its own. Types such as `Metrics`, `Messages`, `Locale`, `ThemeTokens` and `Viewport` are exported
from `@slcomplex/otlp-trace-renderer/headless`.

### Controlled / uncontrolled

The three fields are each judged independently: pass it and it is controlled (`selectedSpanId={null}` counts as
controlled), leave it out and internal state is used, initialized from the matching `default*` prop.

```tsx
const [selected, setSelected] = useState<SpanId | null>(null)

<TraceDetailView trace={trace} selectedSpanId={selected} onSelectedSpanIdChange={setSelected} />
```

## Content slots

```tsx
<TraceDetailView
  trace={trace}
  renderSpanDetailActions={(span, trace, api) => (
    <>
      {span.parentSpanId !== null && (
        <button onClick={() => api.focusSpan(span.parentSpanId!)}>↑ parent span</button>
      )}
      <a href={`/logs?trace=${trace.traceId}&span=${span.spanId}`}>Open logs</a>
    </>
  )}
  renderSpanDetailExtra={(span, trace) => <pre>{JSON.stringify(span.attributes, null, 2)}</pre>}
/>
```

## Theming

- **CSS variables**: `--otlp-trace-bg`, `--otlp-trace-text`, `--otlp-trace-grid-line`, `--otlp-trace-bar`,
  `--otlp-trace-bar-error`, `--otlp-trace-row-hover`, `--otlp-trace-row-selected`, `--otlp-trace-focus-ring`,
  `--otlp-trace-font`, … (full list in `TOKENS`). The hovered row uses `--otlp-trace-row-hover` and the selected one
  `--otlp-trace-row-selected`, so the two states never look alike.
- **Dark**: `theme={DEFAULT_DARK_THEME}` + `servicePalette={SERVICE_PALETTE_DARK}`

## Languages

```tsx
<TraceDetailView locale="ja" />                                     {/* built-in language */}
<TraceDetailView locale="zh-CN" messages={{ zoomIn: 'Zoom in a bit' }} />   {/* override a few keys */}
<TraceDetailView locale="ko" messages={korean} />                   {/* add a new language (missing keys fall back to English) */}
```

Built-in languages: ja, en, zh-CN, zh-TW.

## Keyboard

| Key           | Action                                                         |
| ------------- | -------------------------------------------------------------- |
| `↑` / `↓`     | move the selection up/down (scrolls vertically to follow it)   |
| `←` / `→`     | collapse / expand the selected row (idempotent)                |
| `Shift + ←/→` | pan by 25% of the viewport width                               |
| `+` / `-`     | zoom around the viewport center (`=` `_` `Add` `Subtract` too) |
| `F`           | fit the viewport to the trace                                  |
| `0`           | reset (fit + expand everything)                                |
| `Esc`         | clear the selection                                            |
| `Enter`       | move focus to the detail panel                                 |

Mouse: click a bar or a name to select, double-click any row to collapse/expand, the **caret left of a name** is an
explicit collapse button, drag to pan, and `Ctrl`/`Cmd` + wheel (or `zoomOnWheel`) zooms around the pointer.

## Compatibility

- **React 18.3 / 19.3**
- **ESM only**
- **TypeScript**: subpaths resolve under `bundler`, `node16` and `node` (node10) `moduleResolution`
- **Zero runtime dependencies**
- **Node ≥ 18**
- **Modern browsers**

## Examples

| Directory                | What it shows                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `examples/react-vite`    | Imports the package by name (workspace link → `exports` → `dist`); `?spans=5000`, `?span=<id>`, `?locale=ja`, `?theme=dark` |
| `examples/headless-node` | No UI, headless computation in plain Node                                                                                   |

```bash
pnpm install
pnpm example            # build + vite dev → http://localhost:5174
pnpm example:headless   # build + node examples/headless-node/main.ts
pnpm storybook          # component stories → http://localhost:6006 (13 stories)
```

## Development

```bash
pnpm install
pnpm dev              # playground (vite, uses src directly)
pnpm test             # vitest (node + jsdom environments)
pnpm coverage         # coverage report for diagnostics (v8, html in coverage/), not a gate
pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint
pnpm build            # tsup → dist (ESM + .d.ts)


pnpm verify:package   # build + publint + attw + size-limit
pnpm verify:pack      # install the real tarball into empty projects (React 18 / 19)
pnpm browser:check    # real-browser regression (Playwright + chromium)
```

## License

[Apache-2.0](./LICENSE)
