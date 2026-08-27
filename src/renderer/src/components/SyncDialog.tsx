import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import type { WereadNotebook, WereadSyncReport } from '@shared/types'

interface RowState {
  status: 'idle' | 'busy' | 'done' | 'error'
  message?: string
}

// 微信读书一键同步：笔记本概览 → 逐本拉取划线与想法入库
export default function SyncDialog({
  onClose,
  onSynced
}: {
  onClose: () => void
  onSynced: () => void
}) {
  const [books, setBooks] = useState<WereadNotebook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<Record<string, RowState>>({})

  useEffect(() => {
    window.api
      .wereadNotebooks()
      .then(setBooks)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  const syncOne = async (bookId: string): Promise<void> => {
    setRows((p) => ({ ...p, [bookId]: { status: 'busy' } }))
    try {
      const r: WereadSyncReport = await window.api.wereadSyncBook(bookId)
      setRows((p) => ({
        ...p,
        [bookId]: {
          status: 'done',
          message: `✓ 新增 ${r.highlightsAdded} 星（跳过重复 ${r.highlightsSkipped}）· 想法 ${r.thoughtsAdded}${r.ratingSet ? ' · 已记评分' : ''}`
        }
      }))
      onSynced()
    } catch (err) {
      setRows((p) => ({ ...p, [bookId]: { status: 'error', message: `✕ ${err instanceof Error ? err.message : String(err)}` } }))
    }
  }

  const syncAll = async (): Promise<void> => {
    for (const b of books) {
      if (rows[b.bookId]?.status === 'done') continue
      await syncOne(b.bookId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5b4a33]/30 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="panel flex max-h-[86vh] w-[760px] max-w-[92vw] flex-col overflow-hidden bg-[#fffdf8]"
      >
        <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div className="flex items-center gap-2 text-[15px] font-medium">
            <motion.span
              animate={loading ? { rotate: 360 } : {}}
              transition={loading ? { duration: 1.2, repeat: Infinity, ease: 'linear' } : {}}
              className="inline-flex"
            >
              <RefreshCw size={15} />
            </motion.span>
            从微信读书同步
            {books.length > 0 && (
              <span className="ml-2 text-[12px] font-normal text-[var(--text-dim)]">
                {books.length} 本有笔记 · 共 {books.reduce((a, b) => a + b.noteCount + b.reviewCount, 0)} 条
              </span>
            )}
          </div>
          <button className="btn px-2 py-1" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <div className="py-16 text-center text-[13px] text-[var(--text-dim)]">正在拉取笔记本概览…</div>}
          {error && (
            <div className="rounded-lg border border-red-400/50 bg-red-400/15 px-4 py-3 text-[12.5px] leading-6 text-red-600">
              {error}
              <div className="mt-1 text-[11.5px] opacity-80">请到 设置 → 微信读书同步 填入 API Key（wrk-…）</div>
            </div>
          )}
          {!loading && !error && (
            <div className="space-y-1.5">
              {books.map((b) => {
                const st = rows[b.bookId] ?? { status: 'idle' as const }
                return (
                  <div
                    key={b.bookId}
                    className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{b.title}</div>
                      <div className="text-[11px] text-[var(--text-dim)]">
                        {b.author || '未知作者'} · ✦{b.noteCount} 划线 · ❝{b.reviewCount} 想法
                        {b.bookmarkCount > 0 ? ` · 书签 ${b.bookmarkCount}（暂不可导出）` : ''}
                      </div>
                      {st.message && (
                        <div className={`mt-0.5 text-[11px] ${st.status === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                          {st.message}
                        </div>
                      )}
                    </div>
                    <button
                      className="btn shrink-0 py-1 text-[12px]"
                      disabled={st.status === 'busy'}
                      onClick={() => void syncOne(b.bookId)}
                    >
                      {st.status === 'busy' ? '同步中…' : st.status === 'done' ? '再同步' : '同步'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {!loading && !error && books.length > 0 && (
          <footer className="flex items-center justify-between border-t border-[var(--line)] px-6 py-3">
            <span className="text-[11px] text-[var(--text-dim)]">
              划线含真实创建时间；想法按「原文锚点」自动挂到对应星上；重复同步自动去重
            </span>
            <button className="btn btn-primary py-1.5" onClick={() => void syncAll()}>
              全部同步
            </button>
          </footer>
        )}
      </motion.div>
    </div>
  )
}
