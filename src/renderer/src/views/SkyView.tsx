import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Image, Link2, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import type { LinkRecord, NebulaRecord, StarMapData, StarMapStar } from '@shared/types'
import { StarfieldEngine } from '../starfield/engine'
import StarDrawer from '../components/StarDrawer'
import LinkReview from '../components/LinkReview'
import NebulaPanel from '../components/NebulaPanel'
import { DUR, EASE_OUT } from '../motion'

// 推窗转场（v5 §0.5-③）：会话内首次进星穹 = 完整开窗 ≈650ms，之后 250ms 短亮起
let windowOpenedThisSession = false

export default function SkyView() {
  const canvasHost = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<StarfieldEngine | null>(null)
  const [data, setData] = useState<StarMapData | null>(null)
  const [hover, setHover] = useState<{ star: StarMapStar; x: number; y: number } | null>(null)
  const [selected, setSelected] = useState<StarMapStar | null>(null)
  const [q, setQ] = useState('')
  const [aiRunning, setAiRunning] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [suggestedCount, setSuggestedCount] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [multiSel, setMultiSel] = useState<number[]>([])
  const [activeNebula, setActiveNebula] = useState<NebulaRecord | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const d = await window.api.getStarMap()
    setData(d)
    engineRef.current?.setData(d)
    const links = await window.api.listLinks('suggested')
    setSuggestedCount(links.length)
  }, [])

  useEffect(() => {
    if (!canvasRef.current || !canvasHost.current) return
    const engine = new StarfieldEngine(canvasRef.current, {
      onHover: (star, x, y) => setHover(star ? { star, x, y } : null),
      onSelect: (star) => setSelected(star),
      onMultiSelect: (ids) => setMultiSel([...ids])
    })
    engineRef.current = engine
    windowOpenedThisSession = true
    void reload()
    return () => engine.destroy()
  }, [reload])

  useEffect(() => {
    engineRef.current?.setSelectMode(selectMode)
    if (!selectMode) setMultiSel([])
  }, [selectMode])

  // 视图内搜索：命中星高亮
  useEffect(() => {
    const query = q.trim().toLowerCase()
    if (!query || !data) {
      engineRef.current?.setHighlight(new Set())
      return
    }
    const ids = new Set(
      data.stars.filter((s) => s.content.toLowerCase().includes(query)).map((s) => s.id)
    )
    engineRef.current?.setHighlight(ids)
  }, [q, data])

  const runAi = async (): Promise<void> => {
    setAiRunning(true)
    setAiMsg('正在点亮你的星空…（embedding → 星云 → 双星 → 对撞 → 镇星之宝，视数据量需几分钟）')
    try {
      const r = await window.api.runAiAnalysis()
      if (r.errors.length > 0 && r.nebulae === 0 && r.embedded === 0) {
        toast.error('AI 分析失败', { description: r.errors[0] })
        setAiMsg(`失败：${r.errors[0]}`)
      } else {
        const desc = `嵌入 ${r.embedded} · 新星云 ${r.nebulae}（${r.nebulaStars} 星）· 双星建议 ${r.twins} · 对撞 ${r.collisions} · 镇星之宝 ${r.gems}`
        toast.success('AI 分析完成', { description: desc + (r.errors.length ? `（另有 ${r.errors.length} 项失败）` : '') })
        setAiMsg(desc + (r.errors.length ? ` · 部分失败 ${r.errors.length} 项` : ''))
      }
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('AI 分析失败', { description: msg })
      setAiMsg(`失败：${msg}`)
    } finally {
      setAiRunning(false)
    }
  }

  const createNebulaFromSelection = async (name: string): Promise<void> => {
    if (multiSel.length === 0 || !name.trim()) return
    const n = await window.api.createNebula(name.trim(), multiSel)
    setSelectMode(false)
    setActiveNebula({ ...n, star_count: multiSel.length, created_at: '' })
    setAiMsg(`已自造星云「${name.trim()}」（${multiSel.length} 颗星）`)
    await reload()
  }

  const openStar = (starId: number): void => {
    const star = data?.stars.find((s) => s.id === starId)
    if (star) {
      setSelected(star)
      engineRef.current?.focusStar(starId)
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      {/* 工具条 */}
      <header className="relative z-20 flex shrink-0 items-center gap-3 whitespace-nowrap border-b border-[var(--line)] px-8 py-3">
        <h1 className="text-[16px] font-semibold">星穹</h1>
        <input
          className="input ml-2 w-[240px] min-w-[160px] py-1.5"
          placeholder="在星空里找一颗星…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {aiMsg && (
            <span className="max-w-[420px] truncate text-[11.5px] text-[var(--text-dim)]" title={aiMsg}>
              {aiMsg}
            </span>
          )}
          <button
            className="btn btn-sm"
            title="把当前星空渲染成高清桌面壁纸"
            onClick={async () => {
              const engine = engineRef.current
              if (!engine) return
              const p = await window.api.saveImage('我的星空壁纸.png', engine.renderWallpaper(2560, 1440))
              if (p) toast.success('壁纸已保存', { description: p })
            }}
          >
            <Image size={14} /> 星空壁纸
          </button>
          <button className="btn btn-sm" onClick={() => setReviewOpen(true)}>
            <Link2 size={14} /> 连线审核
            {suggestedCount > 0 && <span className="star-mark">（{suggestedCount}）</span>}
          </button>
          <button
            className={`btn py-1 ${selectMode ? 'btn-primary' : ''}`}
            onClick={() => setSelectMode(!selectMode)}
          >
            <Wand2 size={14} /> {selectMode ? `圈选中 ${multiSel.length} 颗` : '自造星云'}
          </button>
          <button className="btn btn-sm btn-primary" disabled={aiRunning} onClick={() => void runAi()}>
            ✧ {aiRunning ? 'AI 分析中…' : 'AI 分析'}
          </button>
        </div>
      </header>

      {/* 星云 chips */}
      {data && data.nebulae.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
          className="z-10 flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-8 py-2"
        >
          {data.nebulae.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                  setActiveNebula(n)
              }}
              className="rounded-full border border-[var(--line)] px-3 py-0.5 text-[11.5px] text-[var(--text-dim)] transition-colors hover:border-[rgba(221,91,0,0.5)] hover:text-[var(--text)]"
              title={`${n.summary}\n（${n.source === 'ai' ? 'AI 聚类' : '自造'} · ${n.star_count ?? 0} 颗星）`}
            >
              {n.source === 'ai' ? '☁' : '⭘'} {n.name} <span className="opacity-60">{n.star_count}</span>
            </button>
          ))}
        </motion.div>
      )}

      {/* 星野 —— 窗框恒在，开窗＝亮度升起，不是页面跳转 */}
      <div ref={canvasHost} className="relative min-h-0 flex-1 overflow-hidden m-3 rounded-2xl border border-white/10 shadow-[0_24px_80px_rgba(10,16,40,0.35),inset_0_0_120px_rgba(5,8,20,0.6)]">
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0, filter: 'brightness(0.55)' }}
          animate={{ opacity: 1, filter: 'brightness(1)' }}
          transition={{ duration: windowOpenedThisSession ? 0.25 : 0.65, ease: EASE_OUT }}
        >
          <canvas ref={canvasRef} className="absolute inset-0" />
        </motion.div>

        {data && data.stars.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[15px] text-[#8fa3c8]">星空还是空的</div>
            <div className="mt-2 text-[12px] text-[#8fa3c8] opacity-70">先去书架导入笔记，再回来点亮</div>
          </div>
        )}

        {/* hover 提示 */}
        <AnimatePresence>
          {hover && !selected && (
            <motion.div
              key={hover.star.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.125, ease: EASE_OUT }}
              className="pointer-events-none absolute z-20 max-w-[320px] rounded-lg border border-white/15 bg-[#0e1428f0] px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
              style={{ left: Math.min(hover.x + 14, (canvasHost.current?.clientWidth ?? 800) - 340), top: hover.y + 14 }}
            >
              <div className="serif line-clamp-3 text-[12px] leading-6 text-[#dfe7f5]">{hover.star.content}</div>
              <div className="mt-1 text-[11px] text-[#8fa3c8]">
                《{hover.star.book_title}》{hover.star.chapter ? ` · ${hover.star.chapter}` : ''}
                {hover.star.is_gem ? ' · ★镇星之宝' : ''}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 圈选命名条 */}
        <AnimatePresence>
          {selectMode && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: DUR.fast, ease: EASE_OUT } }}
              transition={{ duration: DUR.base, ease: EASE_OUT }}
              className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[rgba(221,91,0,0.4)]  px-5 py-2.5 shadow-xl"
            >
            <input
              id="nebula-name-input"
              className="input w-[220px] py-1"
              placeholder="给这片星云起名…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createNebulaFromSelection((e.target as HTMLInputElement).value)
              }}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={multiSel.length === 0}
              onClick={() => {
                const input = document.getElementById('nebula-name-input') as HTMLInputElement | null
                void createNebulaFromSelection(input?.value ?? '')
              }}
            >
              生成星云（{multiSel.length}）
            </button>
            <button className="btn btn-sm" onClick={() => setSelectMode(false)}>
              退出圈选
            </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 星卡抽屉 */}
      <AnimatePresence>
        {selected && (
          <StarDrawer
            star={selected}
            nebulae={data?.nebulae ?? []}
            links={data?.links.filter((l) => l.from_highlight === selected.id || l.to_highlight === selected.id) ?? []}
            onClose={() => setSelected(null)}
            onChanged={() => {
              void reload()
            }}
            onJump={openStar}
          />
        )}
      </AnimatePresence>

      {/* 星云详情 */}
      <AnimatePresence>
        {activeNebula && (
          <NebulaPanel
            nebula={activeNebula}
            stars={(data?.stars ?? []).filter((s) => s.nebula_ids.includes(activeNebula.id))}
            onClose={() => {
              setActiveNebula(null)
            }}
            onChanged={() => void reload()}
            onOpenStar={(id) => {
              openStar(id)
              setActiveNebula(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* 连线审核 */}
      {reviewOpen && (
        <LinkReview
          onClose={() => setReviewOpen(false)}
          onChanged={() => {
            void reload()
          }}
          onOpenStar={openStar}
        />
      )}
    </div>
  )
}
