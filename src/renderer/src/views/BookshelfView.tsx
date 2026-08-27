import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { BookRecord } from '@shared/types'
import ImportWizard from '../components/ImportWizard'

const BOOK_COLORS = [
  '#7dd3fc', '#a5b4fc', '#f0abfc', '#fda4af',
  '#fcd34d', '#86efac', '#5eead4', '#fdba74'
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
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api.listBooks().then(setBooks).catch(() => {})
  }, [reloadKey])

  const exportAll = async (): Promise<void> => {
    setExporting(true)
    try {
      const p = await window.api.exportMarkdown('all')
      if (p) alert(`已导出到：\n${p}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
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
              ⬇ 导出全部 Markdown
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setWizardOpen(true)}>
            ✦ 导入笔记
          </button>
        </div>
      </header>

      {books.length === 0 ? (
        <div className="mt-28 flex flex-col items-center text-center">
          <div className="twinkle text-5xl star-mark">✦</div>
          <div className="mt-5 text-[15px]">还没有星星</div>
          <div className="mt-2 max-w-[420px] text-[12.5px] leading-6 text-[var(--text-dim)]">
            在微信读书 App 里打开一本书 → 笔记 → 右上角分享/复制，<br />
            把复制出的文本粘贴进导入向导，你的第一颗星就会亮起来。
          </div>
          <button className="btn btn-primary mt-6" onClick={() => setWizardOpen(true)}>
            粘贴我的第一份笔记
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {books.map((b, i) => (
            <motion.button
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              onClick={() => onOpenBook(b.id)}
              className="panel group overflow-hidden p-0 text-left transition-transform hover:-translate-y-0.5"
            >
              <div
                className="h-[4px] w-full"
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
              alert(`摘到 ${report.highlightsAdded} 颗新星${report.highlightsSkipped > 0 ? `，跳过重复 ${report.highlightsSkipped} 条` : ''}`)
            } else {
              alert('没有新增星星（全部与已有笔记重复）')
            }
          }}
        />
      )}
    </div>
  )
}

export { colorFor }
