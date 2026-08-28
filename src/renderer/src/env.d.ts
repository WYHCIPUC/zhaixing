/// <reference types="vite/client" />

import type { ZhaixingApi } from '@shared/types'

declare global {
  interface Window {
    api: ZhaixingApi
  }
  const __APP_VERSION__: string
}

export {}
