#!/usr/bin/env node
/**
 * 真浏览器回归（Playwright + chromium）。
 *
 * 为什么必须有这一层：jsdom 没有布局、没有真滚动，`scrollTop` 相关的坐标 bug（名字列双重偏移、
 * hitTest 少加 scrollTop）在 jsdom 里只能靠「断言 style.top 的数字」间接发现，而真浏览器里
 * 一次点击就能看出来。这里把这几件事变成会自动红的检查：
 *
 *   1. 首屏真画出画布（不是空白帧）
 *   2. 深色预设生效（画布底色 = #0b1220）；开关能切回去
 *   3. **滚动后点击**：鼠标底下那一行 == 被选中的那一行（真鼠标事件）
 *   4. **滚动后悬停**：高亮的行 == 鼠标底下那一行
 *   5. 移动视口 + 触摸 tap 也能选中（Pointer Events 在触屏上的路径）
 *   6. 条目从 12 涨到 5000，下方详情区不被时间轴压扁（flex 布局回归）
 *   7. 滚到「半行」位置时，被 sticky 标尺盖住的那半行条子不会画到标尺上面（绘制顺序回归）
 *   8. 折叠三角长在名称列里、在行文字左边，点它能折叠/展开子树（布局 + 交互）
 *   9. 全程没有 console error / 未捕获异常
 *
 * 用法：pnpm browser:check        （需要先 `npx playwright install chromium`）
 * 本地首次：PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers npx playwright install chromium
 */

import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const EXAMPLE_DIST = join(ROOT, 'examples', 'react-vite', 'dist')
const PORT = Number(process.env.BROWSER_CHECK_PORT ?? 5199)

// 浏览器装在仓库里就优先用它（本仓库的开发环境 HOME 可能只读），否则交给 Playwright 默认缓存
const localBrowsers = join(ROOT, '.playwright-browsers')
if (process.env.PLAYWRIGHT_BROWSERS_PATH === undefined && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers
}

const { chromium } = await import('playwright')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

const failures = []
let current = ''

function step(name) {
  current = name
  process.stdout.write(`\n== ${name}\n`)
}

function check(label, condition, detail = '') {
  if (condition) {
    process.stdout.write(`\x1b[32m  OK\x1b[0m ${label}\n`)
    return true
  }
  failures.push(`${current} → ${label}${detail === '' ? '' : `（${detail}）`}`)
  process.stdout.write(`\x1b[31m  FAIL\x1b[0m ${label}${detail === '' ? '' : `（${detail}）`}\n`)
  return false
}

function build() {
  process.stdout.write('== 构建库 + 示例\n')
  execFileSync('pnpm', ['build'], { cwd: ROOT, stdio: 'inherit' })
  execFileSync('pnpm', ['--filter', '@slcomplex/example-react-vite', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function serve() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const path = url.pathname === '/' ? '/index.html' : url.pathname
    const file = join(EXAMPLE_DIST, path)
    if (!file.startsWith(EXAMPLE_DIST) || !existsSync(file)) {
      response.writeHead(404).end('not found')
      return
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    response.end(readFileSync(file))
  })
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)))
}

/** 画布空区域的真实像素（默认取右下角，那里只有底色） */
const canvasPixel = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const [r, g, b] = ctx.getImageData(canvas.width - 30, canvas.height - 20, 1, 1).data
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  })

/** 名字列里那些「完整落在视口里」的行：标题 + 视口 y */
const visibleRows = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="otlp-name-column"] [title]')]
      .map((el) => ({ title: el.getAttribute('title') ?? '', box: el.getBoundingClientRect() }))
      .filter((row) => row.box.height > 0 && row.box.top > 40 && row.box.bottom < 500)
      .map((row) => ({ title: row.title, y: row.box.top + row.box.height / 2 })),
  )

const collectErrors = (page, sink) => {
  page.on('console', (message) => {
    if (message.type() === 'error') sink.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`))
}

async function main() {
  build()
  const server = await serve()
  const base = `http://localhost:${PORT}`
  const browser = await chromium.launch()
  const errors = []

  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } })
  collectErrors(page, errors)

  step('首屏 + 深色预设')
  await page.goto(`${base}/?spans=100&theme=light`, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  check(
    '浅色：画布底色是 #ffffff',
    (await canvasPixel(page)) === '#ffffff',
    await canvasPixel(page),
  )

  await page.goto(`${base}/?spans=100&theme=dark`, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  check(
    '深色预设：画布底色是 #0b1220',
    (await canvasPixel(page)) === '#0b1220',
    await canvasPixel(page),
  )
  check(
    '深色预设：条子用的是深色色板（不是亮色那套）',
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      const ctx = canvas.getContext('2d')
      const dark = [
        '#60a5fa',
        '#2dd4bf',
        '#a78bfa',
        '#22d3ee',
        '#fbbf24',
        '#a3e635',
        '#f0abfc',
        '#94a3b8',
      ]
      const light = [
        '#2563eb',
        '#0d9488',
        '#7c3aed',
        '#db2777',
        '#ca8a04',
        '#0891b2',
        '#4d7c0f',
        '#64748b',
      ]
      // 扫行区那一条：既要有深色色板的像素，又不能有亮色色板的像素
      const data = ctx.getImageData(0, 32, canvas.width, 140).data
      const seen = new Set()
      for (let i = 0; i < data.length; i += 4) {
        seen.add(
          `#${[data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
        )
      }
      return dark.some((color) => seen.has(color)) && !light.some((color) => seen.has(color))
    }),
  )

  step('滚动后：鼠标底下的行 == 点中的行')
  await page.goto(`${base}/?spans=100&theme=dark`, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  const scrolled = await page.evaluate(async () => {
    const scroller = document.querySelector('[role="application"]')
    scroller.scrollTop = 600
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return scroller.scrollTop
  })
  check('时间轴真的滚起来了', scrolled === 600, String(scrolled))

  const rows = await visibleRows(page)
  check('滚动后名字列仍有可见行（不是空白）', rows.length > 3, `${rows.length} 行`)

  const target = rows[Math.floor(rows.length / 2)]
  const canvasBox = await page.locator('canvas').boundingBox()
  const spanName = target.title.split(' · ')[1]

  await page.mouse.click(canvasBox.x + 200, target.y)
  const selected = await page.textContent('[data-testid="otlp-span-detail"] b')
  check(`点中「${spanName}」选中的确实是它`, selected === spanName, `选中了 ${selected}`)

  await page.mouse.move(canvasBox.x + 200, target.y)
  const hovered = await page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid="otlp-name-column"] [title]')]
        .find((el) => el.style.background !== '')
        ?.getAttribute('title') ?? '',
  )
  check(`悬停「${spanName}」高亮的也是它`, hovered === target.title, `高亮了 ${hovered}`)

  step('主题开关')
  await page.click('[role="switch"]')
  await page.waitForTimeout(120)
  check('切回浅色：画布底色变白', (await canvasPixel(page)) === '#ffffff', await canvasPixel(page))
  check(
    '选择写进了 localStorage',
    (await page.evaluate(() => localStorage.getItem('otlp-example-theme'))) === 'light',
  )

  step('移动端视口 + 触摸')
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  collectErrors(mobile, errors)
  await mobile.goto(`${base}/?spans=100&theme=dark`, { waitUntil: 'load' })
  await mobile.waitForSelector('canvas')
  const narrow = await mobile.evaluate(() => {
    const column = document.querySelector('[data-testid="otlp-name-column"]')
    const canvas = document.querySelector('canvas')
    return {
      nameWidth: column.getBoundingClientRect().width,
      plot: canvas.getBoundingClientRect().width,
    }
  })
  check('窄容器里名称列让位、时间轴仍有宽度', narrow.plot >= 120, JSON.stringify(narrow))

  const mobileRows = await visibleRows(mobile)
  check('移动视口里也有可见行', mobileRows.length > 0, `${mobileRows.length} 行`)
  if (mobileRows.length > 0) {
    const mobileTarget = mobileRows[1]
    const mobileCanvas = await mobile.locator('canvas').boundingBox()
    await mobile.touchscreen.tap(mobileCanvas.x + 120, mobileTarget.y)
    const tapped = await mobile.textContent('[data-testid="otlp-span-detail"] b')
    check(
      `触摸点中「${mobileTarget.title.split(' · ')[1]}」也选中它`,
      tapped === mobileTarget.title.split(' · ')[1],
      `选中了 ${tapped}`,
    )
  }

  step('条目多时详情区不被压扁')
  // 回归：时间轴那层的 flex-basis 曾是 auto → 基准尺寸 = 内容高度 = 行数 × rowHeight
  // （5000 行 ≈ 11 万 px），flex 的收缩量按基准尺寸摊派，于是详情面板被一起压扁
  // （示例配的 300px 只剩 23px，内容只能滚）。jsdom 没有布局引擎，测不出来，所以守在这里。
  const detailHeightFor = async (spans) => {
    await page.goto(`${base}/?spans=${spans}&theme=light`, { waitUntil: 'load' })
    await page.waitForSelector('canvas')
    await page.locator('[role="application"]').focus()
    await page.keyboard.press('ArrowDown') // 选中一行，详情面板才会撑到配置高度
    await page.waitForTimeout(120)
    return page.evaluate(() => {
      const detail = document.querySelector('[data-testid="otlp-span-detail"]')
      return detail === null ? null : Math.round(detail.getBoundingClientRect().height)
    })
  }
  const fewRows = await detailHeightFor(12)
  const manyRows = await detailHeightFor(5000)
  check(
    '条目数 12 → 5000，详情区高度不变（不随行数收缩）',
    fewRows === manyRows,
    `12 行 ${fewRows}px → 5000 行 ${manyRows}px`,
  )
  check(
    '详情区拿得到配置高度（示例传的是 300px）',
    manyRows !== null && manyRows >= 300,
    `${manyRows}px`,
  )

  step('标尺挡住半行条子')
  // 回归：标尺带曾经画在条子**之前**，滚到「半行」位置时，被 sticky 标尺盖住的那半行条子会画到标尺上面去。
  // 先按 F 回到 fit：上一步的 ArrowDown 触发过 focusSpan，会把视口缩到被选中那个 span 的宽度（几 µs），
  // 那种视口下可见行里一条 bar 都没有，检查就空转了（下面的正控制就是防这个）。
  await page.locator('[role="application"]').focus()
  await page.keyboard.press('f')
  await page.waitForTimeout(150)
  const band = await page.evaluate(async () => {
    const scroller = document.querySelector('[role="application"]')
    scroller.scrollTop = 611 // 不是行高的整数倍：第一行会被标尺盖掉一半
    for (let i = 0; i < 6; i++) await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => setTimeout(r, 150))
    const canvas = document.querySelector('canvas')
    const dpr = canvas.width / parseFloat(canvas.style.width)
    const ctx = canvas.getContext('2d')
    // 饱和度高的才算条子（网格线/文字/边框都是灰的）
    const hasBar = (y) => {
      const row = ctx.getImageData(0, y, canvas.width, 1).data
      for (let x = 0; x < canvas.width; x++) {
        const i = x * 4
        if (
          Math.max(row[i], row[i + 1], row[i + 2]) - Math.min(row[i], row[i + 1], row[i + 2]) >
          40
        ) {
          return true
        }
      }
      return false
    }
    const rulerRows = Math.round(28 * dpr) // DEFAULT_METRICS.rulerHeight
    let inRuler = 0
    for (let y = 0; y < rulerRows; y++) if (hasBar(y)) inRuler++
    let below = 0
    for (let y = rulerRows + 8; y < canvas.height; y += 2) if (hasBar(y)) below++
    return { inRuler, below, rulerRows, scrollTop: scroller.scrollTop }
  })
  check(
    '标尺带里没有条子颜色',
    band.inRuler === 0,
    `标尺 ${band.rulerRows}px 内有条子的扫描行 ${band.inRuler}`,
  )
  check('标尺下方确实有条子（保证上一条不是空画布）', band.below > 5, `${band.below} 行有条子`)

  step('折叠三角在名称列里（文字左边）')
  // 三角必须落在左侧名称列内、且在行文字左边 —— 这是布局量，jsdom 验不了
  await page.goto(`${base}/?spans=100&theme=light`, { waitUntil: 'load' })
  await page.waitForSelector('canvas')
  const caret = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="otlp-toggle-s000000"]')
    const column = document.querySelector('[data-testid="otlp-name-column"]')
    const canvas = document.querySelector('canvas')
    const row = button?.closest('[title]')
    if (button === null || column === null || canvas === null || row === null) return null
    const box = button.getBoundingClientRect()
    const columnBox = column.getBoundingClientRect()
    const firstText = row.children[1].getBoundingClientRect()
    return {
      left: Math.round(box.left),
      right: Math.round(box.right),
      width: Math.round(box.width),
      columnLeft: Math.round(columnBox.left),
      columnRight: Math.round(columnBox.right),
      canvasLeft: Math.round(canvas.getBoundingClientRect().left),
      textLeft: Math.round(firstText.left),
      expanded: button.getAttribute('aria-expanded'),
      rows: document.querySelectorAll('[data-testid="otlp-name-column"] [title]').length,
    }
  })
  check('第一行（有子节点）渲染出了三角', caret !== null)
  if (caret !== null) {
    check(
      '三角在名称列内、没越过 canvas 左边界',
      caret.left >= caret.columnLeft && caret.right <= caret.canvasLeft,
      `三角 ${caret.left}..${caret.right}，名称列 ${caret.columnLeft}..${caret.columnRight}，canvas 起于 ${caret.canvasLeft}`,
    )
    check(
      '三角在行文字的左边',
      caret.right <= caret.textLeft,
      `三角右缘 ${caret.right} ≤ 文字左缘 ${caret.textLeft}`,
    )
    await page.click('[data-testid="otlp-toggle-s000000"]')
    await page.waitForTimeout(120)
    const collapsed = await page.evaluate(() => ({
      expanded: document
        .querySelector('[data-testid="otlp-toggle-s000000"]')
        ?.getAttribute('aria-expanded'),
      rows: document.querySelectorAll('[data-testid="otlp-name-column"] [title]').length,
      // 折叠后 canvas 上也不该再画被折掉的子行：条子数变少
      detail: document.querySelector('[data-testid="otlp-span-detail"]') !== null,
    }))
    check(
      '点三角折叠了子树（名称列行数变少）',
      collapsed.rows < caret.rows,
      `${caret.rows} → ${collapsed.rows} 行`,
    )
    check('aria-expanded 跟着变 false', collapsed.expanded === 'false', String(collapsed.expanded))
    await page.click('[data-testid="otlp-toggle-s000000"]')
    await page.waitForTimeout(120)
    const reopened = await page.evaluate(
      () => document.querySelectorAll('[data-testid="otlp-name-column"] [title]').length,
    )
    check('再点一次恢复展开', reopened === caret.rows, `${reopened} 行`)
  }

  step('控制台干净')
  check('没有 console error / 未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '))

  await browser.close()
  server.close()

  if (failures.length > 0) {
    process.stdout.write(`\n\x1b[31m${failures.length} 项失败：\x1b[0m\n`)
    for (const failure of failures) process.stdout.write(`  - ${failure}\n`)
    process.exit(1)
  }
  process.stdout.write(
    '\n\x1b[32m全部通过\x1b[0m：真浏览器回归（渲染 / 主题 / 滚动点击 / 悬停 / 触摸 / 布局）\n',
  )
}

await main()
