// 双端共享的异步仓库：mobile-api 的核心（也可用于桌面未来异步化）
// SQL 语义与 src/main/db/repo.ts 逐条对齐（对照注释标明桌面函数名）
import type {
  ArchiveRecord,
  BookPatch,
  BookRecord,
  HighlightRecord,
  OverviewStats,
  ParsedBook,
  SearchHit,
  StarMapData,
  StarMapStar,
  ThoughtRecord,
  CapsuleRecord,
  LinkRecord,
  MeteorToday,
  NebulaRecord
} from '@shared/types'
import { starHashAsync } from '../hash'
import { buildFtsQuery, cjkSplit } from './fts'
import type { AsyncSqliteExecutor } from './executor'

export type Db = AsyncSqliteExecutor

// ---------- 事务（走各端原生事务 API，见 executor.transaction 注释） ----------

export async function withTransaction<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return db.transaction(fn)
}

async function lastId(db: Db): Promise<number> {
  const rows = await db.query<{ id: number }>('SELECT last_insert_rowid() AS id')
  return Number(rows[0]?.id ?? 0)
}

// ---------- 工具 ----------

function norm(text: string): string {
  // 与桌面 sync/weread.ts norm 同口径
  return text
    .replace(/^[“”"'‘’「『」』\s、，。]+/, '')
    .replace(/[“”"'‘’「』」\s]+$/, '')
    .trim()
}

function ts(sec: number): string {
  const d = new Date(sec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// ---------- FTS 同步（桌面 repo.reindexStar 同语义） ----------

export async function reindexStar(db: Db, starId: number): Promise<void> {
  const rows = await db.query<{ content: string; title: string }>(
    `SELECT h.content, b.title FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`,
    [starId]
  )
  await db.run(`DELETE FROM highlights_fts WHERE rowid = ?`, [starId])
  if (rows.length === 0) return
  const thoughts = await db.query<{ content: string }>(
    `SELECT content FROM thoughts WHERE highlight_id = ? ORDER BY created_at`,
    [starId]
  )
  const text = [rows[0].content, ...thoughts.map((t) => t.content)].join('\n')
  await db.run(`INSERT INTO highlights_fts(rowid, text, book_title) VALUES (?, ?, ?)`, [
    starId,
    cjkSplit(text),
    rows[0].title
  ])
}

// ---------- 书 ----------

const BOOK_LIST_SQL = `
  SELECT b.*,
    (SELECT COUNT(*) FROM highlights h WHERE h.book_id = b.id) AS highlight_count,
    (SELECT COUNT(*) FROM thoughts t JOIN highlights h2 ON t.highlight_id = h2.id WHERE h2.book_id = b.id) AS thought_count,
    (SELECT MAX(h3.created_at) FROM highlights h3 WHERE h3.book_id = b.id) AS last_note_at
  FROM books b`

export async function listBooks(db: Db): Promise<BookRecord[]> {
  return db.query<BookRecord>(`${BOOK_LIST_SQL} ORDER BY last_note_at DESC, b.id DESC`)
}

export async function getBook(db: Db, id: number): Promise<BookRecord | null> {
  const rows = await db.query<BookRecord>(`${BOOK_LIST_SQL} WHERE b.id = ?`, [id])
  return rows[0] ?? null
}

export async function findBook(db: Db, title: string, author: string): Promise<BookRecord | null> {
  const rows = await db.query<BookRecord>(`SELECT * FROM books WHERE title = ? AND author = ?`, [title, author])
  return rows[0] ?? null
}

export async function insertBook(db: Db, title: string, author: string): Promise<BookRecord> {
  await db.run(`INSERT INTO books(title, author) VALUES (?, ?)`, [title, author])
  const id = await lastId(db)
  const book = await getBook(db, id)
  return book!
}

export async function updateBook(db: Db, id: number, patch: BookPatch): Promise<void> {
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
  await db.run(`UPDATE books SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function deleteBook(db: Db, id: number): Promise<void> {
  // 桌面 deleteBook 同语义：先清 FTS 再级联删除
  const ids = await db.query<{ id: number }>(`SELECT id FROM highlights WHERE book_id = ?`, [id])
  for (const row of ids) await db.run(`DELETE FROM highlights_fts WHERE rowid = ?`, [row.id])
  await db.run(`DELETE FROM books WHERE id = ?`, [id])
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

async function attachDetails(db: Db, stars: HighlightRecord[]): Promise<HighlightRecord[]> {
  if (stars.length === 0) return stars
  const ids = stars.map((s) => s.id)
  const placeholder = ids.map(() => '?').join(',')
  const thoughts = await db.query<ThoughtRecord>(
    `SELECT * FROM thoughts WHERE highlight_id IN (${placeholder}) ORDER BY created_at, id`,
    ids
  )
  const tagRows = await db.query<{ highlight_id: number; name: string }>(
    `SELECT ht.highlight_id, t.name FROM highlight_tags ht JOIN tags t ON t.id = ht.tag_id WHERE ht.highlight_id IN (${placeholder})`,
    ids
  )
  for (const s of stars) {
    s.thoughts = thoughts.filter((t) => t.highlight_id === s.id)
    s.tags = tagRows.filter((t) => t.highlight_id === s.id).map((t) => t.name)
  }
  return stars
}

export async function listStars(db: Db, bookId: number): Promise<HighlightRecord[]> {
  const rows = await db.query<StarRow>(`SELECT * FROM highlights WHERE book_id = ? ORDER BY chapter_order, id`, [
    bookId
  ])
  return attachDetails(db, rows.map((r) => rowToHighlight(r)))
}

export async function getStar(db: Db, id: number): Promise<HighlightRecord | null> {
  const rows = await db.query<StarRow>(`SELECT * FROM highlights WHERE id = ?`, [id])
  if (rows.length === 0) return null
  return (await attachDetails(db, [rowToHighlight(rows[0])]))[0]
}

export async function insertHighlight(
  db: Db,
  bookId: number,
  chapter: string,
  chapterOrder: number,
  content: string,
  createdAt?: string
): Promise<{ id: number; added: boolean }> {
  const hash = await starHashAsync(bookId, chapter, content)
  const res = await db.run(
    `INSERT OR IGNORE INTO highlights(book_id, chapter, chapter_order, content, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now','localtime')))`,
    [bookId, chapter, chapterOrder, content, hash, createdAt ?? null]
  )
  if (res.changes === 0) return { id: 0, added: false }
  const id = await lastId(db)
  await reindexStar(db, id)
  return { id, added: true }
}

export async function findHighlightId(db: Db, bookId: number, chapter: string, content: string): Promise<number | null> {
  const hash = await starHashAsync(bookId, chapter, content)
  const rows = await db.query<{ id: number }>(`SELECT id FROM highlights WHERE book_id = ? AND content_hash = ?`, [
    bookId,
    hash
  ])
  return rows[0]?.id ?? null
}

export async function insertThought(
  db: Db,
  highlightId: number,
  content: string,
  source: 'user' | 'ai',
  thoughtDate?: string | null
): Promise<ThoughtRecord> {
  await db.run(`INSERT INTO thoughts(highlight_id, content, source, thought_date) VALUES (?, ?, ?, ?)`, [
    highlightId,
    content,
    source,
    thoughtDate ?? null
  ])
  const id = await lastId(db)
  await reindexStar(db, highlightId)
  const rows = await db.query<ThoughtRecord>(`SELECT * FROM thoughts WHERE id = ?`, [id])
  return rows[0]
}

export async function insertThoughtIfNew(
  db: Db,
  highlightId: number,
  content: string,
  source: 'user' | 'ai',
  thoughtDate?: string | null
): Promise<boolean> {
  const exists = await db.query(`SELECT id FROM thoughts WHERE highlight_id = ? AND content = ?`, [
    highlightId,
    content
  ])
  if (exists.length > 0) return false
  await insertThought(db, highlightId, content, source, thoughtDate)
  return true
}

export async function updateStar(
  db: Db,
  id: number,
  patch: { content?: string; chapter?: string; favorite?: boolean }
): Promise<void> {
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
  await db.run(`UPDATE highlights SET ${fields.join(', ')} WHERE id = ?`, values)
  await reindexStar(db, id)
}

export async function deleteStar(db: Db, id: number): Promise<void> {
  await db.run(`DELETE FROM highlights_fts WHERE rowid = ?`, [id])
  await db.run(`DELETE FROM highlights WHERE id = ?`, [id])
}

export async function mergeStars(db: Db, ids: number[], content: string): Promise<number> {
  const survivor = ids[0]
  const rest = ids.slice(1)
  await withTransaction(db, async () => {
    if (rest.length > 0) {
      const placeholder = rest.map(() => '?').join(',')
      await db.run(`UPDATE thoughts SET highlight_id = ? WHERE highlight_id IN (${placeholder})`, [survivor, ...rest])
      for (const id of rest) await db.run(`DELETE FROM highlights_fts WHERE rowid = ?`, [id])
      await db.run(`DELETE FROM highlights WHERE id IN (${placeholder})`, rest)
    }
    await db.run(`UPDATE highlights SET content = ? WHERE id = ?`, [content, survivor])
    await reindexStar(db, survivor)
  })
  return survivor
}

// ---------- 想法 ----------

export async function updateThought(db: Db, id: number, content: string): Promise<void> {
  const rows = await db.query<{ highlight_id: number }>(`SELECT highlight_id FROM thoughts WHERE id = ?`, [id])
  await db.run(`UPDATE thoughts SET content = ? WHERE id = ?`, [content, id])
  if (rows[0]) await reindexStar(db, rows[0].highlight_id)
}

export async function deleteThought(db: Db, id: number): Promise<void> {
  const rows = await db.query<{ highlight_id: number }>(`SELECT highlight_id FROM thoughts WHERE id = ?`, [id])
  await db.run(`DELETE FROM thoughts WHERE id = ?`, [id])
  if (rows[0]) await reindexStar(db, rows[0].highlight_id)
}

// ---------- 标签 ----------

export async function setStarTags(db: Db, starId: number, names: string[]): Promise<void> {
  await withTransaction(db, async () => {
    await db.run(`DELETE FROM highlight_tags WHERE highlight_id = ?`, [starId])
    for (const name of names.map((n) => n.trim()).filter(Boolean)) {
      await db.run(`INSERT OR IGNORE INTO tags(name) VALUES (?)`, [name])
      const tag = await db.query<{ id: number }>(`SELECT id FROM tags WHERE name = ?`, [name])
      await db.run(`INSERT OR IGNORE INTO highlight_tags(highlight_id, tag_id) VALUES (?, ?)`, [starId, tag[0].id])
    }
  })
}

// ---------- 检索（桌面 repo.search 同语义：FTS → LIKE 回退 → snippet） ----------

export async function search(db: Db, q: string): Promise<SearchHit[]> {
  const trimmed = q.trim()
  if (!trimmed) return []
  let ids: number[] = []
  const ftsQuery = buildFtsQuery(trimmed)
  if (ftsQuery) {
    try {
      const rows = await db.query<{ rowid: number }>(
        `SELECT rowid FROM highlights_fts WHERE highlights_fts MATCH ? ORDER BY rank LIMIT 200`,
        [ftsQuery]
      )
      ids = rows.map((r) => Number(r.rowid))
    } catch {
      ids = []
    }
  }
  if (ids.length === 0) {
    const rows = await db.query<{ id: number }>(
      `SELECT h.id FROM highlights h WHERE h.content LIKE ? OR EXISTS (
         SELECT 1 FROM thoughts t WHERE t.highlight_id = h.id AND t.content LIKE ?
       ) ORDER BY h.id DESC LIMIT 200`,
      [`%${trimmed}%`, `%${trimmed}%`]
    )
    ids = rows.map((r) => r.id)
  }
  if (ids.length === 0) return []
  const placeholder = ids.map(() => '?').join(',')
  const rows = await db.query<{ id: number; content: string; chapter: string; book_id: number; title: string }>(
    `SELECT h.id, h.content, h.chapter, b.id AS book_id, b.title
     FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id IN (${placeholder})`,
    ids
  )
  const lower = trimmed.toLowerCase()
  return rows.map((r) => {
    const idx = r.content.toLowerCase().indexOf(lower)
    let snippet = r.content
    if (idx > 40) snippet = '…' + r.content.slice(idx - 40, idx + 120)
    else if (r.content.length > 160) snippet = r.content.slice(0, 160) + '…'
    return { highlight_id: r.id, book_id: r.book_id, book_title: r.title, chapter: r.chapter, content: r.content, snippet }
  })
}

// ---------- 存档 / 设置 / 统计 ----------

export async function addArchive(db: Db, rawText: string, stats: object): Promise<number> {
  await db.run(`INSERT INTO import_archives(source, raw_text, stats) VALUES ('weread', ?, ?)`, [
    rawText,
    JSON.stringify(stats)
  ])
  return lastId(db)
}

export async function listArchives(db: Db): Promise<ArchiveRecord[]> {
  return db.query(
    `SELECT id, source, stats, created_at, substr(raw_text, 1, 200) AS preview FROM import_archives ORDER BY id DESC`
  )
}

export async function getSettings(db: Db): Promise<Record<string, string>> {
  const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`)
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function setSettings(db: Db, patch: Record<string, string>): Promise<void> {
  await withTransaction(db, async () => {
    for (const [k, v] of Object.entries(patch)) {
      await db.run(
        `INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [k, v]
      )
    }
  })
}

export async function overview(db: Db): Promise<OverviewStats> {
  const count = async (sql: string): Promise<number> => {
    const rows = await db.query<{ n: number }>(sql)
    return Number(rows[0].n)
  }
  return {
    bookCount: await count(`SELECT COUNT(*) AS n FROM books`),
    highlightCount: await count(`SELECT COUNT(*) AS n FROM highlights`),
    thoughtCount: await count(`SELECT COUNT(*) AS n FROM thoughts`),
    tagCount: await count(`SELECT COUNT(*) AS n FROM tags`),
    archiveCount: await count(`SELECT COUNT(*) AS n FROM import_archives`),
    readingCount: await count(`SELECT COUNT(*) AS n FROM books WHERE status = 'reading'`),
    finishedCount: await count(`SELECT COUNT(*) AS n FROM books WHERE status = 'finished'`),
    weeklyStars: await count(
      `SELECT COUNT(*) AS n FROM highlights WHERE created_at >= datetime('now', 'localtime', '-7 days')`
    )
  }
}

// ---------- 导入主流程（桌面 repo.importParsed 同语义） ----------

export interface ImportCounts {
  booksAdded: number
  highlightsAdded: number
  highlightsSkipped: number
  thoughtsAdded: number
  bookIds: number[]
}

export async function importParsed(db: Db, books: ParsedBook[]): Promise<ImportCounts> {
  let booksAdded = 0
  let highlightsAdded = 0
  let highlightsSkipped = 0
  let thoughtsAdded = 0
  const bookIds: number[] = []
  await withTransaction(db, async () => {
    for (const pb of books) {
      let book = await findBook(db, pb.title, pb.author)
      if (!book) {
        book = await insertBook(db, pb.title, pb.author)
        booksAdded++
      }
      bookIds.push(book.id)
      const sr = (pb as ParsedBook & { short_review?: string }).short_review
      if (sr && !book.short_review) {
        await updateBook(db, book.id, { short_review: sr })
        book.short_review = sr
      }
      for (const ph of pb.highlights) {
        const order = pb.chapters.indexOf(ph.chapter)
        const res = await insertHighlight(db, book.id, ph.chapter, order < 0 ? 0 : order, ph.content)
        if (res.added) {
          highlightsAdded++
          for (const t of ph.thoughts) {
            await insertThought(db, res.id, t.content, 'user', t.date ?? null)
            thoughtsAdded++
          }
        } else {
          highlightsSkipped++
        }
      }
    }
  })
  return { booksAdded, highlightsAdded, highlightsSkipped, thoughtsAdded, bookIds }
}

// ---------- 微信读书 API 同步（桌面 sync/weread.ts syncBook 同语义） ----------

export interface WereadSyncReportAsync {
  bookTitle: string
  highlightsAdded: number
  highlightsSkipped: number
  thoughtsAdded: number
  thoughtsSkipped: number
  ratingSet: boolean
}

export interface WereadSyncDeps {
  bookmarks: { updated: { markText: string; chapterUid: number; createTime: number }[]; chapters: { chapterUid: number; chapterIdx: number; title: string }[]; book?: { title?: string; author?: string } }
  reviews: { review: { content?: string; abstract?: string; chapterUid?: number; chapterIdx?: number; chapterName?: string; createTime: number; star?: number } }[]
}

export async function wereadSyncBook(db: Db, deps: WereadSyncDeps): Promise<WereadSyncReportAsync> {
  const { bookmarks: bm, reviews } = deps
  const title = bm.book?.title?.trim() || `微信读书 未命名`
  const author = bm.book?.author?.trim() || ''
  const report: WereadSyncReportAsync = {
    bookTitle: title,
    highlightsAdded: 0,
    highlightsSkipped: 0,
    thoughtsAdded: 0,
    thoughtsSkipped: 0,
    ratingSet: false
  }

  let book = await findBook(db, title, author)
  if (!book) book = await insertBook(db, title, author)

  const chapterMap = new Map(bm.chapters.map((c) => [c.chapterUid, c]))
  const contentToId = new Map<string, number>()
  const sorted = [...bm.updated].sort((a, b) => a.createTime - b.createTime)
  for (const u of sorted) {
    const ch = chapterMap.get(u.chapterUid)
    const res = await insertHighlight(db, book.id, ch?.title ?? '', ch?.chapterIdx ?? 0, u.markText, ts(u.createTime))
    if (res.added) report.highlightsAdded++
    else report.highlightsSkipped++
    const hid = res.id || (await findHighlightId(db, book.id, ch?.title ?? '', u.markText))
    if (hid) contentToId.set(norm(u.markText), hid)
  }

  for (const item of reviews) {
    const rv = item.review
    if (!rv.content?.trim()) continue
    const date = ts(rv.createTime)

    let attached = false
    if (rv.abstract?.trim()) {
      const key = norm(rv.abstract)
      let hid: number | null | undefined = contentToId.get(key)
      if (!hid) {
        const ch = rv.chapterUid !== undefined ? chapterMap.get(rv.chapterUid) : undefined
        const res = await insertHighlight(
          db,
          book.id,
          ch?.title ?? rv.chapterName ?? '',
          ch?.chapterIdx ?? rv.chapterIdx ?? 0,
          key,
          ts(rv.createTime)
        )
        if (res.added) report.highlightsAdded++
        hid = res.id || (await findHighlightId(db, book.id, ch?.title ?? rv.chapterName ?? '', key))
        if (hid) contentToId.set(key, hid)
      }
      if (hid) {
        if (await insertThoughtIfNew(db, hid, rv.content.trim(), 'user', date)) report.thoughtsAdded++
        else report.thoughtsSkipped++
        attached = true
      }
    }
    if (!attached && !rv.abstract && !rv.chapterName && !book.short_review) {
      await updateBook(db, book.id, { short_review: rv.content.trim() })
      book.short_review = rv.content.trim()
      attached = true
    }
    if (!attached) report.thoughtsSkipped++

    if (rv.star !== undefined && rv.star >= 0 && book.rating === 0) {
      const stars = Math.max(1, Math.min(5, Math.round(rv.star / 20)))
      await updateBook(db, book.id, { rating: stars })
      book.rating = stars
      report.ratingSet = true
    }
  }

  return report
}

// ---------- 星穹图谱（桌面 nebula.ts 同语义） ----------

export async function listNebulae(db: Db): Promise<NebulaRecord[]> {
  return db.query(
    `SELECT n.*, (SELECT COUNT(*) FROM nebula_stars ns WHERE ns.nebula_id = n.id) AS star_count
     FROM nebulae n ORDER BY n.source DESC, star_count DESC`
  )
}

export async function createNebula(
  db: Db,
  name: string,
  starIds: number[],
  summary = '',
  source: 'ai' | 'user' = 'user',
  color: string | null = null
): Promise<NebulaRecord> {
  let id = 0
  await withTransaction(db, async () => {
    await db.run(`INSERT INTO nebulae(name, summary, source, color) VALUES (?, ?, ?, ?)`, [
      name,
      summary,
      source,
      color
    ])
    id = await lastId(db)
    for (const sid of starIds) {
      await db.run(`INSERT OR IGNORE INTO nebula_stars(nebula_id, highlight_id) VALUES (?, ?)`, [id, sid])
    }
  })
  const rows = await db.query<NebulaRecord>(
    `SELECT n.*, (SELECT COUNT(*) FROM nebula_stars ns WHERE ns.nebula_id = n.id) AS star_count
     FROM nebulae n WHERE n.id = ?`,
    [id]
  )
  return rows[0]
}

export async function updateNebula(
  db: Db,
  id: number,
  patch: { name?: string; summary?: string; color?: string | null }
): Promise<void> {
  const fields: string[] = []
  const values: unknown[] = []
  for (const k of ['name', 'summary', 'color'] as const) {
    if (patch[k] !== undefined) {
      fields.push(`${k} = ?`)
      values.push(patch[k])
    }
  }
  if (fields.length === 0) return
  values.push(id)
  await db.run(`UPDATE nebulae SET ${fields.join(', ')} WHERE id = ?`, values)
}

export async function deleteNebula(db: Db, id: number): Promise<void> {
  await db.run(`DELETE FROM nebulae WHERE id = ?`, [id])
}

export async function addStarsToNebula(db: Db, nebulaId: number, starIds: number[]): Promise<void> {
  for (const sid of starIds) {
    await db.run(`INSERT OR IGNORE INTO nebula_stars(nebula_id, highlight_id) VALUES (?, ?)`, [nebulaId, sid])
  }
}

export async function removeStarFromNebula(db: Db, nebulaId: number, starId: number): Promise<void> {
  await db.run(`DELETE FROM nebula_stars WHERE nebula_id = ? AND highlight_id = ?`, [nebulaId, starId])
}

// ---------- 连线 ----------

const LINK_JOIN_SQL = `
  SELECT l.*,
    hf.content AS from_content, ht.content AS to_content,
    bf.title AS from_book, bt.title AS to_book,
    hf.chapter AS from_chapter, ht.chapter AS to_chapter
  FROM links l
  JOIN highlights hf ON hf.id = l.from_highlight
  JOIN highlights ht ON ht.id = l.to_highlight
  JOIN books bf ON bf.id = hf.book_id
  JOIN books bt ON bt.id = ht.book_id`

export async function listLinks(db: Db, status: 'suggested' | 'confirmed'): Promise<LinkRecord[]> {
  return db.query(`${LINK_JOIN_SQL} WHERE l.status = ? ORDER BY l.id DESC LIMIT 500`, [status])
}

export async function upsertLink(
  db: Db,
  fromId: number,
  toId: number,
  kind: 'twin' | 'collision' | 'manual',
  status: 'suggested' | 'confirmed',
  note: string,
  sim: number | null
): Promise<{ added: boolean }> {
  const exists = await db.query<{ id: number; status: string }>(
    `SELECT id, status FROM links WHERE kind = ? AND (
       (from_highlight = ? AND to_highlight = ?) OR (from_highlight = ? AND to_highlight = ?))`,
    [kind, fromId, toId, toId, fromId]
  )
  if (exists[0]) {
    if (exists[0].status === 'dismissed') {
      await db.run(`UPDATE links SET status = 'suggested', note = ?, sim = ? WHERE id = ?`, [
        note,
        sim,
        exists[0].id
      ])
      return { added: true }
    }
    return { added: false }
  }
  await db.run(
    `INSERT INTO links(from_highlight, to_highlight, kind, status, note, sim) VALUES (?, ?, ?, ?, ?, ?)`,
    [fromId, toId, kind, status, note, sim]
  )
  return { added: true }
}

export async function decideLink(db: Db, id: number, status: 'confirmed' | 'dismissed'): Promise<void> {
  await db.run(`UPDATE links SET status = ? WHERE id = ?`, [status, id])
}

export async function deleteLink(db: Db, id: number): Promise<void> {
  await db.run(`DELETE FROM links WHERE id = ?`, [id])
}

export async function createManualLink(db: Db, fromId: number, toId: number, note: string): Promise<void> {
  await upsertLink(db, fromId, toId, 'manual', 'confirmed', note, null)
}

// ---------- 镇星 / 重访 ----------

export async function setGem(db: Db, starId: number): Promise<void> {
  await db.run(`UPDATE books SET gem_highlight_id = ? WHERE id = (SELECT book_id FROM highlights WHERE id = ?)`, [
    starId,
    starId
  ])
}

export async function bumpRevisit(db: Db, starId: number): Promise<void> {
  await db.run(
    `UPDATE highlights SET revisit_count = revisit_count + 1, last_revisit_at = datetime('now','localtime') WHERE id = ?`,
    [starId]
  )
}

export async function topRevisited(db: Db, limit: number): Promise<HighlightRecord[]> {
  return db.query(
    `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id
     WHERE h.revisit_count > 0 ORDER BY h.revisit_count DESC, h.id DESC LIMIT ?`,
    [limit]
  )
}

// ---------- 星图总览（桌面 nebula.getStarMap 同语义） ----------

export async function getStarMap(db: Db): Promise<StarMapData> {
  const nebulae = await listNebulae(db)
  const links = await listLinks(db, 'confirmed')
  const membership = await db.query<{ nebula_id: number; highlight_id: number }>(
    `SELECT nebula_id, highlight_id FROM nebula_stars`
  )
  const gemRows = await db.query<{ gem_highlight_id: number }>(
    `SELECT gem_highlight_id FROM books WHERE gem_highlight_id IS NOT NULL`
  )
  const gems = new Set(gemRows.map((r) => r.gem_highlight_id))
  const books = await db.query<{ id: number; title: string; color: string }>(
    `SELECT id, title, color FROM books`
  )
  const bookMap = new Map(books.map((b) => [b.id, b]))
  const nebByStar = new Map<number, number[]>()
  for (const m of membership) {
    if (!nebByStar.has(m.highlight_id)) nebByStar.set(m.highlight_id, [])
    nebByStar.get(m.highlight_id)!.push(m.nebula_id)
  }
  const stars: StarMapStar[] = []
  for (const b of books) {
    for (const h of await listStars(db, b.id)) {
      stars.push({
        ...h,
        book_title: b.title,
        book_color: bookMap.get(b.id)?.color ?? '#e8963c',
        nebula_ids: nebByStar.get(h.id) ?? [],
        is_gem: gems.has(h.id)
      })
    }
  }
  return { stars, nebulae, links }
}

// ---------- 流星与时间胶囊（桌面 meteor.ts 同语义） ----------

export async function loadStarWithTitle(
  db: Db,
  highlightId: number
): Promise<(HighlightRecord & { book_title: string }) | null> {
  const rows = await db.query<HighlightRecord & { book_title: string }>(
    `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`,
    [highlightId]
  )
  return rows[0] ?? null
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function capsuleMessageOf(db: Db, capsuleId: number | null): Promise<string | null> {
  if (!capsuleId) return null
  const rows = await db.query<{ message: string }>(`SELECT message FROM capsules WHERE id = ?`, [capsuleId])
  return rows[0]?.message ?? null
}

// 今日流星：到期胶囊优先，其次从低重访星里挑；每天只生成一次
export async function getMeteor(db: Db): Promise<MeteorToday> {
  const date = todayStr()
  const existing = await db.query<{
    id: number
    highlight_id: number
    source: string
    capsule_id: number | null
  }>(`SELECT * FROM meteor_logs WHERE log_date = ? ORDER BY id DESC LIMIT 1`, [date])
  if (existing[0]) {
    return {
      logId: existing[0].id,
      date,
      source: existing[0].source as 'random' | 'capsule',
      capsuleMessage: await capsuleMessageOf(db, existing[0].capsule_id),
      star: await loadStarWithTitle(db, existing[0].highlight_id)
    }
  }

  const due = await db.query<{ id: number; highlight_id: number }>(
    `SELECT id, highlight_id FROM capsules WHERE delivered = 0 AND deliver_at <= ? ORDER BY deliver_at LIMIT 1`,
    [date]
  )

  let starId: number
  let source: 'random' | 'capsule'
  let capsuleId: number | null = null
  if (due[0]) {
    starId = due[0].highlight_id
    source = 'capsule'
    capsuleId = due[0].id
    await db.run(`UPDATE capsules SET delivered = 1 WHERE id = ?`, [due[0].id])
  } else {
    const row = await db.query<{ id: number }>(
      `SELECT id FROM highlights ORDER BY revisit_count ASC, last_revisit_at IS NOT NULL, last_revisit_at ASC, RANDOM() LIMIT 1`
    )
    if (!row[0]) return { logId: 0, date, source: 'random', capsuleMessage: null, star: null }
    starId = row[0].id
    source = 'random'
  }

  await db.run(`INSERT INTO meteor_logs(log_date, highlight_id, source, capsule_id) VALUES (?, ?, ?, ?)`, [
    date,
    starId,
    source,
    capsuleId
  ])
  const logId = await lastId(db)
  return {
    logId,
    date,
    source,
    capsuleMessage: await capsuleMessageOf(db, capsuleId),
    star: await loadStarWithTitle(db, starId)
  }
}

export async function markMeteorRevisited(db: Db, logId: number): Promise<void> {
  const rows = await db.query<{ highlight_id: number; revisited: number }>(
    `SELECT highlight_id, revisited FROM meteor_logs WHERE id = ?`,
    [logId]
  )
  if (!rows[0] || rows[0].revisited !== 0) return
  await db.run(`UPDATE meteor_logs SET revisited = 1 WHERE id = ?`, [logId])
  await db.run(
    `UPDATE highlights SET revisit_count = revisit_count + 1, last_revisit_at = datetime('now','localtime') WHERE id = ?`,
    [rows[0].highlight_id]
  )
}

export async function createCapsule(db: Db, starId: number, deliverAt: string, message: string): Promise<number> {
  await db.run(`INSERT INTO capsules(highlight_id, deliver_at, message) VALUES (?, ?, ?)`, [
    starId,
    deliverAt,
    message
  ])
  return lastId(db)
}

export async function listCapsules(db: Db): Promise<CapsuleRecord[]> {
  return db.query(
    `SELECT c.*, h.content, b.title AS book_title FROM capsules c
     JOIN highlights h ON h.id = c.highlight_id JOIN books b ON b.id = h.book_id
     ORDER BY c.delivered ASC, c.deliver_at ASC LIMIT 100`
  )
}

// 夜航模式：随机漫游（偏向低重访星）
export async function nightFlightStars(db: Db, limit: number): Promise<(HighlightRecord & { book_title: string })[]> {
  return db.query(
    `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id
     ORDER BY h.revisit_count ASC, RANDOM() LIMIT ?`,
    [limit]
  )
}
