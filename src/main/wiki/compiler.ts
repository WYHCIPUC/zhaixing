// 群星 · 编译器：DB 编排 + SHA1 增量写 wiki_pages
// 页面渲染逻辑在 @shared/wiki/render（纯函数，测试覆盖）
import { createHash } from 'node:crypto'
import type { DB } from '../db/connection'
import {
  renderBookPage,
  renderComparisonPage,
  renderConceptPage,
  renderSynthesisPage,
  type RenderedPage
} from '@shared/wiki/render'

export interface CompileReport {
  books: number
  concepts: number
  comparisons: number
  synthesis: number
  compiled: number // 本次新编译
  skipped: number // 哈希未变跳过
}

function upsert(db: DB, page: RenderedPage): boolean {
  const hash = createHash('sha1').update(page.body_md).digest('hex')
  const exists = db
    .prepare(`SELECT id, content_hash FROM wiki_pages WHERE page_type = ? AND ref_id = ?`)
    .get(page.page_type, page.ref_id) as { id: number; content_hash: string } | undefined
  if (exists && exists.content_hash === hash) return false
  db.prepare(
    `INSERT INTO wiki_pages(page_type, ref_id, title, body_md, links, content_hash, compiled_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(page_type, ref_id) DO UPDATE SET
       title = excluded.title, body_md = excluded.body_md, links = excluded.links,
       content_hash = excluded.content_hash, compiled_at = excluded.compiled_at`
  ).run(page.page_type, page.ref_id, page.title, page.body_md, JSON.stringify(page.links), hash)
  return true
}

// 清掉已不存在的孤儿页（书删了/星云散了/连线删了/文章删了）
function pruneOrphans(db: DB, keep: Set<string>): number {
  const rows = db.prepare(`SELECT id, page_type, ref_id FROM wiki_pages`).all() as {
    id: number
    page_type: string
    ref_id: number
  }[]
  let removed = 0
  const del = db.prepare(`DELETE FROM wiki_pages WHERE id = ?`)
  for (const r of rows) {
    if (!keep.has(`${r.page_type}:${r.ref_id}`)) {
      del.run(r.id)
      removed++
    }
  }
  return removed
}

export function compileWiki(db: DB): CompileReport {
  const report: CompileReport = { books: 0, concepts: 0, comparisons: 0, synthesis: 0, compiled: 0, skipped: 0 }
  const keep = new Set<string>()

  // 1. 来源页：每本书
  const books = db.prepare(`SELECT * FROM books`).all() as Parameters<typeof renderBookPage>[0][]
  const starsByBook = new Map<number, Parameters<typeof renderBookPage>[1]>()
  for (const b of books) {
    const stars = db
      .prepare(`SELECT * FROM highlights WHERE book_id = ? ORDER BY chapter_order, id`)
      .all(b.id) as Parameters<typeof renderBookPage>[1]
    starsByBook.set(b.id, stars)
    report.books++
    keep.add(`book:${b.id}`)
    upsert(db, renderBookPage(b, stars)) ? report.compiled++ : report.skipped++
  }

  // 2. 概念页：每片星云（成员 ≥3）
  const nebulae = db
    .prepare(
      `SELECT n.*, COUNT(ns.highlight_id) AS c FROM nebulae n
       LEFT JOIN nebula_stars ns ON ns.nebula_id = n.id GROUP BY n.id HAVING c >= 3`
    )
    .all() as { id: number; name: string; summary: string; source: 'ai' | 'user'; c: number }[]
  for (const neb of nebulae) {
    const members = db
      .prepare(
        `SELECT h.id, h.content, h.chapter, b.id AS book_id, b.title AS book_title
         FROM nebula_stars ns
         JOIN highlights h ON h.id = ns.highlight_id
         JOIN books b ON b.id = h.book_id
         WHERE ns.nebula_id = ? ORDER BY h.id`
      )
      .all(neb.id) as { id: number; content: string; chapter: string; book_id: number; book_title: string }[]
    const byBook = new Map<number, { book: { id: number; title: string }; stars: { id: number; content: string; chapter: string }[] }>()
    for (const m of members) {
      if (!byBook.has(m.book_id)) byBook.set(m.book_id, { book: { id: m.book_id, title: m.book_title }, stars: [] })
      byBook.get(m.book_id)!.stars.push({ id: m.id, content: m.content, chapter: m.chapter })
    }
    report.concepts++
    keep.add(`concept:${neb.id}`)
    upsert(db, renderConceptPage(neb, [...byBook.values()])) ? report.compiled++ : report.skipped++
  }

  // 3. 对比页：已确认连线（twin/collision/manual）
  const links = db
    .prepare(`SELECT * FROM links WHERE status = 'confirmed'`)
    .all() as { id: number; kind: 'twin' | 'collision' | 'manual'; note: string; from_highlight: number; to_highlight: number }[]
  for (const l of links) {
    const sides = [l.from_highlight, l.to_highlight].map((hid) =>
      db
        .prepare(
          `SELECT h.content, h.chapter, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`
        )
        .get(hid) as { content: string; chapter: string; book_title: string }
    )
    if (!sides[0] || !sides[1]) continue
    report.comparisons++
    keep.add(`comparison:${l.id}`)
    upsert(db, renderComparisonPage(l, sides[0], sides[1])) ? report.compiled++ : report.skipped++
  }

  // 4. 综合页：织星文章
  const articles = db.prepare(`SELECT a.*, n.name AS nebula_name FROM articles a LEFT JOIN nebulae n ON n.id = a.nebula_id`).all() as {
    id: number
    title: string
    content_md: string
    version: number
    nebula_name: string | null
  }[]
  for (const a of articles) {
    report.synthesis++
    keep.add(`synthesis:${a.id}`)
    upsert(db, renderSynthesisPage(a, a.nebula_name ?? undefined)) ? report.compiled++ : report.skipped++
  }

  report.compiled += 0
  pruneOrphans(db, keep)
  return report
}

// ---------- 查询 ----------

export interface WikiPageRow {
  id: number
  page_type: 'book' | 'concept' | 'comparison' | 'synthesis'
  ref_id: number
  title: string
  body_md: string
  links: string
  compiled_at: string
}

export function listWikiPages(db: DB): WikiPageRow[] {
  return db
    .prepare(`SELECT id, page_type, ref_id, title, compiled_at FROM wiki_pages ORDER BY page_type, title`)
    .all() as Omit<WikiPageRow, 'body_md' | 'links'>[] as WikiPageRow[]
}

export function getWikiPage(db: DB, id: number): WikiPageRow | null {
  return (db.prepare(`SELECT * FROM wiki_pages WHERE id = ?`).get(id) as WikiPageRow | undefined) ?? null
}

export function getWikiPageByTitle(db: DB, title: string): WikiPageRow | null {
  return (db.prepare(`SELECT * FROM wiki_pages WHERE title = ? LIMIT 1`).get(title) as WikiPageRow | undefined) ?? null
}

// 反向链接：谁的出链里引用了这个标题
export function getWikiBacklinks(db: DB, title: string): { id: number; title: string; page_type: WikiPageRow['page_type'] }[] {
  const needle = `"${title.replace(/"/g, '\\"')}"`
  return db
    .prepare(`SELECT id, title, page_type FROM wiki_pages WHERE links LIKE ? AND title != ?`)
    .all(`%${needle}%`, title) as { id: number; title: string; page_type: WikiPageRow['page_type'] }[]
}
