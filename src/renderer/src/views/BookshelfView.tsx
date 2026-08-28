import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { BookRecord } from '@shared/types'
import ImportWizard from '../components/ImportWizard'
import SyncDialog from '../components/SyncDialog'

const BOOK_COLORS = [
  '#ff9a5a', '#d9930d', '#8b5cf6', '#38bdf8',
  '#a483b8', '#c9a227', '#7a9e9f', '#c08552'
]

function colorFor(title: string): string {
  let h = 0
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return BOOK_COLORS[h % BOOK_COLORS.length]
}

export default function BookshelfView({
  reloadKey,
  onOpenBook,
  onImported
}: {
  reloadKey: number
  onOpenBook: (id: number) => void
  onImported: () => void
}) {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [wizardOpen, setWizardOpen] = useState(false)
  const [syncOpen, setSyncOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api.listBooks().then(setBooks).catch(() => {})
  }, [reloadKey])

  const exportAll = async (): Promise<void> => {
    setExporting(true)
    try {
      const p = await window.api.exportMarkdown('all')
      if (p) toast.success('全部笔记已导出', { description: p })
    } catch (err) {
      toast.error('导出失败', { description: String(err) })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-5 py-6 md:px-10 md:py-8">
      <header className="mb-7 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold">书架</h1>
          <p className="mt-0.5 text-[12.5px] text-[var(--text-dim)]">
            {books.length > 0
              ? `${books.length} 本书 · ${books.reduce((a, b) => a + (b.highlight_count ?? 0), 0)} 颗星`
              : '把微信读书里划过的线，摘到你的星空中'}
          </p>
        </div>
        <div className="flex gap-2">
          {books.length > 0 && (
            <button className="btn" onClick={exportAll} disabled={exporting}>
              <Download /> {exporting ? '导出中…' : '导出全部'}
            </button>
          )}
          <button className="btn" onClick={() => setSyncOpen(true)}>
            <RefreshCw /> 微信读书同步
          </button>
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            <Plus /> 导入笔记
          </button>
        </div>
      </header>

      {books.length === 0 ? (
        <div className="mt-28 flex flex-col items-center text-center">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="text-5xl text-[var(--gold)]"
          >
            <Sparkles size={44} strokeWidth={1.4} />
          </motion.div>
          <div className="mt-5 text-[15px]">还没有星星</div>
          <div className="mt-2 max-w-[420px] text-[12.5px] leading-6 text-[var(--text-dim)]">
            在微信读书 App 里打开一本书 → 笔记 → 右上角分享/复制，<br />
            把复制出的文本粘贴进导入向导，或者直接用 API 一键同步。
          </div>
          <button className="btn btn-primary mt-6" onClick={() => setWizardOpen(true)}>
            <Plus /> 粘贴我的第一份笔记
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {books.map((b, i) => (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.045, 0.5), type: 'spring', stiffness: 260, damping: 24 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onOpenBook(b.id)}
              className="panel panel-hover group overflow-hidden p-0 text-left"
            >
              <motion.div
                className="h-[4px] w-full origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: Math.min(i * 0.045, 0.5) + 0.15, duration: 0.5 }}
                style={{ background: `linear-gradient(90deg, ${b.color}, transparent)` }}
              />
              <div className="p-4">
                <div className="truncate text-[14.5px] font-medium" title={b.title}>
                  {b.title}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-[var(--text-dim)]">
                  {b.author || '未知作者'}
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11.5px] text-[var(--text-dim)]">
                  <span className="star-mark">✦ {b.highlight_count}</span>
                  <span>❝ {b.thought_count}</span>
                  <span className="ml-auto">{(b.last_note_at ?? b.created_at).slice(0, 10)}</span>
                </div>
                {b.short_review && (
                  <div className="serif mt-2 line-clamp-2 text-[11.5px] italic text-[var(--text-dim)]">
                    {b.short_review}
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      {wizardOpen && (
        <ImportWizard
          onClose={() => setWizardOpen(false)}
          onDone={(report) => {
            setWizardOpen(false)
            onImported()
            if (report.highlightsAdded > 0) {
              toast.success(`摘到 ${report.highlightsAdded} 颗新星`, {
                description: report.highlightsSkipped > 0 ? `跳过重复 ${report.highlightsSkipped} 条` : undefined
              })
            } else {
              toast.info('没有新增星星', { description: '全部与已有笔记重复' })
            }
          }}
        />
      )}

      {syncOpen && (
        <SyncDialog
          onClose={() => setSyncOpen(false)}
          onSynced={onImported}
        />
      )}
    </div>
  )
}

export { colorFor }
