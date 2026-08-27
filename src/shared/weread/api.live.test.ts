// 真网关集成测试：设置 WEREAD_API_KEY 才会运行（CI/无 key 环境自动跳过）
// 只读验证：笔记本概览 + 单本书划线/想法的结构与数量口径
import { describe, expect, it } from 'vitest'
import { fetchBookmarklist, fetchMyReviews, fetchNotebooks } from './api'

const KEY = process.env.WEREAD_API_KEY?.trim() || ''
// 剑来：概览口径 划线17/想法17（若笔记有增减，断言用 >=，只验证链路不锁数字）
const LIVE_BOOK_ID = '22261199'

describe.skipIf(!KEY)('weread 网关（真实数据，只读）', () => {
  it('笔记本概览可分页拉取且字段齐全', async () => {
    const books = await fetchNotebooks(KEY)
    expect(books.length).toBeGreaterThan(0)
    const first = books[0]
    expect(first.bookId).toBeTruthy()
    expect(first.book.title).toBeTruthy()
    expect(typeof first.noteCount).toBe('number')
    expect(typeof first.reviewCount).toBe('number')
  }, 60_000)

  it('单本书划线列表含章节映射与原文', async () => {
    const bm = await fetchBookmarklist(KEY, LIVE_BOOK_ID)
    expect(bm.updated.length).toBeGreaterThanOrEqual(1)
    expect(bm.chapters.length).toBeGreaterThanOrEqual(1)
    expect(bm.updated[0].markText?.length).toBeGreaterThan(0)
    const byUid = new Map(bm.chapters.map((c) => [c.chapterUid, c.title]))
    // 每条划线的 chapterUid 都能定位到章节
    for (const u of bm.updated) expect(byUid.has(u.chapterUid)).toBe(true)
  }, 60_000)

  it('单本书想法列表可拉取', async () => {
    const reviews = await fetchMyReviews(KEY, LIVE_BOOK_ID)
    expect(reviews.length).toBeGreaterThanOrEqual(1)
    expect(reviews[0].review.content?.length ?? 0).toBeGreaterThan(0)
  }, 60_000)
})
