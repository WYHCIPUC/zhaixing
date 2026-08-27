import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CapsuleRecord, MeteorToday } from '@shared/types'
import NightFlight from '../components/NightFlight'

export default function MeteorView() {
  const [meteor, setMeteor] = useState<MeteorToday | null>(null)
  const [revisited, setRevisited] = useState(false)
  const [capsules, setCapsules] = useState<CapsuleRecord[]>([])
  const [flightOpen, setFlightOpen] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    const [m, c] = await Promise.all([window.api.getMeteor(), window.api.listCapsules()])
    setMeteor(m)
    setCapsules(c)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const markRevisited = async (): Promise<void> => {
    if (!meteor) return
    await window.api.markMeteorRevisited(meteor.logId)
    setRevisited(true)
  }

  const pending = capsules.filter((c) => !c.delivered)
  const due = pending.filter((c) => c.deliver_at <= meteor?.date!)

  return (
    <div className="relative h-full overflow-y-auto px-10 py-8">
      {/* 流星划过动画 */}
      <motion.div
        initial={{ x: '-20vw', y: '-10vh', opacity: 0 }}
        animate={{ x: '60vw', y: '30vh', opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2.2, ease: 'easeOut' }}
        className="pointer-events-none absolute right-0 top-0 h-px w-[160px] rotate-[24deg] bg-gradient-to-l from-white via-[rgba(251,191,36,0.8)] to-transparent"
        style={{ boxShadow: '0 0 12px rgba(251,191,36,0.8)' }}
      />

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">
            ☄ 今日流星 <span className="ml-1 text-[13px] font-normal text-[var(--text-dim)]">{meteor?.date}</span>
          </h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">不教你记住，只帮你重逢</p>
        </div>
        <button className="btn" onClick={() => setFlightOpen(true)}>
          ✧ 夜航模式
        </button>
      </header>

      {/* 今日之星 */}
      {meteor?.star ? (
        <motion.div
          key={meteor.star.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel mx-auto max-w-[720px] p-8 text-center"
        >
          {meteor.source === 'capsule' && (
            <div className="mb-4 inline-block rounded-full border border-[rgba(251,191,36,0.4)] bg-[rgba(251,191,36,0.08)] px-3 py-1 text-[11.5px] text-[var(--gold)]">
              ⏳ 一颗时间胶囊如约而至
            </div>
          )}
          {meteor.capsuleMessage && (
            <div className="serif mb-4 text-[13px] italic text-[var(--gold)]">「{meteor.capsuleMessage}」</div>
          )}
          <div className="serif text-[16px] leading-9">{meteor.star.content}</div>
          {(meteor.star.thoughts?.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-[var(--line)] pt-4 text-[12.5px] italic leading-7 text-[var(--text-dim)]">
              {meteor.star.thoughts!.map((t) => (
                <div key={t.id}>❝ {t.content}</div>
              ))}
            </div>
          )}
          <div className="mt-5 text-[12px] text-[var(--text-dim)]">
            《{meteor.star.book_title}》{meteor.star.chapter ? ` · ${meteor.star.chapter}` : ''}
          </div>
          <div className="mt-6">
            {revisited ? (
              <span className="text-[12.5px] text-[var(--text-dim)]">✓ 今日已重逢，星星更亮了一点</span>
            ) : (
              <button className="btn btn-primary" onClick={() => void markRevisited()}>
                ✦ 我与它重逢了
              </button>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="mt-20 text-center text-[var(--text-dim)]">星空还是空的，先去书架导入笔记</div>
      )}

      {/* 时间胶囊 */}
      <section className="mx-auto mt-10 max-w-[720px]">
        <h2 className="text-[14px] font-medium">
          ⏳ 时间胶囊 <span className="ml-2 text-[11.5px] font-normal text-[var(--text-dim)]">在任何一颗星的抽屉里埋下「半年后见」</span>
        </h2>
        <div className="mt-3 space-y-2">
          {capsules.length === 0 && (
            <div className="text-[12px] text-[var(--text-dim)] opacity-60">还没有胶囊。到期的胶囊会化作当日流星。</div>
          )}
          {capsules.slice(0, 10).map((c) => (
            <div key={c.id} className="panel flex items-center gap-3 px-4 py-2.5 text-[12.5px]">
              <span className={c.delivered ? 'text-[var(--text-dim)]' : 'text-[var(--gold)]'}>
                {c.delivered ? '已投递' : due.includes(c) ? '今日到期' : `将于 ${c.deliver_at}`}
              </span>
              <span className="serif min-w-0 flex-1 truncate">{c.content}</span>
              <span className="text-[11px] text-[var(--text-dim)]">《{c.book_title}》</span>
            </div>
          ))}
        </div>
      </section>

      {flightOpen && <NightFlight onClose={() => setFlightOpen(false)} />}
    </div>
  )
}
