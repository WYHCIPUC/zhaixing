// 群星 · 导出适配器：wiki_pages → llm_wiki 兼容 Markdown 目录
// llm_wiki 的 raw/sources 可直接摄取；Obsidian 亦可打开
import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db/connection'
import { getWikiPageByTitle, type WikiPageRow } from './compiler'

const SUBDIR: Record<WikiPageRow['page_type'], string> = {
  book: 'books',
  concept: 'concepts',
  comparison: 'comparisons',
  synthesis: 'synthesis'
}

const LLMTYPE: Record<WikiPageRow['page_type'], string> = {
  book: 'source',
  concept: 'concept',
  comparison: 'comparison',
  synthesis: 'synthesis'
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|·]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled'
}

export interface ExportReport {
  dir: string
  files: number
  failed: string[]
}

export function exportWiki(db: DB, dir: string, origin = 'zhaixing'): ExportReport {
  const report: ExportReport = { dir, files: 0, failed: [] }
  const pages = db.prepare(`SELECT * FROM wiki_pages ORDER BY page_type, title`).all() as WikiPageRow[]
  if (pages.length === 0) return report

  for (const sub of Object.values(SUBDIR)) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true })
  }

  for (const p of pages) {
    // frontmatter：type 与 llm_wiki 页面类型对齐；sources 回链本页出链的实体页
    // 巨型星云出链可达 80+，frontmatter 截断到 12 项（正文里完整保留）
    const all = (JSON.parse(p.links || '[]') as string[]).filter((t) => getWikiPageByTitle(db, t))
    const linkTargets = all.slice(0, 12)
    const sourcesLine =
      all.length === 0
        ? 'sources: []'
        : all.length > linkTargets.length
          ? `sources: [${linkTargets.map((t) => `"${t}"`).join(', ')}, "…共 ${all.length} 项，见正文"]`
          : `sources: [${linkTargets.map((t) => `"${t}"`).join(', ')}]`
    const fm = [
      '---',
      `type: ${LLMTYPE[p.page_type]}`,
      `title: ${p.title.replace(/\n/g, ' ')}`,
      `zhaixing: ${p.page_type}${p.ref_id ? `-${p.ref_id}` : ''}`,
      sourcesLine,
      `origin: ${origin}`,
      '---'
    ].join('\n')
    const md = `${fm}\n\n${p.body_md}\n`
    const file = path.join(dir, SUBDIR[p.page_type], `${safeFileName(p.title)}.md`)
    try {
      fs.writeFileSync(file, md, 'utf-8')
      report.files++
    } catch (err) {
      report.failed.push(`${p.title}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 首次导出附使用说明
  const readme = path.join(dir, 'README.md')
  if (!fs.existsSync(readme)) {
    fs.writeFileSync(
      readme,
      [
        '# 摘星实录 · 群星导出',
        '',
        '本目录由摘星实录「群星」模块生成，与 llm_wiki / Obsidian 兼容：',
        '',
        '- **导入 llm_wiki**：把这些子目录（books/concepts/comparisons/synthesis）内的 .md 拷入其 Sources，或将本目录设为来源监视目录，摄取管线会自动建立 `[[互链]]` 关联',
        '- **Obsidian**：直接把本目录作为 vault 打开',
        '- 重复导出为幂等覆盖，以摘星实录内最新数据为准',
        ''
      ].join('\n'),
      'utf-8'
    )
  }
  return report
}
