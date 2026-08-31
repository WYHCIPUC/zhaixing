// headless wiki 模式接线
const fs = require('fs')

let h = fs.readFileSync('src/main/headless.ts', 'utf8')
if (!h.includes('runHeadlessWiki')) {
  h = h.replace(
    "import { runAnalysis } from './ai/pipeline'",
    "import { runAnalysis } from './ai/pipeline'\nimport { compileWiki } from './wiki/compiler'"
  )
  const fn = [
    '',
    '// 无界面群星编译：ZHAIXING_WIKI=1 npx electron .',
    'export async function runHeadlessWiki(): Promise<void> {',
    '  try {',
    '    const r = compileWiki(getDb())',
    '    console.log(`[wiki] 完成：来源 ${r.books} · 概念 ${r.concepts} · 对比 ${r.comparisons} · 综合 ${r.synthesis}（新编译 ${r.compiled}，跳过 ${r.skipped}）`)',
    '    const again = compileWiki(getDb())',
    '    console.log(`[wiki] 幂等复跑：新编译 ${again.compiled}，跳过 ${again.skipped}`)',
    '    closeDb()',
    '    app.exit(0)',
    '  } catch (err) {',
    "    console.error('[wiki] 失败：', err instanceof Error ? err.message : String(err))",
    '    closeDb()',
    '    app.exit(1)',
    '  }',
    '}',
    ''
  ].join('\n')
  h = h + fn
  fs.writeFileSync('src/main/headless.ts', h)
  console.log('headless.ts OK')
}

let i = fs.readFileSync('src/main/index.ts', 'utf8')
if (!i.includes('ZHAIXING_WIKI')) {
  i = i.replace(
    "import { runHeadlessAi, runHeadlessSync } from './headless'",
    "import { runHeadlessAi, runHeadlessSync, runHeadlessWiki } from './headless'"
  )
  i = i.replace(
    `  if (process.env.ZHAIXING_AI) {
    // 无界面 AI 分析模式
    void runHeadlessAi()
    return
  }`,
    `  if (process.env.ZHAIXING_AI) {
    // 无界面 AI 分析模式
    void runHeadlessAi()
    return
  }
  if (process.env.ZHAIXING_WIKI) {
    void runHeadlessWiki()
    return
  }`
  )
  fs.writeFileSync('src/main/index.ts', i)
  console.log('index.ts OK')
}
