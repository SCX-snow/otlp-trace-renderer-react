import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],

  optimizeDeps: { exclude: ['@slcomplex/otlp-trace-renderer'] },
  server: { port: 5174, open: false },
})
