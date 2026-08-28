// 门禁 A：移动 WebView Canvas 2D 星野性能压测（MM0）
// 用真实 StarfieldEngine + 1000 合成星，10 秒采样 FPS
import { useEffect, useRef, useState } from 'react'
import { StarfieldEngine } from '@renderer/starfield/engine'
import type { StarMapData, StarMapStar } from '@shared/types'

const STAR_COUNT = Number(import.meta.env.VITE_STAR_COUNT) || 1000
const SAMPLE_MS = 10_000

const PALETTE = ['#7dd3fc', '#c4b5fd', '#fda4af', '#fcd34d', '#86efac']

function synthStars(): StarMapStar[] {
  const stars: StarMapStar[] = []
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      id: i + 1,
      book_id: (i % 8) + 1,
      book_title: `合成书 ${(i % 8) + 1}`,
      book_color: PALETTE[i % PALETTE.length],
      chapter: `第 ${(i % 12) + 1} 章`,
      chapter_order: i % 12,
      content: `这是第 ${i + 1} 颗合成星的划线内容，用于性能压测。`,
      favorite: false,
      ai_tags: [],
      revisit_count: 0,
      last_revisit_at: null,
      created_at: '2026-01-01 00:00:00',
      nebula_ids: i % 7 === 0 ? [i % 5] : []
    })
  }
  return stars
}

function synthData(): StarMapData {
  const stars = synthStars()
  const links = stars
    .filter((s) => s.id % 3 === 0)
    .map((s) => ({
      id: s.id,
      from_highlight: s.id,
      to_highlight: ((s.id * 7) % STAR_COUNT) + 1,
      kind: 'twin' as const,
      status: 'confirmed' as const,
      note: '',
      sim: 0.9,
      created_at: '2026-01-01 00:00:00',
      from_chapter: '',
      to_chapter: ''
    }))
  return { stars, nebulae: [], links }
}

export default function StarfieldBench() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [fps, setFps] = useState(0)
  const [avgFps, setAvgFps] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new StarfieldEngine(canvas, {
      onHover: () => {},
      onSelect: () => {},
      onMultiSelect: () => {}
    })
    engine.setData(synthData())

    let frames = 0
    let lastSecond = performance.now()
    let startedAt = performance.now()
    const samples: number[] = []
    let raf = 0

    const loop = (): void => {
      frames++
      const t = performance.now()
      if (t - lastSecond >= 1000) {
        const f = Math.round((frames * 1000) / (t - lastSecond))
        setFps(f)
        samples.push(f)
        frames = 0
        lastSecond = t
        setElapsed(Math.round(t - startedAt))
      }
      if (t - startedAt >= SAMPLE_MS) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length
        setAvgFps(Math.round(avg * 10) / 10)
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      engine.destroy()
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b1026' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          padding: '10px 14px',
          borderRadius: 12,
          background: 'rgba(0,0,0,0.55)',
          color: '#e2e8f0',
          font: '14px/1.6 monospace',
          pointerEvents: 'none'
        }}
      >
        <div>门禁A · 星野压测 · {STAR_COUNT} 星（n=URL参数）</div>
        <div>实时 FPS: {fps}</div>
        <div>已采样: {(elapsed / 1000).toFixed(0)}s / 10s</div>
        {avgFps !== null && (
          <div style={{ color: avgFps >= 45 ? '#86efac' : avgFps >= 30 ? '#fcd34d' : '#fda4af', fontWeight: 700 }}>
            10s 均值: {avgFps} FPS → {avgFps >= 45 ? '通过' : avgFps >= 30 ? '有条件通过' : '破裂（走回退分支）'}
          </div>
        )}
      </div>
    </div>
  )
}
