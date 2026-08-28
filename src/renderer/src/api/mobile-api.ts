// 手机端 ZhaixingApi 真实实现：AsyncSqliteExecutor + async-repo + 共享 weread 客户端
// MM1 范围：导入/书/星/想法/标签/检索/设置/统计/存档/微信读书同步/导出文本/AI 测试连接
// MM2-MM4 范围的方法（星穹图谱/流星/织星/AI 管线/星光节）暂由 Proxy 兜底空值，
// 对应视图在移动端落地时改为真实实现（对照桌面 nebula.ts / meteor.ts / articles.ts）
import type { AiTestResult, BookPatch, ImportReport, ParseResult, RewriteStyle, StarPatch, ZhaixingApi } from '@shared/types'
import { parseWereadText } from '@shared/parser/weread'
import { bookToMarkdown, type ExportedFile } from '@shared/exporters/markdown'
import { applySchema } from '@shared/db/apply-schema'
import {
  addArchive,
  addStarsToNebula,
  bumpRevisit,
  createCapsule,
  createManualLink,
  createNebula,
  decideLink,
  deleteBook,
  deleteLink,
  deleteNebula,
  getMeteor,
  deleteStar,
  deleteThought,
  getBook,
  getSettings,
  getStar,
  getStarMap,
  importParsed,
  insertThought,
  listArchives,
  listBooks,
  listCapsules,
  listLinks,
  listStars,
  listNebulae,
  markMeteorRevisited,
  mergeStars,
  nightFlightStars,
  overview,
  removeStarFromNebula,
  search,
  setSettings,
  setStarTags,
  updateBook,
  updateNebula,
  updateStar,
  updateThought,
  topRevisited,
  upsertLink,
  wereadSyncBook,
  type Db
} from '@shared/db/async-repo'
import { fetchBookmarklist, fetchMyReviews, fetchNotebooks, type WereadNotebookItem } from '@shared/weread/api'
import { isAiConfigured, testAi as aiTest, type AiConfig } from '@shared/ai/client'
import { Filesystem } from '@capacitor/filesystem'
import { aiDeps } from '@shared/db/ai-repo'
import {
  askSky,
  dailyCounts,
  deleteArticle,
  draftNebulaArticle,
  fallbackCites,
  listArticles,
  pickGems,
  rewriteQuoteOfStar,
  runAnalysis,
  socraticAsk,
  spiritSpectrum,
  saveArticleVersion,
  updateArticleTitle
} from '@shared/db/ai-repo'

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

    // 星穹图谱（MM2）
    getStarMap: () => getStarMap(db),
    createNebula: (name: string, starIds: number[], summary?: string) =>
      createNebula(db, name, starIds, summary ?? '', 'user', null),
    addStarsToNebula: (nebulaId: number, starIds: number[]) => addStarsToNebula(db, nebulaId, starIds),
    removeStarFromNebula: (nebulaId: number, starId: number) => removeStarFromNebula(db, nebulaId, starId),
    updateNebula: (id: number, patch: { name?: string; summary?: string; color?: string | null }) =>
      updateNebula(db, id, patch),
    deleteNebula: (id: number) => deleteNebula(db, id),
    listLinks: (status: 'suggested' | 'confirmed') => listLinks(db, status),
    decideLink: (id: number, status: 'confirmed' | 'dismissed') => decideLink(db, id, status),
    createLink: (fromId: number, toId: number, note: string) => createManualLink(db, fromId, toId, note),
    deleteLink: (id: number) => deleteLink(db, id),
    bumpRevisit: (starId: number) => bumpRevisit(db, starId),
    topRevisited: (limit: number) => topRevisited(db, limit),

    // 重逢（MM3）
    getMeteor: () => getMeteor(db),
    markMeteorRevisited: (logId: number) => markMeteorRevisited(db, logId),
    createCapsule: (starId: number, deliverAt: string, message: string) => createCapsule(db, starId, deliverAt, message),
    listCapsules: () => listCapsules(db),
    nightFlightStars: (limit: number) => nightFlightStars(db, limit),

    // AI 管线（MM4）：cfg 从设置读取；key 未配时由 aiCfg 抛出友好错误
    runAiAnalysis: async () => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置完整（需要 base_url / api_key / 模型名）')
      return runAnalysis(db, cfg)
    },
    pickGems: async () => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置完整（需要 base_url / api_key / 模型名）')
      return pickGems(db, cfg)
    },
    listArticles: (nebulaId?: number) => listArticles(db, nebulaId),
    draftNebulaArticle: async (nebulaId: number) => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置 AI')
      return draftNebulaArticle(db, cfg, aiDeps, nebulaId)
    },
    saveArticle: (id: number, contentMd: string) => saveArticleVersion(db, id, contentMd),
    updateArticleTitle: (id: number, title: string) => updateArticleTitle(db, id, title),
    deleteArticle: (id: number) => deleteArticle(db, id),
    rewriteQuote: async (starId: number, style: RewriteStyle) => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置 AI')
      return rewriteQuoteOfStar(db, cfg, aiDeps, starId, style)
    },
    socraticAsk: async (starId: number, thought: string) => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置 AI')
      const star = await getStar(db, starId)
      if (!star) throw new Error('星不存在')
      return socraticAsk(cfg, aiDeps, star.content, thought)
    },
    askSky: async (question: string) => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置 AI')
      const r = await askSky(db, cfg, aiDeps, question)
      if (r.cites.length === 0) r.cites.push(...(await fallbackCites(db, question)))
      return r
    },
    dailyCounts: () => dailyCounts(db),
    spiritSpectrum: async (refresh: boolean) => {
      const cfg = await aiCfg()
      if (!cfg) throw new Error('未配置 AI')
      return spiritSpectrum(db, cfg, aiDeps, refresh)
    },

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
      // 与桌面 backupDatabase 同语义：单份轮换备份到库同目录 zhaixing.backup.db。
      // 路径取自 pragma_database_list（插件把库放在 /data/data/<pkg>/databases）。
      // VACUUM INTO 不能覆盖已有文件，先删旧备份；VACUUM 不能在事务内，走 noTx。
      const rows = await db.query<{ file: string }>(`SELECT file FROM pragma_database_list WHERE name = 'main'`)
      const dbPath = rows[0]?.file
      if (!dbPath) throw new Error('无法定位数据库文件')
      const dir = dbPath.slice(0, dbPath.lastIndexOf('/'))
      const backupPath = `${dir}/zhaixing.backup.db`
      try {
        await Filesystem.deleteFile({ path: backupPath })
      } catch {
        // 首次备份时旧文件不存在，忽略
      }
      await db.exec(`VACUUM INTO '${backupPath}'`, { noTx: true })
      return backupPath
    }
  }

  // 兜底：MM2-MM4 的方法（星穹/流星/织星/AI 管线/星光节）返回空值，视图不崩
  // 注意：必须放行 then/Symbol 属性，否则对象成为 thenable，await 它会永久挂起
  return new Proxy(core as unknown as ZhaixingApi, {
    get(target, prop) {
      if (typeof prop !== 'string' || prop === 'then') return Reflect.get(target, prop)
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
