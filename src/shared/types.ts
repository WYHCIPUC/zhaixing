// 摘星实录 — 共享类型与 IPC 契约
// 本文件是渲染层与主进程的唯一契约面 [public]，破坏性变更需迁移

// ---------- 领域记录 ----------

export interface BookRecord {
  id: number
  title: string
  author: string
  color: string
  rating: number // 0-5，0=未评
  status: 'reading' | 'finished' | 'wishlist'
  short_review: string
  category: string // 书架 AI 主题分区（v3）
  gem_highlight_id: number | null // 镇星之宝
  chapter_count?: number | null
  reading_progress?: number | null
  read_status?: string | null
  created_at: string
  updated_at: string
  highlight_count?: number
  thought_count?: number
  last_note_at?: string | null
}

export interface ThoughtRecord {
  id: number
  highlight_id: number
  content: string
  source: 'user' | 'ai'
  thought_date?: string | null // 微信读书同步的真实想法时间
  created_at: string
}

export interface HighlightRecord {
  id: number
  book_id: number
  book_title?: string
  chapter: string
  chapter_order: number
  content: string
  favorite: boolean
  ai_tags: string[]
  revisit_count: number
  last_revisit_at: string | null
  created_at: string
  thoughts?: ThoughtRecord[]
  tags?: string[]
}

// ---------- 导入 ----------

export interface ParsedThought {
  content: string
  date?: string | null
}

export interface ParsedHighlight {
  content: string
  chapter: string
  thoughts: ParsedThought[]
}

export interface ParsedBook {
  title: string
  author: string
  chapters: string[]
  highlights: ParsedHighlight[]
  short_review?: string // 来自「点评 / ◆ 日期 认为好看」块
}

export interface ParseResult {
  books: ParsedBook[]
  warnings: string[]
  lineCount: number
}

export interface ImportReport {
  booksAdded: number
  highlightsAdded: number
  highlightsSkipped: number
  thoughtsAdded: number
  bookIds: number[]
  archiveId: number
}

export interface ArchiveRecord {
  id: number
  source: string
  stats: string
  created_at: string
  preview: string
}

// ---------- 检索 ----------

export interface SearchHit {
  highlight_id: number
  book_id: number
  book_title: string
  chapter: string
  content: string
  snippet: string
}

// ---------- 统计 ----------

export interface OverviewStats {
  bookCount: number
  highlightCount: number
  thoughtCount: number
  tagCount: number
  archiveCount: number
  readingCount: number // 在读
  finishedCount: number // 已读完
  weeklyStars: number // 近 7 天新增划线
}

// ---------- AI ----------

export interface AiTestResult {
  ok: boolean
  error?: string
  model?: string
}

// ---------- 星穹图谱 ----------

export interface NebulaRecord {
  id: number
  name: string
  summary: string
  source: 'ai' | 'user'
  color: string | null
  star_count?: number
  created_at: string
}

export interface LinkRecord {
  id: number
  from_highlight: number
  to_highlight: number
  kind: 'twin' | 'collision' | 'manual'
  status: 'suggested' | 'confirmed' | 'dismissed'
  note: string
  sim: number | null
  created_at: string
  // join 出的展示字段
  from_content?: string
  to_content?: string
  from_book?: string
  to_book?: string
  from_chapter?: string
  to_chapter?: string
}

export interface StarMapStar extends HighlightRecord {
  book_title: string
  book_color: string
  nebula_ids: number[]
  is_gem?: boolean
}

export interface StarMapData {
  stars: StarMapStar[]
  nebulae: NebulaRecord[]
  links: LinkRecord[]
}

export interface AiRunReport {
  embedded: number
  nebulae: number
  nebulaStars: number
  twins: number
  collisions: number
  gems: number
  errors: string[]
}

// ---------- 重逢（流星 / 胶囊 / 夜航） ----------

export interface MeteorToday {
  logId: number
  date: string
  source: 'random' | 'capsule'
  capsuleMessage: string | null
  star: (HighlightRecord & { book_title: string }) | null
}

export interface CapsuleRecord {
  id: number
  highlight_id: number
  deliver_at: string
  message: string
  delivered: number
  created_at: string
  content?: string
  book_title?: string
}

// ---------- 织星成文 ----------

export interface ArticleRecord {
  id: number
  nebula_id: number | null
  nebula_name?: string | null
  title: string
  content_md: string
  history: string
  version: number
  status: string
  created_at: string
  updated_at: string
}

export type RewriteStyle = 'tweet' | 'card' | 'speech' | 'review'

export interface AskSkyResult {
  answer: string
  cites: { id: number; content: string; book: string; chapter: string }[]
}

// ---------- 星光节（统计与分享） ----------

export interface DailyCount {
  date: string
  count: number
}

export interface SpiritSpectrum {
  type_name: string
  type_desc: string
  spectrum: { name: string; score: number }[]
  generated_at: string
}

// ---------- 微信读书 API 同步 ----------

export interface WereadNotebook {
  bookId: string
  title: string
  author: string
  reviewCount: number
  noteCount: number
  bookmarkCount: number
  readingProgress?: number
  markedStatus?: number
  sort: number
}

export interface WikiPageSummary {
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

export interface StarContext {
  chapter_index: number
  chapter_total: number | null
  progress: number | null
  read_status: string | null
  siblings: { id: number; chapter: string; content: string; created_at: string }[]
  peers: { id: number; content: string; created_at: string }[]
}

export interface WereadSyncReport {
  bookTitle: string
  highlightsAdded: number
  highlightsSkipped: number
  thoughtsAdded: number
  thoughtsSkipped: number
  ratingSet: boolean
}

// ---------- IPC API（window.api） ----------

export interface StarPatch {
  content?: string
  chapter?: string
  favorite?: boolean
}

export interface BookPatch {
  category?: string
  title?: string
  author?: string
  color?: string
  rating?: number
  status?: BookRecord['status']
  short_review?: string
  gem_highlight_id?: number | null
}

export interface ZhaixingApi {
  // 导入
  parseWereadText(text: string): Promise<ParseResult>
  confirmImport(text: string): Promise<ImportReport>
  listArchives(): Promise<ArchiveRecord[]>

  // 书
  listBooks(): Promise<BookRecord[]>
  getBook(id: number): Promise<BookRecord | null>
  updateBook(id: number, patch: BookPatch): Promise<void>
  deleteBook(id: number): Promise<void>
  mergeBooks(fromId: number, toId: number): Promise<{ moved: number; deduped: number; thoughtsAttached: number }>

  // 星（划线）
  listStars(bookId: number): Promise<HighlightRecord[]>
  getStar(id: number): Promise<HighlightRecord | null>
  starContext(id: number): Promise<StarContext>
  updateStar(id: number, patch: StarPatch): Promise<void>
  deleteStar(id: number): Promise<void>
  mergeStars(ids: number[], content: string): Promise<number>
  addThought(starId: number, content: string): Promise<ThoughtRecord>
  updateThought(id: number, content: string): Promise<void>
  deleteThought(id: number): Promise<void>
  setStarTags(starId: number, tags: string[]): Promise<void>

  // 检索
  search(q: string): Promise<SearchHit[]>

  // 星穹图谱
  getStarMap(): Promise<StarMapData>
  createNebula(name: string, starIds: number[], summary?: string): Promise<NebulaRecord>
  addStarsToNebula(nebulaId: number, starIds: number[]): Promise<void>
  removeStarFromNebula(nebulaId: number, starId: number): Promise<void>
  updateNebula(id: number, patch: { name?: string; summary?: string; color?: string | null }): Promise<void>
  deleteNebula(id: number): Promise<void>
  listLinks(status: 'suggested' | 'confirmed'): Promise<LinkRecord[]>
  decideLink(id: number, status: 'confirmed' | 'dismissed'): Promise<void>
  createLink(fromId: number, toId: number, note: string): Promise<void>
  deleteLink(id: number): Promise<void>
  runAiAnalysis(): Promise<AiRunReport>
  classifyBooks(): Promise<{ categories: { name: string; count: number }[] }>
  pickGems(): Promise<number>
  bumpRevisit(starId: number): Promise<void>
  topRevisited(limit: number): Promise<HighlightRecord[]>

  // 重逢
  // 群星（wiki）
  wikiCompile(): Promise<WikiCompileReport>
  wikiList(): Promise<WikiPageSummary[]>
  wikiGet(id: number): Promise<WikiPageFull | null>
  wikiGetByTitle(title: string): Promise<WikiPageFull | null>
  wikiExport(): Promise<WikiExportReport>
  wikiSetAutoExport(on: boolean): Promise<void>
  wikiGetAutoExport(): Promise<boolean>

  getMeteor(): Promise<MeteorToday>
  markMeteorRevisited(logId: number): Promise<void>
  createCapsule(starId: number, deliverAt: string, message: string): Promise<void>
  listCapsules(): Promise<CapsuleRecord[]>
  nightFlightStars(limit: number): Promise<(HighlightRecord & { book_title: string })[]>

  // 织星
  listArticles(nebulaId?: number): Promise<ArticleRecord[]>
  draftNebulaArticle(nebulaId: number): Promise<ArticleRecord>
  saveArticle(id: number, contentMd: string): Promise<ArticleRecord | null>
  updateArticleTitle(id: number, title: string): Promise<void>
  deleteArticle(id: number): Promise<void>
  rewriteQuote(starId: number, style: RewriteStyle): Promise<string>
  socraticAsk(starId: number, thought: string): Promise<string>
  askSky(question: string): Promise<AskSkyResult>

  // 星光节
  dailyCounts(): Promise<DailyCount[]>
  spiritSpectrum(refresh: boolean): Promise<SpiritSpectrum>
  saveImage(defaultName: string, dataUrl: string): Promise<string>

  // 微信读书同步
  wereadNotebooks(): Promise<WereadNotebook[]>
  wereadSyncBook(bookId: string, meta?: { progress?: number | null; status?: string | null }): Promise<WereadSyncReport>

  // 导出
  exportMarkdown(bookId: number | 'all'): Promise<string>

  // 设置与 AI
  getSettings(): Promise<Record<string, string>>
  setSettings(patch: Record<string, string>): Promise<void>
  testAi(): Promise<AiTestResult>

  // 统计与系统
  overview(): Promise<OverviewStats>
  backupNow(): Promise<string>
}
