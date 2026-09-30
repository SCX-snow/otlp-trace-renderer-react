import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HEADLESS = join(ROOT, 'src', 'headless')

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/, reason: 'headless 层不得依赖 React' },
  { pattern: /\bdocument\s*\./, reason: 'headless 层不得触碰 DOM' },
  { pattern: /\bwindow\s*\./, reason: 'headless 层不得触碰 DOM' },
  { pattern: /\bResizeObserver\b/, reason: 'headless 层不得触碰 DOM' },
  { pattern: /\bCanvasRenderingContext2D\b/, reason: 'headless 层不得依赖 canvas 类型' },
]


function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return tsFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

describe('层边界：headless 必须零 DOM 零框架', () => {
  const files = tsFiles(HEADLESS)

  it('headless 目录里有东西可查（防止目录改名后测试静默空转）', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${relative(ROOT, file)} 不越界`, () => {
      const offenders: string[] = []
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.replace(/\/\/.*$/, '')
          for (const { pattern, reason } of FORBIDDEN) {
            if (pattern.test(code)) offenders.push(`L${i + 1} ${reason}: ${line.trim()}`)
          }
        })
      expect(offenders).toEqual([])
    })
  }
})
