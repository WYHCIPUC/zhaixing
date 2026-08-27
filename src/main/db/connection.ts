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
  // 手机端以 user_version 判断库版本（db 互通护栏）；桌面建库后同样落版本号
  const uv = (db.pragma('user_version', { simple: true }) as number) ?? 0
  if (uv === 0) db.pragma(`user_version = ${SCHEMA_VERSION}`)
  return db
}

export function getDbPath(): string {
  return path.join(app.getPath('userData'), 'zhaixing.db')
}

// 每次启动轮换一份备份，防止升级/迁移损坏时无路可退
export function backupDatabase(): string {
  const src = getDbPath()
  const dest = path.join(app.getPath('userData'), 'zhaixing.backup.db')
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
  }
  return dest
}

export function closeDb(): void {
  db?.close()
  db = null
}
