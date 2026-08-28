// 风险修复批：数据路径钉死 / 备份滚动 / LIKE 转义 / 契约校验 / 星图暂停 / 死代码清理
const fs = require('fs')

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  let n = 0
  let miss = []
  for (const [a, b] of pairs) {
    if (s.includes(a)) {
      s = s.split(a).join(b)
      n++
    } else miss.push(a.slice(0, 50))
  }
  fs.writeFileSync(file, s)
  console.log(file, '->', n, 'applied', miss.length ? 'MISS: ' + miss.join(' | ') : '')
}

// 1. 主进程：钉死 userData 路径（否则打包后 productName 变化 → 数据目录漂移 → 数据"消失"）
patch('src/main/index.ts', [
  [
    "import { app, BrowserWindow, shell } from 'electron'",
    "import { app, BrowserWindow, shell } from 'electron'\n\n// 钉死数据目录名：dev 与打包版共用 %APPDATA%/zhaixing，防止 productName 变化导致数据漂移\napp.setName('zhaixing')"
  ]
])

// 2. 备份从单点 → 3 份滚动
patch('src/main/db/connection.ts', [
  [
    `export function backupDatabase(): string {
  const src = getDbPath()
  const dest = path.join(app.getPath('userData'), 'zhaixing.backup.db')
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
  }
  return dest
}`,
    `// 滚动保留最近 3 份备份，避免单份备份在异常后才被覆盖
export function backupDatabase(): string {
  const dir = app.getPath('userData')
  const src = getDbPath()
  const oldest = path.join(dir, 'zhaixing.backup.2.db')
  if (fs.existsSync(oldest)) fs.rmSync(oldest)
  for (let i = 1; i >= 0; i--) {
    const from = path.join(dir, \`zhaixing.backup.\${i}.db\`)
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, \`zhaixing.backup.\${i + 1}.db\`))
  }
  const dest = path.join(dir, 'zhaixing.backup.0.db')
  if (fs.existsSync(src)) fs.copyFileSync(src, dest)
  return dest
}`
  ]
])

// 3. LIKE 通配符转义（% _ 与转义符本身），避免用户输入干扰匹配语义
patch('src/main/db/repo.ts', [
  [
    "  if (ids.length === 0) {\n    // 短词（单字）或 FTS 无命中时回退 LIKE\n    const rows = db\n      .prepare(\n        `SELECT h.id FROM highlights h WHERE h.content LIKE ? OR EXISTS (\n           SELECT 1 FROM thoughts t WHERE t.highlight_id = h.id AND t.content LIKE ?\n         ) ORDER BY h.id DESC LIMIT 200`\n      )\n      .all(`%${trimmed}%`, `%${trimmed}%`) as { id: number }[]",
    "  if (ids.length === 0) {\n    // 短词（单字）或 FTS 无命中时回退 LIKE（转义通配符，避免用户输入改变匹配语义）\n    const escaped = trimmed.replace(/[\\\\%_]/g, (c) => '\\\\' + c)\n    const like = `%${escaped}%`\n    const rows = db\n      .prepare(\n        `SELECT h.id FROM highlights h WHERE h.content LIKE ? ESCAPE '\\\\' OR EXISTS (\n           SELECT 1 FROM thoughts t WHERE t.highlight_id = h.id AND t.content LIKE ? ESCAPE '\\\\'\n         ) ORDER BY h.id DESC LIMIT 200`\n      )\n      .all(like, like) as { id: number }[]"
  ],
  // 4. 死代码：defaultDb
  [
    '\nexport function defaultDb() {\n  return getDb()\n}\n',
    '\n'
  ]
])

// 5. preload ↔ 共享契约：编译期校验，IPC 增删后忘改 preload 直接类型报错
patch('src/preload/index.ts', [
  [
    "import { contextBridge, ipcRenderer } from 'electron'",
    "import { contextBridge, ipcRenderer } from 'electron'\nimport type { ZhaixingApi } from '@shared/types'"
  ],
  [
    "export type Api = typeof api",
    "export type Api = typeof api\n\n// 编译期契约校验：preload 实现必须与共享 API 接口完全一致\nconst _contractCheck: ZhaixingApi = api\nvoid _contractCheck"
  ]
])

// 6. 星空引擎：窗口隐藏/最小化时暂停渲染循环
patch('src/renderer/src/starfield/engine.ts', [
  [
    '    this.loop()\n  }',
    '    document.addEventListener(\'visibilitychange\', () => {\n      if (document.hidden) {\n        cancelAnimationFrame(this.raf)\n        this.paused = true\n      } else if (this.paused) {\n        this.paused = false\n        this.loop()\n      }\n    })\n\n    this.loop()\n  }'
  ],
  [
    '  private paused = false\n',
    '  private paused = false\n'
  ]
])

// 7. SkyView 死代码：focusNebula 状态与隐藏占位
patch('src/renderer/src/views/SkyView.tsx', [
  ['  const [focusNebula, setFocusNebula] = useState<number | null>(null)\n', ''],
  ['              setFocusNebula(null)\n', ''],
  ['            onClose={() => {\n              setActiveNebula(null)\n              setFocusNebula(null)\n            }}', '            onClose={() => setActiveNebula(null)}'],
  ['      {focusNebula !== null && <span className="hidden">{focusNebula}</span>}\n', '']
])

// 8. ipc.ts 未使用导入
patch('src/main/ipc.ts', [
  ['  deleteArticle,\n  getArticle,\n  listArticles,', '  deleteArticle,\n  listArticles,']
])
