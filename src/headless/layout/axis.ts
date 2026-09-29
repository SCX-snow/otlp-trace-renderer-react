import type { Metrics } from './metrics'

/**
 * 时间轴的横向几何。
 *
 * 一条 bar 的左边缘 = `paddingX + toX(startUs, viewport, timeWidth)`，**横坐标只由时间决定**：
 * 树深度不再让 bar 右移。原因：缩进是**逐行**的偏移，而网格线是一条贯穿所有行的直线 ——
 * 只要每行的偏移不同，网格/刻度就必然只能和其中一种深度的行对上，其余行读出来的时间全是错的
 * （5k 行、12 层时最深行偏 144px ≈ 14ms，用户看到的「开始时间和坐标轴对不上」就是这个）。
 * 层级改由左侧名称列（DOM 文本缩进）表达，那里本来就要缩进，且不占时间轴的宽度。
 */
export interface TimeAxis {
  /** 「时间 → 像素」可用的宽度：画布宽 − 左右留白。bar、刻度、网格线、命中测试都必须用它 */
  timeWidth: number
}

/**
 * @param width 时间轴那一列的宽度（CSS 像素）
 */
export function resolveTimeAxis(width: number, metrics: Metrics): TimeAxis {
  // 挂载首帧量到的宽度可能是 0，别让 NaN / 负数漏进除法和缩放
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0
  return { timeWidth: Math.max(1, safeWidth - metrics.paddingX * 2) }
}
