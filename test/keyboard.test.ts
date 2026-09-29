import { describe, expect, it } from 'vitest'
import { resolveKeyCommand, type KeyLike } from '../src/headless/interaction/keyboard'
import {
  DEFAULT_METRICS,
  MIN_PLOT_WIDTH,
  resolveNameColumnWidth,
} from '../src/headless/layout/metrics'

const key = (k: string, modifiers: Partial<KeyLike> = {}): KeyLike => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...modifiers,
})

describe('resolveKeyCommand', () => {
  it('上下键移动选中', () => {
    expect(resolveKeyCommand(key('ArrowDown'))).toEqual({ type: 'moveSelection', delta: 1 })
    expect(resolveKeyCommand(key('ArrowUp'))).toEqual({ type: 'moveSelection', delta: -1 })
  })

  it('左右键折叠 / 展开（幂等，不是 toggle）', () => {
    expect(resolveKeyCommand(key('ArrowRight'))).toEqual({ type: 'setCollapsed', collapsed: false })
    expect(resolveKeyCommand(key('ArrowLeft'))).toEqual({ type: 'setCollapsed', collapsed: true })
  })

  it('Shift + 左右键平移视口', () => {
    expect(resolveKeyCommand(key('ArrowRight', { shiftKey: true }))).toEqual({
      type: 'panByFraction',
      fraction: 0.25,
    })
    expect(resolveKeyCommand(key('ArrowLeft', { shiftKey: true }))).toEqual({
      type: 'panByFraction',
      fraction: -0.25,
    })
  })

  it('加减号缩放，等号与下划线都认（不同键盘布局）', () => {
    for (const k of ['+', '=', 'Add']) {
      expect(resolveKeyCommand(key(k))).toEqual({ type: 'zoom', factor: 1.5 })
    }
    for (const k of ['-', '_', 'Subtract']) {
      expect(resolveKeyCommand(key(k))).toEqual({ type: 'zoom', factor: 1 / 1.5 })
    }
  })

  it('F 适配窗口、0 重置、Esc 取消选中、Enter 进详情', () => {
    expect(resolveKeyCommand(key('f'))).toEqual({ type: 'fit' })
    expect(resolveKeyCommand(key('F'))).toEqual({ type: 'fit' })
    expect(resolveKeyCommand(key('0'))).toEqual({ type: 'reset' })
    expect(resolveKeyCommand(key('Escape'))).toEqual({ type: 'clearSelection' })
    expect(resolveKeyCommand(key('Enter'))).toEqual({ type: 'activateSelection' })
  })

  it('带 Ctrl / Cmd / Alt 的组合一律不接管', () => {
    expect(resolveKeyCommand(key('f', { ctrlKey: true }))).toBeNull()
    expect(resolveKeyCommand(key('ArrowDown', { metaKey: true }))).toBeNull()
    expect(resolveKeyCommand(key('0', { altKey: true }))).toBeNull()
  })

  it('没映射的键返回 null（组件据此不 preventDefault）', () => {
    for (const k of ['a', 'Tab', ' ', 'PageDown', 'Shift']) {
      expect(resolveKeyCommand(key(k))).toBeNull()
    }
  })
})

describe('resolveNameColumnWidth', () => {
  it('容器够宽就用期望宽度', () => {
    expect(resolveNameColumnWidth(900, 280)).toBe(280)
  })

  it('窄容器按比例收窄，时间轴至少留 MIN_PLOT_WIDTH', () => {
    expect(resolveNameColumnWidth(300, 280)).toBe(300 - MIN_PLOT_WIDTH)
    expect(resolveNameColumnWidth(300, 280) + MIN_PLOT_WIDTH).toBe(300)
  })

  it('极窄容器名称列直接归零，也不出负数', () => {
    expect(resolveNameColumnWidth(100, 280)).toBe(0)
    expect(resolveNameColumnWidth(0, 280)).toBe(0)
    expect(resolveNameColumnWidth(Number.NaN, 280)).toBe(0)
  })

  it('默认值就是 DEFAULT_METRICS 的名称列宽', () => {
    expect(resolveNameColumnWidth(1200)).toBe(DEFAULT_METRICS.nameColumnWidth)
  })

  it('任何输入下 名称列 + 时间轴 都不超过容器宽', () => {
    for (let width = 0; width <= 1200; width += 17) {
      const name = resolveNameColumnWidth(width, 280)
      expect(name).toBeGreaterThanOrEqual(0)
      expect(name).toBeLessThanOrEqual(width)
      expect(width - name).toBeGreaterThanOrEqual(Math.min(MIN_PLOT_WIDTH, width))
    }
  })
})
