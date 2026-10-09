import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installDomShims } from './dom-shims'

type ComposedStories = Record<string, (props: Record<string, unknown>) => JSX.Element>

let composed: ComposedStories

beforeEach(async () => {
  installDomShims()
  const { composeStories } = await import('@storybook/react')
  const stories = await import('../stories/TraceDetailView.stories')
  composed = composeStories(stories as never) as unknown as ComposedStories
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('stories 全部可渲染', () => {
  it('收集到全部 story', () => {
    expect(new Set(Object.keys(composed))).toEqual(
      new Set([
        'ControlledViewport',
        'CustomLocale',
        'CustomMessages',
        'CustomSlots',
        'DarkTheme',
        'DetailSlots',
        'Empty',
        'FiveThousandSpans',
        'HundredSpans',
        'Japanese',
        'NarrowContainer',
        'Realistic',
        'SingleSpan',
      ]),
    )
  })

  it.each([
    'Realistic',
    'HundredSpans',
    'FiveThousandSpans',
    'SingleSpan',
    'DarkTheme',
    'DetailSlots',
    'ControlledViewport',
    'CustomSlots',
    'Japanese',
    'CustomMessages',
    'CustomLocale',
    'NarrowContainer',
  ])('%s 渲染不抛错且挂上了 canvas', async (name) => {
    const Story = composed[name]!
    const { container } = render(<Story />)
    expect(container.querySelector('canvas')).not.toBeNull()
  })

  it('空 trace 的 story 走 DOM 空态，不画 canvas', async () => {
    const Story = composed.Empty!
    const { container } = render(<Story />)
    expect(container.querySelectorAll('[title*=" · op-"]')).toHaveLength(0)
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('[data-testid="otlp-trace-empty"]')).not.toBeNull()
  })
})
