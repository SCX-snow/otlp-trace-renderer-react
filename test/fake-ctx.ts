export interface CtxOp {
  op:
    | 'save'
    | 'restore'
    | 'setTransform'
    | 'fillRect'
    | 'strokeRect'
    | 'fillText'
    | 'beginPath'
    | 'moveTo'
    | 'lineTo'
    | 'closePath'
    | 'fill'
  args: number[]
  text?: string
  fillStyle?: string
  strokeStyle?: string
  textAlign?: string
}

export interface FakeCtx {
  ctx: CanvasRenderingContext2D
  ops: CtxOp[]
  reset(): void
}

/** 11px 系统字体下，一个字符大约这么宽 —— 单测只需要「宽度随文字长度增长」这个性质 */
export const FAKE_CHAR_WIDTH = 6

const STATE_KEYS = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'font',
  'textAlign',
  'textBaseline',
] as const

/**
 * 记录调用序列的假 2D context。
 *
 * 只实现绘制函数真正用到的那几个方法 —— 与其装 node-canvas 做像素比对，不如断言几何：
 * 长条画在哪、画了几条、视口外的有没有被剔掉。像素级回归留给肉眼。
 */
export function createFakeCtx(): FakeCtx {
  const ops: CtxOp[] = []
  const state: Record<string, string | number> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  }

  const record = (op: CtxOp['op'], args: number[], text?: string) => {
    ops.push({
      op,
      args,
      ...(text === undefined ? {} : { text }),
      fillStyle: String(state['fillStyle']),
      strokeStyle: String(state['strokeStyle']),
      textAlign: String(state['textAlign']),
    })
  }

  const ctx = {
    save: () => record('save', []),
    setTransform: (...args: number[]) => record('setTransform', args),
    restore: () => record('restore', []),
    fillRect: (x: number, y: number, w: number, h: number) => record('fillRect', [x, y, w, h]),
    strokeRect: (x: number, y: number, w: number, h: number) => record('strokeRect', [x, y, w, h]),
    fillText: (text: string, x: number, y: number) => record('fillText', [x, y], text),
    // 量文字宽度用；它不往画布上画东西，所以不进 ops
    measureText: (text: string) => ({ width: text.length * FAKE_CHAR_WIDTH }),
    beginPath: () => record('beginPath', []),
    moveTo: (x: number, y: number) => record('moveTo', [x, y]),
    lineTo: (x: number, y: number) => record('lineTo', [x, y]),
    closePath: () => record('closePath', []),
    fill: () => record('fill', []),
  } as unknown as CanvasRenderingContext2D

  for (const key of STATE_KEYS) {
    Object.defineProperty(ctx, key, {
      get: () => state[key],
      set: (value: string | number) => {
        state[key] = value
      },
      enumerable: true,
      configurable: true,
    })
  }

  return {
    ctx,
    ops,
    reset: () => {
      ops.length = 0
    },
  }
}

/**
 * 什么都不做的 ctx，用于基准测试。
 * 记录版会为每次调用分配对象，测出来的是「记录器的开销」而不是绘制几何的开销。
 */
const noop = () => {}

export function createNullCtx(): CanvasRenderingContext2D {
  return {
    save: noop,
    setTransform: noop,
    restore: noop,
    fillRect: noop,
    strokeRect: noop,
    fillText: noop,
    measureText: (text: string) => ({ width: text.length * FAKE_CHAR_WIDTH }),
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    fill: noop,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'start',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D
}
