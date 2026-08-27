// 启动 shim：渲染层唯一入口。桌面由 preload 注入 window.api；
// 手机（Capacitor 原生壳）接 createMobileApi()（capacitor-sqlite 直连）；
// 纯浏览器开发一律 mock。
// whenApiReady：视图必须等它 resolve 再挂载，否则原生装配完成前会查到空数据
import { Capacitor } from '@capacitor/core'
import type { ZhaixingApi } from '@shared/types'
import { mockApi } from './mock-api'
import { createCapacitorExecutor } from './capacitor-executor'
import { createMobileApi } from './mobile-api'

// 单例：并发调用共享同一次装配（WebView 启动可能双次加载入口模块）
let apiPromise: Promise<ZhaixingApi> | null = null

export function ensurePlatformApi(): Promise<ZhaixingApi> {
  if (!apiPromise) apiPromise = build()
  return apiPromise
}

function build(): Promise<ZhaixingApi> {
  const w = window as unknown as { api?: ZhaixingApi }
  if (w.api) return Promise.resolve(w.api)
  if (Capacitor.isNativePlatform()) {
    return buildNative(w)
  }
  w.api = mockApi
  return Promise.resolve(w.api)
}

function buildNative(w: { api?: ZhaixingApi }): Promise<ZhaixingApi> {
  return (async () => {
    try {
      console.info('[platform] 打开 capacitor-sqlite 连接…')
      const db = await createCapacitorExecutor('zhaixing')
      ;(window as unknown as { __zxDb?: unknown }).__zxDb = db // 调试句柄（MM5 前移除）
      console.info('[platform] 连接就绪，装配 mobile-api…')
      w.api = await createMobileApi(db)
      console.info('[platform] mobile-api 装配完成')
      return w.api
    } catch (err) {
      console.error('[platform] mobile api 装配失败，退回 mock：', err)
      w.api = mockApi
      return w.api
    }
  })()
}
