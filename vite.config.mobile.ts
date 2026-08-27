// 手机端 renderer 构建：与桌面 electron-vite 的 renderer 段同源同别名，产物给 Capacitor
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: { outDir: resolve(__dirname, 'dist-mobile'), emptyOutDir: true }
})
