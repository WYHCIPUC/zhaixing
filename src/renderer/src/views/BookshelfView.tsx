import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Plus, RefreshCw, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { BookRecord } from '@shared/types'
import ImportWizard from '../components/ImportWizard'
import SyncDialog from '../components/SyncDialog'
import Hint from '../components/Hint'
import { CAN_HOVER, DUR, EASE_OUT, SPRING_SETTLE, STAGGER } from '../motion'

const BOOK_COLORS = [
  '#ff9a5a', '#d9930d', '#8b5cf6', '#38bdf8',
  '#a483b8', '#c9a227', '#7a9e9f', '#c08552'
]

function colorFor(title: string): string {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return BOOK_COLORS[h % BOOK_COLORS.length]
}

// ---------- 书脊工具 ----------

// 颜色明度 → 竖排书名用白字还是炭字
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return true
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.6
}

// 书脊宽度：保证竖排书名可读的最低宽度，厚书略宽
function spineWidth(hc: number): number {
  return hc >= 60 ? 30 : hc >= 25 ? 26 : 23
}
// 竖排可容纳的字符数
function spineChars(h: number): number {
  return Math.max(3, Math.floor((h - 18) / 14))
}

// 书脊高度：笔记越多/评分越高越厚实
function spineHeight(book: BookRecord): number {
  const hc = book.highlight_count ?? 0
  return Math.round(
    112 + Math.min(54, (book.thought_count ?? 0) * 3 + book.rating * 5 + Math.min(20, hc / 4))
  )
}

type ViewMode = 'shelf' | 'list'

export default function BookshelfView({
  reloadKey,
  onOpenBook,
  onImported
}: {
  reloadKey: number
  onOpenBook: (id: number) => void
  onImported: () => void
}) {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [mode, setMode] = useState<ViewMode>(
    () => (localStorage.getItem('shelf-view') === 'list' ? 'list' : 'shelf')
  )
  const [q, setQ] = useState('')
  const [classifying, setClassifying] = useState(false)
  const [pullingId, setPullingId] = useState<number | null>(null)

  useEffect(() => {
    window.api.listBooks().then(setBooks).catch(() => {})
  }, [reloadKey])

  const switchMode = (m: ViewMode): void => {
    setMode(m)
    localStorage.setItem('shelf-view', m)
  }

  const exportAll = async (): Promise<void> => {
    setExporting(true)
    try {
      const p = await window.api.exportMarkdown('all')
      if (p) toast.success('全部笔记已导出', { description: p })
    } catch (err) {
      toast.error('导出失败', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const classify = async (): Promise<void> => {
    setClassifying(true)
    toast.loading('管理员正在给书架分区…', { id: 'classify' })
    try {
      const r = await window.api.classifyBooks()
      toast.success(`书架已分成 ${r.categories.length} 个分区`, {
        id: 'classify',
        description: r.categories.map((c) => `${c.name} ${c.count}`).join(' · ')
      })
    } catch (err) {
      toast.error('整理失败', {
        id: 'classify',
        description: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setClassifying(false)
    }
  }

  const query = q.trim().toLowerCase()
  const matches = (b: BookRecord): boolean =>
    !query || b.title.toLowerCase().includes(query) || (b.author || '').toLowerCase().includes(query)

  // 分区：书数降序，「未分类」永远排最后；每层放 22 本，放不下自动加层
  const SHELF_ROW = 22
  const shelves = useMemo(() => {
    const map = new Map<string, BookRecord[]>()
    for (const b of books) {
      const key = b.category || '未分类'
      const list = map.get(key) ?? []
      list.push(b)
      map.set(key, list)
    }
    const sorted = [...map.entries()]
      .map(([name, list]) => ({ name, list }))
      .sort((a, b) => {
        if (a.name === '未分类') return 1
        if (b.name === '未分类') return -1
        return b.list.length - a.list.length
      })
    return sorted.map((sec) => {
      const rows: BookRecord[][] = []
      for (let i = 0; i < sec.list.length; i += SHELF_ROW) rows.push(sec.list.slice(i, i + SHELF_ROW))
      return { ...sec, rows }
    })
  }, [books])

  const pull = (id: number): void => {
    if (pullingId !== null) return
    setPullingId(id)
    setTimeout(() => {
      onOpenBook(id)
      setPullingId(null)
    }, 190)
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 md:px-10 md:py-8">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-display">书架</h1>
          <p className="mt-0.5 text-[12px] text-[var(--text-dim)]">
            {books.length > 0
              ? `${books.length} 本书 · ${books.reduce((a, b) => a + (b.highlight_count ?? 0), 0)} 颗星`
              : '把微信读书里划过的线，摘到你的星空中'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {books.length > 0 && (
            <>
              {/* 书架|列表 切换 */}
              <div className="flex rounded-lg border border-[var(--line)] p-0.5">
                {(
                  [
                    ['shelf', '书架'],
                    ['list', '列表']
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className={`rounded-md px-2.5 py-1 text-[12px] tap ${
                      mode === k ? 'bg-[var(--surface-2)] text-[var(--text)]' : 'text-[var(--text-dim)]'
                    }`}
                    onClick={() => switchMode(k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
                <input
                  className="input w-[170px] py-1.5 pl-7"
                  placeholder="找一本书…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <button className="btn btn-sm" disabled={classifying} title="AI 把全部书归入主题分区" onClick={() => void classify()}>
                <Sparkles size={14} /> {classifying ? '整理中…' : '整理书架'}
              </button>
              <button className="btn btn-sm" onClick={exportAll} disabled={exporting}>
                <Download /> {exporting ? '导出中…' : '导出'}
              </button>
            </>
          )}
          <button className="btn btn-sm" onClick={() => setSyncOpen(true)}>
            <RefreshCw /> 微信读书同步
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>
            <Plus /> 导入笔记
          </button>
        </div>
      </header>

      {books.length === 0 ? (
        <div className="mt-28 flex flex-col items-center text-center">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl text-[var(--gold)]"
          >
            <Sparkles size={44} strokeWidth={1.4} />
          </motion.div>
          <div className="mt-5 text-[15px]">还没有星星</div>
          <div className="mt-2 max-w-[420px] text-[12px] leading-6 text-[var(--text-dim)]">
            在微信读书 App 里打开一本书 → 笔记 → 右上角分享/复制，<br />
            把复制出的文本粘贴进导入向导，或者直接用 API 一键同步。
          </div>
          <button className="btn btn-primary mt-6" onClick={() => setWizardOpen(true)}>
            <Plus /> 粘贴我的第一份笔记
          </button>
        </div>
      ) : mode === 'shelf' ? (
        /* ---------- 书架模式：整面书柜，一层一个主题，书名全部可见 ---------- */
        <div className="space-y-10 pb-10">
          {shelves.length === 1 && shelves[0].name === '未分类' && (
            <div className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-4 py-2.5 text-[12px] text-[var(--text-dim)]">
              这面书架还没分区——点右上角「✦ 整理书架」，AI 会按主题把书分到不同层。
            </div>
          )}
          {shelves.map((shelf) =>
            shelf.rows.map((row, ri) => (
              <div key={`${shelf.name}-${ri}`}>
                {ri === 0 ? (
                  <div className="mb-2 flex items-baseline gap-2 px-1">
                    <span className="shelf-plaque text-[12px] font-medium">{shelf.name}</span>
                    <span className="text-[12px] text-[var(--text-dim)]">
                      {shelf.list.length} 本
                      {query && shelf.list.filter(matches).length < shelf.list.length
                        ? ` · 命中 ${shelf.list.filter(matches).length}`
                        : ''}
                    </span>
                  </div>
                ) : (
                  <div className="mb-1.5 px-1 text-[12px] text-[var(--text-dim)] opacity-60">
                    {shelf.name} · 续 {ri + 1}
                  </div>
                )}
                <div className="shelf-row flex items-end gap-[3px] rounded-t-md px-3 pt-5">
                  {row.map((b) => {
                    const hit = matches(b)
                    const w = spineWidth(b.highlight_count ?? 0)
                    const h = spineHeight(b)
                    const dark = isDarkColor(b.color)
                    const pulling = pullingId === b.id
                    const chars = spineChars(h)
                    const title = b.title.length > chars ? b.title.slice(0, chars - 1) + '…' : b.title
                    const spine = (
                      <motion.button
                        initial={{ opacity: 0, y: 14 }}
                        animate={pulling ? { y: -18, scale: 1.05 } : { opacity: 1, y: 0, scale: 1 }}
                        transition={
                          pulling
                            ? { duration: 0.18, ease: EASE_OUT }
                            : { ...SPRING_SETTLE, delay: Math.min(STAGGER * (b.id % 12), 0.3) }
                        }
                        whileHover={CAN_HOVER && hit ? { y: -8 } : undefined}
                        whileTap={hit ? { scale: 0.97 } : undefined}
                        onClick={() => hit && pull(b.id)}
                        className="relative shrink-0 cursor-pointer rounded-t-[3px]"
                        style={{
                          width: w,
                          height: h,
                          opacity: hit ? 1 : 0.25,
                          background: `linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(255,255,255,0.16) 12%, ${b.color} 40%, ${b.color} 80%, rgba(0,0,0,0.30) 100%)`,
                          boxShadow: '0 3px 5px rgba(15, 15, 15, 0.22), inset 0 -3px 5px rgba(0,0,0,0.18)'
                        }}
                      >
                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                          style={{ color: dark ? 'rgba(255,255,255,0.94)' : 'rgba(28,26,22,0.9)' }}
                        >
                          <span
                            className="whitespace-nowrap text-[12px] font-medium"
                            style={{ writingMode: 'vertical-rl', maxHeight: h - 14 }}
                          >
                            {title}
                          </span>
                        </span>
                        {b.gem_highlight_id != null && (
                          <span className="star-mark absolute -top-3.5 left-1/2 -translate-x-1/2 text-[11px]">★</span>
                        )}
                      </motion.button>
                    )
                    return (
                      <Hint
                        key={b.id}
                        label={`《${b.title}》${b.author || ''} · ${b.highlight_count ?? 0} 星`}
                        side="top"
                      >
                        {spine}
                      </Hint>
                    )
                  })}
                </div>
                <div className="shelf-board" />
              </div>
            ))
          )}
        </div>
      ) : (
        /* ---------- 列表模式：卡片网格 ---------- */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {books.filter(matches).map((b, i) => (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...SPRING_SETTLE, delay: Math.min(i * STAGGER, 0.4) }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenBook(b.id)}
              className="panel panel-hover group overflow-hidden p-0 text-left"
            >
              <motion.div
                className="h-[4px] w-full origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: Math.min(i * STAGGER, 0.4) + 0.1, duration: DUR.slow, ease: EASE_OUT }}
                style={{ background: `linear-gradient(90deg, ${b.color}, transparent)` }}
              />
              <div className="p-4">
                <div className="truncate text-[14px] font-medium" title={b.title}>
                  {b.title}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-[var(--text-dim)]">
                  {b.author || '未知作者'}
                </div>
                <div className="mt-3 flex items-center gap-3 text-[12px] text-[var(--text-dim)]">
                  <span className="star-mark">✦ {b.highlight_count}</span>
                  <span>❝ {b.thought_count}</span>
                  <span className="ml-auto">{(b.last_note_at ?? b.created_at).slice(0, 10)}</span>
                </div>
                {b.short_review && (
                  <div className="serif mt-2 line-clamp-2 text-[12px] italic text-[var(--text-dim)]">
                    {b.short_review}
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {wizardOpen && (
        <ImportWizard
          onClose={() => setWizardOpen(false)}
          onDone={(report) => {
            setWizardOpen(false)
            onImported()
            if (report.highlightsAdded > 0) {
              toast.success(`摘到 ${report.highlightsAdded} 颗新星`, {
                description: report.highlightsSkipped > 0 ? `跳过重复 ${report.highlightsSkipped} 条` : undefined
              })
            } else {
              toast.info('没有新增星星', { description: '全部与已有笔记重复' })
            }
          }}
        />
      )}

      {syncOpen && <SyncDialog onClose={() => setSyncOpen(false)} onSynced={onImported} />}
    </div>
  )
}

export { colorFor }
