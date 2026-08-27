import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zhaixing.app',
  appName: '摘星实录',
  webDir: 'dist-mobile',
  server: { androidScheme: 'https' },
  plugins: {
    // WebView 内 fetch 走原生转发，绕 CORS（用户自配 AI 端点不一定带 CORS 头）
    CapacitorHttp: { enabled: true }
  }
}

export default config
