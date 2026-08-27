// 直连插件层：查事务状态 → 强制 commit 复位 → 验证 import 可用
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    const out = {}
    const p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite
    if (!p) return 'no plugin'
    const opts = { database: 'zhaixing', readonly: false }
    try { out.inTxnBefore = JSON.stringify(await p.isTransactionActive && await p.isTransactionActive(opts)) } catch (e) { out.inTxnBefore = 'ERR ' + e }
    try { out.commit = JSON.stringify(await p.commitTransaction(opts)) } catch (e) { out.commit = 'ERR ' + (e && e.message || e) }
    try { const db = window.__zxDb; out.after = JSON.stringify(await db.query('SELECT COUNT(*) AS n FROM books')) } catch (e) { out.after = 'ERR ' + e }
    try {
      const r = await window.api.confirmImport('《烟测2》\\n作者乙\\n◆ 第一章\\n>> 事务复位后的导入。\\n')
      out.import = r
    } catch (e) { out.importErr = String(e && e.message || e) }
    return JSON.stringify(out)
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  console.log(m.data.slice(0, 1600))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 60000)
