import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, BookOpen, Feather, MoonStar, Settings, Sparkles } from 'lucide-react'
import Hint from './Hint'
import type { OverviewStats } from '@shared/types'
import type { ViewKey } from '../App'
import { DUR, EASE_OUT } from '../motion'

// 书脊色取自书色盘 MORANDI（src/main/db/repo.ts，书=星的本源，与星图用色同源）
const NAV: { key: ViewKey; label: string; icon: typeof BookOpen; spine: string }[] = [
  { key: 'shelf', label: '书架', icon: BookOpen, spine: '#c97b4a' },
  { key: 'sky', label: '星穹', icon: Sparkles, spine: '#6f8fa8' },
  { key: 'meteor', label: '流星', icon: MoonStar, spine: '#a483b8' },
  { key: 'weave', label: '织星', icon: Feather, spine: '#c9a227' },
  { key: 'stats', label: '统计', icon: BarChart3, spine: '#7a9e9f' },
  { key: 'settings', label: '设置', icon: Settings, spine: '#8f9a6d' }
]

export default function Sidebar({
  view,
  onNavigate
}: {
  view: ViewKey
  onNavigate: (v: ViewKey) => void
}) {
  const [stats, setStats] = useState<OverviewStats | null>(null)

  useEffect(() => {
    window.api.overview().then(setStats).catch(() => {})
  }, [view])

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--line)] bg-[#f6f5f4] px-3 py-5">
      <div className="mb-8 px-2">
        <motion.div
          className="text-[19px] font-semibold tracking-wide"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: DUR.base, ease: EASE_OUT }}
        >
          <span className="star-mark mr-1.5 inline-block">✦</span>
          摘星实录
        </motion.div>
        <div className="mt-1 text-[11px] tracking-wide text-[var(--text-dim)]">
          不教你记住，只帮你重逢
        </div>
      </div>

      {/* 书架：每项是一本书的书脊，激活＝书被抽出来（v5 §0.5-①，切换零动画） */}
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const active = view === n.key
          const Icon = n.icon
          return (
            <Hint key={n.key} label={n.label} side="right">
              <button
                onClick={() => onNavigate(n.key)}
                className={`group relative flex w-full items-center rounded-lg py-2 pl-4 pr-3 text-left text-[13.5px] font-medium transition-colors ${
                  active
                    ? 'bg-[var(--surface-2)] text-[var(--text)]'
                    : 'text-[var(--text-dim)] hover:bg-[rgba(15,15,15,0.03)] hover:text-[var(--text)]'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-full transition-opacity ${
                    active ? 'opacity-100' : 'opacity-40 group-hover:opacity-75'
                  }`}
                  style={{
                    background: n.spine,
                    height: active ? '58%' : '10px'
                  }}
                />
                <span
                  className={`relative z-10 flex items-center gap-3 ${active ? 'translate-x-[3px]' : ''}`}
                >
                  <span className="flex w-4 justify-center">
                    <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  {n.label}
                </span>
              </button>
            </Hint>
          )
        })}
      </nav>

      <div className="mt-auto px-2 text-[11.5px] leading-6 text-[var(--text-dim)]">
        {stats && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div>
              书 <span className="text-[var(--text)]">{stats.bookCount}</span> · 星{' '}
              <span className="text-[var(--text)]">{stats.highlightCount}</span>
            </div>
            <div>
              想法 {stats.thoughtCount} · 标签 {stats.tagCount}
            </div>
          </motion.div>
        )}
      </div>
    </aside>
  )
}
