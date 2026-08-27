// 真实数据端到端：在手机 WebView 里配置 weread key → 同步《剑来》真实笔记 → 检索
const [wsUrl, key] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    await window.api.setSettings({ weread_api_key: '${key}' })
    const report = await window.api.wereadSyncBook('22261199')
    const report2 = await window.api.wereadSyncBook('22261199')
    const ov = await window.api.overview()
    const hits = await window.api.search('李淳罡')
    const books = await window.api.listBooks()
    return JSON.stringify({ report, report2Skipped: report2.highlightsSkipped, overview: ov, liChunGangHits: hits.length, books: books.slice(0, 5).map(b => [b.title, b.highlight_count, b.thought_count]) })
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const r = msg.result && msg.result.result
  console.log(r && r.value ? r.value : JSON.stringify(msg).slice(0, 1200))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 120000)
