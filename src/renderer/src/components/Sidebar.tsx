import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, BookOpen, Feather, MoonStar, Settings, Sparkles, Waypoints } from 'lucide-react'
import Hint from './Hint'
import type { OverviewStats } from '@shared/types'
import type { ViewKey } from '../App'
import { DUR, EASE_OUT } from '../motion'

// 书脊色取自书色盘 MORANDI（src/main/db/repo.ts，书=星的本源，与星图用色同源）
const NAV: { key: ViewKey; label: string; icon: typeof BookOpen; spine: string }[] = [
  { key: 'shelf', label: '书架', icon: BookOpen, spine: '#c97b4a' },
  { key: 'sky', label: '星穹', icon: Sparkles, spine: '#6f8fa8' },
  { key: 'wiki', label: '群星', icon: Waypoints, spine: '#a483b8' },
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
        <div className="mt-1 text-[12px] tracking-wide text-[var(--text-dim)]">
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
                className={`group relative flex w-full items-center rounded-lg py-2 pl-4 pr-3 text-left text-[14px] font-medium tap ${
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

      <div className="mt-auto space-y-3 px-2">
        {/* 书房速览：利用左下角空白（v6 A4） */}
        {stats && (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5">
            <div className="text-[12px] font-medium text-[var(--text)]">书房速览</div>
            <div className="mt-1.5 space-y-0.5 text-[12px] leading-5 text-[var(--text-dim)]">
              <div>
                在读 <span className="text-[var(--text)] tabular-nums">{stats.readingCount}</span>
                <span className="mx-1 opacity-40">·</span>
                读完 <span className="text-[var(--text)] tabular-nums">{stats.finishedCount}</span>
              </div>
              <div>
                本周新增 <span className="star-mark tabular-nums">✦ {stats.weeklyStars}</span> 颗星
              </div>
            </div>
            <button
              className="tap mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--line)] py-1 text-[12px] text-[var(--text-dim)] hover:border-[var(--line-strong)] hover:text-[var(--text)]"
              onClick={() => onNavigate('meteor')}
            >
              ☾ 进入夜航
            </button>
          </div>
        )}
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
