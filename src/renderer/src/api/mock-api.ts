// 内存版 ZhaixingApi：浏览器开发与 MM0 冒烟用。
// 核心方法（导入/书架/星卡/检索/统计）真实走内存数据 + shared 解析器；
// 其余方法由 Proxy 兜底返回空值，保证任何视图调用不崩。
import type {
  ArchiveRecord,
  BookRecord,
  BookPatch,
  HighlightRecord,
  ImportReport,
  ParseResult,
  SearchHit,
  ZhaixingApi
} from '@shared/types'
import { parseWereadText } from '@shared/parser/weread'

function createMockApi(): ZhaixingApi {
  const books: BookRecord[] = []
  const stars = new Map<number, HighlightRecord[]>() // bookId -> stars
  const archives: ArchiveRecord[] = []
  let nextBookId = 1
  let nextStarId = 1
  let nextArchiveId = 1

  const now = (): string => new Date().toISOString().replace('T', ' ').slice(0, 19)

  const core = {
    parseWereadText: (text: string): Promise<ParseResult> => Promise.resolve(parseWereadText(text)),

    confirmImport: (text: string): Promise<ImportReport> => {
      const result = parseWereadText(text)
      const bookIds: number[] = []
      let highlightsAdded = 0
      let thoughtsAdded = 0
      for (const b of result.books) {
        let book = books.find((x) => x.title === b.title && x.author === b.author)
        if (!book) {
          book = {
            id: nextBookId++,
            title: b.title,
            author: b.author,
            color: '#7dd3fc',
            rating: 0,
            status: 'finished',
            short_review: '',
            category: '',
            gem_highlight_id: null,
            created_at: now(),
            updated_at: now()
          }
          books.push(book)
          stars.set(book.id, [])
        }
        const list = stars.get(book.id)!
        for (const h of b.highlights) {
          const dup = list.some((s) => s.content === h.content && s.chapter === h.chapter)
          if (dup) continue
          list.push({
            id: nextStarId++,
            book_id: book.id,
            book_title: book.title,
            chapter: h.chapter,
            chapter_order: list.length,
            content: h.content,
            favorite: false,
            ai_tags: [],
            revisit_count: 0,
            last_revisit_at: null,
            created_at: now(),
            thoughts: h.thoughts.map((t, i) => ({
              id: nextStarId * 1000 + i,
              highlight_id: nextStarId,
              content: t.content,
              source: 'user' as const,
              created_at: t.date ?? now()
            }))
          })
          highlightsAdded++
          thoughtsAdded += h.thoughts.length
        }
        bookIds.push(book.id)
      }
      const report: ImportReport = {
        booksAdded: bookIds.length,
        highlightsAdded,
        highlightsSkipped: 0,
        thoughtsAdded,
        bookIds,
        archiveId: nextArchiveId
      }
      archives.push({
        id: nextArchiveId++,
        source: 'weread',
        stats: JSON.stringify(report),
        created_at: now(),
        preview: text.slice(0, 120)
      })
      return Promise.resolve(report)
    },

    listArchives: (): Promise<ArchiveRecord[]> => Promise.resolve([...archives]),

    listBooks: (): Promise<BookRecord[]> =>
      Promise.resolve(
        books.map((b) => ({
          ...b,
          highlight_count: stars.get(b.id)?.length ?? 0,
          thought_count:
            stars
              .get(b.id)
              ?.reduce((n, s) => n + (s.thoughts?.length ?? 0), 0) ?? 0,
          last_note_at: null
        }))
      ),
    getBook: (id: number): Promise<BookRecord | null> =>
      Promise.resolve(books.find((b) => b.id === id) ?? null),
    updateBook: (id: number, patch: BookPatch): Promise<void> => {
      const b = books.find((x) => x.id === id)
      if (b) Object.assign(b, patch)
      return Promise.resolve()
    },
    deleteBook: (id: number): Promise<void> => {
      const i = books.findIndex((b) => b.id === id)
      if (i >= 0) {
        books.splice(i, 1)
        stars.delete(id)
      }
      return Promise.resolve()
    },

    listStars: (bookId: number): Promise<HighlightRecord[]> =>
      Promise.resolve([...(stars.get(bookId) ?? [])]),
    getStar: (id: number): Promise<HighlightRecord | null> => {
      for (const list of stars.values()) {
        const s = list.find((x) => x.id === id)
        if (s) return Promise.resolve(s)
      }
      return Promise.resolve(null)
    },
    updateStar: (id: number, patch: Partial<HighlightRecord>): Promise<void> => {
      for (const list of stars.values()) {
        const s = list.find((x) => x.id === id)
        if (s) Object.assign(s, patch)
      }
      return Promise.resolve()
    },

    search: (q: string): Promise<SearchHit[]> => {
      const hits: SearchHit[] = []
      for (const [bookId, list] of stars) {
        const book = books.find((b) => b.id === bookId)
        for (const s of list) {
          if (q && s.content.includes(q)) {
            hits.push({
              highlight_id: s.id,
              book_id: bookId,
              book_title: book?.title ?? '',
              chapter: s.chapter,
              content: s.content,
              snippet: s.content.slice(0, 80)
            })
          }
        }
      }
      return Promise.resolve(hits)
    },

    getSettings: (): Promise<Record<string, string>> => Promise.resolve({}),
    setSettings: (): Promise<void> => Promise.resolve(),

    overview: () =>
      Promise.resolve({
        bookCount: books.length,
        highlightCount: [...stars.values()].reduce((n, l) => n + l.length, 0),
        thoughtCount: [...stars.values()].reduce((n, l) => n + (l[0]?.thoughts?.length ?? 0) * l.length, 0),
        tagCount: 0,
        archiveCount: archives.length
      }),
    backupNow: (): Promise<string> => Promise.resolve('mock://zhaixing.backup.db'),
    exportMarkdown: (): Promise<string> => Promise.resolve(''),
    testAi: (): Promise<{ ok: boolean; error?: string }> =>
      Promise.resolve({ ok: false, error: 'mock 模式未配置 AI' })
  }

  // 兜底：未实现的方法返回空值 Promise，保证视图冒烟不崩
  // 注意：放行 then，避免对象成为 thenable 导致 await 挂起
  return new Proxy(core, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return Reflect.get(target, prop)
      if (prop in target) return target[prop as keyof typeof target]
      return (...args: unknown[]) => {
        console.info(`[mock-api] ${prop}(${args.length} args) → 空值兜底`)
        if (/^(get|list|top|night|daily|ask|spirit)/.test(prop)) return Promise.resolve([])
        if (/^(draft|create)/.test(prop)) return Promise.resolve(null)
        return Promise.resolve(undefined)
      }
    }
  }) as unknown as ZhaixingApi
}

export const mockApi = createMockApi()
