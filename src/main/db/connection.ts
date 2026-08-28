import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { SCHEMA, SCHEMA_VERSION } from '@shared/db/schema'

export type DB = Database.Database
export { SCHEMA_VERSION }

let db: DB | null = null

export function getDb(): DB {
  if (db) return db
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'zhaixing.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  // 迁移：老库（user_version 0/1）补齐 v2 新列后再落版本号
  const uv = (db.pragma('user_version', { simple: true }) as number) ?? 0
  if (uv < 2) {
    const alters = [
      'ALTER TABLE books ADD COLUMN chapter_count INTEGER',
      'ALTER TABLE books ADD COLUMN reading_progress REAL',
      'ALTER TABLE books ADD COLUMN read_status TEXT'
    ]
    for (const sql of alters) {
      try {
        db.exec(sql)
      } catch {
        /* 列已存在（CREATE IF NOT EXISTS 建出的新库） */
      }
    }
  }
  if (uv !== SCHEMA_VERSION) db.pragma(`user_version = ${SCHEMA_VERSION}`)
  return db
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'zhaixing.db')
}

// 每次启动轮换一份备份，防止升级/迁移损坏时无路可退
// 滚动保留最近 3 份备份，避免单份备份在异常后才被覆盖
export function backupDatabase(): string {
  const dir = app.getPath('userData')
  const src = getDbPath()
  const oldest = path.join(dir, 'zhaixing.backup.2.db')
  if (fs.existsSync(oldest)) fs.rmSync(oldest)
  for (let i = 1; i >= 0; i--) {
    const from = path.join(dir, `zhaixing.backup.${i}.db`)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, `zhaixing.backup.${i + 1}.db`))
  }
  const dest = path.join(dir, 'zhaixing.backup.0.db')
  if (fs.existsSync(src)) fs.copyFileSync(src, dest)
  return dest
}

export function closeDb(): void {
  db?.close()
  db = null
}
