import { defineConfig } from 'vitest/config'

// 基准单独一份配置：vitest 5 不再导出 bench()，我们用 tinybench 写在普通 it 里，
// 所以需要把 *.bench.ts 也纳入 include。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.bench.ts'],
    testTimeout: 60_000,
  },
})
