import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { ensurePlatformApi } from './api/platform'

ensurePlatformApi()

// 开发/门禁专用页面（MM5 前随 bench 目录一起清理）
const hash = window.location.hash
if (hash === '#__bench') {
  import('./bench/StarfieldBench').then(({ default: Bench }) => {
    createRoot(document.getElementById('root')!).render(<Bench />)
  })
} else if (hash === '#__diag') {
  import('./bench/DiagPage').then(({ default: Diag }) => {
    createRoot(document.getElementById('root')!).render(<Diag />)
  })
} else {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}
