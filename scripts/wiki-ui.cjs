// 群星 UI 接线：Sidebar / App / StarDrawer / styles
const fs = require('fs')

function patch(file, pairs) {
  let s = fs.readFileSync(file, 'utf8')
  let miss = []
  for (const [a, b] of pairs) {
    if (s.includes(a)) s = s.split(a).join(b)
    else miss.push(a.slice(0, 50))
  }
  fs.writeFileSync(file, s)
  console.log(file, miss.length ? 'MISS: ' + miss.join(' | ') : 'OK')
}

// 1. Sidebar：群星入口
patch('src/renderer/src/components/Sidebar.tsx', [
  [
    "import { BarChart3, BookOpen, Feather, MoonStar, Settings, Sparkles } from 'lucide-react'",
    "import { BarChart3, BookOpen, Feather, MoonStar, Settings, Sparkles, Waypoints } from 'lucide-react'"
  ],
  [
    "  { key: 'sky', label: '星穹', icon: Sparkles },",
    "  { key: 'sky', label: '星穹', icon: Sparkles },\n  { key: 'wiki', label: '群星', icon: Waypoints },"
  ]
])

// 2. App：路由 + 跳转目标
patch('src/renderer/src/App.tsx', [
  [
    "import StatsView from './views/StatsView'",
    "import StatsView from './views/StatsView'\nimport WikiView from './views/WikiView'"
  ],
  [
    "export type ViewKey = 'shelf' | 'sky' | 'meteor' | 'weave' | 'stats' | 'settings'",
    "export type ViewKey = 'shelf' | 'sky' | 'wiki' | 'meteor' | 'weave' | 'stats' | 'settings'\n\nexport interface WikiTarget {\n  title?: string\n  type?: string\n  refId?: number\n}"
  ],
  [
    "  const [searchOpen, setSearchOpen] = useState(false)",
    "  const [searchOpen, setSearchOpen] = useState(false)\n  const [wikiTarget, setWikiTarget] = useState<WikiTarget | null>(null)"
  ],
  [
    "            {view === 'sky' && <SkyView />}",
    "            {view === 'sky' && <SkyView onOpenWiki={(t) => { setWikiTarget(t); setView('wiki') }} />}\n            {view === 'wiki' && <WikiView target={wikiTarget} />}"
  ]
])

// 3. SkyView：接收 onOpenWiki 并传给 StarDrawer
patch('src/renderer/src/views/SkyView.tsx', [
  [
    "export default function SkyView() {",
    "export default function SkyView({ onOpenWiki }: { onOpenWiki?: (t: { title?: string; type?: string; refId?: number }) => void }) {"
  ],
  [
    "            onClose={() => setSelected(null)}",
    "            onClose={() => setSelected(null)}\n            onOpenWiki={onOpenWiki}"
  ]
])

// 4. StarDrawer：「在群星中查看」按钮
patch('src/renderer/src/components/StarDrawer.tsx', [
  [
    "  onClose: () => void\n  onChanged: () => void\n  onJump: (starId: number) => void\n}) {",
    "  onClose: () => void\n  onChanged: () => void\n  onJump: (starId: number) => void\n  onOpenWiki?: (t: { title?: string; type?: string; refId?: number }) => void\n}) {"
  ],
  [
    "  onClose,\n  onChanged,\n  onJump\n}: {",
    "  onClose,\n  onChanged,\n  onJump,\n  onOpenWiki\n}: {"
  ],
  [
    "        <button className=\"btn px-2 py-0.5\" onClick={onClose}>\n          ✕\n        </button>",
    "        <div className=\"flex items-center gap-1.5\">\n          {onOpenWiki && (\n            <button\n              className=\"btn px-2 py-0.5 text-[11.5px]\"\n              title=\"在群星（知识库）中查看本书页面\"\n              onClick={() => onOpenWiki({ type: 'book', refId: star.book_id })}\n            >\n              群星 ↗\n            </button>\n          )}\n          <button className=\"btn px-2 py-0.5\" onClick={onClose}>\n            ✕\n          </button>\n        </div>"
  ]
])

// 5. styles.css：wiki 正文排版
const css = fs.readFileSync('src/renderer/src/styles.css', 'utf8')
if (!css.includes('.wiki-body')) {
  fs.writeFileSync(
    'src/renderer/src/styles.css',
    css +
      `
/* ---------- 群星（wiki）正文排版 ---------- */
.wiki-body h1 { font-size: 22px; font-weight: 600; margin: 0 0 12px; }
.wiki-body h2 { font-size: 16px; font-weight: 600; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
.wiki-body h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; }
.wiki-body p { margin: 8px 0; line-height: 1.75; }
.wiki-body blockquote {
  margin: 10px 0; padding: 8px 14px;
  border-left: 3px solid rgba(221, 91, 0, 0.35);
  background: var(--surface-2); border-radius: 0 8px 8px 0;
  color: #37352f; line-height: 1.8; font-size: 13.5px;
}
.wiki-body blockquote blockquote {
  border-left-color: rgba(217, 147, 13, 0.45);
  background: rgba(217, 147, 13, 0.06);
  font-style: italic; font-size: 12.5px;
}
.wiki-body ul { padding-left: 20px; margin: 8px 0; }
.wiki-body li { margin: 4px 0; line-height: 1.7; font-size: 13.5px; }
.wiki-body a.wikilink {
  color: var(--accent); text-decoration: none;
  border-bottom: 1px dashed rgba(221, 91, 0, 0.4);
  cursor: pointer; padding: 0 1px;
}
.wiki-body a.wikilink:hover { background: var(--accent-soft); border-bottom-style: solid; }
`
  )
  console.log('styles.css OK')
} else {
  console.log('styles.css: 已存在')
}
