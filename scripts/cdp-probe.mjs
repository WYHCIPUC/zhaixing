// CDP 底层探针 v2：逐条 await，带 try/catch 与超时，定位装配挂点
const [wsUrl] = process.argv.slice(2)
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  const expr = `(async () => {
    const db = window.__zxDb
    if (!db) return 'no __zxDb'
    const out = {}
    const step = async (name, fn) => {
      try {
        out[name] = JSON.stringify(await Promise.race([
          fn(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('step-timeout')), 5000))
        ]))
      } catch (e) { out[name] = 'ERR: ' + (e && e.message) }
    }
    await step('pragma_version', () => db.query('PRAGMA user_version'))
    await step('create', () => db.exec('CREATE TABLE IF NOT EXISTS probe2(x TEXT UNIQUE)'))
    await step('insert_fresh', () => db.run('INSERT OR IGNORE INTO probe2(x) VALUES (?)', ['a']))
    await step('insert_ignore', () => db.run('INSERT OR IGNORE INTO probe2(x) VALUES (?)', ['a']))
    await step('lastid', () => db.query('SELECT last_insert_rowid() AS id'))
    await step('begin', () => db.exec('BEGIN'))
    await step('txn_write', () => db.run("INSERT OR IGNORE INTO probe2(x) VALUES ('c')"))
    await step('txn_read_same_conn', () => db.query('SELECT COUNT(*) AS n FROM probe2'))
    await step('commit', () => db.exec('COMMIT'))
    await step('final_count', () => db.query('SELECT COUNT(*) AS n FROM probe2'))
    await step('drop', () => db.exec('DROP TABLE probe2'))
    return JSON.stringify(out)
  })()`
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }))
}
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data)
  const r = msg.result && msg.result.result
  console.log(r && r.value ? r.value : JSON.stringify(msg).slice(0, 1000))
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 60000)
