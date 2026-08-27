import type { DB } from './connection'
import type { HighlightRecord, LinkRecord, NebulaRecord, StarMapData, StarMapStar } from '@shared/types'
import { listStars } from './repo'
import { blobToVectors, cosine } from '@shared/ai/client'

// ---------- 星云 ----------

export function listNebulae(db: DB): NebulaRecord[] {
  return db
    .prepare(
      `SELECT n.*, (SELECT COUNT(*) FROM nebula_stars ns WHERE ns.nebula_id = n.id) AS star_count
       FROM nebulae n ORDER BY n.source DESC, star_count DESC`
    )
    .all() as NebulaRecord[]
}

export function createNebula(
  db: DB,
  name: string,
  summary: string,
  source: 'ai' | 'user',
  color: string | null,
  starIds: number[]
): NebulaRecord {
  const tx = db.transaction(() => {
    const info = db
      .prepare(`INSERT INTO nebulae(name, summary, source, color) VALUES (?, ?, ?, ?)`)
      .run(name, summary, source, color)
    const id = Number(info.lastInsertRowid)
    const ins = db.prepare(`INSERT OR IGNORE INTO nebula_stars(nebula_id, highlight_id) VALUES (?, ?)`)
    for (const sid of starIds) ins.run(id, sid)
    return id
  })
  const id = tx()
  return (db
    .prepare(
      `SELECT n.*, (SELECT COUNT(*) FROM nebula_stars ns WHERE ns.nebula_id = n.id) AS star_count
       FROM nebulae n WHERE n.id = ?`
    )
    .get(id) as NebulaRecord)
}

export function updateNebula(
  db: DB,
  id: number,
  patch: { name?: string; summary?: string; color?: string | null }
): void {
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
  db.prepare(`UPDATE nebulae SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteNebula(db: DB, id: number): void {
  db.prepare(`DELETE FROM nebulae WHERE id = ?`).run(id)
}

export function addStarsToNebula(db: DB, nebulaId: number, starIds: number[]): void {
  const ins = db.prepare(`INSERT OR IGNORE INTO nebula_stars(nebula_id, highlight_id) VALUES (?, ?)`)
  const tx = db.transaction(() => {
    for (const sid of starIds) ins.run(nebulaId, sid)
  })
  tx()
}

export function removeStarFromNebula(db: DB, nebulaId: number, starId: number): void {
  db.prepare(`DELETE FROM nebula_stars WHERE nebula_id = ? AND highlight_id = ?`).run(nebulaId, starId)
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

export function listLinks(db: DB, status: 'suggested' | 'confirmed'): LinkRecord[] {
  return db
    .prepare(`${LINK_JOIN_SQL} WHERE l.status = ? ORDER BY l.id DESC LIMIT 500`)
    .all(status) as LinkRecord[]
}

export function upsertLink(
  db: DB,
  fromId: number,
  toId: number,
  kind: 'twin' | 'collision' | 'manual',
  status: 'suggested' | 'confirmed',
  note: string,
  sim: number | null
): { added: boolean } {
  const exists = db
    .prepare(
      `SELECT id, status FROM links WHERE kind = ? AND (
         (from_highlight = ? AND to_highlight = ?) OR (from_highlight = ? AND to_highlight = ?))`
    )
    .get(kind, fromId, toId, toId, fromId) as { id: number; status: string } | undefined
  if (exists) {
    if (exists.status === 'dismissed') {
      db.prepare(`UPDATE links SET status = 'suggested', note = ?, sim = ? WHERE id = ?`).run(note, sim, exists.id)
      return { added: true }
    }
    return { added: false }
  }
  db.prepare(
    `INSERT INTO links(from_highlight, to_highlight, kind, status, note, sim) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(fromId, toId, kind, status, note, sim)
  return { added: true }
}

export function decideLink(db: DB, id: number, status: 'confirmed' | 'dismissed'): void {
  db.prepare(`UPDATE links SET status = ? WHERE id = ?`).run(status, id)
}

export function deleteLink(db: DB, id: number): void {
  db.prepare(`DELETE FROM links WHERE id = ?`).run(id)
}

export function createManualLink(db: DB, fromId: number, toId: number, note: string): void {
  upsertLink(db, fromId, toId, 'manual', 'confirmed', note, null)
}

// ---------- embedding ----------

export function setEmbedding(db: DB, starId: number, vector: number[]): void {
  const buf = Buffer.alloc(vector.length * 4)
  for (let i = 0; i < vector.length; i++) buf.writeFloatLE(vector[i], i * 4)
  db.prepare(`UPDATE highlights SET embedding = ? WHERE id = ?`).run(buf, starId)
}

export function starsWithoutEmbedding(db: DB, limit: number): { id: number; content: string }[] {
  return db
    .prepare(`SELECT id, content FROM highlights WHERE embedding IS NULL ORDER BY id LIMIT ?`)
    .all(limit) as { id: number; content: string }[]
}

export function allEmbeddings(db: DB): Map<number, number[]> {
  const rows = db
    .prepare(`SELECT id, embedding FROM highlights WHERE embedding IS NOT NULL`)
    .all() as { id: number; embedding: Buffer }[]
  const map = new Map<number, number[]>()
  for (const r of rows) map.set(r.id, blobToVectors(r.embedding))
  return map
}

// ---------- 星图总览 ----------

export function getStarMap(db: DB): StarMapData {
  const nebulae = listNebulae(db)
  const links = listLinks(db, 'confirmed')
  const membership = db.prepare(`SELECT nebula_id, highlight_id FROM nebula_stars`).all() as {
    nebula_id: number
    highlight_id: number
  }[]
  const gems = new Set(
    (db.prepare(`SELECT gem_highlight_id FROM books WHERE gem_highlight_id IS NOT NULL`).all() as {
      gem_highlight_id: number
    }[]).map((r) => r.gem_highlight_id)
  )
  const books = db.prepare(`SELECT id, title, color FROM books`).all() as {
    id: number
    title: string
    color: string
  }[]
  const bookMap = new Map(books.map((b) => [b.id, b]))
  const nebByStar = new Map<number, number[]>()
  for (const m of membership) {
    if (!nebByStar.has(m.highlight_id)) nebByStar.set(m.highlight_id, [])
    nebByStar.get(m.highlight_id)!.push(m.nebula_id)
  }
  const stars: StarMapStar[] = []
  for (const b of books) {
    for (const h of listStars(db, b.id) as (HighlightRecord & { book_title?: string })[]) {
      stars.push({
        ...h,
        book_title: b.title,
        book_color: bookMap.get(b.id)?.color ?? '#7dd3fc',
        nebula_ids: nebByStar.get(h.id) ?? [],
        is_gem: gems.has(h.id)
      })
    }
  }
  return { stars, nebulae, links }
}

// ---------- 重访 ----------

export function bumpRevisit(db: DB, starId: number): void {
  db.prepare(
    `UPDATE highlights SET revisit_count = revisit_count + 1, last_revisit_at = datetime('now','localtime') WHERE id = ?`
  ).run(starId)
}

export function topRevisited(db: DB, limit: number): HighlightRecord[] {
  const rows = db
    .prepare(
      `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id
       WHERE h.revisit_count > 0 ORDER BY h.revisit_count DESC, h.id DESC LIMIT ?`
    )
    .all(limit) as (HighlightRecord & { book_title: string })[]
  for (const r of rows) (r as HighlightRecord & { book_title: string }).book_title = r.book_title
  return rows
}

// 余弦相似度批量检索（贪心聚类/双星推荐用）
export function findSimilarPairs(
  embeddings: Map<number, number[]>,
  bookOf: Map<number, number>,
  minSim: number,
  maxSim: number,
  cap = 400
): { a: number; b: number; sim: number }[] {
  const ids = [...embeddings.keys()]
  const out: { a: number; b: number; sim: number }[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const bi = bookOf.get(ids[i])
      const bj = bookOf.get(ids[j])
      if (bi === undefined || bj === undefined || bi === bj) continue // 只跨书
      const sim = cosine(embeddings.get(ids[i])!, embeddings.get(ids[j])!)
      if (sim >= minSim && sim <= maxSim) out.push({ a: ids[i], b: ids[j], sim })
    }
  }
  out.sort((x, y) => y.sim - x.sim)
  return out.slice(0, cap)
}
