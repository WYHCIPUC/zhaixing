// 一次性脚本：对齐 notion/DESIGN.md 规范（炭墨文字/白灰表面/语义色/三档阴影）
const fs = require('fs')

const globalSwaps = [
  // 强调色统一到 Notion 品牌橙（星光琥珀）
  ['rgba(224,102,44', 'rgba(221,91,0'],
  ['#e0662c', '#dd5b00'],
  ['#faf8f5', '#ffffff'],
  ['#faf5ec', '#ffffff'],
  // 浅底上残留的深底色
  ['bg-[#f4ead8]/70', 'bg-[#f6f5f4]']
]

const fileEdits = [
  // 侧边栏：Notion 灰面 + 炭墨文字
  [
    'src/renderer/src/components/Sidebar.tsx',
    [
      ['bg-[#f6f3ee]', 'bg-[#f6f5f4]'],
      ["active ? 'text-[var(--accent)]'", "active ? 'text-[var(--text)]'"],
      ['className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]"', 'className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]"']
    ]
  ],
  // 统计页：Notion 中性网格 + 品牌橙热力
  [
    'src/renderer/src/views/StatsView.tsx',
    [
      ["if (n === 0) return 'rgba(60,50,40,0.07)'", "if (n === 0) return '#f0eeec'"],
      ['rgba(224, 102, 44, ${0.15 + t * 0.85})', 'rgba(221, 91, 0, ${0.12 + t * 0.88})'],
      ['bg-[rgba(224,102,44,0.75)]', 'bg-[#dd5b00]'],
      ['fill="rgba(224,102,44,0.14)"', 'fill="rgba(221,91,0,0.12)"'],
      ['stroke="rgba(224,102,44,0.85)"', 'stroke="#dd5b00"'],
      ['stroke="rgba(60,50,40,0.1)"', 'stroke="#e5e3df"'],
      ['fill="rgba(146,116,67,1)"', 'fill="#787671"']
    ]
  ],
  // 星图引擎：白纸星图 + 墨线 + 语义红对撞
  [
    'src/renderer/src/starfield/engine.ts',
    [
      ["g.fillStyle = '#faf8f5'", "g.fillStyle = '#ffffff'"],
      ['rgba(150,120,90,${a})', 'rgba(55,53,47,${a * 0.45})'],
      ["'rgba(90,70,60,0.22)'", "'rgba(55,53,47,0.15)'"],
      ["'rgba(224,102,44,0.5)'", "'rgba(224,49,49,0.4)'"],
      ["'rgba(217,119,6,0.45)'", "'rgba(221,91,0,0.4)'"],
      ["'rgba(180,110,10,0.9)'", "'rgba(217,147,13,0.95)'"],
      ["g.fillStyle = 'rgba(90,80,70,0.75)'", "g.fillStyle = 'rgba(120,118,113,0.8)'"]
    ]
  ],
  // 分享卡片：Notion 白卡
  [
    'src/renderer/src/share/card.ts',
    [
      ["bg.addColorStop(0, '#fffdf9')", "bg.addColorStop(0, '#ffffff')"],
      ["bg.addColorStop(0.55, '#faf3e8')", "bg.addColorStop(0.55, '#fbfaf8')"],
      ["bg.addColorStop(1, '#f2e7d4')", "bg.addColorStop(1, '#f6f5f4')"],
      ["glow.addColorStop(0, 'rgba(221,91,0,0.4)')", "glow.addColorStop(0, 'rgba(221,91,0,0.28)')"],
      ["g.fillStyle = '#322b3d'", "g.fillStyle = '#37352f'"],
      ["g.fillStyle = 'rgba(150,110,60,0.95)'", "g.fillStyle = 'rgba(120,118,113,0.95)'"],
      ['rgba(196,148,74,${a})', 'rgba(55,53,47,${a * 0.4})']
    ]
  ],
  // 年度回放：白底 + 琥珀星 + 灰标签
  [
    'src/renderer/src/components/YearReplay.tsx',
    [
      ["g.fillStyle = '#faf8f5'", "g.fillStyle = '#ffffff'"],
      ["grad.addColorStop(0, 'rgba(224,102,44,0.9)')", "grad.addColorStop(0, 'rgba(221,91,0,0.9)')"],
      ["grad.addColorStop(0.3, 'rgba(224,102,44,0.5)')", "grad.addColorStop(0.3, 'rgba(221,91,0,0.4)')"],
      ["g.fillStyle = 'rgba(90,80,70,0.9)'", "g.fillStyle = 'rgba(120,118,113,0.9)'"]
    ]
  ],
  // 流星：品牌橙
  [
    'src/renderer/src/views/MeteorView.tsx',
    [
      ['from-[#e0662c]', 'from-[#dd5b00]'],
      ['rgba(221,91,0,0.7)', 'rgba(221,91,0,0.7)']
    ]
  ],
  // 窗口底色
  ['src/main/index.ts', [["backgroundColor: '#faf5ec'", "backgroundColor: '#ffffff'"]]]
]

let total = 0
for (const [global] of [globalSwaps]) {
  for (const f of new Set([
    'src/renderer/src/views/SkyView.tsx',
    'src/renderer/src/views/BookDetailView.tsx',
    'src/renderer/src/views/BookshelfView.tsx',
    'src/renderer/src/components/StarDrawer.tsx',
    'src/renderer/src/components/NebulaPanel.tsx',
    'src/renderer/src/components/LinkReview.tsx',
    'src/renderer/src/components/ImportWizard.tsx',
    'src/renderer/src/components/SyncDialog.tsx',
    'src/renderer/src/components/SearchOverlay.tsx',
    'src/renderer/src/components/MobileChrome.tsx',
    'src/renderer/src/components/NightFlight.tsx',
    'src/renderer/src/views/WeaveView.tsx',
    'src/renderer/src/views/MeteorView.tsx'
  ])) {
    let s = fs.readFileSync(f, 'utf8')
    let n = 0
    for (const [a, b] of global) {
      if (s.includes(a)) {
        n += s.split(a).length - 1
        s = s.split(a).join(b)
      }
    }
    if (n) {
      fs.writeFileSync(f, s)
      console.log(f, n)
      total += n
    }
  }
}

for (const [file, pairs] of fileEdits) {
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
  total += pairs.length - miss
  console.log(file, miss ? miss + ' MISS' : 'OK')
}
console.log('TOTAL:', total)
