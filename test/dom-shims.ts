import { vi } from 'vitest'
import { createFakeCtx } from './fake-ctx'

export interface DomShims {
  ctx: ReturnType<typeof createFakeCtx>
  fireResize(target?: Element): void
  resizeTo(width: number, height: number): void
  fireMediaChange(): void
}

const resizeEntry = (target: Element) =>
  ({
    target,
    contentRect: {
      width: target.clientWidth,
      height: target.clientHeight,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: target.clientWidth,
      bottom: target.clientHeight,
      toJSON: () => ({}),
    },
  }) as unknown as ResizeObserverEntry

export function installDomShims(width = 900, height = 400, language = 'en-US'): DomShims {
  const ctx = createFakeCtx()
  let cssWidth = width
  let cssHeight = height

  const observers: { callback: ResizeObserverCallback; targets: Element[] }[] = []
  const mediaListeners = new Set<() => void>()

  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => cssWidth,
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => cssHeight,
  })

  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      const styled = Number.parseFloat(this.style.width)
      return Number.isFinite(styled) ? styled : cssWidth
    },
  })
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLCanvasElement) {
      const styled = Number.parseFloat(this.style.height)
      return Number.isFinite(styled) ? styled : cssHeight
    },
  })

  HTMLCanvasElement.prototype.getContext = (() =>
    ctx.ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: cssWidth,
      height: cssHeight,
      right: cssWidth,
      bottom: cssHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
  Element.prototype.hasPointerCapture = () => false

  globalThis.ResizeObserver = function ResizeObserverShim(callback: ResizeObserverCallback) {
    const targets: Element[] = []
    observers.push({ callback, targets })
    return {
      observe(target: Element) {
        if (!targets.includes(target)) targets.push(target)
      },
      unobserve(target: Element) {
        const index = targets.indexOf(target)
        if (index !== -1) targets.splice(index, 1)
      },
      disconnect() {
        targets.length = 0
      },
    }
  } as unknown as typeof ResizeObserver

  const fireResize = (target?: Element) => {
    for (const observer of observers) {
      if (observer.targets.length === 0) continue
      if (target !== undefined && !observer.targets.includes(target)) continue
      observer.callback(
        observer.targets.map((observed) => resizeEntry(observed)),
        undefined as unknown as ResizeObserver,
      )
    }
  }

  const resizeTo = (nextWidth: number, nextHeight: number) => {
    cssWidth = nextWidth
    cssHeight = nextHeight
    fireResize()
  }

  const fireMediaChange = () => {
    const listeners = Array.from(mediaListeners)
    for (const listener of listeners) listener()
  }

  Object.defineProperty(window.navigator, 'language', { configurable: true, value: language })
  Object.defineProperty(window.navigator, 'languages', { configurable: true, value: [language] })
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'change') mediaListeners.add(listener)
    },
    removeEventListener: (_type: string, listener: () => void) => {
      mediaListeners.delete(listener)
    },
    addListener: (listener: () => void) => {
      mediaListeners.add(listener)
    },
    removeListener: (listener: () => void) => {
      mediaListeners.delete(listener)
    },
    dispatchEvent: () => false,
  }))

  vi.stubGlobal(
    'requestAnimationFrame',
    (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0) as unknown as number,
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle))

  return { ctx, fireResize, resizeTo, fireMediaChange }
}
