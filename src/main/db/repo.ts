import { createHash } from 'node:crypto'
import type { DB } from './connection'
import { getDb } from './connection'
import type {
  ArchiveRecord,
  BookPatch,
  BookRecord,
  HighlightRecord,
  OverviewStats,
  ParsedBook,
  SearchHit,
  ThoughtRecord
} from '@shared/types'

// ---------- 工具 ----------

// 同步版（better-sqlite3 世界）；手机端用 shared/hash.ts 的 starHashAsync，
// 两者输出逐字节一致（见 src/shared/db/fts.test.ts 固定向量）
export function starHash(bookId: number, chapter: string, content: string): string {
  return createHash('sha1').update(`${bookId}\n${chapter}\n${content}`).digest('hex')
}

export { cjkSplit, buildFtsQuery } from '@shared/db/fts'
import { cjkSplit, buildFtsQuery } from '@shared/db/fts'

// ---------- FTS 同步 ----------

export function reindexStar(db: DB, starId: number): void {
  const row = db
    .prepare(
      `SELECT h.id, h.content, b.title FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`
    )
    .get(starId) as { id: number; content: string; title: string } | undefined
  db.prepare(`DELETE FROM highlights_fts WHERE rowid = ?`).run(starId)
  if (!row) return
  const thoughts = db
    .prepare(`SELECT content FROM thoughts WHERE highlight_id = ? ORDER BY created_at`)
    .all(starId) as { content: string }[]
  const text = [row.content, ...thoughts.map((t) => t.content)].join('\n')
  db.prepare(`INSERT INTO highlights_fts(rowid, text, book_title) VALUES (?, ?, ?)`).run(
    starId,
    cjkSplit(text),
    row.title
  )
}

// ---------- 书 ----------

const BOOK_LIST_SQL = `
  SELECT b.*,
    (SELECT COUNT(*) FROM highlights h WHERE h.book_id = b.id) AS highlight_count,
    (SELECT COUNT(*) FROM thoughts t JOIN highlights h2 ON t.highlight_id = h2.id WHERE h2.book_id = b.id) AS thought_count,
    (SELECT MAX(h3.created_at) FROM highlights h3 WHERE h3.book_id = b.id) AS last_note_at
  FROM books b`

export function listBooks(db: DB): BookRecord[] {
  return db.prepare(`${BOOK_LIST_SQL} ORDER BY last_note_at DESC, b.id DESC`).all() as BookRecord[]
}

export function getBook(db: DB, id: number): BookRecord | null {
  const row = db.prepare(`${BOOK_LIST_SQL} WHERE b.id = ?`).get(id) as BookRecord | undefined
  return row ?? null
}

export function findBook(db: DB, title: string, author: string): BookRecord | null {
  const row = db
    .prepare(`SELECT * FROM books WHERE title = ? AND author = ?`)
    .get(title, author) as BookRecord | undefined
  return row ?? null
}

const MORANDI = ['#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8', '#a483b8', '#c9a227', '#7a9e9f', '#c08552']
export function insertBook(db: DB, title: string, author: string): BookRecord {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const info = db.prepare(`INSERT INTO books(title, author, color) VALUES (?, ?, ?)`).run(title, author, MORANDI[h % MORANDI.length])
  return getBook(db, Number(info.lastInsertRowid))!
}

export function updateBook(db: DB, id: number, patch: BookPatch): void {
  const fields: string[] = []
  const values: unknown[] = []
  for (const key of ['title', 'author', 'color', 'rating', 'status', 'short_review', 'gem_highlight_id'] as const) {
    if (patch[key] !== undefined) {
      fields.push(`${key} = ?`)
      values.push(patch[key])
    }
  }
  if (fields.length === 0) return
  fields.push(`updated_at = datetime('now','localtime')`)
  values.push(id)
  db.prepare(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteBook(db: DB, id: number): void {
  const ids = db.prepare(`SELECT id FROM highlights WHERE book_id = ?`).all(id) as { id: number }[]
  const del = db.prepare(`DELETE FROM highlights_fts WHERE rowid = ?`)
  for (const row of ids) del.run(row.id)
  db.prepare(`DELETE FROM books WHERE id = ?`).run(id)
}

// ---------- 星（划线） ----------

interface StarRow {
  id: number
  book_id: number
  chapter: string
  chapter_order: number
  content: string
  favorite: number
  ai_tags: string
  revisit_count: number
  last_revisit_at: string | null
  created_at: string
}

function rowToHighlight(row: StarRow, bookTitle?: string): HighlightRecord {
  return {
    id: row.id,
    book_id: row.book_id,
    book_title: bookTitle,
    chapter: row.chapter,
    chapter_order: row.chapter_order,
    content: row.content,
    favorite: row.favorite === 1,
    ai_tags: row.ai_tags ? row.ai_tags.split(',').filter(Boolean) : [],
    revisit_count: row.revisit_count,
    last_revisit_at: row.last_revisit_at,
    created_at: row.created_at
  }
}

function attachDetails(db: DB, stars: HighlightRecord[]): HighlightRecord[] {
  if (stars.length === 0) return stars
  const ids = stars.map((s) => s.id)
  const placeholder = ids.map(() => '?').join(',')
  const thoughts = db
    .prepare(`SELECT * FROM thoughts WHERE highlight_id IN (${placeholder}) ORDER BY created_at, id`)
    .all(...ids) as ThoughtRecord[]
  const tagRows = db
    .prepare(
      `SELECT ht.highlight_id, t.name FROM highlight_tags ht JOIN tags t ON t.id = ht.tag_id WHERE ht.highlight_id IN (${placeholder})`
    )
    .all(...ids) as { highlight_id: number; name: string }[]
  for (const s of stars) {
    s.thoughts = thoughts.filter((t) => t.highlight_id === s.id)
    s.tags = tagRows.filter((t) => t.highlight_id === s.id).map((t) => t.name)
  }
  return stars
}

export function listStars(db: DB, bookId: number): HighlightRecord[] {
  const rows = db
    .prepare(`SELECT * FROM highlights WHERE book_id = ? ORDER BY chapter_order, id`)
    .all(bookId) as StarRow[]
  return attachDetails(db, rows.map((r) => rowToHighlight(r)))
}

export function getStar(db: DB, id: number): HighlightRecord | null {
  const row = db.prepare(`SELECT * FROM highlights WHERE id = ?`).get(id) as StarRow | undefined
  if (!row) return null
  return attachDetails(db, [rowToHighlight(row)])[0]
}

export function insertHighlight(
  db: DB,
  bookId: number,
  chapter: string,
  chapterOrder: number,
  content: string,
  createdAt?: string
): { id: number; added: boolean } {
  const hash = starHash(bookId, chapter, content)
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO highlights(book_id, chapter, chapter_order, content, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`
    )
    .run(bookId, chapter, chapterOrder, content, hash, createdAt ?? null)
  if (info.changes === 0) return { id: 0, added: false }
  reindexStar(db, Number(info.lastInsertRowid))
  return { id: Number(info.lastInsertRowid), added: true }
}

export function findHighlightId(db: DB, bookId: number, chapter: string, content: string): number | null {
  const hash = starHash(bookId, chapter, content)
  const row = db
    .prepare(`SELECT id FROM highlights WHERE book_id = ? AND content_hash = ?`)
    .get(bookId, hash) as { id: number } | undefined
  return row?.id ?? null
}

export function insertThoughtIfNew(
  db: DB,
  highlightId: number,
  content: string,
  source: 'user' | 'ai',
  thoughtDate?: string | null
): boolean {
  const exists = db
    .prepare(`SELECT id FROM thoughts WHERE highlight_id = ? AND content = ?`)
    .get(highlightId, content)
  if (exists) return false
  insertThought(db, highlightId, content, source, thoughtDate)
  return true
}

export function insertThought(
  db: DB,
  highlightId: number,
  content: string,
  source: 'user' | 'ai',
  thoughtDate?: string | null
): ThoughtRecord {
  const info = db
    .prepare(`INSERT INTO thoughts(highlight_id, content, source, thought_date) VALUES (?, ?, ?, ?)`)
    .run(highlightId, content, source, thoughtDate ?? null)
  reindexStar(db, highlightId)
  return db
    .prepare(`SELECT * FROM thoughts WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as ThoughtRecord
}

export function updateStar(
  db: DB,
  id: number,
  patch: { content?: string; chapter?: string; favorite?: boolean }
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.content !== undefined) {
    fields.push(`content = ?`)
    values.push(patch.content)
  }
  if (patch.chapter !== undefined) {
    fields.push(`chapter = ?`)
    values.push(patch.chapter)
  }
  if (patch.favorite !== undefined) {
    fields.push(`favorite = ?`)
    values.push(patch.favorite ? 1 : 0)
  }
  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE highlights SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  reindexStar(db, id)
}

export function deleteStar(db: DB, id: number): void {
  db.prepare(`DELETE FROM highlights_fts WHERE rowid = ?`).run(id)
  db.prepare(`DELETE FROM highlights WHERE id = ?`).run(id)
}

export function mergeStars(db: DB, ids: number[], content: string): number {
  const survivor = ids[0]
  const rest = ids.slice(1)
  const tx = db.transaction(() => {
    if (rest.length > 0) {
      const placeholder = rest.map(() => '?').join(',')
      db.prepare(`UPDATE thoughts SET highlight_id = ? WHERE highlight_id IN (${placeholder})`).run(survivor, ...rest)
      const del = db.prepare(`DELETE FROM highlights_fts WHERE rowid = ?`)
      for (const id of rest) del.run(id)
      db.prepare(`DELETE FROM highlights WHERE id IN (${placeholder})`).run(...rest)
    }
    db.prepare(`UPDATE highlights SET content = ? WHERE id = ?`).run(content, survivor)
    reindexStar(db, survivor)
  })
  tx()
  return survivor
}

// ---------- 想法 ----------

export function updateThought(db: DB, id: number, content: string): void {
  const row = db.prepare(`SELECT highlight_id FROM thoughts WHERE id = ?`).get(id) as
    | { highlight_id: number }
    | undefined
  db.prepare(`UPDATE thoughts SET content = ? WHERE id = ?`).run(content, id)
  if (row) reindexStar(db, row.highlight_id)
}

export function deleteThought(db: DB, id: number): void {
  const row = db.prepare(`SELECT highlight_id FROM thoughts WHERE id = ?`).get(id) as
    | { highlight_id: number }
    | undefined
  db.prepare(`DELETE FROM thoughts WHERE id = ?`).run(id)
  if (row) reindexStar(db, row.highlight_id)
}

// ---------- 标签 ----------

export function setStarTags(db: DB, starId: number, names: string[]): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM highlight_tags WHERE highlight_id = ?`).run(starId)
    const insTag = db.prepare(`INSERT OR IGNORE INTO tags(name) VALUES (?)`)
    const findTag = db.prepare(`SELECT id FROM tags WHERE name = ?`)
    const insLink = db.prepare(`INSERT OR IGNORE INTO highlight_tags(highlight_id, tag_id) VALUES (?, ?)`)
    for (const name of names.map((n) => n.trim()).filter(Boolean)) {
      insTag.run(name)
      const tag = findTag.get(name) as { id: number }
      insLink.run(starId, tag.id)
    }
  })
  tx()
}

// ---------- 检索 ----------

export function search(db: DB, q: string): SearchHit[] {
  const trimmed = q.trim()
  if (!trimmed) return []
  let ids: number[] = []
  const ftsQuery = buildFtsQuery(trimmed)
  if (ftsQuery) {
    try {
      const rows = db
        .prepare(`SELECT rowid FROM highlights_fts WHERE highlights_fts MATCH ? ORDER BY rank LIMIT 200`)
        .all(ftsQuery) as { rowid: number }[]
      ids = rows.map((r) => r.rowid)
    } catch {
      ids = []
    }
  }
  if (ids.length === 0) {
    // 短词（单字）或 FTS 无命中时回退 LIKE（转义通配符，避免用户输入改变匹配语义）
    const escaped = trimmed.replace(/[\\%_]/g, (c) => '\\' + c)
    const like = `%${escaped}%`
    const rows = db
      .prepare(
        `SELECT h.id FROM highlights h WHERE h.content LIKE ? ESCAPE '\\' OR EXISTS (
           SELECT 1 FROM thoughts t WHERE t.highlight_id = h.id AND t.content LIKE ? ESCAPE '\\'
         ) ORDER BY h.id DESC LIMIT 200`
      )
      .all(like, like) as { id: number }[]
    ids = rows.map((r) => r.id)
  }
  if (ids.length === 0) return []
  const placeholder = ids.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT h.id, h.content, h.chapter, b.id AS book_id, b.title
       FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id IN (${placeholder})`
    )
    .all(...ids) as { id: number; content: string; chapter: string; book_id: number; title: string }[]
  const lower = trimmed.toLowerCase()
  return rows.map((r) => {
    const idx = r.content.toLowerCase().indexOf(lower)
    let snippet = r.content
    if (idx > 40) snippet = '…' + r.content.slice(idx - 40, idx + 120)
    else if (r.content.length > 160) snippet = r.content.slice(0, 160) + '…'
    return {
      highlight_id: r.id,
      book_id: r.book_id,
      book_title: r.title,
      chapter: r.chapter,
      content: r.content,
      snippet
    }
  })
}

// ---------- 存档 / 设置 / 统计 ----------

export function addArchive(db: DB, rawText: string, stats: object): number {
  const info = db
    .prepare(`INSERT INTO import_archives(source, raw_text, stats) VALUES ('weread', ?, ?)`)
    .run(rawText, JSON.stringify(stats))
  return Number(info.lastInsertRowid)
}

export function listArchives(db: DB): ArchiveRecord[] {
  return db
    .prepare(`SELECT id, source, stats, created_at, substr(raw_text, 1, 200) AS preview FROM import_archives ORDER BY id DESC`)
    .all() as ArchiveRecord[]
}

export function getSettings(db: DB): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[]
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export function setSettings(db: DB, patch: Record<string, string>): void {
  const up = db.prepare(`INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(patch)) up.run(k, v)
  })
  tx()
}

export function overview(db: DB): OverviewStats {
  const count = (sql: string): number => (db.prepare(sql).get() as { n: number }).n
  return {
    bookCount: count(`SELECT COUNT(*) AS n FROM books`),
    highlightCount: count(`SELECT COUNT(*) AS n FROM highlights`),
    thoughtCount: count(`SELECT COUNT(*) AS n FROM thoughts`),
    tagCount: count(`SELECT COUNT(*) AS n FROM tags`),
    archiveCount: count(`SELECT COUNT(*) AS n FROM import_archives`)
  }
}

// 导入主流程：解析结果 → 事务入库（去重）→ 存档
export function importParsed(
  db: DB,
  books: ParsedBook[]
): { booksAdded: number; highlightsAdded: number; highlightsSkipped: number; thoughtsAdded: number; bookIds: number[] } {
  let booksAdded = 0
  let highlightsAdded = 0
  let highlightsSkipped = 0
  let thoughtsAdded = 0
  const bookIds: number[] = []
  const tx = db.transaction(() => {
    for (const pb of books) {
      let book = findBook(db, pb.title, pb.author)
      if (!book) {
        book = insertBook(db, pb.title, pb.author)
        booksAdded++
      }
      bookIds.push(book.id)
      if (pb.short_review && !book.short_review) {
        updateBook(db, book.id, { short_review: pb.short_review })
        book.short_review = pb.short_review
      }
      for (const ph of pb.highlights) {
        const order = pb.chapters.indexOf(ph.chapter)
        const res = insertHighlight(db, book.id, ph.chapter, order < 0 ? 0 : order, ph.content)
        if (res.added) {
          highlightsAdded++
          for (const t of ph.thoughts) {
            insertThought(db, res.id, t.content, 'user', t.date ?? null)
            thoughtsAdded++
          }
        } else {
          highlightsSkipped++
        }
      }
    }
  })
  tx()
  return { booksAdded, highlightsAdded, highlightsSkipped, thoughtsAdded, bookIds }
}

