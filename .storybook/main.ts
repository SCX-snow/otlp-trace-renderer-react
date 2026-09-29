import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.tsx'],
  // 不加 addon：个人项目用不上 docs/controls 那一堆，装了就得多维护
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
}

export default config
