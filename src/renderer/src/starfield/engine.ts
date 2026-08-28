import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import type { StarMapData, StarMapStar } from '@shared/types'

interface Node extends SimulationNodeDatum {
  id: number
  star: StarMapStar
  r: number
  color: string
  phase: number
  bright: number
  spikes: boolean
}

type Edge = SimulationLinkDatum<Node> & { kind: string }

export interface EngineCallbacks {
  onHover: (star: StarMapStar | null, sx: number, sy: number) => void
  onSelect: (star: StarMapStar | null) => void
  onMultiSelect: (ids: number[]) => void
}

interface Haze {
  wx: number
  wy: number
  r: number
  color: string
}

// 星云辉光色板（深空底上柔和可见）
const HAZE_PALETTE = ['#6d8bff', '#a78bfa', '#ff8f8f', '#5fd4b6', '#ffd08a', '#f0a3ff', '#7fd0ff', '#ffa057']

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeSprite(color: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 96
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.12, colorWithAlpha(color, 0.95))
  grad.addColorStop(0.3, colorWithAlpha(color, 0.42))
  grad.addColorStop(0.62, colorWithAlpha(color, 0.14))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 96, 96)
  return c
}

function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16)
    const gg = parseInt(color.slice(3, 5), 16)
    const b = parseInt(color.slice(5, 7), 16)
    return `rgba(${r},${gg},${b},${alpha})`
  }
  return color
}

export class StarfieldEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private nodes: Node[] = []
  private edges: Edge[] = []
  private sprites = new Map<string, HTMLCanvasElement>()
  private bg: HTMLCanvasElement | null = null
  private haze: Haze[] = []
  private raf = 0
  private paused = false
  private dpr = 1
  private cam = { x: 0, y: 0, k: 1 }
  private camTarget: { x: number; y: number; k: number } | null = null
  private dragging = false
  private dragMoved = false
  private lastMouse = { x: 0, y: 0 }
  private hoverId = 0
  private selectedId = 0
  private highlightIds = new Set<number>()
  private selectMode = false
  private multiSelected = new Set<number>()
  private byId = new Map<number, Node>()
  private sim = forceSimulation<Node>()
  private cb: EngineCallbacks
  private ro: ResizeObserver

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.cb = cb

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas.parentElement ?? canvas)
    this.resize()
    // 触屏：禁掉浏览器默认手势（滚动/系统缩放），单指拖动才能平移星图
    canvas.style.touchAction = 'none'

    // 双指捏合缩放（MM2）：pointer 级跟踪，两指走 pinch，松回一指恢复拖动/点选
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0

    const zoomAt = (mx: number, my: number, factor: number): void => {
      const rect = canvas.getBoundingClientRect()
      const wx = (mx - rect.width / 2) / this.cam.k + this.cam.x
      const wy = (my - rect.height / 2) / this.cam.k + this.cam.y
      this.cam.k = Math.min(6, Math.max(0.3, this.cam.k * factor))
      this.cam.x = wx - (mx - rect.width / 2) / this.cam.k
      this.cam.y = wy - (my - rect.height / 2) / this.cam.k
      this.camTarget = null
    }

    canvas.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        this.dragging = false
        return
      }
      this.dragging = true
      this.dragMoved = false
      this.lastMouse = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0 && d > 0) {
          const rect = canvas.getBoundingClientRect()
          zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinchDist)
        }
        pinchDist = d
        return
      }
      const rect = this.canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      if (this.dragging && e.buttons === 1) {
        const dx = e.clientX - this.lastMouse.x
        const dy = e.clientY - this.lastMouse.y
        if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true
        this.cam.x -= dx / this.cam.k
        this.cam.y -= dy / this.cam.k
        this.camTarget = null
        this.lastMouse = { x: e.clientX, y: e.clientY }
      } else if (mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height) {
        this.handleHover(mx, my)
      }
    })
    window.addEventListener('pointerup', (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (this.dragging && !this.dragMoved) this.handleClick()
      this.dragging = false
    })
    window.addEventListener('pointercancel', (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      this.dragging = false
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.12 : 0.89
        zoomAt(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top, factor)
      },
      { passive: false }
    )

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.raf)
        this.paused = true
      } else if (this.paused) {
        this.paused = false
        this.loop()
      }
    })

    this.loop()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.sim.stop()
  }

  setData(data: StarMapData): void {
    // 星云中心：黄金角螺旋布置，半径随成员规模生长（避免大星云挤出屏幕）
    const nebInfo = data.nebulae.map((n) => ({ id: n.id, count: n.star_count ?? 0 }))
    const nebCenters = new Map<number, { x: number; y: number }>()
    nebInfo.forEach((n, i) => {
      const radius = 150 + Math.sqrt(n.count) * 15
      const angle = i * 2.39996 + 0.6
      nebCenters.set(n.id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * 0.85 })
    })

    const rand = mulberry32(20260827)
    this.nodes = data.stars.map((s) => {
      const len = Math.min(2.4, s.content.length / 90)
      const r = 1.7 + len + (s.favorite ? 1.3 : 0) + (s.is_gem ? 1.6 : 0)
      return {
        id: s.id,
        star: s,
        r,
        color: s.is_gem
          ? '#ffd166'
          : s.nebula_ids[0] !== undefined
            ? (data.nebulae.find((n) => n.id === s.nebula_ids[0])?.color ?? s.book_color)
            : s.book_color,
        phase: rand() * Math.PI * 2,
        bright: Math.min(1, 0.35 + s.revisit_count * 0.18 + (s.favorite ? 0.25 : 0)),
        spikes: r >= 3.4 || Boolean(s.is_gem),
        x: (rand() - 0.5) * 1400,
        y: (rand() - 0.5) * 1400,
        vx: 0,
        vy: 0
      }
    })
    this.byId = new Map(this.nodes.map((n) => [n.id, n]))
    this.edges = data.links
      .map((l) => ({ source: l.from_highlight, target: l.to_highlight, kind: l.kind }))
      .filter((e) => this.byId.has(e.source as number) && this.byId.has(e.target as number))

    this.sim
      .nodes(this.nodes)
      .force(
        'link',
        forceLink<Node, Edge>(this.edges)
          .id((d) => d.id)
          .distance(110)
          .strength(0.25)
      )
      .force('charge', forceManyBody<Node>().strength(9)) // 万有引力：星星互相吸引（Barnes-Hut 近似），自然聚成星团
      .force('collide', forceCollide<Node>((d) => d.r * 7)) // 引力与碰撞平衡：成团而不坍缩
      .force('x', forceX<Node>((d) => (d.star.nebula_ids[0] !== undefined ? (nebCenters.get(d.star.nebula_ids[0])?.x ?? 0) : 0)).strength((d) => (d.star.nebula_ids[0] !== undefined ? 0.08 : 0.015)))
      .force('y', forceY<Node>((d) => (d.star.nebula_ids[0] !== undefined ? (nebCenters.get(d.star.nebula_ids[0])?.y ?? 0) : 0)).strength((d) => (d.star.nebula_ids[0] !== undefined ? 0.08 : 0.015)))
      .alpha(1)
      .restart()

    // 星云辉光：按成员分布计算中心与半径（延迟到首个绘制帧后，布局接近稳定时更新）
    const byNeb = new Map<number, Node[]>()
    for (const n of this.nodes) {
      const id = n.star.nebula_ids[0]
      if (id === undefined) continue
      if (!byNeb.has(id)) byNeb.set(id, [])
      byNeb.get(id)!.push(n)
    }
    this.haze = []
    byNeb.forEach((members) => {
      if (members.length < 3) return
      let cx = 0
      let cy = 0
      for (const m of members) {
        cx += m.x ?? 0
        cy += m.y ?? 0
      }
      cx /= members.length
      cy /= members.length
      let r = 0
      for (const m of members) r = Math.max(r, Math.hypot((m.x ?? 0) - cx, (m.y ?? 0) - cy))
      this.haze.push({
        wx: cx,
        wy: cy,
        r: Math.max(70, r * 1.2),
        color: HAZE_PALETTE[this.haze.length % HAZE_PALETTE.length]
      })
    })
    // 布局会继续演化，8 秒后再校准一次辉光位置
    setTimeout(() => this.refreshHaze(), 8000)

    this.buildBackground()
  }

  private refreshHaze(): void {
    if (this.paused) return
    const byNeb = new Map<number, Node[]>()
    for (const n of this.nodes) {
      const id = n.star.nebula_ids[0]
      if (id === undefined) continue
      if (!byNeb.has(id)) byNeb.set(id, [])
      byNeb.get(id)!.push(n)
    }
    let i = 0
    for (const [, members] of byNeb) {
      if (members.length < 3 || i >= this.haze.length) continue
      let cx = 0
      let cy = 0
      for (const m of members) {
        cx += m.x ?? 0
        cy += m.y ?? 0
      }
      cx /= members.length
      cy /= members.length
      let r = 0
      for (const m of members) r = Math.max(r, Math.hypot((m.x ?? 0) - cx, (m.y ?? 0) - cy))
      this.haze[i] = { ...this.haze[i], wx: cx, wy: cy, r: Math.max(70, r * 1.2) }
      i++
    }
  }

  setHighlight(ids: Set<number>): void {
    this.highlightIds = ids
  }

  setSelectMode(on: boolean): void {
    this.selectMode = on
    if (!on) this.multiSelected.clear()
  }

  getMultiSelected(): number[] {
    return [...this.multiSelected]
  }

  focusStar(id: number): void {
    const n = this.byId.get(id)
    if (!n || n.x === undefined || n.y === undefined) return
    this.camTarget = { x: n.x, y: n.y, k: Math.max(1.8, this.cam.k) }
  }

  // 把当前星空渲染成高清壁纸（深空质感，与画布一致）
  renderWallpaper(width = 2560, height = 1440): string {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const g = c.getContext('2d')!
    this.paintDeepSpace(g, width, height, mulberry32(99), 1)

    if (this.nodes.length > 0) {
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      let maxY = -Infinity
      for (const n of this.nodes) {
        minX = Math.min(minX, n.x ?? 0)
        maxX = Math.max(maxX, n.x ?? 0)
        minY = Math.min(minY, n.y ?? 0)
        maxY = Math.max(maxY, n.y ?? 0)
      }
      const pad = 220
      const k = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))
      const ox = width / 2 - ((minX + maxX) / 2) * k
      const oy = height / 2 - ((minY + maxY) / 2) * k
      const sx = (n: Node): number => (n.x ?? 0) * k + ox
      const sy = (n: Node): number => (n.y ?? 0) * k + oy

      g.globalCompositeOperation = 'lighter'
      for (const h of this.haze) {
        const r = h.r * k * 1.3
        const grad = g.createRadialGradient(h.wx * k + ox, h.wy * k + oy, 0, h.wx * k + ox, h.wy * k + oy, Math.max(40, r))
        grad.addColorStop(0, colorWithAlpha(h.color, 0.16))
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.fillRect(h.wx * k + ox - r, h.wy * k + oy - r, r * 2, r * 2)
      }
      for (const e of this.edges) {
        const a = this.byId.get(e.source as number)
        const b = this.byId.get(e.target as number)
        if (!a || !b) continue
        g.strokeStyle =
          e.kind === 'collision'
            ? 'rgba(255,120,120,0.4)'
            : e.kind === 'manual'
              ? 'rgba(255,205,130,0.4)'
              : 'rgba(150,175,255,0.22)'
        g.lineWidth = 1.2
        g.beginPath()
        g.moveTo(sx(a), sy(a))
        g.lineTo(sx(b), sy(b))
        g.stroke()
      }
      for (const n of this.nodes) {
        const size = n.r * 9 * Math.max(1, k * 0.55)
        g.globalAlpha = Math.min(1, 0.4 + n.bright * 0.7)
        g.drawImage(this.spriteFor(n.color), sx(n) - size / 2, sy(n) - size / 2, size, size)
        if (n.spikes) this.paintSpikes(g, sx(n), sy(n), size, n.color, 0.55)
      }
      g.globalCompositeOperation = 'source-over'
    }
    g.font = "24px 'Microsoft YaHei UI', sans-serif"
    g.fillStyle = 'rgba(200,214,240,0.85)'
    g.fillText('✦ 摘星实录 · 我的阅读星空', 40, height - 40)
    return c.toDataURL('image/png')
  }

  private resize(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    this.dpr = window.devicePixelRatio || 1
    this.canvas.width = parent.clientWidth * this.dpr
    this.canvas.height = parent.clientHeight * this.dpr
    this.canvas.style.width = `${parent.clientWidth}px`
    this.canvas.style.height = `${parent.clientHeight}px`
    this.buildBackground()
  }

  // 深空底：渐变 + 三层星尘 + 银河带（离屏预渲染，带视差平铺）
  private buildBackground(): void {
    const c = document.createElement('canvas')
    c.width = Math.max(1, this.canvas.width)
    c.height = Math.max(1, this.canvas.height)
    const g = c.getContext('2d')
    if (!g) return
    this.paintDeepSpace(g, c.width, c.height, mulberry32(77), this.dpr)
    this.bg = c
  }

  private paintDeepSpace(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number, scale: number): void {
    // 深空渐变底
    const grad = g.createLinearGradient(0, 0, w * 0.4, h)
    grad.addColorStop(0, '#0c1226')
    grad.addColorStop(0.55, '#080c1b')
    grad.addColorStop(1, '#05070f')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    // 银河带（对角，高斯散布的密集尘埃 + 云雾亮斑）
    g.save()
    g.translate(w / 2, h / 2)
    g.rotate(-0.42)
    const len = Math.hypot(w, h) * 1.2
    const band = h * 0.16 * scale
    for (let i = 0; i < Math.floor(len / (4 * scale)); i++) {
      const t = (rand() - 0.5) * len
      const off = ((rand() + rand() + rand()) / 1.5 - 1) * band
      const r = (rand() * 1.3 + 0.3) * scale
      const a = rand() * 0.22 + 0.03
      g.fillStyle = `rgba(208,220,255,${a})`
      g.beginPath()
      g.arc(t, off, r, 0, Math.PI * 2)
      g.fill()
    }
    for (let i = 0; i < Math.floor(30 * scale); i++) {
      const t = (rand() - 0.5) * len
      const off = ((rand() + rand()) - 1) * band * 0.7
      const r = (rand() * 46 + 16) * scale
      const grad2 = g.createRadialGradient(t, off, 0, t, off, r)
      grad2.addColorStop(0, `rgba(190,205,255,${rand() * 0.05 + 0.02})`)
      grad2.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad2
      g.fillRect(t - r, off - r, r * 2, r * 2)
    }
    g.restore()

    // 全天散布星尘（三层色温）
    const count = Math.floor((w * h) / (5200 * scale))
    for (let i = 0; i < count; i++) {
      const x = rand() * w
      const y = rand() * h
      const r = (rand() * 1.2 + 0.3) * scale
      const a = rand() * 0.4 + 0.05
      g.fillStyle = [`rgba(210,222,255,${a})`, `rgba(255,236,210,${a * 0.8})`, `rgba(255,255,255,${a * 0.9})`][i % 3]
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }

    // 暗角（边缘压暗，聚焦中心）
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(2,4,12,0.55)')
    g.fillStyle = vig
    g.fillRect(0, 0, w, h)
  }

  private screenOf(n: Node): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((n.x ?? 0) - this.cam.x) * this.cam.k + rect.width / 2,
      y: ((n.y ?? 0) - this.cam.y) * this.cam.k + rect.height / 2
    }
  }

  private nodeAt(mx: number, my: number): Node | null {
    let best: Node | null = null
    let bestD = Infinity
    for (const n of this.nodes) {
      const s = this.screenOf(n)
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2
      const hit = (n.r * this.cam.k + 7) ** 2
      if (d < hit && d < bestD) {
        best = n
        bestD = d
      }
    }
    return best
  }

  private handleHover(mx: number, my: number): void {
    const n = this.nodeAt(mx, my)
    const prev = this.hoverId
    this.hoverId = n?.id ?? 0
    this.canvas.style.cursor = n ? 'pointer' : 'grab'
    if (prev !== this.hoverId || n) {
      this.cb.onHover(n?.star ?? null, mx, my)
    }
  }

  private handleClick(): void {
    const rect = this.canvas.getBoundingClientRect()
    const mx = this.lastMouse.x - rect.left
    const my = this.lastMouse.y - rect.top
    const n = this.nodeAt(mx, my)
    if (this.selectMode) {
      if (n) {
        if (this.multiSelected.has(n.id)) this.multiSelected.delete(n.id)
        else this.multiSelected.add(n.id)
        this.cb.onMultiSelect([...this.multiSelected])
      }
      return
    }
    this.selectedId = n?.id ?? 0
    this.cb.onSelect(n?.star ?? null)
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    // 力导向沉降后停止计算，只保留绘制（闪烁/交互），大幅降低 CPU
    if (this.sim.alpha()! > 0.015) this.sim.tick(1)
    if (this.camTarget) {
      this.cam.x += (this.camTarget.x - this.cam.x) * 0.08
      this.cam.y += (this.camTarget.y - this.cam.y) * 0.08
      this.cam.k += (this.camTarget.k - this.cam.k) * 0.08
      if (Math.abs(this.camTarget.x - this.cam.x) < 0.5) this.camTarget = null
    }
    this.draw(Date.now() / 1000)
  }

  private draw(t: number): void {
    const ctx = this.ctx
    const dpr = this.dpr
    const w = this.canvas.width / dpr
    const h = this.canvas.height / dpr
    ctx.save()
    ctx.scale(dpr, dpr)

    // 深空底（含银河/星尘，视差平铺）
    if (this.bg) {
      const px = -this.cam.x * 0.3 * this.cam.k
      const py = -this.cam.y * 0.3 * this.cam.k
      ctx.drawImage(this.bg, (px % w) - w, (py % h) - h, w * 3, h * 3)
    } else {
      ctx.fillStyle = '#080c1b'
      ctx.fillRect(0, 0, w, h)
    }

    ctx.globalCompositeOperation = 'lighter'

    // 星云辉光
    for (const hz of this.haze) {
      const hx = (hz.wx - this.cam.x) * this.cam.k + w / 2
      const hy = (hz.wy - this.cam.y) * this.cam.k + h / 2
      const r = hz.r * this.cam.k
      if (hx < -r || hx > w + r || hy < -r || hy > h + r) continue
      const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, Math.max(40, r))
      grad.addColorStop(0, colorWithAlpha(hz.color, 0.11))
      grad.addColorStop(0.7, colorWithAlpha(hz.color, 0.045))
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2)
    }

    // 连线
    for (const e of this.edges) {
      const a = this.byId.get(e.source as number)
      const b = this.byId.get(e.target as number)
      if (!a || !b || a.x === undefined || b.x === undefined) continue
      const sa = this.screenOf(a)
      const sb = this.screenOf(b)
      ctx.strokeStyle =
        e.kind === 'collision'
          ? 'rgba(255,110,110,0.42)'
          : e.kind === 'manual'
            ? 'rgba(255,205,130,0.42)'
            : 'rgba(150,175,255,0.22)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sa.x, sa.y)
      ctx.lineTo(sb.x, sb.y)
      ctx.stroke()
    }

    // 星
    for (const n of this.nodes) {
      const s = this.screenOf(n)
      if (s.x < -80 || s.x > w + 80 || s.y < -80 || s.y > h + 80) continue
      const sprite = this.spriteFor(n.color)
      const tw = 0.82 + 0.18 * Math.sin(t * 1.4 + n.phase)
      const size = (n.r * 7.5 + (this.highlightIds.has(n.id) ? 10 : 0)) * this.cam.k * tw
      ctx.globalAlpha = Math.min(1, 0.35 + n.bright * 0.75) * tw
      ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size)
      if (this.highlightIds.has(n.id)) {
        ctx.globalAlpha = 0.95
        ctx.drawImage(sprite, s.x - size / 2 - 4, s.y - size / 2 - 4, size + 8, size + 8)
      }
      if (n.spikes && this.cam.k > 0.55) {
        this.paintSpikes(ctx, s.x, s.y, size * 0.85, n.color, 0.4 * tw)
      }
      if (n.star.is_gem) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = 'rgba(255,209,102,0.85)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 6, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (this.multiSelected.has(n.id)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,213,128,0.95)'
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (n.id === this.selectedId) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(235,242,255,0.92)'
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // 亮星衍射芒：十字光晕
  private paintSpikes(g: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
    const len = Math.max(8, size * 0.75)
    g.save()
    g.globalCompositeOperation = 'lighter'
    g.lineWidth = 1
    for (const [dx, dy] of [
      [1, 0],
      [0, 1]
    ]) {
      const grad = g.createLinearGradient(x - dx * len, y - dy * len, x + dx * len, y + dy * len)
      grad.addColorStop(0, colorWithAlpha(color, 0))
      grad.addColorStop(0.5, colorWithAlpha(color, alpha))
      grad.addColorStop(1, colorWithAlpha(color, 0))
      g.strokeStyle = grad
      g.beginPath()
      g.moveTo(x - dx * len, y - dy * len)
      g.lineTo(x + dx * len, y + dy * len)
      g.stroke()
    }
    g.restore()
  }

  private spriteFor(color: string): HTMLCanvasElement {
    let sp = this.sprites.get(color)
    if (!sp) {
      sp = makeSprite(color)
      this.sprites.set(color, sp)
    }
    return sp
  }
}
