import { useEffect, useState } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { toast } from 'sonner'
import type { LinkRecord, NebulaRecord, SearchHit, StarContext, StarMapStar } from '@shared/types'
import { makeQuoteCard } from '../share/card'
import { DUR, EASE_DRAWER, EASE_OUT, flickShouldDismiss } from '../motion'

const KIND_META: Record<string, { label: string; icon: string }> = {
  twin: { label: '双星', icon: '✧' },
  collision: { label: '观点对撞', icon: '⚡' },
  manual: { label: '手连', icon: '⭘' }
}

export default function StarDrawer({
  star,
  nebulae,
  links,
  onClose,
  onChanged,
  onJump,
  onFocusSystem,
  onOpenWiki
}: {
  star: StarMapStar
  nebulae: NebulaRecord[]
  links: LinkRecord[]
  onClose: () => void
  onChanged: () => void
  onJump: (starId: number) => void
  onFocusSystem?: () => void
  onOpenWiki?: (t: { title?: string; type?: string; refId?: number }) => void
}) {
  const [tagInput, setTagInput] = useState('')
  const [capsuleDate, setCapsuleDate] = useState('')
  const [capsuleMsg, setCapsuleMsg] = useState('')
  const [socratic, setSocratic] = useState('')
  const [thoughtDraft, setThoughtDraft] = useState('')
  const [rewriteBusy, setRewriteBusy] = useState<string | null>(null)
  const [rewriteText, setRewriteText] = useState('')
  const [cardUrl, setCardUrl] = useState('')
  const [ctx, setCtx] = useState<StarContext | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [linkNote, setLinkNote] = useState('')
  const [linkSearch, setLinkSearch] = useState<SearchHit[] | null>(null)
  const dragControls = useDragControls()

  useEffect(() => {
    setCtx(null)
    window.api.starContext(star.id).then(setCtx).catch(() => {})
  }, [star.id])

  const other = (l: LinkRecord): { id: number; content: string; book?: string } =>
    l.from_highlight === star.id
      ? { id: l.to_highlight, content: l.to_content ?? '', book: l.to_book }
      : { id: l.from_highlight, content: l.from_content ?? '', book: l.from_book }

  const searchLinkTarget = async (): Promise<void> => {
    const q = linkTarget.trim()
    if (!q) return
    const hits = await window.api.search(q)
    setLinkSearch(hits.filter((h) => h.highlight_id !== star.id).slice(0, 6))
  }

  const doLink = async (targetId: number): Promise<void> => {
    await window.api.createLink(star.id, targetId, linkNote.trim())
    setLinkTarget('')
    setLinkNote('')
    setLinkSearch(null)
    onChanged()
  }

  const joinNebula = async (nebulaId: number): Promise<void> => {
    await window.api.addStarsToNebula(nebulaId, [star.id])
    onChanged()
  }

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%', transition: { duration: DUR.base, ease: EASE_DRAWER } }}
      transition={{ duration: DUR.slow, ease: EASE_DRAWER }}
      drag="x"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.12}
      onDragEnd={(_, info) => {
        if (info.offset.x > 0 && flickShouldDismiss(info.offset.x, info.velocity.x)) onClose()
      }}
      className="absolute right-0 top-0 z-[60] flex h-full w-full flex-col overflow-hidden border-l border-[var(--line)] bg-white shadow-[-24px_0_64px_rgba(20,30,60,0.18)]  md:w-[400px] md:max-w-[45vw]"
    >
      <header
        className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => dragControls.start(e)}
      >
        <div className="text-[14px] text-[var(--text-dim)]">
          《{star.book_title}》{star.chapter ? ` · ${star.chapter}` : ''}
        </div>
        <button className="btn btn-sm px-2" onClick={onClose}>
          ✕
        </button>
      </header>

      {/* 星卡主体：切换星级时 150ms 内容淡入，替换瞬移（v5 §5-5） */}
      <motion.div
        key={star.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15, ease: EASE_OUT }}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        <div className="serif text-[14px] leading-8">{star.content}</div>

        <div className="mt-3 flex items-center gap-3 text-[12px] text-[var(--text-dim)]">
          <button
            className={`tap text-[15px] ${star.favorite ? 'star-mark' : 'opacity-40 hover:opacity-80'}`}
            onClick={async () => {
              await window.api.updateStar(star.id, { favorite: !star.favorite })
              onChanged()
            }}
          >
            {star.favorite ? '★' : '☆'}
          </button>
          {star.is_gem && <span className="star-mark">★ 镇星之宝</span>}
          {onOpenWiki && (
          <button
            className="btn px-2 py-0.5 text-[11.5px]"
            title="在群星（知识库）中查看本书页面"
            onClick={() => onOpenWiki({ type: 'book', refId: star.book_id })}
          >
            群星 ↗
          </button>
        )}
        {onFocusSystem && (
            <button
              className="tap rounded border border-[var(--line)] px-1.5 text-[12px] text-[var(--text-dim)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
              onClick={onFocusSystem}
            >
              ☀ 前往恒星系
            </button>
          )}
          <span>重访 {star.revisit_count}</span>
          <span>{star.created_at.slice(0, 10)}</span>
        </div>

        {/* 语境：回忆当时的阅读现场 */}
        {ctx && (
          <div className="mt-4 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5">
            <div className="mb-1.5 text-[12px] tracking-wide text-[var(--text-dim)]">当时的语境</div>
            <div className="text-[12px] leading-6">
              {star.chapter && <span className="text-[var(--text)]">{star.chapter}</span>}
              {ctx.chapter_total ? (
                <span className="text-[var(--text-dim)]"> · 第 {ctx.chapter_index + 1}/{ctx.chapter_total} 章</span>
              ) : null}
            </div>
            {ctx.progress !== null && ctx.progress !== undefined && (
              <div className="mt-1 text-[12px] text-[var(--text-dim)]">
                当时读到 <span className="font-medium text-[var(--text)]">{Math.round(ctx.progress)}%</span>
                {ctx.read_status === 'finished' ? ' · 已读完' : ctx.read_status === 'reading' ? ' · 在读' : ''}
              </div>
            )}
            {ctx.siblings.length > 0 && (
              <div className="mt-2.5">
                <div className="text-[12px] text-[var(--text-dim)]">同章你还摘了 {ctx.siblings.length} 条</div>
                {ctx.siblings.slice(0, 3).map((sib) => (
                  <div key={sib.id} className="mt-1 line-clamp-1 text-[12px] text-[var(--text-secondary,5d5b54)] opacity-80">
                    · {sib.content}
                  </div>
                ))}
              </div>
            )}
            {ctx.peers.length > 0 && (
              <div className="mt-1.5 text-[12px] text-[var(--text-dim)]">前后一周内你还拾了 {ctx.peers.length} 颗星</div>
            )}
          </div>
        )}

        {/* 年轮想法 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">
          年轮（{star.thoughts?.length ?? 0}）
        </h3>
        <div className="mt-2 space-y-2 border-l border-dashed border-[rgba(251,191,36,0.35)] pl-4">
          {(star.thoughts ?? []).map((t) => (
              <div key={t.id} className="text-[12px] italic leading-6 text-[var(--text-dim)]">
                <span className="serif">{t.content}</span>
                <span className="ml-2 not-italic opacity-60">{(t.thought_date || t.created_at).slice(0, 10)}</span>
              </div>
          ))}
          {(star.thoughts?.length ?? 0) === 0 && <div className="text-[12px] opacity-50">还没有想法</div>}
        </div>
        <input
          className="input mt-2 py-1 text-[12px]"
          placeholder="在这颗星上落一笔…"
          value={thoughtDraft}
          onChange={(e) => setThoughtDraft(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && thoughtDraft.trim()) {
              await window.api.addThought(star.id, thoughtDraft.trim())
              const s = await window.api.getSettings()
              if (s.socratic_enabled === '1') {
                try {
                  setSocratic(await window.api.socraticAsk(star.id, thoughtDraft.trim()))
                } catch {
                  setSocratic('')
                }
              }
              setThoughtDraft('')
              onChanged()
            }
          }}
        />
        {socratic && (
          <div className="mt-2 rounded-lg border border-[rgba(221,91,0,0.35)] bg-[rgba(221,91,0,0.08)] px-3 py-2 text-[12px] italic text-[var(--accent)]">
            苏格拉底问：{socratic}
            <button className="tap ml-2 not-italic opacity-60 hover:opacity-100" onClick={() => setSocratic('')}>
              ×
            </button>
          </div>
        )}

        {/* 金句重写器 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">金句重写器</h3>        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              ['tweet', '推文体'],
              ['card', '卡片文案'],
              ['speech', '演讲引用'],
              ['review', '书评开头']
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className="btn btn-sm"
              disabled={rewriteBusy !== null}
              onClick={async () => {
                setRewriteBusy(k)
                setRewriteText('')
                try {
                  setRewriteText(await window.api.rewriteQuote(star.id, k))
                } catch (err) {
                  setRewriteText(`（失败：${err instanceof Error ? err.message : String(err)}）`)
                } finally {
                  setRewriteBusy(null)
                }
              }}
            >
              {rewriteBusy === k ? '…' : label}
            </button>
          ))}
        </div>
        {rewriteText && (
          <div className="mt-2 rounded-lg border border-[var(--line)] bg-[#f6f5f4] px-3 py-2 text-[12px] leading-6">
            <span className="serif">{rewriteText}</span>
            <button
              className="ml-2 text-[12px] text-[var(--accent)]"
              onClick={() => {
                void navigator.clipboard.writeText(rewriteText)
                toast.success('已复制到剪贴板')
              }}
            >
              复制
            </button>
          </div>
        )}

        {/* 金句卡片 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">金句分享卡片</h3>
        <button
          className="btn btn-sm mt-2"
          onClick={() => setCardUrl(makeQuoteCard(star))}
        >
          ✦ 生成分享卡片
        </button>
        {cardUrl && (
          <div className="mt-2 rounded-lg border border-[var(--line)] p-2">
            <img src={cardUrl} alt="金句卡片" className="w-full rounded-md" />
            <div className="mt-2 flex gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={async () => {
                  const p = await window.api.saveImage(`摘星 · ${star.book_title ?? ''}.png`, cardUrl)
                  if (p) toast.success('卡片已保存', { description: p })
                }}
              >
                ⬇ 保存 PNG
              </button>
              <button className="btn btn-sm" onClick={() => setCardUrl('')}>
                收起
              </button>
            </div>
          </div>
        )}

        {/* 星云归属 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">所属星云</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {nebulae
            .filter((n) => star.nebula_ids.includes(n.id))
            .map((n) => (
              <span key={n.id} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[12px]">
                {n.source === 'ai' ? '☁' : '⭘'} {n.name}
              </span>
            ))}
          <select
            className="rounded-full border border-[var(--line)] bg-transparent px-2 py-0.5 text-[12px] text-[var(--text-dim)]"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value)
              if (id) void joinNebula(id)
            }}
          >
            <option value="">＋加入星云…</option>
            {nebulae
              .filter((n) => !star.nebula_ids.includes(n.id))
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
          </select>
        </div>

        {/* 相关星（已确认连线） */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">
          相关星（{links.filter((l) => l.status === 'confirmed').length}）
        </h3>
        <div className="mt-2 space-y-2">
          {links
            .filter((l) => l.status === 'confirmed')
            .map((l) => {
              const o = other(l)
              const meta = KIND_META[l.kind]
              return (
                <button
                  key={l.id}
                  className="block w-full rounded-lg border border-[var(--line)] px-3 py-2 text-left tap hover:border-[rgba(221,91,0,0.4)]"
                  onClick={() => onJump(o.id)}
                >
                  <div className="text-[12px] text-[var(--accent)]">
                    {meta.icon} {meta.label}
                    {l.kind === 'collision' && l.note ? ` · ${l.note}` : ''}
                  </div>
                  <div className="serif mt-0.5 line-clamp-2 text-[12px] leading-6">{o.content}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--text-dim)]">《{o.book}》</div>
                </button>
              )
            })}
          {links.filter((l) => l.status === 'confirmed').length === 0 && (
            <div className="text-[12px] opacity-50">还没有确认的连线</div>
          )}
        </div>

        {/* 手动连线 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">连线到另一颗星</h3>
        <div className="mt-2 flex gap-2">
          <input
            className="input py-1 text-[12px]"
            placeholder="搜索另一条划线…"
            value={linkTarget}
            onChange={(e) => setLinkTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void searchLinkTarget()}
          />
          <button className="btn btn-sm" onClick={() => void searchLinkTarget()}>
            搜
          </button>
        </div>
        <input
          className="input mt-2 py-1 text-[12px]"
          placeholder="为什么连？（可留空）"
          value={linkNote}
          onChange={(e) => setLinkNote(e.target.value)}
        />
        {linkSearch && (
          <div className="mt-2 space-y-1.5">
            {linkSearch.map((h) => (
              <button
                key={h.highlight_id}
                className="block w-full rounded-lg border border-[var(--line)] px-3 py-1.5 text-left text-[12px] hover:border-[rgba(221,91,0,0.4)]"
                onClick={() => void doLink(h.highlight_id)}
              >
                <span className="serif line-clamp-1">{h.snippet}</span>
                <span className="text-[12px] text-[var(--text-dim)]">《{h.book_title}》· 点击连线</span>
              </button>
            ))}
            {linkSearch.length === 0 && <div className="text-[12px] opacity-50">没有匹配的星</div>}
          </div>
        )}

        {/* 标签 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">标签</h3>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(star.tags ?? []).map((t) => (
            <span key={t} className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[12px]">
              #{t}
            </span>
          ))}
          <input
            className="input w-24 py-0.5 text-[12px]"
            placeholder="＋标签"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                const name = tagInput.trim().replace(/^#/, '')
                if (!name) return
                await window.api.setStarTags(star.id, [...(star.tags ?? []), name])
                setTagInput('')
                onChanged()
              }
            }}
          />
        </div>

        {/* 时间胶囊 */}
        <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">⏳ 时间胶囊</h3>
        <div className="mt-2 flex gap-2">
          <input
            type="date"
            className="input w-[150px] py-1 text-[12px]"
            value={capsuleDate}
            onChange={(e) => setCapsuleDate(e.target.value)}
          />
          <input
            className="input flex-1 py-1 text-[12px]"
            placeholder="给未来的自己带句话（可空）"
            value={capsuleMsg}
            onChange={(e) => setCapsuleMsg(e.target.value)}
          />
        </div>
        <button
          className="btn btn-sm mt-2"
          disabled={!capsuleDate}
          onClick={async () => {
            await window.api.createCapsule(star.id, capsuleDate, capsuleMsg.trim())
            setCapsuleDate('')
            setCapsuleMsg('')
            onChanged()
          }}
        >
          埋下胶囊，到期随流星而来
        </button>
      </motion.div>
    </motion.div>
  )
}
