// 纯 Markdown 渲染：记录 → 文本。双端共用（桌面 buildExports / 手机分享导出）
// 入口文件的 DB 查询编排留在各端（src/main/exporters/markdown.ts）
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
