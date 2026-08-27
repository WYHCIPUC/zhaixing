// 手机端 ZhaixingApi 真实实现：AsyncSqliteExecutor + async-repo + 共享 weread 客户端
// MM1 范围：导入/书/星/想法/标签/检索/设置/统计/存档/微信读书同步/导出文本/AI 测试连接
// MM2-MM4 范围的方法（星穹图谱/流星/织星/AI 管线/星光节）暂由 Proxy 兜底空值，
// 对应视图在移动端落地时改为真实实现（对照桌面 nebula.ts / meteor.ts / articles.ts）
import type { AiTestResult, BookPatch, ImportReport, ParseResult, StarPatch, ZhaixingApi } from '@shared/types'
import { parseWereadText } from '@shared/parser/weread'
import { bookToMarkdown, type ExportedFile } from '@shared/exporters/markdown'
import { applySchema } from '@shared/db/apply-schema'
import {
  addArchive,
  deleteBook,
  deleteStar,
  deleteThought,
  getBook,
  getSettings,
  getStar,
  importParsed,
  insertThought,
  listArchives,
  listBooks,
  listStars,
  mergeStars,
  overview,
  search,
  setSettings,
  setStarTags,
  updateBook,
  updateStar,
  updateThought,
  wereadSyncBook,
  type Db
} from '@shared/db/async-repo'
import { fetchBookmarklist, fetchMyReviews, fetchNotebooks, type WereadNotebookItem } from '@shared/weread/api'
import { isAiConfigured, testAi as aiTest, type AiConfig } from '@shared/ai/client'

// 对照桌面 buildExports（buildExports 依赖同步 DB，手机端此处按同格式异步编排）
async function exportBookMarkdown(db: Db, bookId: number | 'all'): Promise<ExportedFile[]> {
  const safe = (name: string): string => name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)
  if (bookId !== 'all') {
    const book = await getBook(db, bookId)
    if (!book) return []
    return [{ fileName: `${safe(book.title)}.md`, content: bookToMarkdown(book, await listStars(db, book.id)) }]
  }
  const books = await listBooks(db)
  const files: ExportedFile[] = []
  for (const b of books) {
    files.push({ fileName: `${safe(b.title)}.md`, content: bookToMarkdown(b, await listStars(db, b.id)) })
  }
  return files
}

export async function createMobileApi(db: Db): Promise<ZhaixingApi> {
  await applySchema(db)

  const wereadKey = async (): Promise<string> => (await getSettings(db))['weread_api_key']?.trim() || ''
  const aiCfg = async (): Promise<AiConfig | null> => {
    const s = await getSettings(db)
    const cfg = {
      baseUrl: s.ai_base_url?.trim(),
      apiKey: s.ai_api_key?.trim(),
      chatModel: s.ai_chat_model?.trim(),
      embedModel: s.ai_embed_model?.trim()
    }
    return isAiConfigured(cfg) ? cfg : null
  }

  const core = {
    parseWereadText: (text: string): Promise<ParseResult> => Promise.resolve(parseWereadText(text)),

    confirmImport: async (text: string): Promise<ImportReport> => {
      const parsed = parseWereadText(text)
      const r = await importParsed(db, parsed.books)
      const archiveId = await addArchive(db, text, {
        added: r.highlightsAdded,
        skipped: r.highlightsSkipped,
        books: r.booksAdded,
        warnings: parsed.warnings
      })
      return { ...r, archiveId }
    },
    listArchives: () => listArchives(db),

    listBooks: () => listBooks(db),
    getBook: (id: number) => getBook(db, id),
    updateBook: (id: number, patch: BookPatch) => updateBook(db, id, patch),
    deleteBook: (id: number) => deleteBook(db, id),

    listStars: (bookId: number) => listStars(db, bookId),
    getStar: (id: number) => getStar(db, id),
    updateStar: (id: number, patch: StarPatch) => updateStar(db, id, patch),
    deleteStar: (id: number) => deleteStar(db, id),
    mergeStars: (ids: number[], content: string) => mergeStars(db, ids, content),
    addThought: (starId: number, content: string) => insertThought(db, starId, content, 'user'),
    updateThought: (id: number, content: string) => updateThought(db, id, content),
    deleteThought: (id: number) => deleteThought(db, id),
    setStarTags: (starId: number, tags: string[]) => setStarTags(db, starId, tags),

    search: (q: string) => search(db, q),

    exportMarkdown: async (bookId: number | 'all'): Promise<string> => {
      const files = await exportBookMarkdown(db, bookId)
      if (files.length === 0) return ''
      if (bookId !== 'all') return files[0].content
      return files.map((f) => f.content).join('\n\n---\n\n')
    },

    getSettings: () => getSettings(db),
    setSettings: (patch: Record<string, string>) => setSettings(db, patch),
    testAi: async (): Promise<AiTestResult> => {
      const cfg = await aiCfg()
      if (!cfg) return { ok: false, error: '未配置完整（需要 base_url / api_key / 模型名）' }
      const r = await aiTest(cfg)
      return { ok: r.ok, error: r.error, model: cfg.chatModel }
    },

    overview: () => overview(db),

    // 微信读书同步（key 从设置读取；手机端无 env）
    wereadNotebooks: async (): Promise<WereadNotebookItem[]> => {
      const key = await wereadKey()
      if (!key) throw new Error('未配置微信读书 API Key（设置 → weread_api_key）')
      return fetchNotebooks(key)
    },
    wereadSyncBook: async (bookId: string) => {
      const key = await wereadKey()
      if (!key) throw new Error('未配置微信读书 API Key（设置 → weread_api_key）')
      const [bm, reviews] = await Promise.all([fetchBookmarklist(key, bookId), fetchMyReviews(key, bookId)])
      return wereadSyncBook(db, { bookmarks: bm, reviews })
    },

    backupNow: async (): Promise<string> => {
      // MM1 后续任务接 Filesystem 插件复制 db 文件；先落占位避免误报成功
      throw new Error('备份将在 MM1 后续任务中启用')
    }
  }

  // 兜底：MM2-MM4 的方法（星穹/流星/织星/AI 管线/星光节）返回空值，视图不崩
  return new Proxy(core as unknown as ZhaixingApi, {
    get(target, prop: string) {
      if (prop in target) return (target as unknown as Record<string, unknown>)[prop]
      return (...args: unknown[]) => {
        console.info(`[mobile-api] ${prop}(${args.length} args) 尚未实现（MM2-MM4）→ 空值兜底`)
        if (/^(get|list|top|night|daily|spirit)/.test(prop)) return Promise.resolve([])
        if (/draftNebulaArticle/.test(prop)) return Promise.resolve(null)
        return Promise.resolve(undefined)
      }
    }
  })
}
