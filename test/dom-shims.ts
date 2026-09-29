import { vi } from 'vitest'
import { createFakeCtx } from './fake-ctx'

export interface DomShims {
  ctx: ReturnType<typeof createFakeCtx>
}

/**
 * jsdom 没有布局引擎、没有 canvas、没有 ResizeObserver、没有 matchMedia。
 * 这几样都得手工搭起来，否则组件在 jsdom 里永远拿到 0×0 尺寸，什么都渲染不出来。
 */
export function installDomShims(width = 900, height = 400, language = 'en-US'): DomShims {
  const ctx = createFakeCtx()

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => width,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => height,
  })
  // jsdom 没有布局引擎，canvas 的尺寸只能从内联 style 里推（组件就是这么设的）
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      const styled = Number.parseFloat(this.style.width)
      return Number.isFinite(styled) ? styled : width
    },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      const styled = Number.parseFloat(this.style.height)
      return Number.isFinite(styled) ? styled : height
    },
  })

  HTMLCanvasElement.prototype.getContext = (() =>
    ctx.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  // navigator.languages 优先于 navigator.language，两个都要盖掉，否则读出来还是 en-US
  Object.defineProperty(window.navigator, 'language', { configurable: true, value: language })
  Object.defineProperty(window.navigator, 'languages', { configurable: true, value: [language] })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))

  // 让 rAF 走 setTimeout，测试里可以用 waitFor 等它
  vi.stubGlobal(
    'requestAnimationFrame',
    (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number,
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))

  return { ctx }
}
