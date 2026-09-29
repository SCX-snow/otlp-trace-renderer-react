// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TOKENS } from '../src/headless/theme/tokens'
import { TraceTimeline } from '../src/react/TraceTimeline'
import type { CtxOp } from './fake-ctx'
import { installDomShims } from './dom-shims'
import { rawSpan, toTraceData } from './helpers/trace-factory'

/**
 * 主题解析：CSS 变量 → canvas 用的颜色值。
 *
 * 深色模式（`examples/react-vite` 里的开关）就靠这条链路：在 `documentElement` 上换个 class，
 * canvas 必须重新解析 CSS 变量并重画 —— 这条以前没有测试盯着。
 */
const cssVars: Record<string, string> = {}
const DARK_BG = '#0b1220'

let ctx: ReturnType<typeof installDomShims>['ctx']

beforeEach(() => {
  ctx = installDomShims(900, 400).ctx
  cssVars[TOKENS.bg] = '#ffffff'
  cssVars[TOKENS.bar] = '#2563eb'
  // jsdom 的 getComputedStyle 不认自定义属性，这里喂一份可控的「假样式表」
  vi.stubGlobal(
    'getComputedStyle',
    () =>
      ({
        getPropertyValue: (name: string) => cssVars[name] ?? '',
      }) as unknown as CSSStyleDeclaration,
  )
})

afterEach(() => {
  cleanup()
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-theme')
  vi.unstubAllGlobals()
})

const trace = toTraceData([rawSpan('root', 0, 1000), rawSpan('a', 100, 400, 'root')])

const bgFills = (color: string) =>
  ctx.ops.filter((op: CtxOp) => op.op === 'fillRect' && op.fillStyle === color).length

/** 最后一帧的绘制指令（每次 render 开头都会 setTransform，用它切帧） */
const lastFrame = () => {
  let start = 0
  ctx.ops.forEach((op: CtxOp, index: number) => {
    if (op.op === 'setTransform') start = index
  })
  return ctx.ops.slice(start)
}

const frameBgs = (ops: CtxOp[]) =>
  ops.filter((op) => op.op === 'fillRect' && op.fillStyle !== undefined).map((op) => op.fillStyle)

describe('主题解析（CSS 变量 → canvas）', () => {
  it('挂载时按 CSS 变量解析颜色', async () => {
    render(<TraceTimeline trace={trace} height={400} />)

    await waitFor(() => expect(bgFills('#ffffff')).toBeGreaterThan(0))
    expect(bgFills(DARK_BG)).toBe(0)
  })

  /**
   * 回归测试：主题解析完必须**当帧**重画，不能等 rAF。
   *
   * 真实事故：深色模式打开时 canvas 先拿 DEFAULT_THEME（亮色）画了首帧，主题解析出来只合并到
   * 下一帧 —— 深色用户看到一次白闪，headless 截图必拍到。这里把 rAF 摘掉，只有同步路径能过：
   * 只要最后一帧全是深色，浏览器那一帧就是对的（亮色帧在 commit 里就被覆盖了，上不了屏）。
   */
  it('rAF 不可用时，首帧渲染完最后一帧就已是深色（不许白闪一帧）', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    cssVars[TOKENS.bg] = DARK_BG

    render(<TraceTimeline trace={trace} height={400} />)

    await waitFor(() => expect(frameBgs(lastFrame())).toContain(DARK_BG))
    expect(frameBgs(lastFrame())).not.toContain('#ffffff')
  })

  it('documentElement 换 class 后重新解析并重画', async () => {
    render(<TraceTimeline trace={trace} height={400} />)
    await waitFor(() => expect(bgFills('#ffffff')).toBeGreaterThan(0))

    // 换变量 + 换 class：等价于用户切到深色主题
    cssVars[TOKENS.bg] = DARK_BG
    document.documentElement.classList.add('dark')

    await waitFor(() => expect(bgFills(DARK_BG)).toBeGreaterThan(0))
  })

  it('rAF 不可用时，换 class 也当帧重画', async () => {
    render(<TraceTimeline trace={trace} height={400} />)
    await waitFor(() => expect(bgFills('#ffffff')).toBeGreaterThan(0))

    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    ctx.reset()
    cssVars[TOKENS.bg] = DARK_BG
    document.documentElement.classList.add('dark')

    await waitFor(() => expect(frameBgs(lastFrame())).toContain(DARK_BG))
  })

  it('data-theme 属性换主题同样有效', async () => {
    render(<TraceTimeline trace={trace} height={400} />)
    await waitFor(() => expect(bgFills('#ffffff')).toBeGreaterThan(0))

    // 不是所有项目都用 class 切主题（Bootstrap / MUI 那套用 data-theme）
    cssVars[TOKENS.bg] = DARK_BG
    document.documentElement.setAttribute('data-theme', 'dark')

    await waitFor(() => expect(bgFills(DARK_BG)).toBeGreaterThan(0))
  })

  it('theme prop 直接叠在解析结果上，不用改 CSS', async () => {
    render(<TraceTimeline trace={trace} height={400} theme={{ bg: '#123456' }} />)

    await waitFor(() => expect(bgFills('#123456')).toBeGreaterThan(0))
  })
})
