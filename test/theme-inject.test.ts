import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_THEME, TOKENS } from '../src/headless/theme/tokens'
import { acquireThemeDefaults, themeRefCount, themeToCss } from '../src/react/theme-inject'

const STYLE_ID = 'otlp-trace-tokens'
const styleTag = () => document.getElementById(STYLE_ID)

const acquired: Array<() => void> = []
const acquire = () => {
  const release = acquireThemeDefaults()
  acquired.push(release)
  return release
}
const releaseAll = () => {
  while (acquired.length > 0) acquired.pop()!()
}

afterEach(releaseAll)

describe('theme-inject', () => {
  it('注入默认 token 到 :where(:root)；引用计数归零时把 style 元素摘掉', () => {
    const release = acquire()

    expect(themeRefCount()).toBe(1)
    expect(styleTag()?.textContent).toContain(':where(:root)')
    expect(styleTag()?.textContent).toContain(`${TOKENS.bg}:${DEFAULT_THEME.bg}`)

    release()
    expect(themeRefCount()).toBe(0)
    expect(styleTag()).toBeNull()
  })

  it('重复释放是幂等的，计数不会变负（StrictMode 下 cleanup 可能跑两次）', () => {
    const release = acquire()
    release()
    expect(() => release()).not.toThrow()
    expect(themeRefCount()).toBe(0)
  })

  it('多个使用者共享同一个 style 元素，最后一个释放才移除', () => {
    const first = acquire()
    const second = acquire()

    expect(themeRefCount()).toBe(2)
    expect(document.querySelectorAll(`#${STYLE_ID}`)).toHaveLength(1)

    first()
    expect(themeRefCount()).toBe(1)
    expect(styleTag()).not.toBeNull()

    second()
    expect(styleTag()).toBeNull()
  })

  it('themeToCss 只输出真正给了值的 token', () => {
    expect(themeToCss({ bg: '#000000' })).toBe(`${TOKENS.bg}:#000000`)
    expect(themeToCss({})).toBe('')
  })
})
