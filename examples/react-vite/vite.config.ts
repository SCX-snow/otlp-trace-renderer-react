import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  // 包是通过 workspace 软链进来的，直接吃 dist。排除预打包，否则改了库要清缓存才生效。
  optimizeDeps: { exclude: ['@slcomplex/otlp-trace-renderer'] },
  server: { port: 5174, open: false },
})
