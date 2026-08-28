// 对齐 NASA 深空照片质感：白热星点 + 紧凑光晕 + 不规则星云气团 + 背景星系 + 传感噪声
// （保留协作者的 reduced-motion 与偶发流星逻辑）
const fs = require('fs')

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  let miss = []
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
    else miss.push(a.slice(0, 60))
  }
  fs.writeFileSync(file, s)
  console.log(file, miss.length ? 'MISS: ' + miss.join(' | ') : 'OK')
}

// ---------- 引擎：写实化渲染 ----------
patch('src/renderer/src/starfield/engine.ts', [
  // 1. 星点精灵：更白、更紧（去卡通光球感）
  [
    `function makeSprite(color: string): HTMLCanvasElement {
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
}`,
    `function makeSprite(color: string): HTMLCanvasElement {
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
  return \`rgb(\${m(r)},\${m(gg)},\${m(b)})\`
}`
  ],
  // 2. 星色整体向白偏移（去糖果感）
  [
    '    this.byId = new Map(this.nodes.map((n, i) => [n.id, i]))',
    `    // 恒星色温：莫兰迪书色向白混合 35%，只留微妙色偏（真实星色的呈现方式）
    for (const n of this.nodes) {
      if (!n.star.is_gem) n.color = mixWithWhite(n.color, 0.35)
    }
    this.byId = new Map(this.nodes.map((n, i) => [n.id, i]))`
  ],
  // 3. 星云：预渲染不规则气团精灵（纤维状 + 电离亮芯 + 暗尘埃 + 内嵌亮星）
  [
    `  // 辉光跟随星系实际聚拢位置演化
  private computeHaze(): void {`,
    `  private nebulaSprites = new Map<number, HTMLCanvasElement>()

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
      grad.addColorStop(0, \`rgba(4,5,12,\${0.1 + rand() * 0.16})\`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    // 内嵌年轻亮星
    for (let i = 0; i < 12; i++) {
      const x = cx + (rand() - 0.5) * size * 0.6
      const y = cy + (rand() - 0.5) * size * 0.6
      g.fillStyle = \`rgba(255,255,255,\${0.3 + rand() * 0.5})\`
      g.beginPath()
      g.arc(x, y, 0.6 + rand() * 1.1, 0, Math.PI * 2)
      g.fill()
    }
    this.nebulaSprites.set(hi, c)
    return c
  }

  // 辉光跟随星系实际聚拢位置演化
  private computeHaze(): void {`
  ],
  // 4. 绘制星云改用预渲染精灵
  [
    `      // ±2% 极慢呼吸（v5 §0.5-④）
      const base = hz.r * this.cam.k * (this.reduced ? 1 : 1 + 0.02 * Math.sin(t * 0.5 + hi * 1.7))
      if (hx < -base * 2 || hx > w + base * 2 || hy < -base * 2 || hy > h + base * 2) continue
      const jr = mulberry32(Math.floor(hz.wx * 7 + hz.wy * 13 + hi * 101))
      for (let b = 0; b < 4; b++) {
        const ox = (jr() - 0.5) * base * 0.9
        const oy = (jr() - 0.5) * base * 0.7
        const r = base * (0.45 + jr() * 0.5)
        const col = b === 3 ? HAZE_PALETTE[(hi + 3) % HAZE_PALETTE.length] : hz.color
        const grad = ctx.createRadialGradient(hx + ox, hy + oy, 0, hx + ox, hy + oy, Math.max(40, r))
        grad.addColorStop(0, colorWithAlpha(col, b === 0 ? 0.085 : 0.05))
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.fillRect(hx + ox - r, hy + oy - r, r * 2, r * 2)
      }
    }`,
    `      // ±2% 极慢呼吸（v5 §0.5-④）；气团用预渲染精灵，形态不规则如真实星云
      const base = hz.r * this.cam.k * (this.reduced ? 1 : 1 + 0.02 * Math.sin(t * 0.5 + hi * 1.7))
      if (hx < -base * 2.4 || hx > w + base * 2.4 || hy < -base * 2.4 || hy > h + base * 2.4) continue
      const spr = this.nebulaSpriteFor(hi, hz.color)
      const w2 = base * 4.6
      ctx.globalAlpha = 0.9
      ctx.drawImage(spr, hx - w2 / 2, hy - w2 / 2, w2, w2)
    }
    ctx.globalAlpha = 1`
  ],
  // 5. 连线更含蓄（真实照片里没有线，这是功能元素，压到最低存在感）
  [
    "      const base = e.kind === 'collision' ? 0.4 : e.kind === 'manual' ? 0.42 : 0.22",
    "      const base = e.kind === 'collision' ? 0.32 : e.kind === 'manual' ? 0.34 : 0.15"
  ],
  // 6. 背景加远景背景星系 + 传感噪声（哈勃深空场的标志）
  [
    `    // 全天散布星尘（三层色温）`,
    `    // 远景背景星系（哈勃深空场里的小小椭圆光斑）
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
      gradG.addColorStop(0, \`rgba(235,225,205,\${a})\`)
      gradG.addColorStop(0.7, \`rgba(190,200,235,\${a * 0.5})\`)
      gradG.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = gradG
      g.beginPath()
      g.arc(0, 0, r, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }

    // 全天散布星尘（三层色温）`
  ],
  [
    `    // 暗角
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(2,4,12,0.55)')
    g.fillStyle = vig
    g.fillRect(0, 0, w, h)
  }`,
    `    // 暗角
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
      g.fillStyle = \`rgba(\${rand() > 0.5 ? '255,255,255' : '0,0,0'},\${rand() * 0.05})\`
      g.fillRect(x, y, scale, scale)
    }
  }`
  ],
  // 7. 清理主循环里已失效的 gem 圆圈死代码
  [
    `      if (n.star.is_gem) {
        ctx.globalAlpha = 0.9
        ctx.strokeStyle = 'rgba(255,209,102,0.85)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(sx, sy, n.r * this.cam.k + 6, 0, Math.PI * 2)
        ctx.stroke()
      }
      if (this.multiSelected.has(n.id)) {`,
    `      if (this.multiSelected.has(n.id)) {`
  ],
  // 8. 镇星之宝加镜头横 streak（真实亮星的饱和溢出）
  [
    `      const rayA = 0.55 + 0.15 * Math.sin(t * 1.1 + n.phase)
      this.paintSpikes(ctx, sx, sy, base * 2.6, '#ffe8b0', rayA)
      this.paintSpikes(ctx, sx, sy, base * 1.5, '#ffe8b0', rayA * 0.6, Math.PI / 4)`,
    `      const rayA = 0.55 + 0.15 * Math.sin(t * 1.1 + n.phase)
      this.paintSpikes(ctx, sx, sy, base * 2.6, '#ffe8b0', rayA)
      this.paintSpikes(ctx, sx, sy, base * 1.5, '#ffe8b0', rayA * 0.6, Math.PI / 4)
      // 镜头横向溢光（亮星过曝的水平 streak）
      const streak = ctx.createLinearGradient(sx - base * 3.2, sy, sx + base * 3.2, sy)
      streak.addColorStop(0, 'rgba(255,228,160,0)')
      streak.addColorStop(0.5, \`rgba(255,236,190,\${0.24 + 0.1 * Math.sin(t * 1.3)})\`)
      streak.addColorStop(1, 'rgba(255,228,160,0)')
      ctx.fillStyle = streak
      ctx.fillRect(sx - base * 3.2, sy - 0.9, base * 6.4, 1.8)`
  ]
])
console.log('done')
