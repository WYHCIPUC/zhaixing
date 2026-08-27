import { useEffect, useState } from 'react'
import type { OverviewStats } from '@shared/types'
import type { ViewKey } from '../App'

const NAV: { key: ViewKey; label: string; icon: string; hint?: string }[] = [
  { key: 'shelf', label: '书架', icon: '◆' },
  { key: 'sky', label: '星穹', icon: '✦' },
  { key: 'meteor', label: '流星', icon: '☄' },
  { key: 'weave', label: '织星', icon: '❋' },
  { key: 'stats', label: '统计', icon: '▤' },
  { key: 'settings', label: '设置', icon: '⚙' }
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
        <div className="text-[19px] font-semibold tracking-wide">
          <span className="star-mark twinkle mr-1">✦</span>
          摘星<span className="text-[var(--text-dim)]">实录</span>
        </div>
        <div className="mt-1 text-[11px] text-[var(--text-dim)]">不教你记住，只帮你重逢</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <button
            key={n.key}
            onClick={() => onNavigate(n.key)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors ${
              view === n.key
                ? 'bg-[rgba(125,211,252,0.12)] text-[var(--accent)]'
                : 'text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]'
            }`}
          >
            <span className="w-4 text-center text-[15px]">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto px-2 text-[11.5px] leading-6 text-[var(--text-dim)]">
        {stats && (
          <>
            <div>
              书 <span className="text-[var(--text)]">{stats.bookCount}</span> · 星{' '}
              <span className="text-[var(--text)]">{stats.highlightCount}</span>
            </div>
            <div>
              想法 {stats.thoughtCount} · 标签 {stats.tagCount}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
