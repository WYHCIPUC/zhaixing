// 检查 window.api 是否就绪、平台判定与装配报错
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => ({
    hasApi: !!window.api,
    capPlatform: (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || false,
    capBridge: !!window.Capacitor,
  }))()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  console.log(JSON.stringify(msg).slice(0, 600))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 15000)
