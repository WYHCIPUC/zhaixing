import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import type { SearchHit } from '@shared/types'

export default function SearchOverlay({
  onClose,
  onOpenBook
}: {
  onClose: () => void
  onOpenBook: (bookId: number) => void
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const query = q.trim()
      if (!query) {
        setHits([])
        setSearched(false)
        return
      }
      window.api
        .search(query)
        .then((r) => {
          setHits(r)
          setSearched(true)
        })
        .catch(() => {})
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[#5b4a33]/30 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="panel w-[720px] max-w-[90vw] overflow-hidden bg-[#fffdf8]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--line)] px-5 py-3">
          <div className="flex items-center gap-3">
            <Search size={16} className="shrink-0 text-[var(--text-dim)]" />
            <input
              ref={inputRef}
              className="w-full bg-transparent text-[16px] outline-none"
              placeholder="搜索你的星空…（划线与想法）"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
          </div>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {hits.map((h, i) => (
            <motion.button
              key={h.highlight_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.25) }}
              className="block w-full rounded-lg px-4 py-3 text-left transition-colors hover:bg-[rgba(146,116,67,0.08)]"
              onClick={() => {
                onOpenBook(h.book_id)
                onClose()
              }}
            >
              <div className="serif line-clamp-2 text-[13px] leading-6">{h.snippet}</div>
              <div className="mt-1 text-[11px] text-[var(--text-dim)]">
                《{h.book_title}》{h.chapter ? ` · ${h.chapter}` : ''}
              </div>
            </motion.button>
          ))}
          {searched && hits.length === 0 && (
            <div className="py-10 text-center text-[13px] text-[var(--text-dim)]">夜空中没有匹配的星</div>
          )}
          {!searched && (
            <div className="py-10 text-center text-[12px] text-[var(--text-dim)]">输入关键词，按书与想法全文检索</div>
          )}
        </div>
        <div className="border-t border-[var(--line)] px-5 py-2 text-[11px] text-[var(--text-dim)]">
          Ctrl+K 呼出 · Esc 关闭 · 点击结果进入所属书
        </div>
      </motion.div>
    </div>
  )
}
