// 门禁 B：验证 @capacitor-community/sqlite 的 FTS5 + unicode61 + 中文（MM0）
// 仅在手机壳内可跑（依赖原生插件）；验证完即弃（MM5 前删除本目录）
import { useState } from 'react'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { cjkSplit } from '@shared/db/fts'

const DIAG_SQL = {
  create: `CREATE VIRTUAL TABLE IF NOT EXISTS diag_fts USING fts5(body, tokenize = 'unicode61')`,
  insert: `INSERT INTO diag_fts(body) VALUES (?)`,
  match: `SELECT snippet(diag_fts, 0, '[', ']', '…', 8) AS snip FROM diag_fts WHERE diag_fts MATCH ?`,
  drop: `DROP TABLE IF EXISTS diag_fts`
}

export default function DiagPage() {
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)

  const append = (line: string): void => setLog((l) => [...l, line])

  const run = async (): Promise<void> => {
    setRunning(true)
    setLog([])
    let db: SQLiteDBConnection | null = null
    try {
      const sqlite = new SQLiteConnection(CapacitorSQLite)
      db = await sqlite.createConnection('diag', false, 'no-encryption', 1, false)
      await db.open()
      append('① 连接打开成功')

      await db.execute(DIAG_SQL.create)
      append('② CREATE VIRTUAL TABLE fts5 成功（FTS5 可用）')

      const body = cjkSplit('书页里摘下的一颗星，深夜也发光。')
      await db.run(DIAG_SQL.insert, [body])
      append(`③ 写入（cjkSplit 后）：${body}`)

      const q = cjkSplit('一颗星')
      const res = await db.query(DIAG_SQL.match, [`"${q}"`])
      const rows = res.values ?? []
      if (rows.length > 0) {
        append(`④ MATCH "${q}" 命中 ${rows.length} 条：${String(rows[0].snip)}`)
        append('✅ 门禁B 通过：FTS5 + unicode61 + 中文检索可用')
      } else {
        append(`④ MATCH "${q}" 零命中 → 需检查 cjkSplit 口径或走回退分支`)
      }
      await db.execute(DIAG_SQL.drop)
    } catch (err) {
      append(`❌ 出错：${err instanceof Error ? err.message : String(err)}`)
      if (String(err).includes('fts5')) append('→ 报 no such module: fts5，走回退分支（FTS4 → 定制构建 → LIKE）')
    } finally {
      await db?.close().catch(() => {})
      setRunning(false)
    }
  }

  return (
    <div style={{ padding: 20, background: '#0b1026', minHeight: '100vh', color: '#e2e8f0', font: '14px/1.7 sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>门禁B · FTS5 中文诊断</h2>
      <button
        onClick={() => void run()}
        disabled={running}
        style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#38bdf8', color: '#0b1026', fontWeight: 700, fontSize: 16 }}
      >
        {running ? '运行中…' : '运行诊断'}
      </button>
      <pre style={{ whiteSpace: 'pre-wrap', marginTop: 16 }}>{log.join('\n')}</pre>
    </div>
  )
}
