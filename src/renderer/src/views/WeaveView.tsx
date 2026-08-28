import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ArticleRecord, AskSkyResult, NebulaRecord } from '@shared/types'

export default function WeaveView() {
  const [mode, setMode] = useState<'weave' | 'ask'>('weave')
  const [nebulae, setNebulae] = useState<NebulaRecord[]>([])
  const [activeNebula, setActiveNebula] = useState<NebulaRecord | null>(null)
  const [articles, setArticles] = useState<ArticleRecord[]>([])
  const [active, setActive] = useState<ArticleRecord | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 与星空对话
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<AskSkyResult | null>(null)

  const loadNebulae = useCallback(async (): Promise<void> => {
    const map = await window.api.getStarMap()
    setNebulae(map.nebulae)
  }, [])

  useEffect(() => {
    void loadNebulae()
  }, [loadNebulae])

  useEffect(() => {
    if (activeNebula) {
      window.api.listArticles(activeNebula.id).then(setArticles).catch(() => {})
    } else {
      setArticles([])
    }
    setActive(null)
    setDraft(null)
  }, [activeNebula])

  const doDraft = async (): Promise<void> => {
    if (!activeNebula) return
    setBusy(true)
    setMsg('AI 正在为你织文…')
    try {
      const a = await window.api.draftNebulaArticle(activeNebula.id)
      setArticles((prev) => [a, ...prev])
      setActive(a)
      setDraft(a.content_md)
      setMsg('')
    } catch (err) {
      setMsg(`失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const saveVersion = async (): Promise<void> => {
    if (!active || draft === null) return
    const saved = await window.api.saveArticle(active.id, draft)
    if (saved) {
      setActive(saved)
      setArticles((prev) => prev.map((x) => (x.id === saved.id ? saved : x)))
      setMsg(`已保存（第 ${saved.version} 版，旧版进历史）`)
    }
  }

  const doAsk = async (): Promise<void> => {
    const q = question.trim()
    if (!q) return
    setBusy(true)
    setMsg('正在翻检你的星空…')
    try {
      setAnswer(await window.api.askSky(q))
      setMsg('')
    } catch (err) {
      setMsg(`失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const historyOf = (a: ArticleRecord): { version: number; saved_at: string }[] => {
    try {
      return JSON.parse(a.history || '[]')
    } catch {
      return []
    }
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      <header className="mb-5 flex items-center gap-4">
        <h1 className="text-[22px] font-semibold">
          ❋ 织星 <span className="ml-1 text-[13px] font-normal text-[var(--text-dim)]">笔记的终点是作品</span>
        </h1>
        <div className="ml-auto flex rounded-lg border border-[var(--line)] p-0.5">
          {(
            [
              ['weave', '织星成文'],
              ['ask', '与星空对话']
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className={`rounded-md px-3 py-1 text-[12.5px] ${mode === k ? 'bg-[rgba(221,91,0,0.15)] text-[var(--accent)]' : 'text-[var(--text-dim)]'}`}
              onClick={() => setMode(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {msg && <div className="mb-3 text-[12px] text-[var(--text-dim)]">{msg}</div>}

      {mode === 'weave' ? (
        <div className="flex gap-5">
          {/* 星云与文章列表 */}
          <div className="w-[260px] shrink-0 space-y-4">
            <div>
              <h2 className="mb-2 text-[12px] tracking-wide text-[var(--text-dim)]">选一片星云</h2>
              <div className="space-y-1.5">
                {nebulae.map((n) => (
                  <button
                    key={n.id}
                    className={`block w-full rounded-lg border px-3 py-2 text-left text-[12.5px] transition-colors ${
                      activeNebula?.id === n.id
                        ? 'border-[rgba(221,91,0,0.5)] text-[var(--text)]'
                        : 'border-[var(--line)] text-[var(--text-dim)] hover:text-[var(--text)]'
                    }`}
                    onClick={() => setActiveNebula(n)}
                  >
                    {n.source === 'ai' ? '☁' : '⭘'} {n.name}
                    <span className="ml-1 opacity-60">{n.star_count}</span>
                  </button>
                ))}
                {nebulae.length === 0 && (
                  <div className="text-[12px] opacity-60">还没有星云。先在星穹里跑一次 AI 分析，或自造一片。</div>
                )}
              </div>
            </div>
            {activeNebula && (
              <div>
                <button className="btn btn-primary w-full justify-center" disabled={busy} onClick={() => void doDraft()}>
                  {busy ? '织文中…' : '✧ AI 起草一篇文章'}
                </button>
                <h2 className="mb-2 mt-4 text-[12px] tracking-wide text-[var(--text-dim)]">
                  文章（{articles.length}）
                </h2>
                <div className="space-y-1.5">
                  {articles.map((a) => (
                    <button
                      key={a.id}
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-[12px] ${
                        active?.id === a.id ? 'border-[rgba(221,91,0,0.5)]' : 'border-[var(--line)]'
                      }`}
                      onClick={() => {
                        setActive(a)
                        setDraft(a.content_md)
                      }}
                    >
                      <div className="serif truncate">{a.title}</div>
                      <div className="text-[10.5px] text-[var(--text-dim)]">
                        v{a.version} · {a.updated_at.slice(0, 10)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 编辑器 */}
          <div className="panel min-w-0 flex-1 p-6">
            {!active && <div className="mt-16 text-center text-[13px] text-[var(--text-dim)]">选一片星云，让星空自己长出第一篇文章</div>}
            {active && (
              <>
                <input
                  className="w-full bg-transparent text-[17px] font-medium outline-none"
                  value={active.title}
                  onChange={(e) => setActive({ ...active, title: e.target.value })}
                  onBlur={() => void window.api.updateArticleTitle(active.id, active.title)}
                />
                <div className="mt-1 text-[11px] text-[var(--text-dim)]">
                  第 {active.version} 版 · {active.updated_at} · 历史版本 {historyOf(active).length} 份
                </div>
                <textarea
                  className="input serif mt-3 min-h-[46vh] resize-y leading-8"
                  value={draft ?? active.content_md}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary" onClick={() => void saveVersion()}>
                    保存新版本
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      if (!confirm('删除这篇文章（含历史版本）？')) return
                      await window.api.deleteArticle(active.id)
                      setActive(null)
                      setArticles((prev) => prev.filter((x) => x.id !== active.id))
                    }}
                  >
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* 与星空对话 */
        <div className="mx-auto max-w-[760px]">
          <div className="flex gap-2">
            <input
              className="input py-2.5"
              placeholder="问自己的星空：我读过哪些关于「拖延」的内容？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void doAsk()}
            />
            <button className="btn btn-primary px-5" disabled={busy} onClick={() => void doAsk()}>
              {busy ? '…' : '问'}
            </button>
          </div>
          {answer && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel mt-5 p-6">
              <div className="serif text-[14px] leading-8">{answer.answer}</div>
              <h3 className="mt-5 text-[12px] tracking-wide text-[var(--text-dim)]">出处星链</h3>
              <div className="mt-2 space-y-2">
                {answer.cites.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[12px]">
                    <div className="serif line-clamp-2 leading-6">{c.content}</div>
                    <div className="mt-0.5 text-[10.5px] text-[var(--text-dim)]">《{c.book}》{c.chapter}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {!answer && (
            <div className="mt-14 text-center text-[12.5px] leading-7 text-[var(--text-dim)]">
              AI 用你自己的划线作答，每句附出处。<br />
              需要已配置 AI 并跑过分析（生成向量）。
            </div>
          )}
        </div>
      )}
    </div>
  )
}
