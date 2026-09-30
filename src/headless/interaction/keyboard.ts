




export type KeyboardCommand =
  | { type: 'moveSelection'; delta: number }
  | { type: 'setCollapsed'; collapsed: boolean }
  | { type: 'zoom'; factor: number }
  | { type: 'panByFraction'; fraction: number }
  | { type: 'fit' }
  | { type: 'reset' }
  | { type: 'clearSelection' }
  | { type: 'activateSelection' }

export interface KeyLike {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
}

const PAN_FRACTION = 0.25
const ZOOM_STEP = 1.5

export function resolveKeyCommand(event: KeyLike): KeyboardCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null

  switch (event.key) {
    case 'ArrowDown':
      return { type: 'moveSelection', delta: 1 }
    case 'ArrowUp':
      return { type: 'moveSelection', delta: -1 }
    case 'ArrowRight':

      return event.shiftKey
        ? { type: 'panByFraction', fraction: PAN_FRACTION }
        : { type: 'setCollapsed', collapsed: false }
    case 'ArrowLeft':
      return event.shiftKey
        ? { type: 'panByFraction', fraction: -PAN_FRACTION }
        : { type: 'setCollapsed', collapsed: true }
    case 'Enter':
      return { type: 'activateSelection' }
    case 'Escape':
      return { type: 'clearSelection' }
    case '+':
    case '=':
    case 'Add':
      return { type: 'zoom', factor: ZOOM_STEP }
    case '-':
    case '_':
    case 'Subtract':
      return { type: 'zoom', factor: 1 / ZOOM_STEP }
    case 'f':
    case 'F':
      return { type: 'fit' }
    case '0':
      return { type: 'reset' }
    default:
      return null
  }
}
