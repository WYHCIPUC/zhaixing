import type { HighlightRecord } from '@shared/types'

// 金句分享卡片：书名 + 划线 + 署名 → PNG dataURL
export function makeQuoteCard(star: HighlightRecord & { book_title?: string }): string {
  const W = 1080
  const H = 1440
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!

  // 背景：夜空渐变 + 星尘
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#ffffff')
  bg.addColorStop(0.55, '#fbfaf8')
  bg.addColorStop(1, '#f6f5f4')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  let seed = star.id * 2654435761
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  for (let i = 0; i < 130; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = rand() * 1.6 + 0.3
    g.fillStyle = `rgba(196,148,74,${rand() * 0.5 + 0.08})`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // 主星
  const glow = g.createRadialGradient(W / 2, H * 0.24, 0, W / 2, H * 0.24, 200)
  glow.addColorStop(0, 'rgba(221,91,0,0.28)')
  glow.addColorStop(0.25, 'rgba(251,191,36,0.12)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = glow
  g.fillRect(W / 2 - 220, H * 0.24 - 220, 440, 440)
  g.fillStyle = '#d9930d'
  g.beginPath()
  g.arc(W / 2, H * 0.24, 7, 0, Math.PI * 2)
  g.fill()

  // 正文
  const quote = star.content
  const fontSize = quote.length > 120 ? 40 : quote.length > 60 ? 48 : 56
  g.font = `${fontSize}px Georgia, 'Source Han Serif SC', 'Noto Serif SC', serif`
  g.fillStyle = '#37352f'
  const maxWidth = W - 200
  const lines: string[] = []
  let line = ''
  for (const ch of quote) {
    if (g.measureText(line + ch).width > maxWidth) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  const lh = fontSize * 1.85
  let y = H * 0.38
  for (const l of lines.slice(0, 14)) {
    g.fillText(l, 100, y)
    y += lh
  }

  // 出处与署名
  g.font = "26px 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
  g.fillStyle = 'rgba(146,116,67,0.95)'
  g.fillText(`——《${star.book_title ?? ''}》`, 100, Math.min(y + 60, H - 170))
  g.font = "22px 'Microsoft YaHei UI', 'PingFang SC', sans-serif"
  g.fillStyle = 'rgba(120,118,113,0.95)'
  g.fillText('✦ 摘星实录 · 我在书页里摘下的星', 100, H - 90)

  return c.toDataURL('image/png')
}
