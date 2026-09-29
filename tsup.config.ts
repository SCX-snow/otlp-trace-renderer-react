import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    headless: 'src/headless.ts',
    'adapters/otlp': 'src/adapters/otlp.ts',
  },
  format: ['esm'],
  target: 'es2020', // BigInt 字面量的下限，别再降
  dts: true,
  sourcemap: true,
  treeshake: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime'],
})
