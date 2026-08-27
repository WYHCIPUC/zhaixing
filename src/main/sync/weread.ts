import type { DB } from '../db/connection'
import { getDb } from '../db/connection'
import {
  findBook,
  findHighlightId,
  getSettings,
  insertBook,
  insertHighlight,
  insertThought,
  insertThoughtIfNew,
  updateBook
} from '../db/repo'
import {
  fetchBookmarklist,
  fetchMyReviews,
  fetchNotebooks,
  type WereadNotebookItem
} from '@shared/weread/api'

export function wereadKey(): string {
  const fromSettings = getSettings(getDb())['weread_api_key']?.trim()
  return fromSettings || process.env.WEREAD_API_KEY?.trim() || ''
}

export async function listNotebooks(apiKey: string): Promise<WereadNotebookItem[]> {
  return fetchNotebooks(apiKey)
}

function ts(sec: number): string {
  const d = new Date(sec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 锚点归一化：与解析器 stripQuotes 同口径
function norm(text: string): string {
  return text
    .replace(/^[“”"'‘’「『」』\s、，。]+/, '')
    .replace(/[“”"'‘’「』」\s]+$/, '')
    .trim()
}

export interface WereadSyncReport {
  bookTitle: string
  highlightsAdded: number
  highlightsSkipped: number
  thoughtsAdded: number
  thoughtsSkipped: number
  ratingSet: boolean
}

export async function syncBook(db: DB, apiKey: string, bookId: string): Promise<WereadSyncReport> {
  const [bm, reviews] = await Promise.all([fetchBookmarklist(apiKey, bookId), fetchMyReviews(apiKey, bookId)])
  const title = bm.book?.title?.trim() || `微信读书 ${bookId}`
  const author = bm.book?.author?.trim() || ''
  const report: WereadSyncReport = {
    bookTitle: title,
    highlightsAdded: 0,
    highlightsSkipped: 0,
    thoughtsAdded: 0,
    thoughtsSkipped: 0,
    ratingSet: false
  }

  let book = findBook(db, title, author)
  if (!book) book = insertBook(db, title, author)

  const chapterMap = new Map((bm.chapters ?? []).map((c) => [c.chapterUid, c]))

  // 划线（按创建时间排序入库）
  const contentToId = new Map<string, number>()
  const sorted = [...(bm.updated ?? [])].sort((a, b) => a.createTime - b.createTime)
  for (const u of sorted) {
    const ch = chapterMap.get(u.chapterUid)
    const res = insertHighlight(db, book.id, ch?.title ?? '', ch?.chapterIdx ?? 0, u.markText, ts(u.createTime))
    if (res.added) report.highlightsAdded++
    else report.highlightsSkipped++
    const hid = res.id || findHighlightId(db, book.id, ch?.title ?? '', u.markText)
    if (hid) contentToId.set(norm(u.markText), hid)
  }

  // 想法/点评：有 abstract → 挂到对应划线（无则补建）；无 abstract 的整本书评 → 短评；star → 评分
  for (const item of reviews) {
    const rv = item.review
    if (!rv.content?.trim()) continue
    const date = ts(rv.createTime)

    let attached = false
    if (rv.abstract?.trim()) {
      const key = norm(rv.abstract)
      let hid: number | null | undefined = contentToId.get(key)
      if (!hid) {
        const ch = rv.chapterUid !== undefined ? chapterMap.get(rv.chapterUid) : undefined
        const res = insertHighlight(
          db,
          book.id,
          ch?.title ?? rv.chapterName ?? '',
          ch?.chapterIdx ?? rv.chapterIdx ?? 0,
          key,
          ts(rv.createTime)
        )
        if (res.added) report.highlightsAdded++
        hid = res.id || findHighlightId(db, book.id, ch?.title ?? rv.chapterName ?? '', key)
        if (hid) contentToId.set(key, hid)
      }
      if (hid) {
        if (insertThoughtIfNew(db, hid, rv.content.trim(), 'user', date)) report.thoughtsAdded++
        else report.thoughtsSkipped++
        attached = true
      }
    }
    if (!attached) {
      // 整本书评 → 短评（仅在书还没有短评时）
      if (!rv.abstract && !rv.chapterName && !book.short_review) {
        updateBook(db, book.id, { short_review: rv.content.trim() })
        book.short_review = rv.content.trim()
        attached = true
      }
    }
    if (!attached) report.thoughtsSkipped++

    // star 实测为 0-100 刻度（100=好看，20=差），换算成 1-5 星
    if (rv.star !== undefined && rv.star >= 0 && book.rating === 0) {
      const stars = Math.max(1, Math.min(5, Math.round(rv.star / 20)))
      updateBook(db, book.id, { rating: stars })
      book.rating = stars
      report.ratingSet = true
    }
  }

  return report
}
