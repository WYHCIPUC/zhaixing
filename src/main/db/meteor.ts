import type { DB } from './connection'
import type { HighlightRecord } from '@shared/types'

export interface MeteorToday {
  logId: number
  date: string
  source: 'random' | 'capsule'
  capsuleMessage: string | null
  star: (HighlightRecord & { book_title: string }) | null
}

function loadStar(db: DB, highlightId: number): (HighlightRecord & { book_title: string }) | null {
  const row = db
    .prepare(
      `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`
    )
    .get(highlightId) as (HighlightRecord & { book_title: string }) | undefined
  return row ?? null
}

function todayStr(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 今日流星：到期胶囊优先，其次从低重访星里挑；每天只生成一次
export function getMeteor(db: DB): MeteorToday {
  const date = todayStr()
  const existing = db
    .prepare(`SELECT * FROM meteor_logs WHERE log_date = ? ORDER BY id DESC LIMIT 1`)
    .get(date) as { id: number; highlight_id: number; source: string; capsule_id: number | null } | undefined
  if (existing) {
    return {
      logId: existing.id,
      date,
      source: existing.source as 'random' | 'capsule',
      capsuleMessage: capsuleMessageOf(db, existing.capsule_id),
      star: loadStar(db, existing.highlight_id)
    }
  }

  // 到期胶囊
  const due = db
    .prepare(`SELECT id, highlight_id FROM capsules WHERE delivered = 0 AND deliver_at <= ? ORDER BY deliver_at LIMIT 1`)
    .get(date) as { id: number; highlight_id: number } | undefined

  let starId: number
  let source: 'random' | 'capsule'
  let capsuleId: number | null = null
  if (due) {
    starId = due.highlight_id
    source = 'capsule'
    capsuleId = due.id
    db.prepare(`UPDATE capsules SET delivered = 1 WHERE id = ?`).run(due.id)
  } else {
    // 低重访优先，最老的优先
    const row = db
      .prepare(
        `SELECT id FROM highlights ORDER BY revisit_count ASC, last_revisit_at IS NOT NULL, last_revisit_at ASC, RANDOM() LIMIT 1`
      )
      .get() as { id: number } | undefined
    if (!row) {
      return { logId: 0, date, source: 'random', capsuleMessage: null, star: null }
    }
    starId = row.id
    source = 'random'
  }

  const info = db
    .prepare(`INSERT INTO meteor_logs(log_date, highlight_id, source, capsule_id) VALUES (?, ?, ?, ?)`)
    .run(date, starId, source, capsuleId)
  return {
    logId: Number(info.lastInsertRowid),
    date,
    source,
    capsuleMessage: capsuleMessageOf(db, capsuleId),
    star: loadStar(db, starId)
  }
}

function capsuleMessageOf(db: DB, capsuleId: number | null): string | null {
  if (!capsuleId) return null
  const row = db.prepare(`SELECT message FROM capsules WHERE id = ?`).get(capsuleId) as
    | { message: string }
    | undefined
  return row?.message ?? null
}

export function markMeteorRevisited(db: DB, logId: number): void {
  const row = db.prepare(`SELECT highlight_id, revisited FROM meteor_logs WHERE id = ?`).get(logId) as
    | { highlight_id: number; revisited: number }
    | undefined
  if (!row) return
  if (row.revisited === 0) {
    db.prepare(`UPDATE meteor_logs SET revisited = 1 WHERE id = ?`).run(logId)
    db.prepare(
      `UPDATE highlights SET revisit_count = revisit_count + 1, last_revisit_at = datetime('now','localtime') WHERE id = ?`
    ).run(row.highlight_id)
  }
}

// ---------- 时间胶囊 ----------

export interface CapsuleRow {
  id: number
  highlight_id: number
  deliver_at: string
  message: string
  delivered: number
  created_at: string
  content?: string
  book_title?: string
}

export function createCapsule(db: DB, starId: number, deliverAt: string, message: string): number {
  const info = db
    .prepare(`INSERT INTO capsules(highlight_id, deliver_at, message) VALUES (?, ?, ?)`)
    .run(starId, deliverAt, message)
  return Number(info.lastInsertRowid)
}

export function listCapsules(db: DB): CapsuleRow[] {
  return db
    .prepare(
      `SELECT c.*, h.content, b.title AS book_title FROM capsules c
       JOIN highlights h ON h.id = c.highlight_id JOIN books b ON b.id = h.book_id
       ORDER BY c.delivered ASC, c.deliver_at ASC LIMIT 100`
    )
    .all() as CapsuleRow[]
}

// 夜航模式：随机漫游（偏向低重访星）
export function nightFlightStars(db: DB, limit: number): (HighlightRecord & { book_title: string })[] {
  return db
    .prepare(
      `SELECT h.*, b.title AS book_title FROM highlights h JOIN books b ON b.id = h.book_id
       ORDER BY h.revisit_count ASC, RANDOM() LIMIT ?`
    )
    .all(limit) as (HighlightRecord & { book_title: string })[]
}
