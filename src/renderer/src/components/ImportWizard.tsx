import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { ImportReport, ParseResult } from '@shared/types'

// 导入向导：粘贴 → 解析预览（可改文本重解）→ 确认入库
export default function ImportWizard({
  onClose,
  onDone
}: {
  onClose: () => void
  onDone: (report: ImportReport) => void
}) {
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const doParse = async (input?: string): Promise<void> => {
    const t = input ?? text
    if (!t.trim()) return
    setBusy(true)
    setError('')
    try {
      const r = await window.api.parseWereadText(t)
      setParsed(r)
      setText(t)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    const content = await file.text()
    setText(content)
    await doParse(content)
  }

  const doImport = async (): Promise<void> => {
    setBusy(true)
    try {
      const r = await window.api.confirmImport(text)
      setReport(r)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const totalStars = parsed?.books.reduce((a, b) => a + b.highlights.length, 0) ?? 0
  const totalThoughts =
    parsed?.books.reduce((a, b) => a + b.highlights.reduce((x, h) => x + h.thoughts.length, 0), 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#5b4a33]/30 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="panel flex max-h-[88vh] w-[820px] max-w-[92vw] flex-col overflow-hidden bg-[#fffdf8]"
      >
        <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
          <div className="text-[15px] font-medium">
            <span className="star-mark mr-2">✦</span>
            导入微信读书笔记
          </div>
          <button className="btn px-2 py-1" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="mb-3 rounded-lg border border-red-400/50 bg-red-400/15 px-4 py-2 text-[12.5px] text-red-600">{error}</div>}

          {!parsed && !report && (
            <>
              <p className="mb-3 text-[12.5px] leading-6 text-[var(--text-dim)]">
                在微信读书 App 中：进入一本书 → <b>笔记</b> → 分享/更多 → <b>复制</b>，
                然后把文本粘贴到这里。也支持直接拖入 .txt 文件。
              </p>
              <textarea
                className="input serif min-h-[300px] resize-y leading-7"
                placeholder={'《三体》\n刘慈欣\n◆ 序章\n\n>> 我们都是阴沟里的虫子，但总还是得有人仰望星空。\n\n// 这句话要反复读'}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onDrop={(e) => {
                  e.preventDefault()
                  void onFile(e.dataTransfer.files[0])
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md"
                className="hidden"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <div className="mt-4 flex items-center justify-between">
                <button className="btn" onClick={() => fileRef.current?.click()}>
                  选择 .txt 文件
                </button>
                <button className="btn btn-primary" disabled={!text.trim() || busy} onClick={() => void doParse()}>
                  {busy ? '解析中…' : '解析预览 →'}
                </button>
              </div>
            </>
          )}

          {parsed && !report && (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-[var(--line)] bg-[#f4ead8]/70 px-4 py-2.5 text-[12.5px]">
                <span>
                  识别到 <b className="text-[var(--accent)]">{parsed.books.length}</b> 本书
                </span>
                <span>
                  <b className="star-mark">{totalStars}</b> 条划线
                </span>
                <span>
                  <b>{totalThoughts}</b> 条想法
                </span>
                <button className="btn ml-auto px-2 py-1 text-[12px]" onClick={() => setParsed(null)}>
                  ← 返回修改文本
                </button>
              </div>

              {parsed.warnings.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-500/35 bg-amber-400/15 px-4 py-2 text-[12px] leading-6 text-amber-700">
                  {parsed.warnings.map((w, i) => (
                    <div key={i}>· {w}</div>
                  ))}
                </div>
              )}

              <div className="space-y-5">
                {parsed.books.map((b) => (
                  <div key={b.title} className="panel p-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium">《{b.title}》</span>
                      <span className="text-[12px] text-[var(--text-dim)]">{b.author || '未识别作者'}</span>
                      <span className="ml-auto text-[11.5px] text-[var(--text-dim)]">
                        {b.highlights.length} 条划线 · {b.chapters.length} 章
                      </span>
                    </div>
                    <div className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pr-1">
                      {b.highlights.map((h, i) => (
                        <div key={i} className="text-[12.5px] leading-6">
                          <div className="serif flex gap-2 text-[var(--text)]">
                            <span className="star-mark shrink-0 select-none">✦</span>
                            <span>{h.content}</span>
                          </div>
                          {h.thoughts.map((t, j) => (
                            <div key={j} className="mt-0.5 flex gap-2 pl-6 text-[var(--text-dim)]">
                              <span className="shrink-0 select-none">❝</span>
                              <span className="italic">{t.content}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button className="btn" onClick={() => setParsed(null)}>
                  取消
                </button>
                <button className="btn btn-primary" disabled={parsed.books.length === 0 || busy} onClick={() => void doImport()}>
                  {busy ? '入库中…' : `确认入库（${totalStars} 颗星）`}
                </button>
              </div>
            </>
          )}

          {report && (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="text-4xl star-mark twinkle">✦</div>
              <div className="mt-4 text-[16px]">入库完成</div>
              <div className="mt-2 space-y-1 text-[13px] text-[var(--text-dim)]">
                <div>新增 {report.booksAdded} 本书 · 摘到 {report.highlightsAdded} 颗星 · {report.thoughtsAdded} 条想法</div>
                {report.highlightsSkipped > 0 && <div>跳过重复划线 {report.highlightsSkipped} 条</div>}
                <div className="mt-1 text-[11.5px] opacity-70">原始文本已存档（#{report.archiveId}），随时可重放</div>
              </div>
              <button className="btn btn-primary mt-7" onClick={() => onDone(report)}>
                完成
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
