import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
          exclude: ['test/react-*.test.tsx', 'test/react-detail-view.test.tsx', 'test/stories.test.tsx'],
        },
      },
      {
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['test/react-*.test.tsx', 'test/react-detail-view.test.tsx', 'test/stories.test.tsx'],
        },
      },
    ],
  },
})
