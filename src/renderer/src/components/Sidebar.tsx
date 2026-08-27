import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, BookOpen, Feather, MoonStar, Settings, Sparkles } from 'lucide-react'
import type { OverviewStats } from '@shared/types'
import type { ViewKey } from '../App'

const NAV: { key: ViewKey; label: string; icon: typeof BookOpen; hint?: string }[] = [
  { key: 'shelf', label: '书架', icon: BookOpen },
  { key: 'sky', label: '星穹', icon: Sparkles },
  { key: 'meteor', label: '流星', icon: MoonStar },
  { key: 'weave', label: '织星', icon: Feather },
  { key: 'stats', label: '统计', icon: BarChart3 },
  { key: 'settings', label: '设置', icon: Settings }
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
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--line)] bg-black/20 px-3 py-5">
      <div className="mb-8 px-2">
        <motion.div
          className="text-[19px] font-semibold tracking-wide"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <span className="star-mark twinkle mr-1 inline-block">✦</span>
          摘星<span className="text-[var(--text-dim)]">实录</span>
        </motion.div>
        <div className="mt-1 text-[11px] text-[var(--text-dim)]">不教你记住，只帮你重逢</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = view === n.key
          const Icon = n.icon
          return (
            <button
              key={n.key}
              onClick={() => onNavigate(n.key)}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
                active ? 'text-[var(--accent)]' : 'text-[var(--text-dim)] hover:text-[var(--text)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg bg-[rgba(125,211,252,0.12)]"
                />
              )}
              <motion.span
                className="relative z-10 flex w-4 justify-center"
                whileHover={{ scale: 1.15, rotate: active ? 0 : -6 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              >
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              </motion.span>
              <span className="relative z-10">{n.label}</span>
            </button>
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
