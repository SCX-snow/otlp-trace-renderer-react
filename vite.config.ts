import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 只服务 playground/ 的本地调试，库构建走 tsup
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
