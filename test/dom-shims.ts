import { vi } from 'vitest'
import { createFakeCtx } from './fake-ctx'

export interface DomShims {
  ctx: ReturnType<typeof createFakeCtx>
}





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


  vi.stubGlobal(
    'requestAnimationFrame',
    (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number,
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))

  return { ctx }
}
