import { describe, expect, it } from 'vitest'
import {
  initViewState,
  traceReducer,
  type Action,
  type ReducerCtx,
  type ViewState,
} from '../src/headless/interaction/reducer'
import { fitViewport } from '../src/headless/layout/viewport'
import { rawSpan, toTraceData } from './helpers/trace-factory'

const trace = toTraceData([
  rawSpan('root', 0, 1000),
  rawSpan('a', 10, 100, 'root'),
  rawSpan('c', 20, 30, 'a'),
  rawSpan('b', 200, 300, 'root'),
])

const ctx: ReducerCtx = { trace, width: 1000 }
const dispatch = (state: ViewState, action: Action) => traceReducer(state, action, ctx)
const initial = () => initViewState(trace)

describe('initViewState', () => {
  it('初始视口是 fit，没有选中也没有折叠', () => {
    const state = initial()
    expect(state.viewport).toEqual(fitViewport(trace.durationUs))
    expect(state.selectedSpanId).toBeNull()
    expect(state.hoveredSpanId).toBeNull()
    expect(state.collapsed.size).toBe(0)
  })
})

describe('视口 action', () => {
  it('缩放到达上限后再缩放，state 引用不变（React 会跳过这次渲染）', () => {
    const [zoomedOut] = dispatch(initial(), { type: 'zoom', anchorPx: 500, factor: 0.5 })
    const [again] = dispatch(zoomedOut, { type: 'zoom', anchorPx: 500, factor: 0.5 })
    expect(zoomedOut.viewport.spanUs).toBe(trace.durationUs * 1.05)
    expect(again).toBe(zoomedOut)
  })

  it('pan 到左边界后再 pan，state 引用不变', () => {
    const state = initial()
    const [panned] = dispatch(state, { type: 'pan', dxPx: 500 })
    const [again] = dispatch(panned, { type: 'pan', dxPx: 500 })
    expect(panned.viewport.startUs).toBe(0)
    expect(again).toBe(panned)
  })

  it('非法输入不改 state', () => {
    const state = initial()
    expect(dispatch(state, { type: 'zoom', anchorPx: 1, factor: Number.NaN })[0]).toBe(state)
    expect(dispatch(state, { type: 'zoom', anchorPx: Number.NaN, factor: 2 })[0].viewport).toEqual(
      state.viewport,
    )
    expect(dispatch(state, { type: 'pan', dxPx: Number.NaN })[0]).toBe(state)
    expect(
      dispatch(state, {
        type: 'setViewport',
        viewport: { startUs: Number.NaN, spanUs: Number.NaN },
      })[0].viewport,
    ).toEqual({ startUs: 0, spanUs: 1 })
  })

  it('zoomBy 以视口中心为锚点（工具栏按钮不知道绘图宽度）', () => {
    const [zoomed] = dispatch(initial(), { type: 'zoomBy', factor: 2 })
    expect(zoomed.viewport.spanUs).toBeCloseTo(510, 6)
    expect(zoomed.viewport.startUs).toBeCloseTo(255, 6)
  })

  it('宽度未知（还没量到）时 zoomBy 不动视口', () => {
    const state = initial()
    const [next] = traceReducer(state, { type: 'zoomBy', factor: 2 }, { trace, width: 0 })
    expect(next).toBe(state)
  })

  it('fit 回到初始视口', () => {
    const [zoomed] = dispatch(initial(), { type: 'zoom', anchorPx: 0, factor: 4 })
    const [fitted] = dispatch(zoomed, { type: 'fit' })
    expect(fitted.viewport).toEqual(fitViewport(trace.durationUs))
  })
})

describe('选中与悬停', () => {
  it('选中存在的 span', () => {
    const [next] = dispatch(initial(), { type: 'select', spanId: 'c' })
    expect(next.selectedSpanId).toBe('c')
  })

  it('重复选中同一个 span 返回原引用', () => {
    const [once] = dispatch(initial(), { type: 'select', spanId: 'c' })
    const [twice] = dispatch(once, { type: 'select', spanId: 'c' })
    expect(twice).toBe(once)
  })

  it('选中不存在的 spanId 被忽略', () => {
    const state = initial()
    expect(dispatch(state, { type: 'select', spanId: 'nope' })[0]).toBe(state)
  })

  it('可以清空选中', () => {
    const [selected] = dispatch(initial(), { type: 'select', spanId: 'c' })
    expect(dispatch(selected, { type: 'select', spanId: null })[0].selectedSpanId).toBeNull()
  })

  it('悬停独立于选中', () => {
    const [hovered] = dispatch(initial(), { type: 'hover', spanId: 'b' })
    expect(hovered.hoveredSpanId).toBe('b')
    expect(hovered.selectedSpanId).toBeNull()
    expect(dispatch(hovered, { type: 'hover', spanId: null })[0].hoveredSpanId).toBeNull()
  })
})

describe('折叠', () => {
  it('叶子节点不能折叠', () => {
    const state = initial()
    expect(dispatch(state, { type: 'toggleCollapse', spanId: 'c' })[0]).toBe(state)
  })

  it('折叠 / 展开是幂等切换', () => {
    const [collapsed] = dispatch(initial(), { type: 'toggleCollapse', spanId: 'a' })
    expect([...collapsed.collapsed]).toEqual(['a'])
    const [expanded] = dispatch(collapsed, { type: 'toggleCollapse', spanId: 'a' })
    expect(expanded.collapsed.size).toBe(0)
  })

  it('折叠不存在的 spanId 被忽略', () => {
    const state = initial()
    expect(dispatch(state, { type: 'toggleCollapse', spanId: 'nope' })[0]).toBe(state)
  })

  it('collapseAll 只折叠有子节点的 span，重复调用返回原引用', () => {
    const [all] = dispatch(initial(), { type: 'collapseAll' })
    expect(new Set(all.collapsed)).toEqual(new Set(['a', 'root']))
    expect(dispatch(all, { type: 'collapseAll' })[0]).toBe(all)
  })

  it('expandAll 清空折叠集合，重复调用返回原引用', () => {
    const [all] = dispatch(initial(), { type: 'collapseAll' })
    const [expanded] = dispatch(all, { type: 'expandAll' })
    expect(expanded.collapsed.size).toBe(0)
    expect(dispatch(expanded, { type: 'expandAll' })[0]).toBe(expanded)
  })

  it('expandTo 展开目标的所有祖先', () => {
    const [all] = dispatch(initial(), { type: 'collapseAll' })
    const [next] = dispatch(all, { type: 'expandTo', spanId: 'c' })
    expect(next.collapsed.size).toBe(0)
  })

  it('expandTo 对已经不折叠的节点返回原引用', () => {
    const state = initial()
    expect(dispatch(state, { type: 'expandTo', spanId: 'c' })[0]).toBe(state)
  })
})

describe('focusSpan', () => {
  it('选中 + 展开祖先 + 把 span 摆进视野 + 给出滚动目标行', () => {
    const [zoomed] = dispatch(initial(), { type: 'zoom', anchorPx: 0, factor: 20 })
    expect(zoomed.viewport.spanUs).toBeLessThan(100)

    const [focused, effects] = dispatch(zoomed, { type: 'focusSpan', spanId: 'b' })
    expect(focused.selectedSpanId).toBe('b')
    expect(focused.viewport.startUs).toBeLessThanOrEqual(200)
    expect(focused.viewport.startUs + focused.viewport.spanUs).toBeGreaterThanOrEqual(300)
    expect(effects.scrollToRow).toBe(3) // rows = [root, a, c, b]
  })

  it('祖先被折叠时会先展开，否则目标行根本不存在', () => {
    const [collapsed] = dispatch(initial(), { type: 'collapseAll' })
    const [focused, effects] = dispatch(collapsed, { type: 'focusSpan', spanId: 'c' })
    expect(focused.collapsed.size).toBe(0)
    expect(focused.selectedSpanId).toBe('c')
    expect(effects.scrollToRow).toBe(2)
  })

  it('不存在的 spanId 什么都不做', () => {
    const state = initial()
    const [next, effects] = dispatch(state, { type: 'focusSpan', spanId: 'nope' })
    expect(next).toBe(state)
    expect(effects).toEqual({})
  })
})
