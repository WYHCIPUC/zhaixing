import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { marked } from 'marked'
import { toast } from 'sonner'
import { ArrowLeft, BookOpen, Cloud, FileText, GitCompareArrows, RefreshCw, Share2 } from 'lucide-react'
import type { WikiCompileReport, WikiExportReport, WikiPageFull, WikiPageSummary } from '@shared/types'

// [[wikilink]] → 可点击锚点（marked 之前预处理，避免与 md 语法冲突）
function renderMd(body: string): string {
  const html = marked.parse(body, { async: false }) as string
  return html.replace(/\[\[([^\]]+)\]\]/g, (_m, title) => {
    const t = String(title).trim()
    return `<a class="wikilink" data-title="${t.replace(/"/g, '&quot;')}">${t}</a>`
  })
}

const TYPE_META: Record<WikiPageSummary['page_type'], { label: string; icon: typeof BookOpen }> = {
  book: { label: '来源', icon: BookOpen },
  concept: { label: '概念', icon: Cloud },
  comparison: { label: '对比', icon: GitCompareArrows },
  synthesis: { label: '综合', icon: FileText }
}

export default function WikiView({ target }: { target?: { type?: string; refId?: number; title?: string } | null }) {
  const [pages, setPages] = useState<WikiPageSummary[]>([])
  const [current, setCurrent] = useState<WikiPageFull | null>(null)
  const [history, setHistory] = useState<number[]>([])
  const [filter, setFilter] = useState<WikiPageSummary['page_type'] | 'all'>('all')
  const [q, setQ] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [autoExport, setAutoExport] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    setPages(await window.api.wikiList())
  }, [])

  useEffect(() => {
    void reload()
    void window.api.wikiGetAutoExport().then(setAutoExport)
  }, [reload])

  // 从星穹/星卡跳转进来
  useEffect(() => {
    if (!target) return
    void (async () => {
      if (target.title) {
        const p = await window.api.wikiGetByTitle(target.title)
        if (p) {
          setCurrent(p)
          return
        }
      }
      toast.info('该页尚未编译，正在为你编译群星…')
      await doCompile()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const open = useCallback(async (id: number, pushHistory = true): Promise<void> => {
    const p = await window.api.wikiGet(id)
    if (!p) return
    if (pushHistory && current) setHistory((h) => [...h, current.id])
    setCurrent(p)
  }, [current])

  const openByTitle = useCallback(
    async (title: string): Promise<void> => {
      const p = await window.api.wikiGetByTitle(title)
      if (!p) {
        toast.error(`没有找到「${title}」页面`, { description: '可能尚未编译，试试右上角「编译」' })
        return
      }
      if (current) setHistory((h) => [...h, current.id])
      setCurrent(p)
    },
    [current]
  )

  const back = (): void => {
    setHistory((h) => {
      if (h.length === 0) return h
      const prev = h[h.length - 1]
      void window.api.wikiGet(prev).then((p) => p && setCurrent(p))
      return h.slice(0, -1)
    })
  }

  const doCompile = async (): Promise<void> => {
    setCompiling(true)
    try {
      const r: WikiCompileReport = await window.api.wikiCompile()
      toast.success('群星已编译', {
        description: `来源 ${r.books} · 概念 ${r.concepts} · 对比 ${r.comparisons} · 综合 ${r.synthesis}（新编译 ${r.compiled}，跳过 ${r.skipped}）`
      })
      await reload()
    } catch (err) {
      toast.error('编译失败', { description: String(err) })
    } finally {
      setCompiling(false)
    }
  }

  const doExport = async (): Promise<void> => {
    setExporting(true)
    try {
      const r: WikiExportReport = await window.api.wikiExport()
      if (r.dir) {
        toast.success(`已导出 ${r.files} 个页面`, {
          description: r.failed.length ? `${r.dir}（${r.failed.length} 个失败）` : r.dir
        })
      }
    } catch (err) {
      toast.error('导出失败', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  const toggleAuto = async (on: boolean): Promise<void> => {
    setAutoExport(on)
    await window.api.wikiSetAutoExport(on)
    if (on) toast.info('已开启：每次微信读书同步后自动编译并导出到记忆目录')
  }

  const onBodyClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const a = (e.target as HTMLElement).closest('a.wikilink')
    if (a) {
      e.preventDefault()
      void openByTitle((a as HTMLElement).dataset.title ?? '')
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: pages.length }
    for (const p of pages) c[p.page_type] = (c[p.page_type] ?? 0) + 1
    return c
  }, [pages])

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase()
    return pages.filter(
      (p) =>
        (filter === 'all' || p.page_type === filter) &&
        (!query || p.title.toLowerCase().includes(query))
    )
  }, [pages, filter, q])

  const bodyHtml = useMemo(() => (current ? renderMd(current.body_md) : ''), [current])

  return (
    <div className="flex h-full">
      {/* 左：页面目录 */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--line)] bg-[var(--surface-2)]">
        <div className="border-b border-[var(--line)] px-3 py-3">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold">群星</h1>
            <span className="text-[11px] text-[var(--text-dim)]">{pages.length} 页</span>
          </div>
          <input
            className="input mt-2 py-1 text-[12px]"
            placeholder="搜索页面…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {(['all', 'book', 'concept', 'comparison', 'synthesis'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  filter === k
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)]'
                }`}
              >
                {k === 'all' ? `全部 ${counts.all ?? 0}` : `${TYPE_META[k].label} ${counts[k] ?? 0}`}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.map((p) => {
            const Icon = TYPE_META[p.page_type].icon
            return (
              <button
                key={p.id}
                onClick={() => void open(p.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors ${
                  current?.id === p.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-white'
                }`}
              >
                <Icon size={13} className="shrink-0 opacity-60" />
                <span className="truncate" title={p.title}>{p.title}</span>
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-[12px] text-[var(--text-dim)]">
              {pages.length === 0 ? '群星尚未编译——点击右上角「编译」生成知识页面' : '无匹配页面'}
            </div>
          )}
        </div>
      </aside>

      {/* 右：页面内容 */}
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-6 py-3">
          {history.length > 0 && (
            <button className="btn px-2 py-1 text-[12px]" onClick={back} title="返回上一页">
              <ArrowLeft size={13} />
            </button>
          )}
          <div className="flex min-w-0 items-center gap-2">
            {current && (() => {
              const M = TYPE_META[current.page_type]
              return (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-dim)]">
                  <M.icon size={11} /> {M.label}
                </span>
              )
            })()}
            <span className="truncate text-[14px] font-medium">{current?.title ?? '选择左侧页面，或编译群星'}</span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[var(--text-dim)]" title="微信读书同步后自动编译并导出（B 档）">
              <input
                type="checkbox"
                className="accent-amber-500"
                checked={autoExport}
                onChange={(e) => void toggleAuto(e.target.checked)}
              />
              同步后自动导出
            </label>
            <button className="btn py-1" disabled={exporting} onClick={() => void doExport()} title="导出为 llm_wiki / Obsidian 兼容目录">
              <Share2 size={13} /> {exporting ? '导出中…' : '导出'}
            </button>
            <button className="btn btn-primary py-1" disabled={compiling} onClick={() => void doCompile()}>
              <RefreshCw size={13} /> {compiling ? '编译中…' : '编译'}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-10 py-6" onClick={onBodyClick}>
          <AnimatePresence mode="wait">
            {current && (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="wiki-body mx-auto max-w-[760px]"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            )}
          </AnimatePresence>

          {/* 反向链接 */}
          {current && current.backlinks.length > 0 && (
            <div className="mx-auto mt-10 max-w-[760px] border-t border-[var(--line)] pt-4">
              <h3 className="mb-2 text-[12px] tracking-wide text-[var(--text-dim)]">
                反向链接（{current.backlinks.length}）——谁引用了本页
              </h3>
              <div className="flex flex-wrap gap-2">
                {current.backlinks.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => void open(b.id)}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-[12px] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {TYPE_META[b.page_type].icon &&
                      (() => {
                        const I = TYPE_META[b.page_type].icon
                        return <I size={11} className="opacity-60" />
                      })()}
                    {b.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
