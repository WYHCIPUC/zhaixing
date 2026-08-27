// 重载页面并等待渲染
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.reload', params: {} }))
  setTimeout(() => { console.log('reloaded'); process.exit(0) }, 3000)
}
ws.onerror = () => { console.log('ws error (may be ok during reload)'); process.exit(0) }
