// 移动端壳：窄屏（<md）顶栏 + 底部导航，替代桌面侧边栏（App.tsx 控制 md 显隐）
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, BookOpen, Feather, MoonStar, Search, Settings, Sparkles } from 'lucide-react'
import type { OverviewStats } from '@shared/types'
import type { ViewKey } from '../App'

export const MOBILE_NAV: { key: ViewKey; label: string; icon: typeof BookOpen }[] = [
  { key: 'shelf', label: '书架', icon: BookOpen },
  { key: 'sky', label: '星穹', icon: Sparkles },
  { key: 'meteor', label: '流星', icon: MoonStar },
  { key: 'weave', label: '织星', icon: Feather },
  { key: 'stats', label: '统计', icon: BarChart3 },
  { key: 'settings', label: '设置', icon: Settings }
]

export function MobileTopBar({ onSearch }: { onSearch: () => void }): React.JSX.Element {
  const [stats, setStats] = useState<OverviewStats | null>(null)

  useEffect(() => {
    window.api.overview().then(setStats).catch(() => {})
  }, [])

  return (
    <header className="flex items-center justify-between border-b border-[var(--line)] bg-black/20 px-4 py-2.5 md:hidden">
      <div className="flex items-baseline gap-2">
        <span className="text-[16px] font-semibold tracking-wide">
          <span className="star-mark twinkle mr-1 inline-block">✦</span>
          摘星<span className="text-[var(--text-dim)]">实录</span>
        </span>
        {stats && (
          <span className="text-[11px] text-[var(--text-dim)]">
            书 {stats.bookCount} · 星 {stats.highlightCount}
          </span>
        )}
      </div>
      <button
        aria-label="检索"
        onClick={onSearch}
        className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-dim)] active:bg-white/10"
      >
        <Search size={19} />
      </button>
    </header>
  )
}

export function MobileBottomNav({
  view,
  onNavigate
}: {
  view: ViewKey
  onNavigate: (v: ViewKey) => void
}): React.JSX.Element {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--line)] bg-[var(--panel-strong)] pb-[env(safe-area-inset-bottom)] md:hidden">
      {MOBILE_NAV.map((n) => {
        const active = view === n.key
        const Icon = n.icon
        return (
          <button
            key={n.key}
            onClick={() => onNavigate(n.key)}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] transition-colors ${
              active ? 'text-[var(--accent)]' : 'text-[var(--text-dim)]'
            }`}
          >
            {active && (
              <motion.span
                layoutId="mobile-nav-active"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-[var(--accent)]"
              />
            )}
            <Icon size={19} strokeWidth={active ? 2.2 : 1.7} />
            {n.label}
          </button>
        )
      })}
    </nav>
  )
}
