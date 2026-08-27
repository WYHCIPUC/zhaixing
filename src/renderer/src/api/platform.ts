// 启动 shim：渲染层唯一入口。桌面由 preload 注入 window.api；
// 手机（Capacitor 原生壳）接 createMobileApi()（capacitor-sqlite 直连）；
// 纯浏览器开发一律 mock。
import { Capacitor } from '@capacitor/core'
import type { ZhaixingApi } from '@shared/types'
import { mockApi } from './mock-api'
import { createCapacitorExecutor } from './capacitor-executor'
import { createMobileApi } from './mobile-api'

export function ensurePlatformApi(): void {
  const w = window as unknown as { api?: ZhaixingApi }
  if (w.api) return
  if (Capacitor.isNativePlatform()) {
    // 异步装配在模块加载后立即执行；装配完成前 api 为 undefined 的窗口期
    // 由调用方 await（所有视图都走 Promise，天然容忍）
    void (async () => {
      try {
        const db = await createCapacitorExecutor('zhaixing')
        w.api = await createMobileApi(db)
      } catch (err) {
        console.error('[platform] mobile api 装配失败，退回 mock：', err)
        w.api = mockApi
      }
    })()
  } else {
    w.api = mockApi
  }
}
