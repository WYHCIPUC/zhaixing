import { useEffect, useMemo, useState } from 'react'
import { animate, motion } from 'framer-motion'
import type { DailyCount, SpiritSpectrum } from '@shared/types'
import YearReplay from '../components/YearReplay'

// 数字滚动
function CountUp({ value }: { value: number }): React.ReactElement {
  const [n, setN] = useState(0)
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setN(Math.round(v))
    })
    return () => controls.stop()
  }, [value])
  return <>{n}</>
}

export default function StatsView() {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof window.api.overview>> | null>(null)
  const [daily, setDaily] = useState<DailyCount[]>([])
  const [themes, setThemes] = useState<{ name: string; count: number }[]>([])
  const [spirit, setSpirit] = useState<SpiritSpectrum | null>(null)
  const [spiritBusy, setSpiritBusy] = useState(false)
  const [replayOpen, setReplayOpen] = useState(false)

  useEffect(() => {
    void (async () => {
      setOverview(await window.api.overview())
      setDaily(await window.api.dailyCounts())
      const map = await window.api.getStarMap()
      setThemes(
        map.nebulae
          .map((n) => ({ name: n.name, count: n.star_count ?? 0 }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8)
      )
    })().catch(() => {})
    window.api
      .spiritSpectrum(false)
      .then(setSpirit)
      .catch(() => {})
  }, [])

  const runSpirit = async (refresh: boolean): Promise<void> => {
    setSpiritBusy(true)
    try {
      setSpirit(await window.api.spiritSpectrum(refresh))
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err))
    } finally {
      setSpiritBusy(false)
    }
  }

  const maxTheme = Math.max(1, ...themes.map((t) => t.count))

  return (
    <div className="h-full overflow-y-auto px-10 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">▤ 统计</h1>
        <button className="btn btn-primary" disabled={!overview || overview.highlightCount === 0} onClick={() => setReplayOpen(true)}>
          ▶ 年度星空回放
        </button>
      </header>

      {/* 总览 */}
      <div className="grid grid-cols-5 gap-3">
        {(
          [
            ['书', overview?.bookCount],
            ['星（划线）', overview?.highlightCount],
            ['想法', overview?.thoughtCount],
            ['星云', themes.length],
            ['标签', overview?.tagCount]
          ] as [string, number | undefined][]
        ).map(([label, value], i) => (
          <motion.div
            key={String(label)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="panel panel-hover px-4 py-3 text-center"
          >
            <div className="text-[24px] font-semibold text-[var(--accent)]">
              {value === undefined ? '–' : <CountUp value={value} />}
            </div>
            <div className="text-[11px] text-[var(--text-dim)]">{label}</div>
          </motion.div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-[1.4fr_1fr] gap-5">
        {/* 热力图 */}
        <section className="panel p-5">
          <h2 className="mb-3 text-[13px] font-medium">摘星热力</h2>
          <HeatMap daily={daily} />
        </section>

        {/* 主题分布 */}
        <section className="panel p-5">
          <h2 className="mb-3 text-[13px] font-medium">星云主题分布</h2>
          {themes.length === 0 && <div className="text-[12px] text-[var(--text-dim)] opacity-70">还没有星云（星穹 → AI 分析）</div>}
          <div className="space-y-2">
            {themes.map((t) => (
              <div key={t.name} className="flex items-center gap-2 text-[12px]">
                <span className="w-24 truncate text-right text-[var(--text-dim)]">{t.name}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[rgba(146,116,67,0.08)]">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(t.count / maxTheme) * 100}%` }}
                    transition={{ duration: 0.6 }}
                    className="h-full rounded-full bg-gradient-to-r from-[rgba(217,122,30,0.7)] to-[rgba(167,139,250,0.7)]"
                  />
                </div>
                <span className="w-6 text-[var(--text-dim)]">{t.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 精神光谱 */}
      <section className="panel mt-5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium">✧ 精神光谱</h2>
          <button className="btn py-1 text-[12px]" disabled={spiritBusy} onClick={() => void runSpirit(spirit !== null)}>
            {spiritBusy ? '分析中…' : spirit ? '重新分析' : 'AI 分析我的阅读画像'}
          </button>
        </div>
        {spirit ? (
          <div className="mt-4 flex items-center gap-10">
            <Radar spectrum={spirit.spectrum} />
            <div>
              <div className="text-[20px] font-semibold text-[var(--gold)]">{spirit.type_name}</div>
              <div className="serif mt-2 max-w-[380px] text-[13px] italic leading-7 text-[var(--text-dim)]">
                {spirit.type_desc}
              </div>
              <div className="mt-2 text-[10.5px] opacity-50">生成于 {spirit.generated_at}</div>
            </div>
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-[var(--text-dim)] opacity-70">
            让 AI 读一遍你的全部划线，告诉你自己是什么类型的读者（需配置 AI）。
          </div>
        )}
      </section>

      {replayOpen && <YearReplay onClose={() => setReplayOpen(false)} />}
    </div>
  )
}

// ---------- 热力图（近 26 周） ----------

function HeatMap({ daily }: { daily: DailyCount[] }): React.ReactElement {
  const map = useMemo(() => new Map(daily.map((d) => [d.date, d.count])), [daily])
  const weeks = useMemo(() => {
    const out: { date: string; count: number }[][] = []
    const today = new Date()
    const start = new Date(today)
    start.setDate(today.getDate() - 26 * 7 - today.getDay())
    for (let w = 0; w < 27; w++) {
      const col: { date: string; count: number }[] = []
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start)
        cur.setDate(start.getDate() + w * 7 + d)
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
        col.push({ date: key, count: map.get(key) ?? 0 })
      }
      out.push(col)
    }
    return out
  }, [map])
  const max = Math.max(1, ...daily.map((d) => d.count))

  const color = (n: number): string => {
    if (n === 0) return 'rgba(255,255,255,0.05)'
    const t = Math.min(1, n / max)
    return `rgba(251,191,36,${0.2 + t * 0.8})`
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto">
      {weeks.map((col, w) => (
        <div key={w} className="flex flex-col gap-[3px]">
          {col.map((cell, d) => (
            <div
              key={cell.date}
              title={`${cell.date} · ${cell.count} 颗星`}
              className="cell-in h-[11px] w-[11px] rounded-[2px]"
              style={{ background: color(cell.count), animationDelay: `${(w * 7 + d) * 0.004}s` }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ---------- 精神光谱雷达 ----------

function Radar({ spectrum }: { spectrum: SpiritSpectrum['spectrum'] }): React.ReactElement {
  const size = 200
  const cx = size / 2
  const cy = size / 2
  const R = 78
  const n = Math.max(3, spectrum.length)
  const pt = (i: number, r: number): [number, number] => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
  }
  const poly = spectrum.map((s, i) => pt(i, (s.score / 100) * R).join(',')).join(' ')
  return (
    <svg width={size} height={size} className="shrink-0">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon
          key={f}
          points={spectrum.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
        />
      ))}
      <polygon
        points={poly}
        fill="rgba(251,191,36,0.18)"
        stroke="rgba(251,191,36,0.8)"
        strokeWidth={1.5}
        style={{
          transformOrigin: '100px 100px',
          animation: 'radar-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both'
        }}
      />
      {spectrum.map((s, i) => {
        const [x, y] = pt(i, R + 18)
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="rgba(146,116,67,1)">
            {s.name}
          </text>
        )
      })}
    </svg>
  )
}
