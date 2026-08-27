import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { ensurePlatformApi } from './api/platform'

ensurePlatformApi()

// 开发/门禁专用页面（MM5 前随 bench 目录一起清理）
// 入口：构建期 VITE_ENTRY=bench|diag（门禁 APK），或浏览器 hash #__bench / #__diag
const entry = (import.meta.env.VITE_ENTRY as string | undefined) ?? ''
const hash = window.location.hash
const mount = (component: React.ComponentType): void => {
  const Comp = component
  createRoot(document.getElementById('root')!).render(<Comp />)
}
if (entry === 'bench' || hash === '#__bench') {
  import('./bench/StarfieldBench').then(({ default: Bench }) => mount(Bench))
} else if (entry === 'diag' || hash === '#__diag') {
  import('./bench/DiagPage').then(({ default: Diag }) => mount(Diag))
} else {
  // 等 window.api 就绪再挂载（原生壳装配是异步的，过早挂载会查到空数据）
  ensurePlatformApi().then(() => {
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
}
