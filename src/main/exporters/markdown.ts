import type { DB } from '../db/connection'
import { listBooks, listStars } from '../db/repo'
import type { BookRecord, HighlightRecord } from '@shared/types'

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
}

export function bookToMarkdown(book: BookRecord, stars: HighlightRecord[]): string {
  const lines: string[] = []
  lines.push('---')
  lines.push(`title: ${book.title}`)
  if (book.author) lines.push(`author: ${book.author}`)
  lines.push(`source: 摘星实录`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${book.title}`)
  if (book.author) lines.push(`\n> ${book.author}`)
  if (book.short_review) lines.push(`\n## 短评\n\n${book.short_review}`)
  lines.push('')

  let lastChapter: string | null = null
  for (const s of stars) {
    if (s.chapter !== lastChapter) {
      lastChapter = s.chapter
      lines.push(`## ${s.chapter || '未分章'}`)
      lines.push('')
    }
    lines.push(`> ${s.content.replace(/\n/g, '\n> ')}`)
    for (const t of s.thoughts ?? []) {
      lines.push('>> ' + t.content.replace(/\n/g, '\n>> '))
    }
    lines.push('')
  }
  return lines.join('\n')
}

export interface ExportedFile {
  fileName: string
  content: string
}

export function buildExports(db: DB, bookId: number | 'all'): ExportedFile[] {
  if (bookId !== 'all') {
    const book = db.prepare(`SELECT * FROM books WHERE id = ?`).get(bookId) as BookRecord | undefined
    if (!book) return []
    return [{ fileName: `${safeFileName(book.title)}.md`, content: bookToMarkdown(book, listStars(db, book.id)) }]
  }
  const books = listBooks(db)
  return books.map((b) => ({ fileName: `${safeFileName(b.title)}.md`, content: bookToMarkdown(b, listStars(db, b.id)) }))
}
