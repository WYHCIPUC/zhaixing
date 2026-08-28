// 一次性脚本：莫兰迪书色 + 单一琥珀强调收敛
const fs = require('fs')

// 1. repo.ts：CANDY → MORANDI
let r = fs.readFileSync('src/main/db/repo.ts', 'utf8')
const candyOld = "const CANDY = ['#ff9a5a', '#d9930d', '#8b5cf6', '#f59e0b', '#38bdf8', '#ff6f91', '#7c6cf6', '#ffb347']"
if (r.includes(candyOld)) {
  r = r.replace(candyOld, "const MORANDI = ['#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8', '#a483b8', '#c9a227', '#7a9e9f', '#c08552']")
  r = r.split('CANDY[h % CANDY.length]').join('MORANDI[h % MORANDI.length]')
  fs.writeFileSync('src/main/db/repo.ts', r)
  console.log('repo.ts MORANDI OK')
} else {
  console.log('repo.ts: CANDY pattern not found (可能已迁移)')
}

// 2. BookshelfView 色板
let b = fs.readFileSync('src/renderer/src/views/BookshelfView.tsx', 'utf8')
b = b.replace(
  /'#ff9a5a', '#f4589c', '#8b5cf6', '#38bdf8',\s*\n\s*'#f59e0b', '#ff6f91', '#7c6cf6', '#ffb347'/,
  "'#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8',\n  '#a483b8', '#c9a227', '#7a9e9f', '#c08552'"
)
fs.writeFileSync('src/renderer/src/views/BookshelfView.tsx', b)

// 3. 画布与统计收敛
const edits = [
  [
    'src/renderer/src/starfield/engine.ts',
    [
      ['rgba(244,88,156,${a})', 'rgba(150,120,90,${a})'],
      ['rgba(139,92,246,${a})', 'rgba(150,120,90,${a})'],
      ['rgba(240,150,60,${a})', 'rgba(170,140,105,${a})'],
      ["'rgba(139,92,246,0.32)'", "'rgba(90,70,60,0.22)'"],
      ["'rgba(244,88,156,0.5)'", "'rgba(224,102,44,0.5)'"],
      ["ctx.strokeStyle = 'rgba(80,50,120,0.75)'", "ctx.strokeStyle = 'rgba(43,39,35,0.75)'"],
      ["g.fillStyle = '#fff7ef'", "g.fillStyle = '#faf8f5'"],
      ["g.fillStyle = 'rgba(80,50,120,0.65)'", "g.fillStyle = 'rgba(90,80,70,0.75)'"]
    ]
  ],
  [
    'src/renderer/src/components/YearReplay.tsx',
    [
      ["g.fillStyle = '#fff7ef'", "g.fillStyle = '#faf8f5'"],
      ["grad.addColorStop(0, 'rgba(217,122,30,0.9)')", "grad.addColorStop(0, 'rgba(224,102,44,0.9)')"],
      ["grad.addColorStop(0.3, 'rgba(244,88,156,0.5)')", "grad.addColorStop(0.3, 'rgba(232,150,60,0.55)')"],
      ["g.fillStyle = 'rgba(80,50,120,0.8)'", "g.fillStyle = 'rgba(90,80,70,0.9)'"]
    ]
  ],
  [
    'src/renderer/src/components/NightFlight.tsx',
    [
      ['from-[#ffe8d6] via-[#ffd9e8] to-[#e6d9ff]', 'from-[#fdf3e7] via-[#faf0e6] to-[#f1e9de]'],
      ['bg-[#f4589c] twinkle', 'bg-[#d9930d] twinkle']
    ]
  ],
  [
    'src/renderer/src/views/MeteorView.tsx',
    [
      ['via-[rgba(255,170,90,0.9)]', 'via-[rgba(240,150,60,0.85)]'],
      ['rgba(224,102,44,0.8)', 'rgba(224,102,44,0.7)']
    ]
  ],
  [
    'src/renderer/src/share/card.ts',
    [
      ["bg.addColorStop(0, '#ffe3c9')", "bg.addColorStop(0, '#fffdf9')"],
      ["bg.addColorStop(0.55, '#ffd3e2')", "bg.addColorStop(0.55, '#faf3e8')"],
      ["bg.addColorStop(1, '#dcc8ff')", "bg.addColorStop(1, '#f2e7d4')"],
      ["glow.addColorStop(0, 'rgba(244,88,156,0.45)')", "glow.addColorStop(0, 'rgba(224,102,44,0.4)')"],
      ["g.fillStyle = '#f4589c'", "g.fillStyle = '#d9930d'"],
      ["g.fillStyle = 'rgba(139,92,246,0.9)'", "g.fillStyle = 'rgba(150,110,60,0.95)'"]
    ]
  ],
  [
    'src/renderer/src/views/StatsView.tsx',
    [
      ["if (n === 0) return 'rgba(255, 255, 255, 0.05)'", "if (n === 0) return 'rgba(60, 50, 40, 0.07)'"],
      ['rgba(251, 191, 36, ${0.2 + t * 0.8})', 'rgba(224, 102, 44, ${0.15 + t * 0.85})'],
      ['from-[rgba(232,150,60,0.8)] to-[rgba(217,119,6,0.8)]', 'bg-[rgba(224,102,44,0.75)]'],
      ['fill="rgba(251,191,36,0.18)"', 'fill="rgba(224,102,44,0.14)"'],
      ['stroke="rgba(251,191,36,0.8)"', 'stroke="rgba(224,102,44,0.85)"']
    ]
  ]
]

for (const [file, pairs] of edits) {
  let s = fs.readFileSync(file, 'utf8')
  let miss = 0
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
    else {
      miss++
      console.log('  MISS:', file, '::', a.slice(0, 60))
    }
  }
  fs.writeFileSync(file, s)
  console.log(file, miss ? miss + ' MISS' : 'OK')
}
