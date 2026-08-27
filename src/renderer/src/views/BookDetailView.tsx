import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { BookRecord, HighlightRecord, ThoughtRecord } from '@shared/types'
import { colorFor } from './BookshelfView'

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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [reviewDraft, setReviewDraft] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const [b, s] = await Promise.all([window.api.getBook(bookId), window.api.listStars(bookId)])
    setBook(b)
    setStars(s)
  }, [bookId])

  useEffect(() => {
    void load()
  }, [load])

  const chapters = useMemo(() => {
    const map = new Map<string, HighlightRecord[]>()
    for (const s of stars) {
      const key = s.chapter || '未分章'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [stars])

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

  return (
    <div className="relative flex h-full flex-col">
      {/* 顶部 */}
      <header className="border-b border-[var(--line)] px-10 pb-4 pt-6">
        <button className="btn px-2 py-1 text-[12px]" onClick={onBack}>
          ← 书架
        </button>
        <div className="mt-3 flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[21px] font-semibold">
              《{book.title}》
              <span className="ml-3 text-[13px] font-normal text-[var(--text-dim)]">{book.author}</span>
            </h1>
            <div className="mt-1.5 flex items-center gap-3 text-[12px] text-[var(--text-dim)]">
              <span className="flex cursor-pointer items-center" title="评分">
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.span
                    key={n}
                    whileHover={{ scale: 1.35, rotate: n % 2 === 0 ? 8 : -8 }}
                    whileTap={{ scale: 0.85 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    onClick={() => void saveRating(n === book.rating ? 0 : n)}
                    className={`inline-block ${n <= book.rating ? 'star-mark' : 'opacity-30 hover:opacity-70'}`}
                  >
                    ★
                  </motion.span>
                ))}
              </span>
              <span>✦ {stars.length} 颗星</span>
              <span>
                ❝ {stars.reduce((a, s) => a + (s.thoughts?.length ?? 0), 0)} 条想法
              </span>
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
        {/* 镇星之宝 */}
        {gem && (
          <button
            className="serif mt-3 block max-w-[640px] rounded-lg border border-[rgba(251,191,36,0.35)] bg-[rgba(251,191,36,0.06)] px-4 py-2 text-left text-[12.5px] italic leading-7"
            onClick={() => {
              const el = document.getElementById(`star-${gem.id}`)
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          >
            <span className="star-mark mr-1.5 not-italic">★ 镇星之宝</span>
            {gem.content.length > 80 ? gem.content.slice(0, 80) + '…' : gem.content}
          </button>
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
              className="serif text-left text-[12.5px] italic text-[var(--text-dim)] hover:text-[var(--text)]"
              onClick={() => setReviewDraft(book.short_review)}
            >
              {book.short_review ? `❝ ${book.short_review}` : '+ 写一句短评'}
            </button>
          )}
        </div>
      </header>

      {/* 星列表 */}
      <div className="flex-1 overflow-y-auto px-10 py-6">
        {stars.length === 0 && (
          <div className="mt-20 text-center text-[var(--text-dim)]">这本书还没有星星</div>
        )}
        {chapters.map(([chapter, list]) => (
          <section key={chapter} className="mb-7">
            <button
              className="mb-2 flex w-full items-center gap-2 text-left"
              onClick={() => {
                const next = new Set(collapsed)
                if (next.has(chapter)) next.delete(chapter)
                else next.add(chapter)
                setCollapsed(next)
              }}
            >
              <span className="text-[11px] text-[var(--text-dim)]">{collapsed.has(chapter) ? '▸' : '▾'}</span>
              <h2 className="text-[13px] font-medium tracking-wide text-[var(--accent)]">{chapter}</h2>
              <span className="text-[11px] text-[var(--text-dim)]">{list.length}</span>
              <div className="ml-2 h-px flex-1 bg-[var(--line)]" />
            </button>
            {!collapsed.has(chapter) && (
              <div className="space-y-3">
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
            )}
          </section>
        ))}
      </div>

      {/* 合并浮条 */}
      {selected.size > 0 && mergeText === null && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[rgba(217,122,30,0.4)] bg-[#fffdf8] px-5 py-2.5 shadow-xl"
        >
          <span className="text-[13px]">已选 {selected.size} 颗星</span>
          <button className="btn btn-primary py-1" disabled={selected.size < 2} onClick={beginMerge}>
            合并碎片
          </button>
          <button className="btn py-1" onClick={() => setSelected(new Set())}>
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
            className="panel w-[640px] bg-[#fffdf8] p-6"
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
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), type: 'spring', stiffness: 280, damping: 26 }}
      className={`panel group relative p-4 transition-colors ${selected ? 'border-[rgba(217,122,30,0.55)]' : ''}`}
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
                <button className="btn btn-primary py-1" onClick={() => void saveContent()}>
                  保存
                </button>
                <button
                  className="btn py-1"
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
            <div className="serif text-[13.5px] leading-7" onDoubleClick={() => setEditing(true)}>
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
                        className="input min-h-[60px] resize-y text-[12.5px]"
                        autoFocus
                        value={editingThought.content}
                        onChange={(e) => setEditingThought({ ...editingThought, content: e.target.value })}
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          className="btn py-0.5 text-[12px]"
                          onClick={async () => {
                            await window.api.updateThought(t.id, editingThought.content.trim())
                            setEditingThought(null)
                            onChanged()
                          }}
                        >
                          存
                        </button>
                        <button className="btn py-0.5 text-[12px]" onClick={() => setEditingThought(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[12.5px] italic leading-6 text-[var(--text-dim)]">
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
              className="input py-1 text-[12.5px]"
              placeholder="在这颗星上落一笔想法…"
              value={thoughtDraft}
              onChange={(e) => setThoughtDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addThought()}
            />
            <button className="btn py-1 text-[12px]" onClick={() => void addThought()} disabled={!thoughtDraft.trim()}>
              记下
            </button>
          </div>

          {/* 标签 + 元信息 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-dim)]">
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
                className="input w-28 py-0.5 text-[11px]"
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
              <span>{star.created_at.slice(0, 10)}</span>
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
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 0.8, rotate: 20 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
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
