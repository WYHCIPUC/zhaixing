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
}

type Edge = SimulationLinkDatum<Node> & { kind: string }

export interface EngineCallbacks {
  onHover: (star: StarMapStar | null, sx: number, sy: number) => void
  onSelect: (star: StarMapStar | null) => void
  onMultiSelect: (ids: number[]) => void
}

const NEBULA_RADIUS = 320

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
  c.width = 64
  c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, colorWithAlpha(color, 1))
  grad.addColorStop(0.22, colorWithAlpha(color, 0.6))
  grad.addColorStop(0.45, colorWithAlpha(color, 0.35))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
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
  private raf = 0
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

    canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true
      this.dragMoved = false
      this.lastMouse = { x: e.clientX, y: e.clientY }
    })
    window.addEventListener('pointermove', (e) => {
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
    window.addEventListener('pointerup', () => {
      if (this.dragging && !this.dragMoved) this.handleClick()
      this.dragging = false
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.12 : 0.89
        const rect = this.canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const wx = (mx - rect.width / 2) / this.cam.k + this.cam.x
        const wy = (my - rect.height / 2) / this.cam.k + this.cam.y
        this.cam.k = Math.min(6, Math.max(0.3, this.cam.k * factor))
        this.cam.x = wx - (mx - rect.width / 2) / this.cam.k
        this.cam.y = wy - (my - rect.height / 2) / this.cam.k
        this.camTarget = null
      },
      { passive: false }
    )

    this.loop()
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.sim.stop()
  }

  setData(data: StarMapData): void {
    const nebIds = [...new Set(data.nebulae.map((n) => n.id))]
    const nebCenters = new Map<number, { x: number; y: number }>()
    nebIds.forEach((id, i) => {
      const angle = (i / Math.max(1, nebIds.length)) * Math.PI * 2
      nebCenters.set(id, { x: Math.cos(angle) * NEBULA_RADIUS, y: Math.sin(angle) * NEBULA_RADIUS })
    })

    const rand = mulberry32(20260827)
    this.nodes = data.stars.map((s) => {
      const len = Math.min(2.4, s.content.length / 90)
      const r = 1.7 + len + (s.favorite ? 1.3 : 0) + (s.is_gem ? 1.6 : 0)
      return {
        id: s.id,
        star: s,
        r,
        color: s.is_gem ? '#fbbf24' : (s.nebula_ids[0] !== undefined ? (data.nebulae.find((n) => n.id === s.nebula_ids[0])?.color ?? s.book_color) : s.book_color),
        phase: rand() * Math.PI * 2,
        bright: Math.min(1, 0.35 + s.revisit_count * 0.18 + (s.favorite ? 0.25 : 0)),
        x: (rand() - 0.5) * 900,
        y: (rand() - 0.5) * 900,
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
      .force('charge', forceManyBody<Node>().strength(-28))
      .force('collide', forceCollide<Node>((d) => d.r * 5))
      .force('x', forceX<Node>((d) => (d.star.nebula_ids[0] !== undefined ? (nebCenters.get(d.star.nebula_ids[0])?.x ?? 0) : 0)).strength((d) => (d.star.nebula_ids[0] !== undefined ? 0.08 : 0.015)))
      .force('y', forceY<Node>((d) => (d.star.nebula_ids[0] !== undefined ? (nebCenters.get(d.star.nebula_ids[0])?.y ?? 0) : 0)).strength((d) => (d.star.nebula_ids[0] !== undefined ? 0.08 : 0.015)))
      .alpha(1)
      .restart()

    this.buildBackground()
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

  // 把当前星空渲染成高清壁纸（用现有布局，不吃闪烁动画）
  renderWallpaper(width = 2560, height = 1440): string {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const g = c.getContext('2d')!
    g.fillStyle = '#faf5ec'
    g.fillRect(0, 0, width, height)

    if (this.nodes.length === 0) return c.toDataURL('image/png')
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
    const pad = 200
    const k = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))
    const ox = width / 2 - ((minX + maxX) / 2) * k
    const oy = height / 2 - ((minY + maxY) / 2) * k
    const sx = (n: Node): number => (n.x ?? 0) * k + ox
    const sy = (n: Node): number => (n.y ?? 0) * k + oy

    g.globalCompositeOperation = 'lighter'
    for (const e of this.edges) {
      const a = this.byId.get(e.source as number)
      const b = this.byId.get(e.target as number)
      if (!a || !b) continue
      g.strokeStyle =
        e.kind === 'collision'
          ? 'rgba(248,113,113,0.25)'
          : e.kind === 'manual'
            ? 'rgba(251,191,36,0.28)'
            : 'rgba(217,122,30,0.18)'
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(sx(a), sy(a))
      g.lineTo(sx(b), sy(b))
      g.stroke()
    }
    for (const n of this.nodes) {
      const size = n.r * 8 * Math.max(1, k * 0.55)
      g.globalAlpha = Math.min(1, 0.35 + n.bright * 0.75)
      g.drawImage(this.spriteFor(n.color), sx(n) - size / 2, sy(n) - size / 2, size, size)
    }
    g.globalCompositeOperation = 'source-over'
    g.font = "22px 'Microsoft YaHei UI', sans-serif"
    g.fillStyle = 'rgba(146,116,67,0.7)'
    g.fillText('✦ 摘星实录 · 我的阅读星空', 40, height - 36)
    return c.toDataURL('image/png')
  }

  private resize(): void {
    const parent = this.canvas.parentElement
    if (!parent) return
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = parent.clientWidth * dpr
    this.canvas.height = parent.clientHeight * dpr
    this.canvas.style.width = `${parent.clientWidth}px`
    this.canvas.style.height = `${parent.clientHeight}px`
    this.buildBackground()
  }

  private buildBackground(): void {
    const c = document.createElement('canvas')
    c.width = this.canvas.width
    c.height = this.canvas.height
    const g = c.getContext('2d')
    if (!g) return
    const rand = mulberry32(77)
    const w = c.width
    const h = c.height
    for (let i = 0; i < (w * h) / 6500; i++) {
      const x = rand() * w
      const y = rand() * h
      const r = rand() * 1.1 + 0.2
      const a = rand() * 0.35 + 0.06
      g.fillStyle = `rgba(196,148,74,${a})`
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    this.bg = c
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
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.width / dpr
    const h = this.canvas.height / dpr
    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    // 背景星尘（视差）
    if (this.bg) {
      const px = -this.cam.x * 0.35 * this.cam.k
      const py = -this.cam.y * 0.35 * this.cam.k
      ctx.globalAlpha = 0.8
      ctx.drawImage(this.bg, (px % w) - w, (py % h) - h, w * 3, h * 3)
      ctx.globalAlpha = 1
    }

    ctx.globalCompositeOperation = 'lighter'

    // 连线
    for (const e of this.edges) {
      const a = this.byId.get(e.source as number)
      const b = this.byId.get(e.target as number)
      if (!a || !b || a.x === undefined || b.x === undefined) continue
      const sa = this.screenOf(a)
      const sb = this.screenOf(b)
      ctx.strokeStyle =
        e.kind === 'collision'
          ? 'rgba(220,80,80,0.42)'
          : e.kind === 'manual'
            ? 'rgba(180,110,10,0.35)'
            : 'rgba(217,122,30,0.2)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(sa.x, sa.y)
      ctx.lineTo(sb.x, sb.y)
      ctx.stroke()
    }

    // 星
    for (const n of this.nodes) {
      const s = this.screenOf(n)
      if (s.x < -60 || s.x > w + 60 || s.y < -60 || s.y > h + 60) continue
      const sprite = this.spriteFor(n.color)
      const tw = 0.8 + 0.2 * Math.sin(t * 1.4 + n.phase)
      const size = (n.r * 7 + (this.highlightIds.has(n.id) ? 10 : 0)) * this.cam.k * tw
      ctx.globalAlpha = Math.min(1, 0.3 + n.bright * 0.8) * tw
      ctx.drawImage(sprite, s.x - size / 2, s.y - size / 2, size, size)
      if (this.highlightIds.has(n.id)) {
        ctx.globalAlpha = 0.9
        ctx.drawImage(sprite, s.x - size / 2 - 4, s.y - size / 2 - 4, size + 8, size + 8)
      }
      if (n.star.is_gem) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = 'rgba(180,110,10,0.9)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 6, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (this.multiSelected.has(n.id)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(217,122,30,1)'
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (n.id === this.selectedId) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(120,70,10,0.85)'
        ctx.beginPath()
        ctx.arc(s.x, s.y, n.r * this.cam.k + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
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
