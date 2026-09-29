import type { NormalizeWarning } from '../model/types'

/** 内置语言。`locale` prop 接受任意字符串，未知值回退 en。 */
export type Locale = 'en' | 'zh-CN' | 'zh-TW' | 'ja'

/**
 * 全部可定制文案。
 *
 * 使用者传 `messages={{ zoomIn: '放大一点' }}` 就只改这一条；要加一门内置之外的语言，
 * 就传一整套（缺的 key 自动回退到英文，不会出现 undefined）。
 */
export interface Messages {
  /** 时间轴容器的 aria-label */
  timelineLabel: string
  /** 选中变化时的读屏播报（aria-live） */
  selectionAnnouncement: string

  zoomIn: string
  zoomOut: string
  fit: string
  collapseAll: string
  expandAll: string
  /** 每行折叠三角的读屏名（状态由 aria-expanded 给） */
  toggleSubtree: string
  spansCount: string
  warningsCount: string

  emptyHint: string
  noSpans: string
  copyJson: string
  copied: string
  rootSpan: string
  startLabel: string
  durationLabel: string
  durationPercentile: string
  tagsSection: string
  processSection: string
  eventsSection: string
  linksSection: string
  expandValue: string
  collapseValue: string
  linkNotInTrace: string
  linkCrossTrace: string

  warnParentNotFound: string
  warnNegativeDuration: string
  warnCycle: string
  warnEmptyTrace: string
  warnDuplicateSpanId: string
  warnClockSkew: string
  warnBadTimestamp: string
  warnMultipleTraces: string
}

const en: Messages = {
  timelineLabel: 'Trace timeline',
  selectionAnnouncement: 'Selected {name}, {service}, duration {duration}',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  collapseAll: 'Collapse all',
  expandAll: 'Expand all',
  toggleSubtree: 'Expand or collapse subtree',
  spansCount: '{count} spans',
  warningsCount: '{count} data warnings',
  emptyHint:
    'Select a span on the timeline or in the name column. Click the triangle left of a name to collapse its subtree.',
  noSpans: 'This trace contains no spans.',
  copyJson: 'Copy JSON',
  copied: 'Copied',
  rootSpan: 'root span',
  startLabel: 'start',
  durationLabel: 'duration',
  durationPercentile: 'duration pct {percent}%',
  tagsSection: 'Tags ({count})',
  processSection: 'Process ({count})',
  eventsSection: 'Events ({count})',
  linksSection: 'Links ({count})',
  expandValue: 'expand ({length})',
  collapseValue: 'collapse',
  linkNotInTrace: '(not in this trace)',
  linkCrossTrace: 'cross-trace {traceId}',
  warnParentNotFound:
    'parent span {parentSpanId} is not in this trace; {spanId} is treated as a root',
  warnNegativeDuration:
    'end < start ({startTimeUnixNano} to {endTimeUnixNano}); duration clamped to 0',
  warnCycle:
    '{count} span(s) form a parent cycle starting at {spanId}; broken and promoted to roots',
  warnEmptyTrace: 'the trace has no spans',
  warnDuplicateSpanId: 'duplicate spanId {spanId}; the later one was dropped',
  warnClockSkew:
    'span {spanId} ({startUs}~{endUs}µs) falls outside its parent ({parentStartUs}~{parentEndUs}µs)',
  warnBadTimestamp: 'not an integer nanosecond timestamp: "{value}"; treated as 0',
  warnMultipleTraces:
    'input holds {count} traces; only {chosenTraceId} ({spanCount} spans) was normalized',
}

const zhCN: Messages = {
  timelineLabel: '调用链时间轴',
  selectionAnnouncement: '已选中 {name}，{service}，时长 {duration}',
  zoomIn: '放大',
  zoomOut: '缩小',
  fit: '适应窗口',
  collapseAll: '全部折叠',
  expandAll: '全部展开',
  toggleSubtree: '展开 / 折叠子树',
  spansCount: '{count} 个 span',
  warningsCount: '{count} 条数据告警',
  emptyHint: '点时间轴上的长条或左侧名称查看详情；点名称左边的三角折叠子树。',
  noSpans: '这条 trace 里没有 span。',
  copyJson: '复制 JSON',
  copied: '已复制',
  rootSpan: '根 span',
  startLabel: '起点',
  durationLabel: '时长',
  durationPercentile: '时长分位 {percent}%',
  tagsSection: '标签 ({count})',
  processSection: '进程 ({count})',
  eventsSection: '事件 ({count})',
  linksSection: '关联 ({count})',
  expandValue: '展开 ({length})',
  collapseValue: '收起',
  linkNotInTrace: '（不在本 trace 内）',
  linkCrossTrace: '跨 trace {traceId}',
  warnParentNotFound: '父 span {parentSpanId} 不在本 trace 中，{spanId} 按根处理',
  warnNegativeDuration: 'end < start（{startTimeUnixNano} → {endTimeUnixNano}），时长归零',
  warnCycle: '从 {spanId} 起有 {count} 个 span 构成父子环，已断开并提升为根',
  warnEmptyTrace: 'trace 里没有 span',
  warnDuplicateSpanId: '重复的 spanId {spanId}，已丢弃后出现的那条',
  warnClockSkew:
    'span {spanId}（{startUs}~{endUs}µs）落在父区间（{parentStartUs}~{parentEndUs}µs）之外',
  warnBadTimestamp: '不是整数纳秒时间戳：「{value}」，按 0 处理',
  warnMultipleTraces: '输入含 {count} 条 trace，只归一化了 {chosenTraceId}（{spanCount} 个 span）',
}

const zhTW: Messages = {
  timelineLabel: '呼叫鏈時間軸',
  selectionAnnouncement: '已選取 {name}，{service}，時長 {duration}',
  zoomIn: '放大',
  zoomOut: '縮小',
  fit: '符合視窗',
  collapseAll: '全部收合',
  expandAll: '全部展開',
  toggleSubtree: '展開 / 收合子樹',
  spansCount: '{count} 個 span',
  warningsCount: '{count} 筆資料警示',
  emptyHint: '點時間軸上的長條或左側名稱查看詳情；點名稱左邊的三角形收合子樹。',
  noSpans: '這筆 trace 沒有任何 span。',
  copyJson: '複製 JSON',
  copied: '已複製',
  rootSpan: '根 span',
  startLabel: '起點',
  durationLabel: '時長',
  durationPercentile: '時長百分位 {percent}%',
  tagsSection: '標籤 ({count})',
  processSection: '程序 ({count})',
  eventsSection: '事件 ({count})',
  linksSection: '關聯 ({count})',
  expandValue: '展開 ({length})',
  collapseValue: '收合',
  linkNotInTrace: '（不在本 trace 內）',
  linkCrossTrace: '跨 trace {traceId}',
  warnParentNotFound: '父 span {parentSpanId} 不在本 trace 中，{spanId} 以根處理',
  warnNegativeDuration: 'end < start（{startTimeUnixNano} → {endTimeUnixNano}），時長歸零',
  warnCycle: '從 {spanId} 起有 {count} 個 span 構成父子環，已斷開並提升為根',
  warnEmptyTrace: 'trace 裡沒有 span',
  warnDuplicateSpanId: '重複的 spanId {spanId}，已丟棄後出現的那筆',
  warnClockSkew:
    'span {spanId}（{startUs}~{endUs}µs）落在父區間（{parentStartUs}~{parentEndUs}µs）之外',
  warnBadTimestamp: '不是整數奈秒時間戳：「{value}」，以 0 處理',
  warnMultipleTraces: '輸入含 {count} 筆 trace，只正規化了 {chosenTraceId}（{spanCount} 個 span）',
}

const ja: Messages = {
  timelineLabel: 'トレースタイムライン',
  selectionAnnouncement: '{name}、{service}、所要時間 {duration} を選択しました',
  zoomIn: '拡大',
  zoomOut: '縮小',
  fit: '全体表示',
  collapseAll: 'すべて折りたたむ',
  expandAll: 'すべて展開',
  toggleSubtree: 'サブツリーを展開 / 折りたたむ',
  spansCount: '{count} スパン',
  warningsCount: 'データ警告 {count} 件',
  emptyHint:
    'タイムラインまたは左の名前をクリックすると詳細を表示します。名前の左の三角でサブツリーを折りたたみます。',
  noSpans: 'このトレースにはスパンがありません。',
  copyJson: 'JSON をコピー',
  copied: 'コピーしました',
  rootSpan: 'ルートスパン',
  startLabel: '開始',
  durationLabel: '所要時間',
  durationPercentile: '所要時間パーセンタイル {percent}%',
  tagsSection: 'タグ ({count})',
  processSection: 'プロセス ({count})',
  eventsSection: 'イベント ({count})',
  linksSection: 'リンク ({count})',
  expandValue: '展開 ({length})',
  collapseValue: '折りたたむ',
  linkNotInTrace: '（このトレース内にありません）',
  linkCrossTrace: 'クロストレース {traceId}',
  warnParentNotFound:
    '親スパン {parentSpanId} がこのトレースに無いため、{spanId} をルートとして扱います',
  warnNegativeDuration:
    'end < start（{startTimeUnixNano} → {endTimeUnixNano}）のため所要時間を 0 にしました',
  warnCycle:
    '{spanId} から {count} 個のスパンが親子関係の循環を作っています。切断してルートに昇格しました',
  warnEmptyTrace: 'トレースにスパンがありません',
  warnDuplicateSpanId: 'spanId {spanId} が重複しています。後から現れた方を破棄しました',
  warnClockSkew:
    'スパン {spanId}（{startUs}~{endUs}µs）が親の区間（{parentStartUs}~{parentEndUs}µs）からはみ出しています',
  warnBadTimestamp: '整数のナノ秒タイムスタンプではありません：「{value}」を 0 として扱います',
  warnMultipleTraces:
    '入力に {count} 件のトレースがあります。{chosenTraceId}（{spanCount} スパン）のみ正規化しました',
}

export const MESSAGES: Record<Locale, Messages> = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
}

/** `{key}` 占位替换。不做复数/性别规则 —— 这几条文案用不上，引 Intl.MessageFormat 不划算。 */
export function format(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

function matchLocale(tag: string): Locale | undefined {
  const lower = tag.toLowerCase()
  if (lower === 'en' || lower.startsWith('en-')) return 'en'
  if (lower.startsWith('ja')) return 'ja'
  if (lower.startsWith('zh')) {
    // zh-Hant / zh-TW / zh-HK / zh-MO → 繁體，其余中文按简体
    return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN'
  }
  return undefined
}

function detectLocale(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.languages?.[0] ?? navigator.language ?? 'en'
}

/**
 * `'auto'` / undefined → 读 `navigator.language`；显式值先按内置表匹配；都不中回退 `en`。
 *
 * `navigator` 只在函数体里读：模块顶层读会让 SSR 和 node 单测直接炸。
 */
export function resolveLocale(input?: string): Locale {
  const requested = input === undefined || input === '' || input === 'auto' ? detectLocale() : input
  return matchLocale(requested) ?? 'en'
}

/**
 * 内置字典（按 locale 解析）+ 使用者的覆盖，永远叠在最上层。
 *
 * locale 不认识时用英文打底：使用者传一整套自己的语言就得到自己的语言，
 * 漏掉的 key 回退英文，不会出现 undefined。
 */
export function resolveMessages(locale?: string, overrides?: Partial<Messages>): Messages {
  const base = MESSAGES[resolveLocale(locale)]
  return overrides === undefined ? base : { ...base, ...overrides }
}

/** 把归一化告警拼成当前语言的句子 */
export function formatWarning(warning: NormalizeWarning, messages: Messages): string {
  switch (warning.code) {
    case 'parent-not-found':
      return format(messages.warnParentNotFound, {
        parentSpanId: warning.parentSpanId,
        spanId: warning.spanId,
      })
    case 'negative-duration':
      return format(messages.warnNegativeDuration, {
        startTimeUnixNano: warning.startTimeUnixNano,
        endTimeUnixNano: warning.endTimeUnixNano,
      })
    case 'cycle':
      return format(messages.warnCycle, { count: warning.cycleLength, spanId: warning.spanId })
    case 'empty-trace':
      return messages.warnEmptyTrace
    case 'duplicate-span-id':
      return format(messages.warnDuplicateSpanId, { spanId: warning.spanId })
    case 'clock-skew':
      return format(messages.warnClockSkew, {
        spanId: warning.spanId,
        startUs: warning.startUs,
        endUs: warning.endUs,
        parentStartUs: warning.parentStartUs,
        parentEndUs: warning.parentEndUs,
      })
    case 'bad-timestamp':
      return format(messages.warnBadTimestamp, { value: warning.value })
    case 'multiple-traces':
      return format(messages.warnMultipleTraces, {
        count: warning.traceCount,
        chosenTraceId: warning.chosenTraceId,
        spanCount: warning.spanCount,
      })
  }
}

/** 英文描述，给日志/调试用 —— UI 上要用 formatWarning + 当前语言 */
export function describeWarning(warning: NormalizeWarning): string {
  return formatWarning(warning, MESSAGES.en)
}
