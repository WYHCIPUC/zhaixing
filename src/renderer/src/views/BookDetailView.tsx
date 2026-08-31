import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import type { BookRecord, HighlightRecord, ThoughtRecord } from '@shared/types'
import { colorFor } from './BookshelfView'
import { CAN_HOVER, DUR, EASE_OUT, SPRING_SETTLE, STAGGER } from '../motion'

type NoteFilter = 'all' | 'fav' | 'thought'

export default function BookDetailView({
  bookId,
  onBack,
  onChanged
}: {
  bookId: number
  onBack: () => void
  onChanged: () => void
}) {
  const [book, setBook] = useState<BookRecord | null>(null)
  const [stars, setStars] = useState<HighlightRecord[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [mergeText, setMergeText] = useState<string | null>(null)
  const [reviewDraft, setReviewDraft] = useState<string | null>(null)
  const [filter, setFilter] = useState<NoteFilter>('all')
  const [expanded, setExpanded] = useState<Set<string> | null>(null) // null = 尚未初始化

  const load = useCallback(async (): Promise<void> => {
    const [b, s] = await Promise.all([window.api.getBook(bookId), window.api.listStars(bookId)])
    setBook(b)
    setStars(s)
  }, [bookId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(
    () =>
      stars.filter((s) =>
        filter === 'fav' ? s.favorite : filter === 'thought' ? (s.thoughts?.length ?? 0) > 0 : true
      ),
    [stars, filter]
  )

  const chapters = useMemo(() => {
    const map = new Map<string, HighlightRecord[]>()
    for (const s of filtered) {
      const key = s.chapter || '未分章'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [filtered])

  const maxChapterCount = useMemo(() => Math.max(1, ...chapters.map(([, l]) => l.length)), [chapters])
  const favCount = useMemo(() => stars.filter((s) => s.favorite).length, [stars])
  const thoughtCount = useMemo(() => stars.filter((s) => (s.thoughts?.length ?? 0) > 0).length, [stars])

  // 章节很少时直接展开；否则默认全部折叠，先看密度概览
  const autoExpanded = useMemo(() => new Set(chapters.length <= 3 ? chapters.map(([c]) => c) : []), [chapters])
  const effectiveExpanded = useMemo(
    () => expanded ?? autoExpanded,
    [expanded, autoExpanded]
  )
  const toggleChapter = (chapter: string): void => {
    const base = expanded ?? autoExpanded
    const next = new Set(base)
    if (next.has(chapter)) next.delete(chapter)
    else next.add(chapter)
    setExpanded(next)
  }
  const allExpanded = chapters.length > 0 && chapters.every(([c]) => effectiveExpanded.has(c))

  const toggleSelect = (id: number): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const beginMerge = (): void => {
    const picked = stars.filter((s) => selected.has(s.id))
    setMergeText(picked.map((s) => s.content).join(''))
  }

  const confirmMerge = async (): Promise<void> => {
    if (!mergeText?.trim()) return
    await window.api.mergeStars([...selected], mergeText.trim())
    setMergeText(null)
    setSelected(new Set())
    await load()
    onChanged()
  }

  const toggleFavorite = async (s: HighlightRecord): Promise<void> => {
    await window.api.updateStar(s.id, { favorite: !s.favorite })
    await load()
  }

  const deleteStar = async (s: HighlightRecord): Promise<void> => {
    if (!confirm('删除这颗星？其想法也会一并删除。')) return
    await window.api.deleteStar(s.id)
    await load()
    onChanged()
  }

  const exportBook = async (): Promise<void> => {
    const p = await window.api.exportMarkdown(bookId)
    if (p) toast.success('已导出 Markdown', { description: p })
  }

  const deleteBook = async (): Promise<void> => {
    if (!book) return
    if (!confirm(`删除《${book.title}》及全部划线？原始导入存档仍会保留。`)) return
    await window.api.deleteBook(bookId)
    toast.success(`已删除《${book.title}》`)
    onChanged()
    onBack()
  }

  const saveRating = async (rating: number): Promise<void> => {
    await window.api.updateBook(bookId, { rating })
    await load()
  }

  const saveReview = async (): Promise<void> => {
    if (reviewDraft === null) return
    await window.api.updateBook(bookId, { short_review: reviewDraft })
    setReviewDraft(null)
    await load()
  }

  const gem = useMemo(
    () => stars.find((s) => s.id === book?.gem_highlight_id) ?? null,
    [stars, book]
  )

  const pickGem = async (): Promise<void> => {
    const n = await window.api.pickGems()
    if (n === 0) toast.error('没能选出镇星之宝', { description: '请先在设置页配置 AI，并确保本书划线 ≥ 3 条' })
    else {
      toast.success('镇星之宝已加冕')
      await load()
    }
  }

  if (!book) {
    return <div className="flex h-full items-center justify-center text-[var(--text-dim)]">加载中…</div>
  }

  const color = book.color && book.color !== '#7dd3fc' ? book.color : colorFor(book.title)
  const thoughtTotal = stars.reduce((a, s) => a + (s.thoughts?.length ?? 0), 0)

  const filterChips: { key: NoteFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: stars.length },
    { key: 'fav', label: '★ 星标', count: favCount },
    { key: 'thought', label: '❝ 有想法', count: thoughtCount }
  ]

  return (
    <div className="relative flex h-full flex-col">
      {/* 顶部 */}
      <header className="border-b border-[var(--line)] px-10 pb-4 pt-6">
        <button className="btn btn-sm px-2" onClick={onBack}>
          ← 书架
        </button>
        <div className="mt-3 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="t-display truncate">
              《{book.title}》
              <span className="ml-3 text-[14px] font-normal text-[var(--text-dim)]">{book.author}</span>
            </h1>
            <div className="mt-1.5 flex items-center gap-3 text-[12px] text-[var(--text-dim)]">
              <span className="flex cursor-pointer items-center" title="评分">
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.span
                    key={n}
                    whileHover={CAN_HOVER ? { scale: 1.15 } : undefined}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
                    onClick={() => void saveRating(n === book.rating ? 0 : n)}
                    className={`inline-block ${n <= book.rating ? 'star-mark' : 'opacity-30 hover:opacity-70'}`}
                  >
                    ★
                  </motion.span>
                ))}
              </span>
              <span>✦ {stars.length} 颗星</span>
              <span>❝ {thoughtTotal} 条想法</span>
              {book.reading_progress !== null && book.reading_progress !== undefined && (
                <span>
                  读到 {Math.round(book.reading_progress)}%{book.read_status === 'finished' ? ' · 已读完' : ''}
                </span>
              )}
              {book.chapter_count ? <span>共 {book.chapter_count} 章</span> : null}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn" disabled={stars.length < 3} title="AI 从本书划线中选出「最你」的一条" onClick={() => void pickGem()}>
              ★ AI 选镇星之宝
            </button>
            <button className="btn" onClick={() => void exportBook()}>
              ⬇ 导出 Markdown
            </button>
            <button className="btn btn-danger" onClick={() => void deleteBook()}>
              删除本书
            </button>
          </div>
        </div>
        {/* 镇星之宝（材质化揭示，稀有时刻 v5 §4.5-4） */}
        {gem && (
          <motion.button
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.delight, ease: EASE_OUT }}
            className="serif mt-3 block max-w-[640px] rounded-lg border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.06)] px-4 py-2 text-left text-[12px] italic leading-7"
            onClick={() => {
              setFilter('all')
              setExpanded((prev) => {
                const base = prev ?? autoExpanded
                const next = new Set(base)
                if (gem.chapter) next.add(gem.chapter)
                return next
              })
              setTimeout(() => {
                const el = document.getElementById(`star-${gem.id}`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }, 80)
            }}
          >
            <span className="star-mark mr-1.5 not-italic">★ 镇星之宝</span>
            {gem.content.length > 80 ? gem.content.slice(0, 80) + '…' : gem.content}
          </motion.button>
        )}
        {/* 短评 */}
        <div className="mt-3">
          {reviewDraft !== null ? (
            <div className="flex gap-2">
              <input
                className="input serif"
                autoFocus
                placeholder="一句话短评…"
                value={reviewDraft}
                onChange={(e) => setReviewDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void saveReview()}
              />
              <button className="btn btn-primary" onClick={() => void saveReview()}>
                存
              </button>
            </div>
          ) : (
            <button
              className="serif text-left text-[12px] italic text-[var(--text-dim)] hover:text-[var(--text)]"
              onClick={() => setReviewDraft(book.short_review)}
            >
              {book.short_review ? `❝ ${book.short_review}` : '+ 写一句短评'}
            </button>
          )}
        </div>
      </header>

      {/* 渐进披露：密度概览 → 展开章节 */}
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-10">
        {stars.length === 0 && (
          <div className="mt-20 text-center text-[var(--text-dim)]">这本书还没有星星</div>
        )}

        {stars.length > 0 && (
          <>
            {/* 过滤 */}
            <div className="mb-4 flex items-center gap-2">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={`rounded-full border px-3 py-1 text-[14px] tap ${
                    filter === c.key
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)]'
                  }`}
                >
                  {c.label} <span className="opacity-70">{c.count}</span>
                </button>
              ))}
              <span className="ml-auto text-[12px] text-[var(--text-dim)]">
                {chapters.length} 个章节 · 点击章节行展开划线
              </span>
              <button
                className="btn btn-sm px-2"
                onClick={() => setExpanded(allExpanded ? new Set() : new Set(chapters.map(([c]) => c)))}
              >
                {allExpanded ? '全部收起' : '全部展开'}
              </button>
            </div>

            {/* 章节密度概览 + 折叠列表（过滤切换时 200ms 交叉淡入，避免瞬移） */}
            <motion.div key={filter} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: DUR.base, ease: EASE_OUT }}>
            {chapters.map(([chapter, list]) => {
              const open = effectiveExpanded.has(chapter)
              return (
                <section key={chapter} className="mb-2">
                  <button
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left tap hover:bg-[var(--surface-2)]"
                    onClick={() => toggleChapter(chapter)}
                  >
                    <span className="w-3 text-[12px] text-[var(--text-dim)]">{open ? '▾' : '▸'}</span>
                    <h2 className="min-w-0 max-w-[340px] truncate text-[14px] font-medium" title={chapter}>
                      {chapter}
                    </h2>
                    <span className="shrink-0 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] text-[var(--accent)]">
                      {list.length}
                    </span>
                    {/* 密度条（scaleX 合成器动画，不动布局） */}
                    <div className="hidden h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)] md:block">
                      <motion.div
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: DUR.slow, ease: EASE_OUT, delay: 0.05 }}
                        className="h-full w-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${color}88, ${color})`,
                          transformOrigin: 'left',
                          width: `${(list.length / maxChapterCount) * 100}%`
                        }}
                      />
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE_OUT } }}
                        transition={{ duration: DUR.base, ease: EASE_OUT }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-3 px-2 pb-4 pt-2">
                          {list.map((s, i) => (
                            <StarCard
                              key={s.id}
                              star={s}
                              color={color}
                              index={i}
                              selected={selected.has(s.id)}
                              onToggleSelect={() => toggleSelect(s.id)}
                              onToggleFavorite={() => void toggleFavorite(s)}
                              onDelete={() => void deleteStar(s)}
                              onChanged={() => {
                                void load()
                                onChanged()
                              }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              )
            })}
            </motion.div>
          </>
        )}
      </div>

      {/* 合并浮条 */}
      {selected.size > 0 && mergeText === null && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: DUR.slow, ease: EASE_OUT }}
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[rgba(221,91,0,0.4)]  px-5 py-2.5 shadow-xl"
        >
          <span className="text-[14px]">已选 {selected.size} 颗星</span>
          <button className="btn btn-sm btn-primary" disabled={selected.size < 2} onClick={beginMerge}>
            合并碎片
          </button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
            取消
          </button>
        </motion.div>
      )}

      {/* 合并对话框 */}
      {mergeText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5b4a33]/30 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING_SETTLE}
            className="panel w-[640px]  p-6"
          >
            <div className="text-[15px] font-medium">合并 {selected.size} 颗星</div>
            <p className="mt-1 text-[12px] text-[var(--text-dim)]">
              已按原顺序拼接，可手工润色合并后的文本；想法会全部保留。
            </p>
            <textarea
              className="input serif mt-4 min-h-[160px] resize-y leading-7"
              value={mergeText}
              onChange={(e) => setMergeText(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setMergeText(null)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={() => void confirmMerge()}>
                确认合并
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}

// ---------- 单颗星卡片 ----------

function StarCard({
  star,
  color,
  index,
  selected,
  onToggleSelect,
  onToggleFavorite,
  onDelete,
  onChanged
}: {
  star: HighlightRecord
  color: string
  index: number
  selected: boolean
  onToggleSelect: () => void
  onToggleFavorite: () => void
  onDelete: () => void
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(star.content)
  const [thoughtDraft, setThoughtDraft] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [editingThought, setEditingThought] = useState<ThoughtRecord | null>(null)

  const saveContent = async (): Promise<void> => {
    const trimmed = content.trim()
    if (trimmed && trimmed !== star.content) {
      await window.api.updateStar(star.id, { content: trimmed })
      onChanged()
    }
    setEditing(false)
  }

  const addThought = async (): Promise<void> => {
    const t = thoughtDraft.trim()
    if (!t) return
    await window.api.addThought(star.id, t)
    setThoughtDraft('')
    onChanged()
  }

  const removeTag = async (name: string): Promise<void> => {
    await window.api.setStarTags(star.id, (star.tags ?? []).filter((t) => t !== name))
    onChanged()
  }

  const addTag = async (): Promise<void> => {
    const name = tagDraft.trim().replace(/^#/, '')
    if (!name) return
    await window.api.setStarTags(star.id, [...(star.tags ?? []), name])
    setTagDraft('')
    setShowTagInput(false)
    onChanged()
  }

  return (
    <motion.div
      layout
      id={`star-${star.id}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING_SETTLE, delay: Math.min(index * STAGGER, 0.32) }}
      className={`panel group relative p-4 transition-colors ${selected ? 'border-[rgba(221,91,0,0.55)]' : ''}`}
    >
      <div
        className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full opacity-50"
        style={{ background: color }}
      />
      <div className="flex items-start gap-3 pl-2">
        <input
          type="checkbox"
          className="mt-1.5 cursor-pointer accent-amber-500"
          checked={selected}
          onChange={onToggleSelect}
          title="选中以便合并"
        />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div>
              <textarea
                className="input serif min-h-[90px] resize-y leading-7"
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="mt-2 flex gap-2">
                <button className="btn btn-sm btn-primary" onClick={() => void saveContent()}>
                  保存
                </button>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setContent(star.content)
                    setEditing(false)
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="serif text-[14px] leading-7" onDoubleClick={() => setEditing(true)}>
              {star.content}
            </div>
          )}

          {/* 想法年轮 */}
          {(star.thoughts?.length ?? 0) > 0 && (
            <div className="mt-3 border-l border-dashed border-[rgba(251,191,36,0.35)] pl-4">
              {star.thoughts!.map((t) => (
                <div key={t.id} className="group/t relative mb-2 last:mb-0">
                  <div className="absolute -left-[21px] top-[9px] h-[7px] w-[7px] rounded-full bg-[rgba(251,191,36,0.7)]" />
                  {editingThought?.id === t.id ? (
                    <div>
                      <textarea
                        className="input min-h-[60px] resize-y text-[12px]"
                        autoFocus
                        value={editingThought.content}
                        onChange={(e) => setEditingThought({ ...editingThought, content: e.target.value })}
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          className="btn btn-sm"
                          onClick={async () => {
                            await window.api.updateThought(t.id, editingThought.content.trim())
                            setEditingThought(null)
                            onChanged()
                          }}
                        >
                          存
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditingThought(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12px] italic leading-6 text-[var(--text-dim)]">
                      <span className="serif">{t.content}</span>
                      <span className="ml-2 not-italic opacity-60">{(t.thought_date || t.created_at).slice(0, 10)}</span>
                      <span className="ml-2 hidden gap-2 not-italic group-hover/t:inline">
                        <button className="hover:text-[var(--accent)]" onClick={() => setEditingThought(t)}>
                          改
                        </button>
                        <button
                          className="hover:text-red-600"
                          onClick={async () => {
                            await window.api.deleteThought(t.id)
                            onChanged()
                          }}
                        >
                          删
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 落一笔 */}
          <div className="mt-2.5 flex gap-2">
            <input
              className="input py-1 text-[12px]"
              placeholder="在这颗星上落一笔想法…"
              value={thoughtDraft}
              onChange={(e) => setThoughtDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addThought()}
            />
            <button className="btn btn-sm" onClick={() => void addThought()} disabled={!thoughtDraft.trim()}>
              记下
            </button>
          </div>

          {/* 标签 + 元信息 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--text-dim)]">
            {(star.tags ?? []).map((t) => (
              <span key={t} className="rounded-full border border-[var(--line)] px-2 py-0.5">
                #{t}
                <button className="ml-1 opacity-50 hover:opacity-100" onClick={() => void removeTag(t)}>
                  ×
                </button>
              </span>
            ))}
            {showTagInput ? (
              <input
                className="input w-28 py-0.5 text-[12px]"
                autoFocus
                placeholder="标签名，回车"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => void addTag()}
                onKeyDown={(e) => e.key === 'Enter' && void addTag()}
              />
            ) : (
              <button className="opacity-60 hover:opacity-100" onClick={() => setShowTagInput(true)}>
                ＃标签
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              <span>{(star.thoughts?.[0]?.thought_date || star.created_at).slice(0, 10)}</span>
              <button className="opacity-0 transition-opacity hover:text-[var(--accent)] group-hover:opacity-100" onClick={() => setEditing(true)}>
                编辑
              </button>
              <button className="opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100" onClick={onDelete}>
                删除
              </button>
            </span>
          </div>
        </div>

        <motion.button
          initial={false}
          animate={star.favorite ? { scale: [1, 1.3, 1], rotate: [0, 10, 0] } : { scale: 1, rotate: 0 }}
          whileTap={{ scale: 0.88 }}
          transition={{ duration: DUR.delight, ease: EASE_OUT }}
          className={`shrink-0 text-[16px] ${star.favorite ? 'star-mark' : 'opacity-25 hover:opacity-70'}`}
          onClick={onToggleFavorite}
          title="星标收藏"
        >
          {star.favorite ? '★' : '☆'}
        </motion.button>
      </div>
    </motion.div>
  )
}
