import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * example 的深色模式现在是「预设 + 页面变量」两半：
 *   - 组件内部主题走库自带的 `DEFAULT_DARK_THEME`（+ `SERVICE_PALETTE_DARK`），不手抄 token；
 *   - `html.dark` 只负责页面自己的 `--app-*`。
 * 这里把两半都钉住：预设没接上、或者页面变量漏一个（深色下留一块白的），都会红。
 */
const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

const html = read('../examples/react-vite/index.html')
const app = read('../examples/react-vite/src/App.tsx')

const cssBlock = (selector: string) =>
  new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(html)?.[1] ?? ''

const declaredVars = (block: string) =>
  [...block.matchAll(/(--[a-z-]+)\s*:/g)].map((match) => match[1]!)

describe('example · 深色模式', () => {
  it('组件深色主题用库的预设，不手抄 token', () => {
    expect(app).toMatch(/theme:\s*DEFAULT_DARK_THEME/)
    expect(app).toContain('SERVICE_PALETTE_DARK')
    // 页面那份 CSS 不再管组件主题：--otlp-trace-* 只应出现在注释里
    expect(cssBlock('html.dark')).not.toContain('--otlp-trace-')
  })

  it('html.dark 覆盖了页面自己声明的每一个 --app-* 变量', () => {
    const light = declaredVars(cssBlock(':root'))
    const dark = new Set(declaredVars(cssBlock('html.dark')))

    expect(light.length).toBeGreaterThan(0)
    expect(light.filter((name) => !dark.has(name))).toEqual([])
  })

  it('首帧脚本与开关共用同一个 localStorage key', () => {
    const constant = /const SCHEME_STORAGE_KEY = '([^']+)'/.exec(app)?.[1]
    const htmlKeys = [...html.matchAll(/localStorage\.(?:get|set)Item\('([^']+)'/g)].map(
      (match) => match[1],
    )

    expect(constant).toBeDefined()
    expect(new Set(htmlKeys)).toEqual(new Set([constant]))
  })

  it('开关切的就是样式表里那个 class', () => {
    expect(app).toContain("classList.toggle('dark'")
    expect(html).toContain('html.dark')
  })
})
