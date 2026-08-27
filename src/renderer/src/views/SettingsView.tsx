import { useEffect, useState } from 'react'
import type { AiTestResult } from '@shared/types'

const FIELDS: { key: string; label: string; placeholder: string; password?: boolean; hint?: string }[] = [
  {
    key: 'ai_base_url',
    label: 'API 地址 (base_url)',
    placeholder: 'https://open.bigmodel.cn/api/paas/v4',
    hint: 'OpenAI 兼容接口均可：GLM / DeepSeek / Moonshot / OpenAI…（以 /v1 结尾，不带 /chat/completions）'
  },
  { key: 'ai_api_key', label: 'API Key', placeholder: 'sk-…', password: true },
  { key: 'ai_chat_model', label: '对话模型', placeholder: 'glm-4-flash' },
  { key: 'ai_embed_model', label: '向量模型', placeholder: 'embedding-3', hint: 'M2 星穹图谱的语义聚类使用' }
]

export default function SettingsView() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AiTestResult | null>(null)
  const [archives, setArchives] = useState<{ id: number; created_at: string; stats: string }[]>([])

  useEffect(() => {
    window.api.getSettings().then(setValues).catch(() => {})
    window.api
      .listArchives()
      .then(setArchives)
      .catch(() => {})
  }, [])

  const set = (key: string, v: string): void => setValues((prev) => ({ ...prev, [key]: v }))

  const save = async (): Promise<void> => {
    const patch: Record<string, string> = {}
    for (const f of FIELDS) patch[f.key] = values[f.key] ?? ''
    await window.api.setSettings(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      await save()
      const r = await window.api.testAi()
      setTestResult(r)
    } finally {
      setTesting(false)
    }
  }

  const backup = async (): Promise<void> => {
    const p = await window.api.backupNow()
    alert(`已备份到：\n${p}`)
  }

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      <h1 className="text-[22px] font-semibold">设置</h1>

      <section className="panel mt-6 max-w-[720px] p-6">
        <h2 className="text-[15px] font-medium">
          AI 接入 <span className="ml-2 text-[11.5px] font-normal text-[var(--text-dim)]">（可选，未配置时所有手动功能照常可用）</span>
        </h2>
        <div className="mt-4 space-y-4">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[12.5px] text-[var(--text-dim)]">{f.label}</label>
              <input
                className="input"
                type={f.password ? 'password' : 'text'}
                placeholder={f.placeholder}
                value={values[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
              />
              {f.hint && <div className="mt-1 text-[11px] text-[var(--text-dim)] opacity-70">{f.hint}</div>}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button className="btn btn-primary" onClick={() => void save()}>
            {saved ? '已保存 ✓' : '保存'}
          </button>
          <button className="btn" disabled={testing} onClick={() => void runTest()}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testResult && (
            <span className={`text-[12.5px] ${testResult.ok ? 'text-emerald-300' : 'text-red-300'}`}>
              {testResult.ok ? '✓ 连接成功' : `✕ ${testResult.error}`}
            </span>
          )}
        </div>
      </section>

      <section className="panel mt-5 max-w-[720px] p-6">
        <h2 className="text-[15px] font-medium">写作</h2>
        <label className="mt-3 flex cursor-pointer items-center gap-3 text-[13px]">
          <input
            type="checkbox"
            className="accent-sky-300"
            checked={values.socratic_enabled === '1'}
            onChange={(e) => {
              const next = { ...values, socratic_enabled: e.target.checked ? '1' : '0' }
              setValues(next)
              void window.api.setSettings({ socratic_enabled: next.socratic_enabled })
            }}
          />
          苏格拉底追问——每写完一条想法，AI 抛回一个尖锐的问题
        </label>
      </section>

      <section className="panel mt-5 max-w-[720px] p-6">
        <h2 className="text-[15px] font-medium">数据</h2>
        <div className="mt-3 flex gap-2">
          <button className="btn" onClick={() => void backup()}>
            立即备份数据库
          </button>
        </div>
        <h3 className="mt-5 text-[12.5px] text-[var(--text-dim)]">导入存档（{archives.length} 份 · 原文可重放）</h3>
        <div className="mt-2 max-h-[180px] space-y-1.5 overflow-y-auto">
          {archives.map((a) => (
            <div key={a.id} className="rounded-lg border border-[var(--line)] px-3 py-2 text-[11.5px] text-[var(--text-dim)]">
              <span className="text-[var(--text)]">#{a.id}</span> · {a.created_at} · {a.stats}
            </div>
          ))}
          {archives.length === 0 && <div className="text-[12px] opacity-60">还没有导入记录</div>}
        </div>
      </section>
    </div>
  )
}
