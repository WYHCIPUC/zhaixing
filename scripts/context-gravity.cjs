// 语境层 + 星穹引力 改造批
const fs = require('fs')

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  let miss = []
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
    else miss.push(a.slice(0, 60))
  }
  fs.writeFileSync(file, s)
  console.log(file, miss.length ? 'MISS: ' + miss.join(' | ') : 'OK')
}

// ---------- 1. 共享类型 ----------
patch('src/shared/types.ts', [
  [
    '  gem_highlight_id: number | null // 镇星之宝\n  created_at: string',
    '  gem_highlight_id: number | null // 镇星之宝\n  chapter_count?: number | null\n  reading_progress?: number | null\n  read_status?: string | null\n  created_at: string'
  ],
  [
    'export interface WereadNotebook {\n  bookId: string\n  book: { title: string; author: string; cover?: string }',
    'export interface WereadNotebook {\n  bookId: string\n  book: { title: string; author: string; cover?: string }\n  readingProgress?: number\n  markedStatus?: number'
  ],
  [
    'export interface WereadSyncReport {',
    `export interface StarContext {
  chapter_index: number
  chapter_total: number | null
  progress: number | null
  read_status: string | null
  siblings: { id: number; chapter: string; content: string; created_at: string }[]
  peers: { id: number; content: string; created_at: string }[]
}

export interface WereadSyncReport {`
  ],
  [
    '  listStars(bookId: number): Promise<HighlightRecord[]>\n  getStar(id: number): Promise<HighlightRecord | null>',
    '  listStars(bookId: number): Promise<HighlightRecord[]>\n  getStar(id: number): Promise<HighlightRecord | null>\n  starContext(id: number): Promise<StarContext>'
  ],
  [
    '  wereadSyncBook(bookId: string): Promise<WereadSyncReport>',
    '  wereadSyncBook(bookId: string, meta?: { progress?: number | null; status?: string | null }): Promise<WereadSyncReport>'
  ]
])

// ---------- 2. repo.ts：语境查询 + 书籍元数据 ----------
patch('src/main/db/repo.ts', [
  [
    'export function insertHighlight(',
    `export interface StarContextResult {
  chapter_index: number
  chapter_total: number | null
  progress: number | null
  read_status: string | null
  siblings: { id: number; chapter: string; content: string; created_at: string }[]
  peers: { id: number; content: string; created_at: string }[]
}

// 笔记的语境：章节位置 / 当时阅读状态 / 同章回顾 / 同期拾星
export function getStarContext(db: DB, id: number): StarContextResult | null {
  const star = db
    .prepare(
      \`SELECT h.id, h.book_id, h.chapter, h.chapter_order, h.created_at, b.chapter_count, b.reading_progress, b.read_status
       FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?\`
    )
    .get(id) as
    | {
        id: number
        book_id: number
        chapter: string
        chapter_order: number
        created_at: string
        chapter_count: number | null
        reading_progress: number | null
        read_status: string | null
      }
    | undefined
  if (!star) return null
  const siblings = db
    .prepare(
      \`SELECT id, chapter, content, created_at FROM highlights
       WHERE book_id = ? AND chapter = ? AND chapter != '' AND id != ? ORDER BY chapter_order, id LIMIT 8\`
    )
    .all(star.book_id, star.chapter, star.id) as StarContextResult['siblings']
  const peers = db
    .prepare(
      \`SELECT id, content, created_at FROM highlights
       WHERE book_id = ? AND id != ? AND created_at != ?
         AND datetime(created_at) BETWEEN datetime(?, '-7 days') AND datetime(?, '+7 days')
       ORDER BY created_at LIMIT 6\`
    )
    .all(star.book_id, star.id, star.created_at, star.created_at, star.created_at) as StarContextResult['peers']
  return {
    chapter_index: star.chapter_order,
    chapter_total: star.chapter_count,
    progress: star.reading_progress,
    read_status: star.read_status,
    siblings,
    peers
  }
}

// 同步写入书籍元数据（章节总数/阅读进度/状态）
export function updateBookMeta(
  db: DB,
  id: number,
  meta: { chapter_count?: number; reading_progress?: number; read_status?: string }
): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (meta.chapter_count !== undefined) {
    fields.push('chapter_count = ?')
    values.push(meta.chapter_count)
  }
  if (meta.reading_progress !== undefined) {
    fields.push('reading_progress = ?')
    values.push(meta.reading_progress)
  }
  if (meta.read_status !== undefined) {
    fields.push('read_status = ?')
    values.push(meta.read_status)
  }
  if (fields.length === 0) return
  fields.push(\`updated_at = datetime('now','localtime')\`)
  values.push(id)
  db.prepare(\`UPDATE books SET \${fields.join(', ')} WHERE id = ?\`).run(...values)
}

export function insertHighlight(`
  ]
])

// ---------- 3. 同步：接收 meta + 章节总数 ----------
patch('src/main/sync/weread.ts', [
  [
    "import { findBook, findHighlightId, getSettings, insertBook, insertHighlight, insertThought, insertThoughtIfNew, updateBook } from '../db/repo'",
    "import { findBook, findHighlightId, getSettings, insertBook, insertHighlight, insertThought, insertThoughtIfNew, updateBook, updateBookMeta } from '../db/repo'"
  ],
  [
    'export async function syncBook(db: DB, apiKey: string, bookId: string): Promise<WereadSyncReport> {',
    'export async function syncBook(\n  db: DB,\n  apiKey: string,\n  bookId: string,\n  meta?: { progress?: number | null; status?: string | null }\n): Promise<WereadSyncReport> {'
  ],
  [
    '  let book = findBook(db, title, author)\n  if (!book) book = insertBook(db, title, author)',
    "  let book = findBook(db, title, author)\n  if (!book) book = insertBook(db, title, author)\n  const chapterTotal = (bm.chapters ?? []).reduce((m, c) => Math.max(m, c.chapterIdx + 1), 0)\n  updateBookMeta(db, book.id, {\n    ...(chapterTotal > 0 ? { chapter_count: chapterTotal } : {}),\n    ...(meta?.progress !== undefined && meta.progress !== null ? { reading_progress: meta.progress } : {}),\n    ...(meta?.status ? { read_status: meta.status } : {})\n  })"
  ]
])

// ---------- 4. IPC ----------
patch('src/main/ipc.ts', [
  [
    "  ipcMain.handle('stars:get', (_e, id: number) => getStar(getDb(), id))",
    "  ipcMain.handle('stars:get', (_e, id: number) => getStar(getDb(), id))\n  ipcMain.handle('stars:context', (_e, id: number) => getStarContext(getDb(), id))"
  ],
  [
    "  ipcMain.handle('weread:syncBook', async (_e, bookId: string) => {\n    const key = wereadKey()\n    if (!key) throw new Error('未配置微信读书 API Key（设置 → 微信读书同步）')\n    return syncBook(getDb(), key, bookId)\n  })",
    "  ipcMain.handle('weread:syncBook', async (_e, bookId: string, meta?: { progress?: number | null; status?: string | null }) => {\n    const key = wereadKey()\n    if (!key) throw new Error('未配置微信读书 API Key（设置 → 微信读书同步）')\n    return syncBook(getDb(), key, bookId, meta)\n  })"
  ],
  [
    "import {\n  addArchive,",
    "import {\n  getStarContext,\n  addArchive,"
  ]
])

// ---------- 5. preload ----------
patch('src/preload/index.ts', [
  [
    '  getStar: (id: number) => ipcRenderer.invoke(\'stars:get\', id),',
    "  getStar: (id: number) => ipcRenderer.invoke('stars:get', id),\n  starContext: (id: number) => ipcRenderer.invoke('stars:context', id),"
  ],
  [
    '  wereadSyncBook: (bookId: string) => ipcRenderer.invoke(\'weread:syncBook\', bookId),',
    "  wereadSyncBook: (bookId: string, meta?: { progress?: number | null; status?: string | null }) =>\n    ipcRenderer.invoke('weread:syncBook', bookId, meta),"
  ]
])

// ---------- 6. 同步对话框/批处理带上阅读状态 ----------
patch('src/renderer/src/components/SyncDialog.tsx', [
  [
    '      const r: WereadSyncReport = await window.api.wereadSyncBook(bookId)',
    "      const nb = books.find((x) => x.bookId === bookId)\n      const r: WereadSyncReport = await window.api.wereadSyncBook(bookId, {\n        progress: nb?.readingProgress ?? null,\n        status: nb?.markedStatus === 1 ? 'finished' : 'reading'\n      })"
  ]
])
patch('src/main/headless.ts', [
  [
    '          const r = await syncBook(db, key, item.bookId)',
    "          const r = await syncBook(db, key, item.bookId, {\n            progress: item.readingProgress ?? null,\n            status: item.markedStatus === 1 ? 'finished' : 'reading'\n          })"
  ]
])
