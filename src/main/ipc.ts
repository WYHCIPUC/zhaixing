import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { getDb, backupDatabase } from './db/connection'
import {
  getStarContext,
  addArchive,
  deleteBook,
  deleteStar,
  deleteThought,
  findBook,
  getBook,
  getSettings,
  getStar,
  importParsed,
  insertBook,
  insertThought,
  listArchives,
  listBooks,
  listStars,
  mergeBooks,
  mergeStars,
  overview,
  search,
  setSettings,
  setStarTags,
  updateBook,
  updateStar,
  updateThought
} from './db/repo'
import { parseWereadText } from '@shared/parser/weread'
import { buildExports } from './exporters/markdown'
import { isAiConfigured, testAi, type AiConfig } from '@shared/ai/client'
import { classifyBooks, pickGems, runAnalysis } from './ai/pipeline'
import { createCapsule, getMeteor, listCapsules, markMeteorRevisited, nightFlightStars } from './db/meteor'
import {
  deleteArticle,
  listArticles,
  saveArticleVersion,
  updateArticleTitle
} from './db/articles'
import { askSky, draftNebulaArticle, rewriteQuote, socraticQuestion, type RewriteStyle } from './ai/weave'
import { spiritSpectrum } from './ai/spirit'
import { listNotebooks, syncBook, wereadKey } from './sync/weread'
import { compileWiki, getWikiBacklinks, getWikiPage, getWikiPageByTitle, listWikiPages } from './wiki/compiler'
import { exportWiki } from './wiki/exporter'
import {
  addStarsToNebula,
  bumpRevisit,
  createManualLink,
  createNebula,
  decideLink,
  deleteLink,
  deleteNebula,
  getStarMap,
  listLinks,
  listNebulae,
  removeStarFromNebula,
  topRevisited,
  updateNebula
} from './db/nebula'
import type { BookPatch, StarPatch } from '@shared/types'

function aiConfigFromSettings(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: s.ai_base_url?.trim(),
    apiKey: s.ai_api_key?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}

// 向量供应商可与对话分属不同平台（留空则沿用主配置）
function embedConfigFromSettings(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: (s.ai_embed_base_url || s.ai_base_url)?.trim(),
    apiKey: (s.ai_embed_key || s.ai_api_key)?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}

export function registerIpc(): void {
  // ---------- 导入 ----------
  ipcMain.handle('import:parse', (_e, text: string) => parseWereadText(text))

  ipcMain.handle('import:confirm', (_e, text: string) => {
    const db = getDb()
    const parsed = parseWereadText(text)
    const report = importParsed(db, parsed.books)
    const archiveId = addArchive(db, text, {
      added: report.highlightsAdded,
      skipped: report.highlightsSkipped,
      books: report.booksAdded,
      warnings: parsed.warnings
    })
    return { ...report, archiveId }
  })

  ipcMain.handle('import:archives', () => listArchives(getDb()))

  // ---------- 书 ----------
  ipcMain.handle('books:list', () => listBooks(getDb()))
  ipcMain.handle('books:get', (_e, id: number) => getBook(getDb(), id))
  ipcMain.handle('books:update', (_e, id: number, patch: BookPatch) => updateBook(getDb(), id, patch))
  ipcMain.handle('books:delete', (_e, id: number) => deleteBook(getDb(), id))
  ipcMain.handle('books:merge', (_e, fromId: number, toId: number) => mergeBooks(getDb(), fromId, toId))

  // ---------- 星 ----------
  ipcMain.handle('stars:list', (_e, bookId: number) => listStars(getDb(), bookId))
  ipcMain.handle('stars:get', (_e, id: number) => getStar(getDb(), id))
  ipcMain.handle('stars:context', (_e, id: number) => getStarContext(getDb(), id))
  ipcMain.handle('stars:update', (_e, id: number, patch: StarPatch) => updateStar(getDb(), id, patch))
  ipcMain.handle('stars:delete', (_e, id: number) => deleteStar(getDb(), id))
  ipcMain.handle('stars:merge', (_e, ids: number[], content: string) => mergeStars(getDb(), ids, content))
  ipcMain.handle('thoughts:add', (_e, starId: number, content: string) =>
    insertThought(getDb(), starId, content, 'user')
  )
  ipcMain.handle('thoughts:update', (_e, id: number, content: string) => updateThought(getDb(), id, content))
  ipcMain.handle('thoughts:delete', (_e, id: number) => deleteThought(getDb(), id))
  ipcMain.handle('stars:setTags', (_e, starId: number, tags: string[]) => setStarTags(getDb(), starId, tags))

  // ---------- 检索 / 导出 ----------
  ipcMain.handle('search', (_e, q: string) => search(getDb(), q))

  // ---------- 星穹图谱 ----------
  ipcMain.handle('nebula:list', () => listNebulae(getDb()))
  ipcMain.handle('nebula:create', (_e, name: string, starIds: number[], summary: string) =>
    createNebula(getDb(), name, summary ?? '', 'user', null, starIds)
  )
  ipcMain.handle('nebula:addStars', (_e, nebulaId: number, starIds: number[]) =>
    addStarsToNebula(getDb(), nebulaId, starIds)
  )
  ipcMain.handle('nebula:removeStar', (_e, nebulaId: number, starId: number) =>
    removeStarFromNebula(getDb(), nebulaId, starId)
  )
  ipcMain.handle(
    'nebula:update',
    (_e, id: number, patch: { name?: string; summary?: string; color?: string | null }) =>
      updateNebula(getDb(), id, patch)
  )
  ipcMain.handle('nebula:delete', (_e, id: number) => deleteNebula(getDb(), id))

  ipcMain.handle('links:list', (_e, status: 'suggested' | 'confirmed') => listLinks(getDb(), status))
  ipcMain.handle('links:decide', (_e, id: number, status: 'confirmed' | 'dismissed') =>
    decideLink(getDb(), id, status)
  )
  ipcMain.handle('links:create', (_e, fromId: number, toId: number, note: string) =>
    createManualLink(getDb(), fromId, toId, note)
  )
  ipcMain.handle('links:delete', (_e, id: number) => deleteLink(getDb(), id))

  ipcMain.handle('starmap:get', () => getStarMap(getDb()))
  ipcMain.handle('stars:bumpRevisit', (_e, starId: number) => bumpRevisit(getDb(), starId))
  ipcMain.handle('stars:topRevisited', (_e, limit: number) => topRevisited(getDb(), limit))

  // ---------- 重逢 ----------
  ipcMain.handle('meteor:today', () => getMeteor(getDb()))
  ipcMain.handle('meteor:revisited', (_e, logId: number) => markMeteorRevisited(getDb(), logId))
  ipcMain.handle('capsule:create', (_e, starId: number, deliverAt: string, message: string) =>
    createCapsule(getDb(), starId, deliverAt, message)
  )
  ipcMain.handle('capsule:list', () => listCapsules(getDb()))
  ipcMain.handle('meteor:nightFlight', (_e, limit: number) => nightFlightStars(getDb(), limit))

  // ---------- 织星 ----------
  ipcMain.handle('articles:list', (_e, nebulaId?: number) => listArticles(getDb(), nebulaId))
  ipcMain.handle('articles:draft', async (_e, nebulaId: number) => {
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    await draftNebulaArticle(getDb(), cfg, nebulaId)
    const articles = listArticles(getDb(), nebulaId)
    return articles[0] ?? null
  })
  ipcMain.handle('articles:save', (_e, id: number, contentMd: string) => saveArticleVersion(getDb(), id, contentMd))
  ipcMain.handle('articles:title', (_e, id: number, title: string) => updateArticleTitle(getDb(), id, title))
  ipcMain.handle('articles:delete', (_e, id: number) => deleteArticle(getDb(), id))

  ipcMain.handle('ai:rewrite', async (_e, starId: number, style: RewriteStyle) => {
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    const star = getStar(getDb(), starId)
    if (!star) throw new Error('星不存在')
    return rewriteQuote(cfg, star.content, style)
  })
  ipcMain.handle('ai:socratic', async (_e, starId: number, thought: string) => {
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    const star = getStar(getDb(), starId)
    if (!star) throw new Error('星不存在')
    return socraticQuestion(cfg, star.content, thought)
  })
  ipcMain.handle('ai:askSky', async (_e, question: string) => {
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    const embedCfg = embedConfigFromSettings()
    if (!embedCfg) throw new Error('未配置向量模型接口')
    return askSky(getDb(), cfg, embedCfg, question)
  })
  ipcMain.handle('ai:spirit', async (_e, refresh: boolean) => {
    const db = getDb()
    if (refresh) {
      const { clearSpiritCache } = await import('./ai/spirit')
      clearSpiritCache(db)
    }
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    return spiritSpectrum(db, cfg)
  })

  // ---------- 星光节 ----------
  ipcMain.handle('stats:daily', () => {
    const rows = getDb()
      .prepare(`SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM highlights GROUP BY date ORDER BY date`)
      .all() as { date: string; count: number }[]
    return rows
  })
  ipcMain.handle('app:saveImage', async (_e, defaultName: string, dataUrl: string) => {
    const win = BrowserWindow.getFocusedWindow()
    const { canceled, filePath } = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [{ name: 'PNG', extensions: ['png'] }]
    })
    if (canceled || !filePath) return ''
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return filePath
  })

  // ---------- AI 管线 ----------
  ipcMain.handle('ai:runAnalysis', async () => {
    const cfg = aiConfigFromSettings()
    if (!cfg) return { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: ['未配置 AI'] }
    const embedCfg = embedConfigFromSettings()
    if (!embedCfg) return { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: ['未配置向量模型接口'] }
    return runAnalysis(cfg, embedCfg)
  })
  ipcMain.handle('ai:classifyBooks', async () => {
    const cfg = aiConfigFromSettings()
    if (!cfg) throw new Error('未配置 AI')
    return classifyBooks(getDb(), cfg)
  })
  ipcMain.handle('ai:pickGems', async () => {
    const cfg = aiConfigFromSettings()
    if (!cfg) return 0
    const report = { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: [] }
    await pickGems(getDb(), cfg, report)
    return report.gems
  })

  ipcMain.handle('export:markdown', async (_e, bookId: number | 'all') => {
    const db = getDb()
    const files = buildExports(db, bookId)
    if (files.length === 0) return ''
    const win = BrowserWindow.getFocusedWindow()
    if (bookId !== 'all') {
      const { canceled, filePath } = await dialog.showSaveDialog(win!, {
        defaultPath: files[0].fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })
      if (canceled || !filePath) return ''
      fs.writeFileSync(filePath, files[0].content, 'utf-8')
      return filePath
    }
    const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择导出目录（每本书一个 Markdown 文件）'
    })
    if (canceled || filePaths.length === 0) return ''
    const dir = filePaths[0]
    for (const f of files) {
      fs.writeFileSync(path.join(dir, f.fileName), f.content, 'utf-8')
    }
    return dir
  })

  // ---------- 群星（wiki） ----------
  ipcMain.handle('wiki:compile', () => compileWiki(getDb()))
  ipcMain.handle('wiki:list', () => listWikiPages(getDb()))
  ipcMain.handle('wiki:get', (_e, id: number) => {
    const p = getWikiPage(getDb(), id)
    if (!p) return null
    return {
      id: p.id,
      page_type: p.page_type,
      ref_id: p.ref_id,
      title: p.title,
      compiled_at: p.compiled_at,
      body_md: p.body_md,
      links: JSON.parse(p.links || '[]'),
      backlinks: getWikiBacklinks(getDb(), p.title)
    }
  })
  ipcMain.handle('wiki:getByTitle', (_e, title: string) => {
    const p = getWikiPageByTitle(getDb(), title)
    if (!p) return null
    return {
      id: p.id,
      page_type: p.page_type,
      ref_id: p.ref_id,
      title: p.title,
      compiled_at: p.compiled_at,
      body_md: p.body_md,
      links: JSON.parse(p.links || '[]'),
      backlinks: getWikiBacklinks(getDb(), p.title)
    }
  })
  ipcMain.handle('wiki:export', async () => {
    const db = getDb()
    compileWiki(db)
    const s = getSettings(db)
    let dir = s.wiki_export_dir?.trim()
    if (!dir) {
      const win = BrowserWindow.getFocusedWindow()
      const { canceled, filePaths } = await dialog.showOpenDialog(win!, {
        properties: ['openDirectory', 'createDirectory'],
        title: '选择群星导出目录（可设为 llm_wiki 的来源监视目录）'
      })
      if (canceled || filePaths.length === 0) return { dir: '', files: 0, failed: [] }
      dir = filePaths[0]
      setSettings(db, { wiki_export_dir: dir })
    }
    return exportWiki(db, dir)
  })
  ipcMain.handle('wiki:setAutoExport', (_e, on: boolean) =>
    setSettings(getDb(), { wiki_auto_export: on ? '1' : '0' })
  )
  ipcMain.handle('wiki:getAutoExport', () => getSettings(getDb()).wiki_auto_export === '1')

  // ---------- 微信读书同步 ----------
  ipcMain.handle('weread:notebooks', async () => {
    const key = wereadKey()
    if (!key) throw new Error('未配置微信读书 API Key（设置 → 微信读书同步）')
    const items = await listNotebooks(key)
    return items.map((n) => ({
      bookId: n.bookId,
      title: n.book?.title ?? '未知书名',
      author: n.book?.author ?? '',
      reviewCount: n.reviewCount ?? 0,
      noteCount: n.noteCount ?? 0,
      bookmarkCount: n.bookmarkCount ?? 0,
      readingProgress: n.readingProgress,
      markedStatus: n.markedStatus,
      sort: n.sort ?? 0
    }))
  })
  ipcMain.handle('weread:syncBook', async (_e, bookId: string, meta?: { progress?: number | null; status?: string | null }) => {
    const key = wereadKey()
    if (!key) throw new Error('未配置微信读书 API Key（设置 → 微信读书同步）')
    const report = await syncBook(getDb(), key, bookId, meta)
    if (getSettings(getDb()).wiki_auto_export === '1') {
      try {
        const db = getDb()
        compileWiki(db)
        const dir = getSettings(db).wiki_export_dir?.trim()
        if (dir) exportWiki(db, dir)
      } catch {
        /* 自动导出失败不阻塞同步 */
      }
    }
    return report
  })

  // ---------- 设置 / AI ----------
  ipcMain.handle('settings:get', () => getSettings(getDb()))
  ipcMain.handle('settings:set', (_e, patch: Record<string, string>) => setSettings(getDb(), patch))
  ipcMain.handle('ai:test', async () => {
    const cfg = aiConfigFromSettings()
    if (!cfg) return { ok: false, error: '未配置完整（需要 base_url / api_key / 模型名）' }
    return testAi(cfg)
  })

  // ---------- 统计 / 系统 ----------
  ipcMain.handle('stats:overview', () => overview(getDb()))
  ipcMain.handle('app:backup', () => backupDatabase())
}
