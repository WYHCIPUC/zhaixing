import { describe, expect, it } from 'vitest'
import { applySchema } from './apply-schema'
import { createTestExecutor } from './test-executor'
import { cjkSplit } from './fts'

const EXPECTED_TABLES = [
  'books',
  'highlights',
  'thoughts',
  'nebulae',
  'nebula_stars',
  'links',
  'tags',
  'highlight_tags',
  'articles',
  'capsules',
  'meteor_logs',
  'import_archives',
  'settings',
  'highlights_fts'
]

describe('applySchema', () => {
  it('空库：建全量表并落 user_version', async () => {
    const db = createTestExecutor()
    await applySchema(db)
    const tables = (await db.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'highlights_fts_%'`
    )).map((r) => r.name)
    for (const t of EXPECTED_TABLES) expect(tables).toContain(t)
    const uv = await db.query<{ user_version: number }>('PRAGMA user_version')
    expect(uv[0].user_version).toBe(2)
  })

  it('重复调用幂等', async () => {
    const db = createTestExecutor()
    await applySchema(db)
    await applySchema(db)
    const n = (await db.query<{ c: number }>(`SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table'`))[0].c
    expect(n).toBeGreaterThan(0) // 不抛错即幂等
  })

  it('去重唯一索引生效', async () => {
    const db = createTestExecutor()
    await applySchema(db)
    await db.run(`INSERT INTO books(title) VALUES ('测试书')`)
    const book = (await db.query<{ id: number }>('SELECT id FROM books'))[0]
    await db.run(`INSERT INTO highlights(book_id, content, content_hash) VALUES (?, ?, ?)`, [book.id, '星星', 'h1'])
    await expect(
      db.run(`INSERT INTO highlights(book_id, content, content_hash) VALUES (?, ?, ?)`, [book.id, '星星', 'h1'])
    ).rejects.toThrow()
  })

  it('中文 FTS 写入后 MATCH 命中（cjkSplit 口径）', async () => {
    const db = createTestExecutor()
    await applySchema(db)
    await db.run(`INSERT INTO highlights_fts(rowid, text) VALUES (?, ?)`, [1, cjkSplit('书页里摘下的一颗星')])
    const hits = await db.query<{ text: string }>(`SELECT text FROM highlights_fts WHERE highlights_fts MATCH ?`, [
      `"${cjkSplit('一颗星')}"`
    ])
    expect(hits.length).toBe(1)
  })

  it('库版本高于当前时拒绝初始化（db 互通护栏）', async () => {
    const db = createTestExecutor()
    await db.exec('CREATE TABLE legacy(x)')
    await db.run(`PRAGMA user_version = 99`)
    await expect(applySchema(db)).rejects.toThrow(/版本/)
  })

  it('外键级联删除生效', async () => {
    const db = createTestExecutor()
    await applySchema(db)
    await db.run(`INSERT INTO books(title) VALUES ('级联书')`)
    const book = (await db.query<{ id: number }>('SELECT id FROM books'))[0]
    await db.run(`INSERT INTO highlights(book_id, content, content_hash) VALUES (?, ?, ?)`, [book.id, '划线', 'hash-x'])
    await db.run('DELETE FROM books WHERE id = ?', [book.id])
    const left = await db.query('SELECT * FROM highlights WHERE book_id = ?', [book.id])
    expect(left.length).toBe(0)
  })
})
