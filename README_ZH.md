# @slcomplex/otlp-trace-renderer

[English](./README.md) | **简体中文**

Jaeger 风格的 OTLP 调用链（trace）时间轴组件，适用于 React 框架。

## 安装

依赖要求：React 18+

```bash
npm install @slcomplex/otlp-trace-renderer

```

## 快速开始

```tsx
import { TraceDetailView } from '@slcomplex/otlp-trace-renderer'
import { normalizeOtlpTrace } from '@slcomplex/otlp-trace-renderer/adapters/otlp'
import otlpJson from './trace.json'

const trace = normalizeOtlpTrace(otlpJson)

export function TracePage() {
  return <TraceDetailView trace={trace} style={{ height: 600 }} />
}
```

深色模式（两个 prop：`theme` 换底色文字，`servicePalette` 换长条配色）：

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

只要时间轴、不要详情面板：

```tsx
import { TraceTimeline } from '@slcomplex/otlp-trace-renderer'

const timelineOnly = <TraceTimeline trace={trace} height={400} />
```

## 只想要计算，不要 UI

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

## 主要 props（`TraceDetailView`）

| prop                                                                                                    | 类型                      | 默认              | 说明                                                 |
| ------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------- | ---------------------------------------------------- |
| `trace`                                                                                                 | `TraceData`               | —                 | 由 `normalizeTrace` / `normalizeOtlpTrace` 产出      |
| `viewport` / `defaultViewport` / `onViewportChange`                                                     | `Viewport`                | fit               | 可见时间窗口                                         |
| `selectedSpanId` / `defaultSelectedSpanId` / `onSelectedSpanIdChange`                                   | `SpanId \| null`          | `null`            | `null` 是合法值（没有选中），传了就算受控            |
| `collapsedSpanIds` / `defaultCollapsedSpanIds` / `onCollapsedSpanIdsChange`                             | `ReadonlySet<SpanId>`     | 空集              | 已折叠的节点                                         |
| `height`                                                                                                | `number \| string`        | `'100%'`          | 父容器需要有高度                                     |
| `showToolbar` / `showDetailPanel`                                                                       | `boolean`                 | `true`            | 关掉就只剩时间轴 / 只剩时间轴 + 工具栏               |
| `detailPanelHeight`                                                                                     | `number \| string`        | `240`             | 详情面板高度                                         |
| `metrics`                                                                                               | `Partial<Metrics>`        | —                 | 行高、留白、缩进、名称列宽等                         |
| `theme`                                                                                                 | `Partial<ThemeTokens>`    | 亮色              | 走组件根节点的内联 CSS 变量，不污染全局              |
| `servicePalette`                                                                                        | `readonly string[]`       | `SERVICE_PALETTE` | service 配色色板，深色底传 `SERVICE_PALETTE_DARK`    |
| `spanColorMode`                                                                                         | `'service' \| 'duration'` | `'service'`       | 长条按 service 上色，或按时长百分位上色              |
| `zoomOnWheel`                                                                                           | `boolean`                 | `false`           | 默认要 `Ctrl`/`Cmd` + 滚轮才缩放，纯滚轮留给页面滚动 |
| `locale`                                                                                                | `string`                  | `'auto'`          | 任意值；未知值回退 `en`；不传读 `navigator.language` |
| `messages`                                                                                              | `Partial<Messages>`       | —                 | 叠在内置字典最上层                                   |
| `renderToolbar` / `renderSpanDetail` / `renderSpanDetailActions` / `renderSpanDetailExtra` / `children` | 渲染插槽                  | —                 | 见下                                                 |
| `className` / `style`                                                                                   | —                         | —                 | 根节点                                               |

`TraceTimeline`（只时间轴）、`TraceToolbar`、`SpanDetailPanel`、`SpanNameColumn` 也单独导出，可以只用其中一个。
`Metrics` / `Messages` / `Locale` / `ThemeTokens` / `Viewport` 等类型从 `@slcomplex/otlp-trace-renderer/headless` 导入。

### 受控 / 非受控

三个字段各自独立判断：传了就是受控（`selectedSpanId={null}` 也算受控），没传就用内部 state 并由 `default*` 初始化。

```tsx
const [selected, setSelected] = useState<SpanId | null>(null)

<TraceDetailView trace={trace} selectedSpanId={selected} onSelectedSpanIdChange={setSelected} />
```

## 内容插槽

```tsx
<TraceDetailView
  trace={trace}
  renderSpanDetailActions={(span, trace, api) => (
    <>
      {span.parentSpanId !== null && (
        <button onClick={() => api.focusSpan(span.parentSpanId!)}>↑ 父 span</button>
      )}
      <a href={`/logs?trace=${trace.traceId}&span=${span.spanId}`}>看日志</a>
    </>
  )}
  renderSpanDetailExtra={(span, trace) => <pre>{JSON.stringify(span.attributes, null, 2)}</pre>}
/>
```

## 主题

- **CSS 变量**：`--otlp-trace-bg`、`--otlp-trace-text`、`--otlp-trace-grid-line`、`--otlp-trace-bar`、
  `--otlp-trace-bar-error`、`--otlp-trace-row-hover`、`--otlp-trace-row-selected`、`--otlp-trace-focus-ring`、
  `--otlp-trace-font` 等（完整名单见 `TOKENS`）—— 悬停行用 `--otlp-trace-row-hover`、选中行用 `--otlp-trace-row-selected`，
  两种状态不会长得一样。
- **深色**：`theme={DEFAULT_DARK_THEME}` + `servicePalette={SERVICE_PALETTE_DARK}`

## 语言

```tsx
<TraceDetailView locale="ja" />                                     {/* 内置语言 */}
<TraceDetailView locale="zh-CN" messages={{ zoomIn: '放大点' }} />   {/* 只改几条 */}
<TraceDetailView locale="ko" messages={korean} />                   {/* 加一门新语言（漏的 key 回退英文） */}
```

内置四种语言ja、en、zh-CN、zh-TW

## 键盘

| 键            | 行为                                            |
| ------------- | ----------------------------------------------- |
| `↑` / `↓`     | 上/下移动选中（联动纵向滚动）                   |
| `←` / `→`     | 折叠 / 展开选中行（幂等）                       |
| `Shift + ←/→` | 平移 25% 视口宽度                               |
| `+` / `-`     | 以视口中心缩放（`=` `_` `Add` `Subtract` 也认） |
| `F`           | 适应窗口（fit）                                 |
| `0`           | 重置（fit + 全部展开）                          |
| `Esc`         | 清空选中                                        |
| `Enter`       | 焦点移到详情面板                                |

鼠标：单击长条/名称选中，双击任意一行折叠或展开，**名称左边的三角**是显式的折叠按钮，拖拽平移，
`Ctrl`/`Cmd` + 滚轮（或 `zoomOnWheel`）以指针为锚点缩放。

## 兼容性

- **React 18.3 / 19.3**
- **ESM only**
- **零运行时依赖**
- **Node ≥ 18**
- **现代浏览器**

## 示例

| 目录                     | 说明                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `examples/react-vite`    | 用包名引入（workspace 软链 → `exports` → `dist`）；`?spans=5000`、`?span=<id>`、`?locale=ja`、`?theme=dark` |
| `examples/headless-node` | 不要 UI，只在 Node 里跑 headless 计算                                                                       |

```bash
pnpm install
pnpm example            # 构建 + vite dev → http://localhost:5174
pnpm example:headless   # 构建 + node examples/headless-node/main.ts
pnpm storybook          # 组件目录 → http://localhost:6006（13 个 story）
```

## 开发

```bash
pnpm install
pnpm dev              # playground（vite，直接用 src）
pnpm test             # vitest（node + jsdom 两种环境）
pnpm typecheck        # tsc --noEmit
pnpm lint             # oxlint
pnpm build            # tsup → dist（ESM + .d.ts）


pnpm verify:package   # build + publint + attw + size-limit
pnpm verify:pack      # 真 tarball 装进空项目跑一遍（React 18 / 19）
pnpm browser:check    # 真浏览器回归（Playwright + chromium）
```

## License

[Apache-2.0](./LICENSE)
