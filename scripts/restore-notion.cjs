// 恢复受损文件（从 git index）并规范化到 Notion v4 终值
// 幂等：所有历史强调色/背景变体 → 最终值；重复执行安全
const fs = require('fs')
const { execSync } = require('child_process')

const FILES = [
  'src/renderer/src/components/SyncDialog.tsx',
  'src/renderer/src/components/MobileChrome.tsx',
  'src/renderer/src/components/NebulaPanel.tsx',
  'src/renderer/src/components/ImportWizard.tsx',
  'src/renderer/src/views/BookshelfView.tsx',
  'src/renderer/src/components/NightFlight.tsx',
  'src/renderer/src/components/LinkReview.tsx',
  'src/renderer/src/components/SearchOverlay.tsx',
  'src/renderer/src/views/MeteorView.tsx',
  'src/renderer/src/components/StarDrawer.tsx',
  'src/renderer/src/views/BookDetailView.tsx',
  'src/renderer/src/views/WeaveView.tsx',
  'src/renderer/src/views/SkyView.tsx'
]

// 1. 备份损坏样本供排查
fs.mkdirSync('scripts/corrupted-backup', { recursive: true })
for (const f of FILES) {
  const dest = 'scripts/corrupted-backup/' + f.split('/').pop()
  fs.copyFileSync(f, dest)
}
console.log('损坏样本已备份到 scripts/corrupted-backup/')

// 2. 从 git index 恢复健康版本
for (const f of FILES) {
  const blob = execSync(`git show ":${f}"`, { maxBuffer: 64 * 1024 * 1024 })
  fs.writeFileSync(f, blob)
}
console.log('已从 git index 恢复', FILES.length, '个文件')

// 3. 规范化：所有历史变体 → Notion v4 终值（顺序无关，幂等）
const RULES = [
  // 玻璃类 → 实面
  ['bg-[#fffdf6f8]', 'bg-white'],
  ['bg-[#fffdf6f5]', 'bg-white'],
  ['bg-[#fffdf6f0]', 'bg-white'],
  ['bg-[#fffdf8]', 'bg-white'],
  ['bg-white/80 backdrop-blur-2xl', 'bg-white'],
  ['bg-white/75 backdrop-blur-2xl', 'bg-white'],
  ['bg-white/45 backdrop-blur-xl', 'bg-white'],
  // 抽屉/对话框深底（更早版本）
  ['bg-[#0b1120f8]', 'bg-white'],
  ['bg-[#0b1120f5]', 'bg-white'],
  ['bg-[#0b1120f0]', 'bg-white'],
  ['bg-[#0b1120]', 'bg-white'],
  // 强调色族 → Notion 品牌橙
  ['rgba(244,88,156', 'rgba(221,91,0'],
  ['rgba(224,102,44', 'rgba(221,91,0'],
  ['rgba(217,122,30', 'rgba(221,91,0'],
  ['#f4589c', '#dd5b00'],
  ['#e0662c', '#dd5b00'],
  ['#e8963c', '#dd5b00'],
  // 底色 → 白
  ['#faf8f5', '#ffffff'],
  ['#faf5ec', '#ffffff'],
  ['#fff7ef', '#ffffff'],
  ['#fffdf8', '#ffffff'],
  ['bg-[#f4ead8]/70', 'bg-[#f6f5f4]'],
  ['bg-black/20', 'bg-[#f6f5f4]'],
  ['bg-black/60', 'bg-black/30'],
  // 尘埃/纹理
  ['rgba(196,148,74', 'rgba(55,53,47'],
  ['rgba(220,230,255', 'rgba(55,53,47'],
  ['rgba(139,150,173', 'rgba(120,118,113'],
  // 状态文字（浅底加深）
  ['text-red-300', 'text-red-600'],
  ['text-red-200', 'text-red-700'],
  ['text-emerald-300', 'text-emerald-600'],
  ['text-amber-200', 'text-amber-700'],
  ['text-[#c4b5fd]', 'text-[var(--accent)]'],
  ['rgba(167,139,250,0.35)', 'rgba(221,91,0,0.35)'],
  ['rgba(167,139,250,0.08)', 'rgba(221,91,0,0.08)'],
  ['accent-sky-300', 'accent-amber-500'],
  ['border-red-400/30', 'border-red-400/50'],
  ['bg-red-400/10', 'bg-red-400/15'],
  ['border-amber-400/25', 'border-amber-500/35'],
  ['bg-amber-400/10', 'bg-amber-400/15'],
  // hover 洗色
  ['hover:bg-white/5', 'hover:bg-[rgba(55,53,47,0.06)]'],
  ['bg-white/5', 'bg-[rgba(55,53,47,0.06)]'],
  // 侧边栏（若 index 版本较旧）
  ['bg-[var(--grad-sunset)] shadow-[0_4px_14px_rgba(244,88,156,0.35)]', 'bg-[var(--accent-soft)]'],
  ['gradient-text', 'star-mark'],
  // 流星
  ['from-white via-[rgba(251,191,36,0.8)]', 'from-[#dd5b00] via-[rgba(240,150,60,0.85)]'],
  ['from-[#f4589c]', 'from-[#dd5b00]'],
  ['from-[#e0662c]', 'from-[#dd5b00]'],
  ['rgba(251,191,36,0.8)', 'rgba(221,91,0,0.7)'],
  // 书色盘（任意历史盘 → 莫兰迪）
  ["'#7dd3fc', '#a5b4fc', '#f0abfc', '#fda4af',", "'#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8',"],
  ["'#fcd34d', '#86efac', '#5eead4', '#fdba74'", "'#a483b8', '#c9a227', '#7a9e9f', '#c08552'"],
  ["'#ff9a5a', '#f4589c', '#8b5cf6', '#38bdf8',", "'#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8',"],
  ["'#f59e0b', '#ff6f91', '#7c6cf6', '#ffb347'", "'#a483b8', '#c9a227', '#7a9e9f', '#c08552'"],
  ["'#f0a04b', '#e8b04b', '#f87171', '#fb923c',", "'#c97b4a', '#b96a6a', '#8f9a6d', '#6f8fa8',",],
  ["'#eab308', '#fb7185', '#d97706', '#facc15'", "'#a483b8', '#c9a227', '#7a9e9f', '#c08552'"],
  // checkbox
  ['accent-sky-300', 'accent-amber-500']
]

for (const f of FILES) {
  let s = fs.readFileSync(f, 'utf8')
  let n = 0
  for (const [a, b] of RULES) {
    if (s.includes(a)) {
      n += s.split(a).length - 1
      s = s.split(a).join(b)
    }
  }
  fs.writeFileSync(f, s)
  console.log(f.split('/').pop(), n, '处规范化')
}

// 4. 校验：无损坏特征 + 无旧色残留
const bad = FILES.filter((f) => {
  const s = fs.readFileSync(f, 'utf8')
  return /impogt|fgom |geact|Stagfield/.test(s)
})
console.log(bad.length === 0 ? '✓ 无损坏残留' : '✗ 仍有损坏: ' + bad.join(','))
