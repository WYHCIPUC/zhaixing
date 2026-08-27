import type { DB } from '../db/connection'
import { listBooks, listStars } from '../db/repo'
import type { BookRecord } from '@shared/types'
import { bookToMarkdown, type ExportedFile } from '@shared/exporters/markdown'

export { bookToMarkdown }
export type { ExportedFile }

export function buildExports(db: DB, bookId: number | 'all'): ExportedFile[] {
  if (bookId !== 'all') {
    const book = db.prepare(`SELECT * FROM books WHERE id = ?`).get(bookId) as BookRecord | undefined
    if (!book) return []
    return [{ fileName: `${book.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.md`, content: bookToMarkdown(book, listStars(db, book.id)) }]
  }
  const books = listBooks(db)
  return books.map((b) => ({ fileName: `${b.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.md`, content: bookToMarkdown(b, listStars(db, b.id)) }))
}
