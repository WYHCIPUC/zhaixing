// 手机端 renderer 构建：与桌面 electron-vite 的 renderer 段同源同别名，产物给 Capacitor
// 门禁变体：--mode bench / diag 注入 VITE_ENTRY，让 APK 直接进入压测/诊断页
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => ({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  define:
    mode === 'bench' || mode === 'diag'
      ? { 'import.meta.env.VITE_ENTRY': JSON.stringify(mode) }
      : {},
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: { outDir: resolve(__dirname, 'dist-mobile'), emptyOutDir: true }
}))
