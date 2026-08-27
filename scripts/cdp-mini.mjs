// 检查加载的 bundle、事务标记状态，并尝试直接驱动一次 confirmImport
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    const scripts = [...document.querySelectorAll('script')].map(s => s.src)
    const out = { scripts }
    try {
      const r = await window.api.confirmImport('《烟测》\\n作者甲\\n◆ 第一章\\n>> 直接导入测试。\\n')
      out.report = r
    } catch (e) { out.importErr = String(e && e.message) }
    return JSON.stringify(out)
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  console.log(m.data.slice(0, 1500))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 60000)
