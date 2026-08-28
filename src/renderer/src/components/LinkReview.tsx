import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { LinkRecord } from '@shared/types'

// 共创连线审核：AI 提议（双星/对撞），用户逐条盖章
export default function LinkReview({
  onClose,
  onChanged,
  onOpenStar
}: {
  onClose: () => void
  onChanged: () => void
  onOpenStar: (starId: number) => void
}) {
  const [links, setLinks] = useState<LinkRecord[]>([])

  const load = useCallback(async (): Promise<void> => {
    setLinks(await window.api.listLinks('suggested'))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: number, status: 'confirmed' | 'dismissed'): Promise<void> => {
    await window.api.decideLink(id, status)
    await load()
    onChanged()
  }

  const meta = (kind: string): { label: string; icon: string } =>
    kind === 'collision' ? { label: '观点对撞', icon: '⚡' } : kind === 'manual' ? { label: '手连', icon: '⭘' } : { label: '双星', icon: '✧' }

  return (
    <motion.div
      initial={{ x: 460, opacity: 0.5 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 460, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      className="absolute right-0 top-0 z-[70] flex h-full w-[460px] max-w-[50vw] shrink-0 flex-col overflow-hidden border-l border-[var(--line)] bg-white shadow-[-24px_0_64px_rgba(20,30,60,0.2)] "
    >
      <header className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
        <div className="text-[14px] font-medium">
          连线审核 <span className="ml-1 text-[12px] text-[var(--text-dim)]">AI 提议，你盖章</span>
        </div>
        <button className="btn px-2 py-0.5" onClick={onClose}>
          ✕
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {links.length === 0 && (
          <div className="mt-16 text-center text-[13px] text-[var(--text-dim)]">
            没有待审核的连线。
            <br />
            导入更多书的笔记并运行「AI 分析」后，跨书的双星与对撞会出现在这里。
          </div>
        )}
        {links.map((l) => {
          const m = meta(l.kind)
          return (
            <div key={l.id} className="panel p-4">
              <div className="flex items-center gap-2 text-[11.5px]">
                <span className={l.kind === 'collision' ? 'text-red-600' : 'text-[var(--accent)]'}>
                  {m.icon} {m.label}
                </span>
                {l.sim !== null && <span className="text-[var(--text-dim)]">相似 {(l.sim * 100).toFixed(0)}%</span>}
              </div>
              {[l.from_highlight, l.to_highlight].map((id, i) => (
                <button
                  key={id}
                  className="mt-2 block w-full text-left"
                  onClick={() => {
                    onOpenStar(id)
                    onClose()
                  }}
                >
                  <div className="text-[10.5px] text-[var(--text-dim)]">{i === 0 ? l.from_book : l.to_book}</div>
                  <div className="serif line-clamp-3 text-[12.5px] leading-6">
                    {i === 0 ? l.from_content : l.to_content}
                  </div>
                </button>
              ))}
              {l.note && (
                <div className={`mt-2 rounded-md px-2 py-1 text-[11.5px] ${l.kind === 'collision' ? 'bg-red-400/15 text-red-700' : 'bg-[rgba(146,116,67,0.08)] text-[var(--text-dim)]'}`}>
                  {l.note}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button className="btn btn-primary py-1 text-[12px]" onClick={() => void decide(l.id, 'confirmed')}>
                  ✓ 确认连线
                </button>
                <button className="btn py-1 text-[12px]" onClick={() => void decide(l.id, 'dismissed')}>
                  忽略
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
