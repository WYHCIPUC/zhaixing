// CDP 诊断：查 thoughts 表内容 + capacitor run() 的 changes 返回形态
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    const api = window.api
    const s = await api.getSettings()
    // 直接拿到底层 executor 不可能（未暴露），改用 api 间接探：
    // 1) 全部星的 thoughts
    const books = await api.listBooks()
    const allStars = []
    for (const b of books) allStars.push(...(await api.listStars(b.id)))
    // 2) 检索想法内容（FTS 覆盖 thoughts）
    const hit = await api.search('值得重逢')
    return JSON.stringify({
      thoughtCountInStars: allStars.reduce((n, s) => n + (s.thoughts?.length || 0), 0),
      thoughtSearchHits: hit.length,
      books: books.map(b => ({ t: b.title, hc: b.highlight_count, tc: b.thought_count }))
    })
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const r = msg.result && msg.result.result
  console.log(r && r.value ? r.value : JSON.stringify(msg).slice(0, 900))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 30000)
