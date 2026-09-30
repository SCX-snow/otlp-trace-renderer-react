import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'







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

  it('用文档里的写法拒绝浏览器的自动深色（而不是被它变暗）', () => {
    expect(html).toMatch(/<meta name="color-scheme" content="only light"\s*\/?>/)
  })

  it('没明确选过时跟着系统偏好走，运行中切也跟', () => {
    expect(app).toContain("matchMedia('(prefers-color-scheme: dark)')")
    expect(app).toContain("media.addEventListener('change', sync)")
    // 明确选过（开关 / ?theme= / localStorage）就不再听系统
    expect(app).toMatch(/if \(followSystem\) return/)
    expect(app).toContain('hasExplicitScheme')
  })
})
