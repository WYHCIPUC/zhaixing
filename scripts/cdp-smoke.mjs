// CDP 冒烟：在手机 WebView 里驱动真实 SQLite 全链路（导入→统计→检索→书架）
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    if (!window.api) return 'api 未就绪'
    const text = ['《端到端测试》','测试者','◆ 第一章 星光','>> 书页里摘下的一颗星。','>> 深夜也要发光。','◆ 第二章 银河','>> 每条划线都是一颗星。','// 值得重逢。'].join('\\n')
    const report = await window.api.confirmImport(text)
    const report2 = await window.api.confirmImport(text) // 二次导入应零新增
    const ov = await window.api.overview()
    const hits = await window.api.search('一颗星')
    const books = await window.api.listBooks()
    const stars = books[0] ? await window.api.listStars(books[0].id) : []
    return JSON.stringify({ report, report2, overview: ov, searchHits: hits.length, firstHit: hits[0] && hits[0].snippet, books: books.map(b => b.title), starCount: stars.length, thought: stars[0] && stars[0].thoughts })
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  console.log(JSON.stringify(msg, null, 1).slice(0, 2000))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 30000)
