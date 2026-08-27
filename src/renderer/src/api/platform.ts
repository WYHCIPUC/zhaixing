// 启动 shim：渲染层唯一入口。桌面由 preload 注入 window.api；
// 手机（Capacitor 原生壳）MM1 接入 createMobileApi()，此前用 mock；
// 纯浏览器开发一律 mock。
import { Capacitor } from '@capacitor/core'
import type { ZhaixingApi } from '@shared/types'
import { mockApi } from './mock-api'

export function ensurePlatformApi(): void {
  const w = window as unknown as { api?: ZhaixingApi }
  if (w.api) return
  w.api = Capacitor.isNativePlatform() ? mockApi : mockApi // MM1: 原生时换 createMobileApi()
}
