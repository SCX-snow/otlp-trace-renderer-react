import type { SpanId, TraceData } from '../model/types'
import { DEFAULT_METRICS } from './metrics'

export interface Row {
  spanIndex: number
  depth: number
}

/**
 * 树 → 行。前序 DFS，折叠的节点还在，但不下钻。
 *
 * 显式栈而不是递归：深链（5000 层）的 trace 会直接爆栈。
 */
export function flattenRows(
  trace: TraceData,
  collapsed: ReadonlySet<SpanId>,
  maxIndentDepth: number = DEFAULT_METRICS.maxIndentDepth,
): Row[] {
  const rows: Row[] = []
  const stack: Row[] = []
  for (let i = trace.roots.length - 1; i >= 0; i--) {
    stack.push({ spanIndex: trace.roots[i]!, depth: 0 })
  }

  while (stack.length > 0) {
    const current = stack.pop()!
    rows.push({
      spanIndex: current.spanIndex,
      depth: Math.min(current.depth, maxIndentDepth),
    })
    if (collapsed.has(trace.spans[current.spanIndex]!.spanId)) continue
    const children = trace.children[current.spanIndex]!
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ spanIndex: children[i]!, depth: current.depth + 1 })
    }
  }

  return rows
}
