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


export const FAKE_CHAR_WIDTH = 6

const STATE_KEYS = [
  'fillStyle',
  'strokeStyle',
  'lineWidth',
  'font',
  'textAlign',
  'textBaseline',
] as const







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
