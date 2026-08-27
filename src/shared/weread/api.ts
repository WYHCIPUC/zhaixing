// 微信读书 Agent API Gateway 纯客户端（双端共用）
// 鉴权：Bearer WEREAD_API_KEY；每次请求必须带 skill_version；业务参数平铺在 body 顶层

export const WEREAD_GATEWAY = 'https://i.weread.qq.com/api/agent/gateway'
export const WEREAD_SKILL_VERSION = '1.0.4'

export class WereadError extends Error {
  constructor(
    message: string,
    public errcode?: number
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 30_000

export async function wereadCall<T>(apiKey: string, apiName: string, params: Record<string, unknown> = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(WEREAD_GATEWAY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ api_name: apiName, ...params, skill_version: WEREAD_SKILL_VERSION }),
      signal: controller.signal
    })
    if (!res.ok) throw new WereadError(`网关 HTTP ${res.status}`)
    const data = (await res.json()) as Record<string, unknown> & { errcode?: number; errmsg?: string; upgrade_info?: { message?: string } }
    if (data.upgrade_info?.message) {
      throw new WereadError(`微信读书 skill 需要升级：${data.upgrade_info.message}`)
    }
    if (data.errcode !== undefined && data.errcode !== 0) {
      throw new WereadError(data.errmsg || `接口错误 errcode=${data.errcode}`, data.errcode)
    }
    return data as T
  } catch (err) {
    if (err instanceof WereadError) throw err
    if (err instanceof Error && err.name === 'AbortError') throw new WereadError('请求超时')
    throw new WereadError(err instanceof Error ? err.message : String(err))
  }
}

// ---------- 回包类型（按 notes.md 字段说明） ----------

export interface WereadNotebookItem {
  bookId: string
  book: { title: string; author: string; cover?: string }
  reviewCount: number // 想法/点评数
  noteCount: number // 划线数
  bookmarkCount: number // 书签数（仅数量，无内容）
  readingProgress?: number
  markedStatus?: number // 1=读完 0=在读
  sort: number // 翻页游标
}

export interface WereadNotebooksResp {
  totalBookCount: number
  totalNoteCount: number
  hasMore: number
  books: WereadNotebookItem[]
}

export interface WereadChapterInfo {
  chapterUid: number
  chapterIdx: number
  title: string
}

export interface WereadBookmarkItem {
  bookmarkId: string
  bookId: string
  chapterUid: number
  markText: string
  createTime: number
  type?: number
  range?: string
  colorStyle?: number
}

export interface WereadBookmarklistResp {
  updated: WereadBookmarkItem[]
  chapters: WereadChapterInfo[]
  book?: { title?: string; author?: string }
}

export interface WereadReviewItem {
  review: {
    reviewId: string
    content: string
    abstract?: string // 想法对应的划线原文（划线想法才有）
    range?: string
    chapterUid?: number
    chapterIdx?: number
    createTime: number
    star?: number // 评分 0-5，-1=无评分
    chapterName?: string
    isFinish?: number
  }
}

export interface WereadReviewsResp {
  reviews: WereadReviewItem[]
  totalCount?: number
  hasMore?: number
  synckey?: number
}

// ---------- 常用封装 ----------

export async function fetchNotebooks(apiKey: string): Promise<WereadNotebookItem[]> {
  const out: WereadNotebookItem[] = []
  let lastSort: number | undefined
  for (let i = 0; i < 50; i++) {
    const params: Record<string, unknown> = { count: 100 }
    if (lastSort !== undefined) params.lastSort = lastSort
    const page = await wereadCall<WereadNotebooksResp>(apiKey, '/user/notebooks', params)
    out.push(...(page.books ?? []))
    if (!page.hasMore) break
    const tail = page.books?.[page.books.length - 1]
    if (!tail) break
    lastSort = tail.sort
  }
  return out
}

export async function fetchBookmarklist(apiKey: string, bookId: string): Promise<WereadBookmarklistResp> {
  return wereadCall<WereadBookmarklistResp>(apiKey, '/book/bookmarklist', { bookId })
}

export async function fetchMyReviews(apiKey: string, bookId: string): Promise<WereadReviewItem[]> {
  const out: WereadReviewItem[] = []
  let synckey = 0
  for (let i = 0; i < 50; i++) {
    const page = await wereadCall<WereadReviewsResp>(apiKey, '/review/list/mine', { bookid: bookId, synckey, count: 100 })
    out.push(...(page.reviews ?? []))
    if (!page.hasMore) break
    synckey = page.synckey ?? 0
  }
  return out
}
