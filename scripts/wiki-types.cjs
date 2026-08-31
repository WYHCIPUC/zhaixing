// 群星类型 + IPC + preload 接线
const fs = require('fs')

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  let miss = []
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
    else miss.push(a.slice(0, 50))
  }
  fs.writeFileSync(file, s)
  console.log(file, miss.length ? 'MISS: ' + miss.join(' | ') : 'OK')
}

// 1. shared/types.ts
let t = fs.readFileSync('src/shared/types.ts', 'utf8')
if (!t.includes('WikiPageSummary')) {
  t = t.replace(
    'export interface StarContext {',
    `export interface WikiPageSummary {
  id: number
  page_type: 'book' | 'concept' | 'comparison' | 'synthesis'
  ref_id: number
  title: string
  compiled_at: string
}

export interface WikiPageFull extends WikiPageSummary {
  body_md: string
  links: string[]
  backlinks: { id: number; title: string; page_type: WikiPageSummary['page_type'] }[]
}

export interface WikiCompileReport {
  books: number
  concepts: number
  comparisons: number
  synthesis: number
  compiled: number
  skipped: number
}

export interface WikiExportReport {
  dir: string
  files: number
  failed: string[]
}

export interface StarContext {`
  )
}
if (!t.includes('wikiCompile')) {
  t = t.replace(
    '  getMeteor(): Promise<MeteorToday>',
    `  // 群星（wiki）
  wikiCompile(): Promise<WikiCompileReport>
  wikiList(): Promise<WikiPageSummary[]>
  wikiGet(id: number): Promise<WikiPageFull | null>
  wikiGetByTitle(title: string): Promise<WikiPageFull | null>
  wikiExport(): Promise<WikiExportReport>
  wikiSetAutoExport(on: boolean): Promise<void>
  wikiGetAutoExport(): Promise<boolean>

  getMeteor(): Promise<MeteorToday>`
  )
}
fs.writeFileSync('src/shared/types.ts', t)
console.log('types.ts:', t.includes('wikiCompile') && t.includes('WikiPageFull'))

// 2. ipc.ts：处理器 + 同步后自动导出钩子
patch('src/main/ipc.ts', [
  [
    "import { listNotebooks, syncBook, wereadKey } from './sync/weread'",
    "import { listNotebooks, syncBook, wereadKey } from './sync/weread'\nimport { compileWiki, getWikiBacklinks, getWikiPage, getWikiPageByTitle, listWikiPages } from './wiki/compiler'\nimport { exportWiki } from './wiki/exporter'"
  ],
  [
    "  // ---------- 微信读书同步 ----------",
    `  // ---------- 群星（wiki） ----------
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

  // ---------- 微信读书同步 ----------`
  ],
  // 同步成功后：自动编译+导出（设置开启时）
  [
    "    return syncBook(getDb(), key, bookId, meta)\n  })",
    `    const report = await syncBook(getDb(), key, bookId, meta)
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
  })`
  ]
])

// 3. preload
patch('src/preload/index.ts', [
  [
    "  getMeteor: () => ipcRenderer.invoke('meteor:today'),",
    `  wikiCompile: () => ipcRenderer.invoke('wiki:compile'),
  wikiList: () => ipcRenderer.invoke('wiki:list'),
  wikiGet: (id: number) => ipcRenderer.invoke('wiki:get', id),
  wikiGetByTitle: (title: string) => ipcRenderer.invoke('wiki:getByTitle', title),
  wikiExport: () => ipcRenderer.invoke('wiki:export'),
  wikiSetAutoExport: (on: boolean) => ipcRenderer.invoke('wiki:setAutoExport', on),
  wikiGetAutoExport: () => ipcRenderer.invoke('wiki:getAutoExport'),

  getMeteor: () => ipcRenderer.invoke('meteor:today'),`
  ]
])
