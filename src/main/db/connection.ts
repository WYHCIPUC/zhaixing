import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export type DB = Database.Database

let db: DB | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#7dd3fc',
  rating INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('reading','finished','wishlist')),
  short_review TEXT NOT NULL DEFAULT '',
  gem_highlight_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_books_title_author ON books(title, author);

CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter TEXT NOT NULL DEFAULT '',
  chapter_order INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  ai_tags TEXT NOT NULL DEFAULT '',
  embedding BLOB,
  revisit_count INTEGER NOT NULL DEFAULT 0,
  last_revisit_at TEXT,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_highlights_dedup ON highlights(book_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_highlights_book ON highlights(book_id);

CREATE TABLE IF NOT EXISTS thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user','ai')),
  thought_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_thoughts_highlight ON thoughts(highlight_id);

CREATE TABLE IF NOT EXISTS nebulae (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','user')),
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS nebula_stars (
  nebula_id INTEGER NOT NULL REFERENCES nebulae(id) ON DELETE CASCADE,
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  PRIMARY KEY (nebula_id, highlight_id)
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_highlight INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  to_highlight INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('twin','collision','manual')),
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','confirmed','dismissed')),
  note TEXT NOT NULL DEFAULT '',
  sim REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_highlight);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_highlight);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS highlight_tags (
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (highlight_id, tag_id)
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nebula_id INTEGER REFERENCES nebulae(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content_md TEXT NOT NULL,
  history TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS capsules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  deliver_at TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meteor_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_date TEXT NOT NULL,
  highlight_id INTEGER NOT NULL REFERENCES highlights(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'random' CHECK (source IN ('random','capsule')),
  capsule_id INTEGER,
  revisited INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_meteor_date_star ON meteor_logs(log_date, highlight_id);

CREATE TABLE IF NOT EXISTS import_archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL DEFAULT 'weread',
  raw_text TEXT NOT NULL,
  stats TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE VIRTUAL TABLE IF NOT EXISTS highlights_fts USING fts5(
  text,
  book_title UNINDEXED,
  tokenize = 'unicode61'
);
`

export function getDb(): DB {
  if (db) return db
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const dbPath = path.join(dir, 'zhaixing.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
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
