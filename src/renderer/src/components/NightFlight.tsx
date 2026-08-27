import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HighlightRecord } from '@shared/types'

// 夜航模式：全屏沉浸，方向键在星间漫游，无打卡无压力
export default function NightFlight({ onClose }: { onClose: () => void }) {
  const [stars, setStars] = useState<(HighlightRecord & { book_title: string })[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    window.api
      .nightFlightStars(60)
      .then((s) => {
        setStars(s)
        setIdx(Math.floor(Math.random() * Math.max(1, s.length)))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ')
        setIdx((i) => (stars.length ? (i + 1) % stars.length : 0))
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setIdx((i) => (stars.length ? (i - 1 + stars.length) % stars.length : 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stars.length, onClose])

  const star = stars[idx]

  const revisit = async (): Promise<void> => {
    if (!star) return
    await window.api.bumpRevisit(star.id)
    setIdx((i) => (stars.length ? (i + 1) % stars.length : 0))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#04060d]"
    >
      {/* 背景微星 */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        {Array.from({ length: 40 }).map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white twinkle"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 100}%`,
              width: 2,
              height: 2,
              animationDelay: `${(i % 7) * 0.4}s`
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {star ? (
          <motion.div
            key={star.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
            className="max-w-[760px] px-12 text-center"
          >
            <div className="serif text-[19px] leading-[2.2]">{star.content}</div>
            {(star.thoughts?.length ?? 0) > 0 && (
              <div className="mt-6 text-[13px] italic leading-8 text-[var(--text-dim)]">
                {star.thoughts!.map((t) => (
                  <div key={t.id}>❝ {t.content}</div>
                ))}
              </div>
            )}
            <div className="mt-8 text-[12px] tracking-widest text-[var(--text-dim)]">
              《{star.book_title}》{star.chapter ? ` · ${star.chapter}` : ''}
            </div>
          </motion.div>
        ) : (
          <div className="text-[13px] text-[var(--text-dim)]">夜空无星</div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-10 flex items-center gap-6 text-[12px] text-[var(--text-dim)]">
        <span>← → 换一颗</span>
        <button className="btn btn-primary py-1" onClick={() => void revisit()} disabled={!star}>
          ✦ 重逢过了，下一颗
        </button>
        <span>Esc 离开夜航</span>
      </div>
    </motion.div>
  )
}
