import type { DB } from './connection'

export interface ArticleRow {
  id: number
  nebula_id: number | null
  title: string
  content_md: string
  history: string
  version: number
  status: string
  created_at: string
  updated_at: string
  nebula_name?: string | null
}

export function listArticles(db: DB, nebulaId?: number): ArticleRow[] {
  if (nebulaId !== undefined) {
    return db
      .prepare(
        `SELECT a.*, n.name AS nebula_name FROM articles a LEFT JOIN nebulae n ON n.id = a.nebula_id
         WHERE a.nebula_id = ? ORDER BY a.id DESC`
      )
      .all(nebulaId) as ArticleRow[]
  }
  return db
    .prepare(
      `SELECT a.*, n.name AS nebula_name FROM articles a LEFT JOIN nebulae n ON n.id = a.nebula_id
       ORDER BY a.id DESC LIMIT 100`
    )
    .all() as ArticleRow[]
}

export function getArticle(db: DB, id: number): ArticleRow | null {
  return (db
    .prepare(
      `SELECT a.*, n.name AS nebula_name FROM articles a LEFT JOIN nebulae n ON n.id = a.nebula_id WHERE a.id = ?`
    )
    .get(id) as ArticleRow | undefined) ?? null
}

export function createArticle(db: DB, nebulaId: number | null, title: string, contentMd: string): ArticleRow {
  const info = db
    .prepare(`INSERT INTO articles(nebula_id, title, content_md) VALUES (?, ?, ?)`)
    .run(nebulaId, title, contentMd)
  return getArticle(db, Number(info.lastInsertRowid))!
}

// 保存 = 旧文进历史，版本号 +1
export function saveArticleVersion(db: DB, id: number, contentMd: string): ArticleRow | null {
  const cur = getArticle(db, id)
  if (!cur) return null
  const history = JSON.parse(cur.history || '[]') as { version: number; content_md: string; saved_at: string }[]
  history.push({ version: cur.version, content_md: cur.content_md, saved_at: cur.updated_at })
  db.prepare(
    `UPDATE articles SET content_md = ?, history = ?, version = version + 1, updated_at = datetime('now','localtime') WHERE id = ?`
  ).run(contentMd, JSON.stringify(history.slice(-20)), id)
  return getArticle(db, id)
}

export function updateArticleTitle(db: DB, id: number, title: string): void {
  db.prepare(`UPDATE articles SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?`).run(title, id)
}

export function deleteArticle(db: DB, id: number): void {
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
}
