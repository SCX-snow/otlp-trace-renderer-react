# 示例：React + Vite

用**包名**引入 `@slcomplex/otlp-trace-renderer`（workspace 软链 → `package.json` 的 `exports` → `dist`），
所以它同时验证了打包产物、exports map 和 `.d.ts` 能不能用。

```bash

pnpm install
pnpm build          # 示例吃的是 dist，改完库代码要重新 build
pnpm example        # = pnpm build && vite dev → http://localhost:5174
```

## 换成你自己的数据

覆盖 `src/trace.json` 就行。它是一个 OTLP/JSON 响应（`{"resourceSpans": [...]}`），
traceId/spanId 是 hex 或 base64 都能识别。

```bash

curl -s 'http://localhost:4318/v1/traces' > src/trace.json
```

## 这个示例展示了什么

`src/App.tsx` 一共三块：

| 用法                                                                                              | 位置                 |
| ------------------------------------------------------------------------------------------------- | -------------------- |
| `normalizeOtlpTrace(rawOtlp)` — OTLP/JSON → 规范模型                                              | 模块顶层，只算一次   |
| `<TraceDetailView trace={trace} />` — 工具栏 + 时间轴 + 名称列 + 详情面板 + 交互全部内置          | `App`                |
| `renderToolbar={(view) => ...}` — 拿到底层 `TraceView`（state + dispatch），右侧加自己的控件      | `App`                |
| 深色模式开关 + `html.dark` 覆盖主题变量 — 一份变量同时改 DOM 和 canvas                            | `App` + `index.html` |
| 详情区插槽示例：「↑ 父 span」「在 Jaeger 打开」「子 span (n)」按钮 — 库只留位置，按钮是使用者写的 | `App`                |

组件自带的交互（调用方一行都不用写）：

- 点长条 / 点名称选中、点长条左边的三角折叠子树、**双击长条或名称行切换该节点展开/折叠**、悬停高亮 —— canvas 命中测试驱动
- 按住拖动平移、`Ctrl`/`⌘` + 滚轮以指针为锚点缩放；工具栏还有放大/缩小/fit/全部折叠/全部展开
- 左侧名称列是 DOM 虚拟行：5000 行也只渲染可见的几十行，文字可选中复制
- 右侧 canvas 走 `ResizeObserver` + `devicePixelRatio`，拖到外接屏不糊

## 键盘

时间轴容器可聚焦（点一下时间轴或 Tab 过去），然后：

| 键            | 动作                                         |
| ------------- | -------------------------------------------- |
| `↑` / `↓`     | 上/下移动选中（自动展开祖先并滚进视野）      |
| `←` / `→`     | 折叠 / 展开选中行的子树（幂等，不是 toggle） |
| `Shift + ←/→` | 时间窗口前/后平移 25%                        |
| `+` / `-`     | 以视口中心放大 / 缩小                        |
| `F`           | 适配整条 trace                               |
| `0`           | 重置（fit + 全部展开）                       |
| `Esc`         | 取消选中                                     |
| `Enter`       | 焦点移进详情面板（之后 Tab 走 tags / link）  |

`Ctrl` / `Cmd` / `Alt` 组合键一律不接管，输入法组合中的按键直接放行。
选中变化会写进 `aria-live` 播报区。

## 深色模式

工具栏最右边有个开关（`role="switch"` + `aria-checked`）。它的实现故意做得很薄 —— **只切一个 class**：

```ts
document.documentElement.classList.toggle('dark', scheme === 'dark')
```

```tsx

{...(dark
  ? { theme: DEFAULT_DARK_THEME, servicePalette: SERVICE_PALETTE_DARK }
  : { servicePalette: SERVICE_PALETTE })}
```

```css
html.dark {
  --app-bg: #0b1220;
  --app-text: #e2e8f0;
}
```

> 也可以全部走 CSS：把 `--otlp-trace-*` 覆盖写进 `html.dark` 即可（库注入的默认值在 `:where(:root)`，特异度 0）。
> 两种方式等价，示例选「预设 + 页面变量」是因为**不用手抄 12 个 token**。

为什么这样就够：

- **库注入的默认值放在 `:where(:root)` 里（特异度 0）**，所以 `html.dark` 这种普通选择器天然盖得住，不需要 `!important`。
- **DOM 和 canvas 读的是同一组变量**：DOM 走 `var(--otlp-trace-*)`，canvas 由 `useThemeTokens` 用
  `getComputedStyle` 解析，而它监听 `documentElement` 的 class 变化 —— 所以切一处，两边同时变色（不用重挂载组件）。
- **首帧不闪白**：`index.html` 里有一段阻塞脚本，在样式生效前按 `?theme=` → `localStorage` →
  `prefers-color-scheme` 的顺序定好 class。选择会写回 `localStorage`（key `otlp-example-theme`）；
  手动切过一次后会把 `?theme=` 从 URL 上摘掉，免得刷新又跳回参数指定的那套。

> 想改成 `theme` prop 那种「不污染全局」的用法也可以：`<TraceDetailView theme={{ bg: '#0b1220' }} />`
> 会把变量写进组件根节点的 inline style。开关这种要同时改页面底色的场景，用 class 更省事。

## 调试用的 URL 参数

| 参数             | 作用                                        |
| ---------------- | ------------------------------------------- |
| `?spans=5000`    | 直接进大数据集（12 / 100 / 5000）           |
| `?span=<spanId>` | 预选中某条 span，直接看详情面板             |
| `?theme=dark`    | 直接用深色打开（截图/复现用，`light` 同理） |

## 要用受控模式 / 自定义详情面板

```tsx
const [selectedSpanId, setSelectedSpanId] = useState<SpanId | null>(null)

<TraceDetailView
  trace={trace}
  selectedSpanId={selectedSpanId}
  onSelectedSpanIdChange={setSelectedSpanId}
  renderSpanDetail={(span) => <MyDetail span={span} />}   // 整块换掉默认面板
/>
```

`viewport` / `collapsedSpanIds` 同理，三个字段各自独立受控。

## 在详情区加自己的东西

详情面板留了三个插槽，库本身不预设任何按钮；`span` 未选中时它们都不会被调用：

| 插槽                                        | 位置                                            | 典型用途              |
| ------------------------------------------- | ----------------------------------------------- | --------------------- |
| `renderSpanDetailActions(span, trace, api)` | 标题栏右侧（「复制 JSON」左边）                 | 跳转按钮、徽标        |
| `renderSpanDetailExtra(span, trace, api)`   | 内置分区（tags / process / events / links）之后 | 自定义表格、原始 JSON |
| `renderSpanDetail(span, trace, api)`        | 整块替换详情内容                                | 完全自己的详情面板    |

`api` 是 `TraceDetailViewApi`：`{ state, dispatch, select, focusSpan, zoomBy, fit, collapseAll, expandAll }`。
**跳转要用 `focusSpan`**（展开祖先 + 挪视口 + 滚到那一行），`select` 只改选中：

```tsx
<TraceDetailView
  trace={trace}
  renderSpanDetailActions={(span, trace, api) => (
    <>
      {span.parentSpanId && (
        <button type="button" onClick={() => api.focusSpan(span.parentSpanId!)}>
          父 span
        </button>
      )}
      <a href={`/logs?trace=${trace.traceId}&span=${span.spanId}`} target="_blank" rel="noreferrer">
        看日志
      </a>
    </>
  )}
/>
```

只想要详情面板本身时用低层的 `SpanDetailPanel`，它也有 `renderActions` / `renderExtra`（签名只收 `(span, trace)`，因为它自己没有 view）。

示例 app 里就是照这个套路放的按钮：`src/App.tsx` 的 `detailActions`（标题栏：`↑ 父 span` + `在 Jaeger 打开`）和 `detailExtra`（分区之后：`子 span (n)` 一排按钮）。带 `?span=<spanId>` 打开、或点任意一行长条就能看到；选中叶子节点时那一段会显示「叶子节点，没有子 span」。

## 换语言 / 自定义文案

```tsx

<TraceDetailView trace={trace} locale="ja" />


<TraceDetailView trace={trace} locale="zh-CN" messages={{ zoomIn: '放大一点点' }} />



<TraceDetailView trace={trace} locale="ko" messages={korean} />


function MyDetail() {
  const { tagsSection } = useTraceMessages()
  return <div>{tagsSection}</div>
}
<TraceDetailView trace={trace} locale="ja" renderSpanDetail={() => <MyDetail />} />
```

`SpanDetailPanel` / `TraceToolbar` 单独用时也一样：传 `locale` 即可，不必自己搭 Provider。

`?locale=` 的缺省是 `zh-CN`；不传 `locale` 时组件读 `navigator.language`。
