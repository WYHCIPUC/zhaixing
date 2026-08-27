import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import type { StarMapStar } from '@shared/types'

// 年度星空回放：延时摄影式回看星星如何一颗颗亮起
export default function YearReplay({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    void (async () => {
      const map = await window.api.getStarMap()
      const stars = map.stars
      const canvas = canvasRef.current
      if (!canvas || stars.length === 0) return

      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      const g = canvas.getContext('2d')!

      // 按 id 哈希布点，按 created_at 定出场月份
      const items = stars.map((s: StarMapStar) => {
        let h = s.id
        const rand = (): number => {
          h = (h * 1103515245 + 12345) & 0x7fffffff
          return h / 0x7fffffff
        }
        const month = Number(s.created_at.slice(5, 7)) - 1 + Number(s.created_at.slice(8, 10)) / 31
        const r = 2 + Math.min(3, s.content.length / 80) + (s.favorite ? 1.2 : 0)
        return { star: s, x: rand(), y: rand(), r, month, phase: rand() * 6 }
      })
      items.sort((a, b) => a.month - b.month)

      const render = (t: number): void => {
        g.save()
        g.scale(dpr, dpr)
        g.fillStyle = '#070b14'
        g.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        for (const it of items) {
          if (it.month > t) continue
          const age = Math.min(1, (t - it.month) * 2)
          const tw = 0.75 + 0.25 * Math.sin(t * 3 + it.phase)
          const x = it.x * (w - 80) + 40
          const y = it.y * (h - 80) + 40
          const size = it.r * 6 * age * tw
          const grad = g.createRadialGradient(x, y, 0, x, y, size)
          grad.addColorStop(0, 'rgba(255,255,255,0.9)')
          grad.addColorStop(0.3, 'rgba(125,211,252,0.5)')
          grad.addColorStop(1, 'rgba(0,0,0,0)')
          g.fillStyle = grad
          g.beginPath()
          g.arc(x, y, size, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = 'rgba(139,150,173,0.9)'
        g.font = '28px sans-serif'
        g.fillText(`${String(Math.min(12, Math.floor(t) + 1)).padStart(2, '0')} 月`, 40, h - 36)
        g.restore()
      }

      let raf = 0
      const start = performance.now()
      const loop = (): void => {
        const elapsed = ((performance.now() - start) / 1000) * 1.6 // 12 个月约 7.5 秒
        if (elapsed > 12.6) {
          render(0) // 循环重播
          requestAnimationFrame(loop)
          return
        }
        render(elapsed)
        raf = requestAnimationFrame(loop)
      }
      if (playing) raf = requestAnimationFrame(loop)
      render(12.6)
      return () => cancelAnimationFrame(raf)
    })()
  }, [playing])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#04060d]"
      onClick={onClose}
    >
      <div className="mb-4 text-[13px] tracking-widest text-[var(--text-dim)]">你的星空，是这样亮起来的</div>
      <canvas ref={canvasRef} className="h-[68vh] w-[86vw] rounded-xl border border-[var(--line)]" />
      <div className="mt-4 flex gap-3 text-[12px] text-[var(--text-dim)]">
        <button
          className="btn py-1"
          onClick={(e) => {
            e.stopPropagation()
            setPlaying((p) => !p)
          }}
        >
          {playing ? '暂停' : '重播'}
        </button>
        <button
          className="btn py-1"
          onClick={async (e) => {
            e.stopPropagation()
            const canvas = canvasRef.current
            if (!canvas) return
            const p = await window.api.saveImage('我的星空.png', canvas.toDataURL('image/png'))
            if (p) toast.success('已保存', { description: p })
          }}
        >
          ⬇ 存为图片
        </button>
        <button className="btn py-1" onClick={onClose}>
          关闭（Esc）
        </button>
      </div>
    </motion.div>
  )
}
