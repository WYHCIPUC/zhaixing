import { useState } from 'react'
import { motion } from 'framer-motion'
import type { NebulaRecord, StarMapStar } from '@shared/types'

// 星座志：一片星云的全部摘录 + 你的想法 + 综述
export default function NebulaPanel({
  nebula,
  stars,
  onClose,
  onChanged,
  onOpenStar
}: {
  nebula: NebulaRecord
  stars: StarMapStar[]
  onClose: () => void
  onChanged: () => void
  onOpenStar: (starId: number) => void
}) {
  const [summary, setSummary] = useState<string | null>(null)
  const isUser = nebula.source === 'user'

  const saveSummary = async (): Promise<void> => {
    if (summary === null) return
    await window.api.updateNebula(nebula.id, { summary })
    setSummary(null)
    onChanged()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute inset-x-0 bottom-0 z-[50] max-h-[62%] overflow-hidden border-t border-[var(--line)] "
    >
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-8 py-3">
        <div>
          <span className="mr-2 rounded-full border border-[var(--line)] px-2 py-0.5 text-[10.5px] text-[var(--text-dim)]">
            {isUser ? '自造星云' : 'AI 聚类'}
          </span>
          <span className="text-[16px] font-semibold">{nebula.name}</span>
          <span className="ml-2 text-[12px] text-[var(--text-dim)]">{stars.length} 颗星</span>
        </div>
        <div className="ml-auto flex gap-2">
          {isUser && (
            <button
              className="btn btn-danger py-1 text-[12px]"
              onClick={async () => {
                if (!confirm(`解散星云「${nebula.name}」？星星本身不受影响。`)) return
                await window.api.deleteNebula(nebula.id)
                onChanged()
                onClose()
              }}
            >
              解散
            </button>
          )}
          <button className="btn py-1 text-[12px]" onClick={onClose}>
            收起 ✕
          </button>
        </div>
      </header>

      <div className="max-h-[calc(62vh-56px)] overflow-y-auto px-8 py-4">
        {/* 综述 */}
        {summary !== null ? (
          <div className="mb-4">
            <textarea
              className="input min-h-[80px] resize-y text-[12.5px] leading-6"
              autoFocus
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary py-1 text-[12px]" onClick={() => void saveSummary()}>
                保存综述
              </button>
              <button className="btn py-1 text-[12px]" onClick={() => setSummary(null)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            className="serif mb-4 block max-w-[720px] text-left text-[12.5px] italic leading-7 text-[var(--text-dim)] hover:text-[var(--text)]"
            onClick={() => setSummary(nebula.summary)}
            title="点击编辑综述"
          >
            {nebula.summary || '＋ 为这片星云写一段综述…'}
          </button>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
          {stars.map((s) => (
            <button
              key={s.id}
              className="panel block p-3 text-left transition-colors hover:border-[rgba(221,91,0,0.4)]"
              onClick={() => onOpenStar(s.id)}
            >
              <div className="serif line-clamp-3 text-[12.5px] leading-6">{s.content}</div>
              {(s.thoughts?.length ?? 0) > 0 && (
                <div className="mt-1 line-clamp-1 text-[11px] italic text-[var(--text-dim)]">
                  ❝ {s.thoughts![0].content}
                </div>
              )}
              <div className="mt-1.5 text-[10.5px] text-[var(--text-dim)]">
                《{s.book_title}》{s.chapter ? ` · ${s.chapter}` : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
