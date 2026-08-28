import type { StarMapData, StarMapStar } from '@shared/types'

interface Node {
  id: number
  star: StarMapStar
  r: number
  color: string
  phase: number
  bright: number
  spikes: boolean
  x: number
  y: number
}

type Edge = { source: number; target: number; kind: string }

export interface EngineCallbacks {
  onHover: (star: StarMapStar | null, sx: number, sy: number) => void
  onSelect: (star: StarMapStar | null) => void
  onMultiSelect: (ids: number[]) => void
}

interface Core {
  wx: number
  wy: number
  mass: number
  spin: 1 | -1
}

interface Haze {
  wx: number
  wy: number
  r: number
  color: string
}

// ---------------- 物理常量（px / s 单位制，模拟真实引力体系） ----------------
const GRAVITY = 6.5 // G：引力常数
const SOFTENING = 26 // ε：软化项，避免近距离奇点（真实宇宙中恒星间距远大于恒星半径）
const PHYSICS_DT = 1 / 30 // 物理定步长 30Hz（与渲染帧率解耦）
const BOUNDARY = 2600 // 软边界：逃逸的星会被极微弱的潮汐拉回
const CORE_SOFTENING = 70 // 星云核心（超大质量体）的软化距离

// 星云辉光色板
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
  const tint = mixWithWhite(color, 0.45)
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.14, colorWithAlpha(tint, 0.85))
  grad.addColorStop(0.32, colorWithAlpha(tint, 0.3))
  grad.addColorStop(0.6, colorWithAlpha(tint, 0.07))
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 96, 96)
  return c
}

// 恒星色温：真实照片里的星色是白色基调上的微妙色偏，不是饱和色块
function mixWithWhite(hex: string, t: number): string {
  if (!hex.startsWith('#')) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const gg = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const m = (c: number): number => Math.round(c + (255 - c) * t)
  return `rgb(${m(r)},${m(gg)},${m(b)})`
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
  private byId = new Map<number, number>() // star id -> 物理数组下标
  private cb: EngineCallbacks
  private ro: ResizeObserver

  // ---- N 体物理状态（SoA 结构，Float32 便于 JIT）----
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private ax = new Float32Array(0)
  private ay = new Float32Array(0)
  private mass = new Float32Array(0)
  private cores: Core[] = []
  private physicsAcc = 0
  private lastTime = 0
  // v5 §7：reduced-motion 时引擎停在单帧（无闪烁/漂移/流星）；§0.5-④：偶发流星
  private reduced = false
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private meteor: { x: number; y: number; dx: number; dy: number; born: number } | null = null
  private nextMeteorAt = performance.now() + 18000 + Math.random() * 20000
  private tickParity = false
  private hazeTimer: ReturnType<typeof setInterval> | null = null

  constructor(canvas: HTMLCanvasElement, cb: EngineCallbacks) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.cb = cb

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas.parentElement ?? canvas)
    this.resize()
    // 触屏：禁掉浏览器默认手势（滚动/系统缩放），单指拖动才能平移星图
    canvas.style.touchAction = 'none'

    // 双指捏合缩放：pointer 级跟踪，两指走 pinch，松回一指恢复拖动/点选
    const pointers = new Map<number, { x: number; y: number }>()
    let pinchDist = 0

    const zoomAt = (mx: number, my: number, factor: number): void => {
      const rect = canvas.getBoundingClientRect()
      const wx = (mx - rect.width / 2) / this.cam.k + this.cam.x
      const wy = (my - rect.height / 2) / this.cam.k + this.cam.y
      this.cam.k = Math.min(6, Math.max(0.25, this.cam.k * factor))
      this.cam.x = wx - (mx - rect.width / 2) / this.cam.k
      this.cam.y = wy - (my - rect.height / 2) / this.cam.k
      this.camTarget = null
      if (this.reduced) this.draw(performance.now() / 1000)
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
        if (this.reduced) this.draw(performance.now() / 1000)
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
        if (this.reduced) {
          this.draw(performance.now() / 1000)
        } else {
          this.lastTime = performance.now()
          this.loop()
        }
      }
    })

    this.reduced = this.motionQuery.matches
    this.motionQuery.addEventListener('change', () => {
      this.reduced = this.motionQuery.matches
      cancelAnimationFrame(this.raf)
      if (this.reduced) {
        this.draw(performance.now() / 1000)
      } else {
        this.lastTime = performance.now()
        this.loop()
      }
    })

    if (this.reduced) {
      this.draw(performance.now() / 1000)
    } else {
      this.lastTime = performance.now()
      this.loop()
    }
  }

  destroy(): void {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    if (this.hazeTimer) clearInterval(this.hazeTimer)
  }

  setData(data: StarMapData): void {
    // 星云核心：黄金角螺旋布置，质量 ∝ 成员数（相当于星系中心的超大质量体）
    const nebInfo = data.nebulae.map((n) => ({ id: n.id, count: n.star_count ?? 0 }))
    const cores: Core[] = []
    const coreOf = new Map<number, Core>()
    nebInfo.forEach((n, i) => {
      const radius = 160 + Math.sqrt(n.count) * 15
      const angle = i * 2.39996 + 0.6
      const core: Core = {
        wx: Math.cos(angle) * radius,
        wy: Math.sin(angle) * radius * 0.85,
        mass: 60 + n.count * 26,
        spin: i % 2 === 0 ? 1 : -1 // 每个星系自转方向不同
      }
      cores.push(core)
      coreOf.set(n.id, core)
    })
    const freeCount = data.stars.filter((s) => s.nebula_ids[0] === undefined).length
    const freeCore: Core = { wx: 0, wy: 0, mass: freeCount * 10, spin: 1 }
    if (freeCount > 0) cores.push(freeCore)
    this.cores = cores

    // 初始化恒星：位置在核心附近，带切向轨道速度（v = √(GM/r)，像行星绕日）
    const rand = mulberry32(20260827)
    const n = data.stars.length
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.ax = new Float32Array(n)
    this.ay = new Float32Array(n)
    this.mass = new Float32Array(n)
    this.nodes = data.stars.map((s, i) => {
      const len = Math.min(2.4, s.content.length / 90)
      // 星等按幂律分布：绝大多数是暗小微星，少数是亮星（真实星空的亮度结构）
      const pr = Math.pow(rand(), 2.4)
      const r = 0.9 + pr * 4.6 + (s.favorite ? 1.1 : 0) + (s.is_gem ? 2.4 : 0)
      const core = s.nebula_ids[0] !== undefined ? (coreOf.get(s.nebula_ids[0]) ?? freeCore) : freeCore
      const dist = 60 + rand() * (60 + Math.sqrt(core.mass) * 3.2)
      const ang = rand() * Math.PI * 2
      const orbitalV = Math.sqrt((GRAVITY * core.mass) / Math.max(60, dist)) * (0.85 + rand() * 0.3)
      this.px[i] = core.wx + Math.cos(ang) * dist
      this.py[i] = core.wy + Math.sin(ang) * dist
      // 切向速度 → 进入稳定轨道；每个星系按自转方向旋转
      this.vx[i] = -Math.sin(ang) * orbitalV * core.spin + (rand() - 0.5) * 2
      this.vy[i] = Math.cos(ang) * orbitalV * core.spin + (rand() - 0.5) * 2
      this.mass[i] = 1 + Math.min(5, s.content.length / 380) + (s.favorite ? 2 : 0) + (s.is_gem ? 6 : 0) // 镇星之宝是本星域的引力核心
      return {
        id: s.id,
        star: s,
        r,
        color: s.is_gem
          ? '#ffd166'
          : s.nebula_ids[0] !== undefined
            ? (data.nebulae.find((x) => x.id === s.nebula_ids[0])?.color ?? s.book_color)
            : s.book_color,
        phase: rand() * Math.PI * 2,
        bright: Math.min(1, 0.16 + pr * 0.5 + s.revisit_count * 0.15 + (s.favorite ? 0.25 : 0)),
        spikes: r >= 3.4 || Boolean(s.is_gem),
        x: this.px[i],
        y: this.py[i]
      }
    })
    // 恒星色温：莫兰迪书色向白混合 35%，只留微妙色偏（真实星色的呈现方式）
    for (const n of this.nodes) {
      if (!n.star.is_gem) n.color = mixWithWhite(n.color, 0.35)
    }
    this.byId = new Map(this.nodes.map((n, i) => [n.id, i]))

    this.edges = data.links
      .map((l) => ({ source: l.from_highlight, target: l.to_highlight, kind: l.kind }))
      .filter((e) => this.byId.has(e.source as number) && this.byId.has(e.target as number))

    this.computeHaze()
    if (this.hazeTimer) clearInterval(this.hazeTimer)
    this.hazeTimer = setInterval(() => this.computeHaze(), 15000)
    this.buildBackground()
  }

  private nebulaSprites = new Map<number, HTMLCanvasElement>()

  // 一次性预渲染不规则星云气团：随机游走云絮 + 电离亮芯 + 暗尘埃 + 内嵌年轻亮星
  private nebulaSpriteFor(hi: number, color: string): HTMLCanvasElement {
    const cached = this.nebulaSprites.get(hi)
    if (cached) return cached
    const size = 640
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const g = c.getContext('2d')!
    const rand = mulberry32(9137 + hi * 977)
    const cx = size / 2
    const cy = size / 2
    const accent = HAZE_PALETTE[(hi + 3) % HAZE_PALETTE.length]
    // 主体气团：随机游走云絮
    let x = cx
    let y = cy
    for (let i = 0; i < 46; i++) {
      const ang = rand() * Math.PI * 2
      const step = 10 + rand() * 46
      x += Math.cos(ang) * step
      y += Math.sin(ang) * step * 0.7
      x += (cx - x) * 0.06
      y += (cy - y) * 0.06
      const dist = Math.hypot(x - cx, y - cy) / (size * 0.42)
      const r = (16 + rand() * 60) * (1 - Math.min(1, dist) * 0.7) + 10
      const grad = g.createRadialGradient(x, y, 0, x, y, Math.max(12, r))
      grad.addColorStop(0, colorWithAlpha(color, 0.05 + rand() * 0.09))
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // 电离亮芯
    for (let i = 0; i < 16; i++) {
      const ang = rand() * Math.PI * 2
      const dist = rand() * size * 0.16
      const x = cx + Math.cos(ang) * dist
      const y = cy + Math.sin(ang) * dist
      const r = 8 + rand() * 26
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, colorWithAlpha(accent, 0.06 + rand() * 0.07))
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // 暗尘埃带
    for (let i = 0; i < 10; i++) {
      const x = cx + (rand() - 0.5) * size * 0.5
      const y = cy + (rand() - 0.5) * size * 0.4
      const r = 14 + rand() * 42
      const grad = g.createRadialGradient(x, y, 0, x, y, r)
      grad.addColorStop(0, `rgba(4,5,12,${0.1 + rand() * 0.16})`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // 内嵌年轻亮星
    for (let i = 0; i < 12; i++) {
      const x = cx + (rand() - 0.5) * size * 0.6
      const y = cy + (rand() - 0.5) * size * 0.6
      g.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.5})`
      g.beginPath()
      g.arc(x, y, 0.6 + rand() * 1.1, 0, Math.PI * 2)
      g.fill()
    }
    this.nebulaSprites.set(hi, c)
    return c
  }

  // 辉光跟随星系实际聚拢位置演化
  private computeHaze(): void {
    const byCore = new Map<string, { sx: number; sy: number; n: number }>()
    for (let i = 0; i < this.nodes.length; i++) {
      let best = ''
      let bestD = Infinity
      for (const c of this.cores) {
        const d = Math.hypot(this.px[i] - c.wx, this.py[i] - c.wy)
        if (d < bestD) {
          bestD = d
          best = `${c.wx},${c.wy}`
        }
      }
      if (!byCore.has(best)) byCore.set(best, { sx: 0, sy: 0, n: 0 })
      const e = byCore.get(best)!
      e.sx += this.px[i]
      e.sy += this.py[i]
      e.n++
    }
    this.haze = []
    let i = 0
    for (const [, e] of byCore) {
      if (e.n < 3) continue
      this.haze.push({
        wx: e.sx / e.n,
        wy: e.sy / e.n,
        r: Math.max(90, 26 * Math.sqrt(e.n)),
        color: HAZE_PALETTE[i % HAZE_PALETTE.length]
      })
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
    const idx = this.byId.get(id)
    if (idx === undefined) return
    this.camTarget = { x: this.px[idx], y: this.py[idx], k: Math.max(1.6, this.cam.k) }
    if (this.reduced) {
      this.cam = { ...this.camTarget }
      this.camTarget = null
      this.draw(performance.now() / 1000)
    }
  }

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
      for (let i = 0; i < this.nodes.length; i++) {
        minX = Math.min(minX, this.px[i])
        maxX = Math.max(maxX, this.px[i])
        minY = Math.min(minY, this.py[i])
        maxY = Math.max(maxY, this.py[i])
      }
      const pad = 240
      const k = Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY))
      const ox = width / 2 - ((minX + maxX) / 2) * k
      const oy = height / 2 - ((minY + maxY) / 2) * k

      g.globalCompositeOperation = 'lighter'
      for (const h of this.haze) {
        const r = h.r * k * 1.3
        const hx = h.wx * k + ox
        const hy = h.wy * k + oy
        const grad = g.createRadialGradient(hx, hy, 0, hx, hy, Math.max(60, r))
        grad.addColorStop(0, colorWithAlpha(h.color, 0.15))
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = grad
        g.fillRect(hx - r, hy - r, r * 2, r * 2)
      }
      for (const e of this.edges) {
        const ai = this.byId.get(e.source as number)
        const bi = this.byId.get(e.target as number)
        if (ai === undefined || bi === undefined) continue
        g.strokeStyle =
          e.kind === 'collision'
            ? 'rgba(255,120,120,0.4)'
            : e.kind === 'manual'
              ? 'rgba(255,205,130,0.4)'
              : 'rgba(150,175,255,0.22)'
        g.lineWidth = 1.2
        g.beginPath()
        g.moveTo(this.px[ai] * k + ox, this.py[ai] * k + oy)
        g.lineTo(this.px[bi] * k + ox, this.py[bi] * k + oy)
        g.stroke()
      }
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i]
        const size = n.r * 9 * Math.max(1, k * 0.55)
        g.globalAlpha = Math.min(1, 0.4 + n.bright * 0.7)
        const x = this.px[i] * k + ox
        const y = this.py[i] * k + oy
        g.drawImage(this.spriteFor(n.color), x - size / 2, y - size / 2, size, size)
        if (n.spikes) this.paintSpikes(g, x, y, size * 0.85, n.color, 0.55)
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
    const grad = g.createLinearGradient(0, 0, w * 0.4, h)
    grad.addColorStop(0, '#0c1226')
    grad.addColorStop(0.55, '#080c1b')
    grad.addColorStop(1, '#05070f')
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)

    // 深空远景色斑（星系辉光留下的微妙色彩变化）
    const tints = ['rgba(30,48,110,0.3)', 'rgba(58,32,96,0.24)', 'rgba(14,52,74,0.22)', 'rgba(74,30,52,0.18)']
    for (let i = 0; i < 7; i++) {
      const x = rand() * w
      const y = rand() * h
      const r = (rand() * 0.3 + 0.18) * Math.max(w, h)
      const grad3 = g.createRadialGradient(x, y, 0, x, y, r)
      grad3.addColorStop(0, tints[i % tints.length])
      grad3.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad3
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }

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
    // 尘埃暗裂缝（银河中央的暗带——真实照片的标志性特征）
    for (let i = 0; i < Math.floor(46 * scale); i++) {
      const t = (rand() - 0.5) * len
      const off = ((rand() + rand() + rand()) / 1.5 - 1) * band * 0.28
      const r = (rand() * 30 + 8) * scale
      const gradD = g.createRadialGradient(t, off, 0, t, off, r)
      gradD.addColorStop(0, 'rgba(3,4,10,' + (rand() * 0.16 + 0.1) + ')')
      gradD.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gradD
      g.fillRect(t - r, off - r, r * 2, r * 2)
    }
    g.restore()

    // 远景背景星系（哈勃深空场里的小小椭圆光斑）
    for (let i = 0; i < 26; i++) {
      const x = rand() * w
      const y = rand() * h
      const r = (rand() * 5 + 2) * scale
      const a = rand() * 0.16 + 0.05
      g.save()
      g.translate(x, y)
      g.rotate(rand() * Math.PI)
      g.scale(1, 0.45 + rand() * 0.4)
      const gradG = g.createRadialGradient(0, 0, 0, 0, 0, r)
      gradG.addColorStop(0, `rgba(235,225,205,${a})`)
      gradG.addColorStop(0.7, `rgba(190,200,235,${a * 0.5})`)
      gradG.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gradG
      g.beginPath()
      g.arc(0, 0, r, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }

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

    // 暗角
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(2,4,12,0.55)')
    g.fillStyle = vig
    g.fillRect(0, 0, w, h)

    // 传感噪声（深空照片的胶片颗粒感）
    const grainCount = Math.floor((w * h) / (1400 * scale))
    for (let i = 0; i < grainCount; i++) {
      const x = rand() * w
      const y = rand() * h
      g.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '0,0,0'},${rand() * 0.05})`
      g.fillRect(x, y, scale, scale)
    }
  }

  private screenX(i: number): number {
    return (this.px[i] - this.cam.x) * this.cam.k + this.canvas.width / this.dpr / 2
  }

  private screenY(i: number): number {
    return (this.py[i] - this.cam.y) * this.cam.k + this.canvas.height / this.dpr / 2
  }

  private nodeAt(mx: number, my: number): number {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < this.nodes.length; i++) {
      const dx = this.screenX(i) - mx
      const dy = this.screenY(i) - my
      const hit = (this.nodes[i].r * this.cam.k + 7) ** 2
      const d = dx * dx + dy * dy
      if (d < hit && d < bestD) {
        best = i
        bestD = d
      }
    }
    return best
  }

  private handleHover(mx: number, my: number): void {
    const idx = this.nodeAt(mx, my)
    const prev = this.hoverId
    this.hoverId = idx >= 0 ? this.nodes[idx].id : 0
    this.canvas.style.cursor = idx >= 0 ? 'pointer' : 'grab'
    if (prev !== this.hoverId || idx >= 0) {
      this.cb.onHover(idx >= 0 ? this.nodes[idx].star : null, mx, my)
    }
  }

  private handleClick(): void {
    const rect = this.canvas.getBoundingClientRect()
    const idx = this.nodeAt(this.lastMouse.x - rect.left, this.lastMouse.y - rect.top)
    if (this.selectMode) {
      if (idx >= 0) {
        const id = this.nodes[idx].id
        if (this.multiSelected.has(id)) this.multiSelected.delete(id)
        else this.multiSelected.add(id)
        this.cb.onMultiSelect([...this.multiSelected])
      }
      return
    }
    this.selectedId = idx >= 0 ? this.nodes[idx].id : 0
    this.cb.onSelect(idx >= 0 ? this.nodes[idx].star : null)
  }

  // ---------- N 体物理：F = G·m₁m₂/(d²+ε²)^{3/2}，半隐式欧拉积分 ----------
  private physicsStep(dt: number): void {
    const n = this.nodes.length
    if (n === 0) return
    this.ax.fill(0)
    this.ay.fill(0)
    const g = GRAVITY
    const e2 = SOFTENING * SOFTENING

    // 星云核心的引力（星系中心的超大质量体）
    const ce2 = CORE_SOFTENING * CORE_SOFTENING
    for (const c of this.cores) {
      for (let i = 0; i < n; i++) {
        const dx = c.wx - this.px[i]
        const dy = c.wy - this.py[i]
        const d2 = dx * dx + dy * dy + ce2
        const inv = (g * c.mass) / (d2 * Math.sqrt(d2))
        this.ax[i] += dx * inv
        this.ay[i] += dy * inv
      }
    }

    // 星与星的互相摄动：质量虽小，但会真实地改变彼此的轨迹
    this.tickParity = !this.tickParity
    const skipPairs = n > 2600 && this.tickParity
    for (let i = 0; i < n; i++) {
      const pxi = this.px[i]
      const pyi = this.py[i]
      const mi = this.mass[i]
      const jStart = skipPairs && i % 2 === 0 ? i + 2 : i + 1
      for (let j = jStart; j < n; j++) {
        const dx = this.px[j] - pxi
        const dy = this.py[j] - pyi
        const d2 = dx * dx + dy * dy + e2
        const inv = g / (d2 * Math.sqrt(d2))
        const fj = inv * this.mass[j]
        const fi = inv * this.mass[i]
        this.ax[i] += dx * fj
        this.ay[i] += dy * fj
        this.ax[j] -= dx * fi
        this.ay[j] -= dy * fi
      }
    }

    // 软边界：极微弱的向心潮汐，防止星永久逃逸
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(this.px[i], this.py[i])
      if (d > BOUNDARY) {
        const pull = ((d - BOUNDARY) / BOUNDARY) * 2.2
        this.ax[i] -= (this.px[i] / d) * pull
        this.ay[i] -= (this.py[i] / d) * pull
      }
    }

    // 半隐式欧拉
    for (let i = 0; i < n; i++) {
      this.vx[i] += this.ax[i] * dt
      this.vy[i] += this.ay[i] * dt
      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt
      this.nodes[i].x = this.px[i]
      this.nodes[i].y = this.py[i]
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop)
    const now = performance.now()
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now
    if (dt > 0.1) dt = 0.1
    this.physicsAcc += dt
    let steps = 0
    while (this.physicsAcc >= PHYSICS_DT && steps < 2) {
      this.physicsStep(PHYSICS_DT)
      this.physicsAcc -= PHYSICS_DT
      steps++
    }
    if (this.physicsAcc > PHYSICS_DT * 3) this.physicsAcc = 0
    if (this.camTarget) {
      this.cam.x += (this.camTarget.x - this.cam.x) * 0.08
      this.cam.y += (this.camTarget.y - this.cam.y) * 0.08
      this.cam.k += (this.camTarget.k - this.cam.k) * 0.08
      if (Math.abs(this.camTarget.x - this.cam.x) < 0.5) this.camTarget = null
    }
    // 偶发流星：每 25–60s 一颗划过画布深处（v5 §0.5-④），reduced-motion 下循环不跑、永不生成
    if (!this.meteor && performance.now() >= this.nextMeteorAt) {
      const w = this.canvas.width / this.dpr
      const h = this.canvas.height / this.dpr
      const ang = Math.PI * (0.7 + Math.random() * 0.22)
      this.meteor = {
        x: w * (0.2 + Math.random() * 0.6),
        y: h * (0.05 + Math.random() * 0.3),
        dx: Math.cos(ang),
        dy: Math.sin(ang),
        born: performance.now()
      }
      this.nextMeteorAt = performance.now() + 25000 + Math.random() * 35000
    }
    this.draw(now / 1000)
  }

  private draw(t: number): void {
    const ctx = this.ctx
    const dpr = this.dpr
    const w = this.canvas.width / dpr
    const h = this.canvas.height / dpr
    ctx.save()
    ctx.scale(dpr, dpr)

    if (this.bg) {
      const px = -this.cam.x * 0.3 * this.cam.k
      const py = -this.cam.y * 0.3 * this.cam.k
      ctx.drawImage(this.bg, (px % w) - w, (py % h) - h, w * 3, h * 3)
    } else {
      ctx.fillStyle = '#080c1b'
      ctx.fillRect(0, 0, w, h)
    }

    ctx.globalCompositeOperation = 'lighter'

    // 星云辉光：多层不规则气团（像真实发射星云的纤维状结构）
    for (let hi = 0; hi < this.haze.length; hi++) {
      const hz = this.haze[hi]
      const hx = (hz.wx - this.cam.x) * this.cam.k + w / 2
      const hy = (hz.wy - this.cam.y) * this.cam.k + h / 2
      // ±2% 极慢呼吸（v5 §0.5-④）；气团用预渲染精灵，形态不规则如真实星云
      const base = hz.r * this.cam.k * (this.reduced ? 1 : 1 + 0.02 * Math.sin(t * 0.5 + hi * 1.7))
      if (hx < -base * 2.4 || hx > w + base * 2.4 || hy < -base * 2.4 || hy > h + base * 2.4) continue
      const spr = this.nebulaSpriteFor(hi, hz.color)
      const w2 = base * 4.6
      ctx.globalAlpha = 0.9
      ctx.drawImage(spr, hx - w2 / 2, hy - w2 / 2, w2, w2)
    }
    ctx.globalAlpha = 1

    // 偶发流星：900ms 划过、淡入淡出（画布深处的「闪念」）
    if (this.meteor) {
      const p = (t * 1000 - this.meteor.born) / 900
      if (p >= 1) {
        this.meteor = null
      } else {
        const travel = Math.min(w, h) * 0.3
        const mhx = this.meteor.x + this.meteor.dx * travel * p
        const mhy = this.meteor.y + this.meteor.dy * travel * p
        const tail = travel * 0.16
        const a = Math.sin(Math.PI * Math.max(0, p))
        const grad = ctx.createLinearGradient(
          mhx,
          mhy,
          mhx - this.meteor.dx * tail,
          mhy - this.meteor.dy * tail
        )
        grad.addColorStop(0, `rgba(255,244,214,${0.75 * a})`)
        grad.addColorStop(1, 'rgba(255,244,214,0)')
        ctx.globalAlpha = 1
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(mhx, mhy)
        ctx.lineTo(mhx - this.meteor.dx * tail, mhy - this.meteor.dy * tail)
        ctx.stroke()
      }
    }

    // 共鸣星桥：随机相位呼吸——一条条思绪时隐时现（v5 §0.5-④）
    for (const e of this.edges) {
      const ai = this.byId.get(e.source as number)
      const bi = this.byId.get(e.target as number)
      if (ai === undefined || bi === undefined) continue
      const base = e.kind === 'collision' ? 0.32 : e.kind === 'manual' ? 0.34 : 0.15
      if (this.reduced) {
        ctx.globalAlpha = base
      } else {
        const seed = (e.source as number) * 7919 + (e.target as number) * 104729
        const period = 6 + (seed % 41) / 10 // 6–10s，各不相同
        const phase = (seed % 628) / 100
        ctx.globalAlpha = Math.max(0.03, base * (0.55 + 0.45 * Math.sin((t * Math.PI * 2) / period + phase)))
      }
      ctx.strokeStyle =
        e.kind === 'collision'
          ? 'rgb(255,110,110)'
          : e.kind === 'manual'
            ? 'rgb(255,205,130)'
            : 'rgb(150,175,255)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(this.screenX(ai), this.screenY(ai))
      ctx.lineTo(this.screenX(bi), this.screenY(bi))
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 星
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]
      const sx = this.screenX(i)
      const sy = this.screenY(i)
      if (sx < -80 || sx > w + 80 || sy < -80 || sy > h + 80) continue
      if (n.star.is_gem) continue // 镇星之宝在恒星级渲染层单独绘制
      const tw = 0.82 + 0.18 * Math.sin(t * 1.4 + n.phase)
      if (n.r < 2.2) {
        // 暗小微星：实心小点（真实照片中绝大多数星是 1px 亮斑）
        const rr = Math.max(0.5, n.r * this.cam.k) * (0.85 + 0.15 * tw)
        ctx.globalAlpha = Math.min(1, 0.22 + n.bright * 0.62) * tw
        ctx.fillStyle = n.color
        ctx.beginPath()
        ctx.arc(sx, sy, rr, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const sprite = this.spriteFor(n.color)
        const size = (n.r * 7.5 + (this.highlightIds.has(n.id) ? 10 : 0)) * this.cam.k * tw
        ctx.globalAlpha = Math.min(1, 0.3 + n.bright * 0.75) * tw
        ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size)
        if (this.highlightIds.has(n.id)) {
          ctx.globalAlpha = 0.95
          ctx.drawImage(sprite, sx - size / 2 - 4, sy - size / 2 - 4, size + 8, size + 8)
        }
        if (n.spikes && this.cam.k > 0.55) {
          this.paintSpikes(ctx, sx, sy, size * 0.85, n.color, 0.4 * tw)
        }
      }
      if (this.multiSelected.has(n.id)) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(255,213,128,0.95)'
        ctx.beginPath()
        ctx.arc(sx, sy, n.r * this.cam.k + 5, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (n.id === this.selectedId) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = 'rgba(235,242,255,0.92)'
        ctx.beginPath()
        ctx.arc(sx, sy, n.r * this.cam.k + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // 镇星之宝：恒星级渲染——呼吸光晕 + 长衍射芒，本星域最亮的天体
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]
      if (!n.star.is_gem) continue
      const sx = this.screenX(i)
      const sy = this.screenY(i)
      if (sx < -180 || sx > w + 180 || sy < -180 || sy > h + 180) continue
      const base = (n.r * 3.4 + 10) * Math.max(1, this.cam.k)
      const pulse = 1 + 0.09 * Math.sin(t * 0.9 + n.phase)
      // 呼吸外晕
      const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, base * 3.4 * pulse)
      halo.addColorStop(0, 'rgba(255,228,150,0.3)')
      halo.addColorStop(0.4, 'rgba(255,200,90,0.1)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.fillRect(sx - base * 3.4 * pulse, sy - base * 3.4 * pulse, base * 6.8 * pulse, base * 6.8 * pulse)
      // 恒星主体
      const sprite = this.spriteFor('#ffd166')
      const size = base * 2.3 * pulse
      ctx.globalAlpha = 1
      ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size)
      // 衍射芒：4 长 + 4 短斜，缓慢呼吸
      const rayA = 0.55 + 0.15 * Math.sin(t * 1.1 + n.phase)
      this.paintSpikes(ctx, sx, sy, base * 2.6, '#ffe8b0', rayA)
      this.paintSpikes(ctx, sx, sy, base * 1.5, '#ffe8b0', rayA * 0.6, Math.PI / 4)
      // 镜头横向溢光（亮星过曝的水平 streak）
      const streak = ctx.createLinearGradient(sx - base * 3.2, sy, sx + base * 3.2, sy)
      streak.addColorStop(0, 'rgba(255,228,160,0)')
      streak.addColorStop(0.5, `rgba(255,236,190,${0.24 + 0.1 * Math.sin(t * 1.3)})`)
      streak.addColorStop(1, 'rgba(255,228,160,0)')
      ctx.fillStyle = streak
      ctx.fillRect(sx - base * 3.2, sy - 0.9, base * 6.4, 1.8)
      // 选中/圈选环
      if (n.id === this.selectedId || this.multiSelected.has(n.id)) {
        ctx.strokeStyle = 'rgba(255,235,180,0.95)'
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.arc(sx, sy, base * 1.25, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // 亮星衍射芒：十字光晕
  private paintSpikes(
    g: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    alpha: number,
    rotation = 0
  ): void {
    const len = Math.max(8, size * 0.75)
    g.save()
    g.translate(x, y)
    if (rotation) g.rotate(rotation)
    g.globalCompositeOperation = 'lighter'
    g.lineWidth = 1
    for (const [dx, dy] of [
      [1, 0],
      [0, 1]
    ]) {
      const grad = g.createLinearGradient(-dx * len, -dy * len, dx * len, dy * len)
      grad.addColorStop(0, colorWithAlpha(color, 0))
      grad.addColorStop(0.5, colorWithAlpha(color, alpha))
      grad.addColorStop(1, colorWithAlpha(color, 0))
      g.strokeStyle = grad
      g.beginPath()
      g.moveTo(-dx * len, -dy * len)
      g.lineTo(dx * len, dy * len)
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
