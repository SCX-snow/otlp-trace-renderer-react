import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DARK_THEME,
  DEFAULT_THEME,
  TOKENS,
  type ThemeToken,
} from '../src/headless/theme/tokens'
import { SERVICE_PALETTE, SERVICE_PALETTE_DARK } from '../src/render/colors'
import { contrastRatio as contrast, hueOf, inRedBand } from './helpers/color'

const tokenKeys = Object.keys(TOKENS) as ThemeToken[]

describe('主题预设', () => {
  for (const [name, theme] of [
    ['DEFAULT_THEME', DEFAULT_THEME],
    ['DEFAULT_DARK_THEME', DEFAULT_DARK_THEME],
  ] as const) {
    it(`${name} 每个 token 都有值`, () => {
      expect(new Set(Object.keys(theme))).toEqual(new Set(Object.keys(TOKENS)))
      for (const [key, value] of Object.entries(theme)) {
        expect(`${key}=${value}`).toMatch(/=\S/)
      }
    })
  }

  it('深色预设不是把亮色预设抄了一遍', () => {
    const same = tokenKeys.filter(
      (token) => token !== 'fontFamily' && DEFAULT_THEME[token] === DEFAULT_DARK_THEME[token],
    )
    expect(same).toEqual([])
  })

  it('深色预设的颜色对比度：正文 ≥ 4.5:1，图形元素 ≥ 3:1', () => {
    const bg = DEFAULT_DARK_THEME.bg
    const textLike: ThemeToken[] = ['text', 'textMuted', 'rulerText']
    const graphical: ThemeToken[] = ['bar', 'barSelected', 'focusRing', 'errorBar']

    for (const token of textLike) {
      expect(`${token}=${contrast(DEFAULT_DARK_THEME[token], bg).toFixed(2)}`).toMatch(
        /=([4-9]|1\d)\./,
      )
    }
    for (const token of graphical) {
      expect(contrast(DEFAULT_DARK_THEME[token], bg)).toBeGreaterThanOrEqual(3)
    }
  })

  it('亮色预设的正文对比度同样过门槛', () => {
    const bg = DEFAULT_THEME.bg
    for (const token of ['text', 'textMuted'] as ThemeToken[]) {
      expect(contrast(DEFAULT_THEME[token], bg)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('service 色板', () => {
  it('两套色板都是 8 色、互不重复，且都不含红', () => {
    for (const palette of [SERVICE_PALETTE, SERVICE_PALETTE_DARK]) {
      expect(palette).toHaveLength(8)
      expect(new Set(palette).size).toBe(8)
      for (const color of palette) expect(inRedBand(hueOf(color))).toBe(false)
    }
  })

  it('深色色板相对深色底 ≥ 3:1（亮色板在深底上有偏暗的，所以另给一套）', () => {
    const bg = DEFAULT_DARK_THEME.bg
    for (const color of SERVICE_PALETTE_DARK) {
      expect(contrast(color, bg)).toBeGreaterThanOrEqual(3)
    }

    const dimmest = Math.min(...SERVICE_PALETTE.map((color) => contrast(color, bg)))
    expect(dimmest).toBeLessThan(4)
  })
})

describe('theme-inject 在没有 document 的环境', () => {
  it('注入是空操作、释放也不抛，计数保持 0', async () => {
    const { acquireThemeDefaults, themeRefCount } = await import('../src/react/theme-inject')

    const release = acquireThemeDefaults()
    expect(typeof release).toBe('function')
    expect(themeRefCount()).toBe(0)

    expect(() => release()).not.toThrow()
    expect(themeRefCount()).toBe(0)
  })
})
