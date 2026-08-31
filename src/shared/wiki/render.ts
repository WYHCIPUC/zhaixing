// 群星（摘星智库）· 页面纯渲染器
// 页面模型与 llm_wiki 同构：source/concept/synthesis/comparison + [[wikilink]]
// 标题即链接约定：书页=书名、概念页=星云名、综合页=文章标题、对比页=「书A · 书B」
// 纯函数、无 DB 依赖 —— 桌面编译器与测试共用

import type { BookRecord, HighlightRecord, LinkRecord, NebulaRecord, ArticleRecord } from '../types'

export interface RenderedPage {
  page_type: 'book' | 'concept' | 'comparison' | 'synthesis'
  ref_id: number
  title: string
  body_md: string
  links: string[] // [[目标标题]] 出链（去重）
}

const RATING_STARS = (n: number): string => '★'.repeat(Math.max(0, Math.min(5, n))) || '未评分'

// ---------- 来源页（book → source） ----------

export function renderBookPage(book: BookRecord, stars: HighlightRecord[]): RenderedPage {
  const lines: string[] = []
  lines.push(`> [!info] 来源档案`)
  lines.push(`> 作者：${book.author || '未知'} · 评分：${RATING_STARS(book.rating)} · 状态：${book.read_status === 'finished' ? '已读完' : book.read_status === 'reading' ? '在读' : '—'}`)
  if (book.short_review) lines.push(`> 短评：${book.short_review.replace(/\n/g, ' ')}`)
  lines.push('')

  let lastChapter: string | null = null
  for (const s of stars) {
    if (s.chapter !== lastChapter) {
      lastChapter = s.chapter
      lines.push(`## ${s.chapter || '未分章'}`)
      lines.push('')
    }
    lines.push(`> ${s.content.replace(/\n/g, '\n> ')}`)
    for (const t of s.thoughts ?? []) {
      lines.push(`> > 💭 ${t.content.replace(/\n/g, ' ')}`)
    }
    lines.push('')
  }
  return {
    page_type: 'book',
    ref_id: book.id,
    title: book.title,
    body_md: lines.join('\n').trim(),
    links: []
  }
}

// ---------- 概念页（nebula → concept） ----------

export interface NebulaMember {
  book: Pick<BookRecord, 'id' | 'title'>
  stars: Pick<HighlightRecord, 'id' | 'content' | 'chapter'>[]
}

export function renderConceptPage(
  nebula: Pick<NebulaRecord, 'id' | 'name' | 'summary' | 'source'>,
  membersByBook: NebulaMember[]
): RenderedPage {
  const links = [...new Set(membersByBook.map((m) => m.book.title))]
  const lines: string[] = []
  lines.push(`> [!abstract] 星云${nebula.source === 'ai' ? '（AI 聚类）' : '（自造）'} · ${membersByBook.reduce((a, m) => a + m.stars.length, 0)} 颗星`)
  if (nebula.summary) lines.push(`> ${nebula.summary.replace(/\n/g, ' ')}`)
  lines.push('')

  for (const m of membersByBook) {
    lines.push(`## [[${m.book.title}]]`)
    lines.push('')
    for (const s of m.stars) {
      const chapter = s.chapter ? `（${s.chapter}）` : ''
      lines.push(`- ${s.content.replace(/\n/g, ' ')}${chapter}`)
    }
    lines.push('')
  }
  return {
    page_type: 'concept',
    ref_id: nebula.id,
    title: nebula.name,
    body_md: lines.join('\n').trim(),
    links
  }
}

// ---------- 对比页（link → comparison：双星并排 / 观点对撞） ----------

export interface ComparisonSide {
  book_title: string
  chapter: string
  content: string
}

export function renderComparisonPage(
  link: Pick<LinkRecord, 'id' | 'kind' | 'note'>,
  a: ComparisonSide,
  b: ComparisonSide
): RenderedPage {
  const title = `${a.book_title} · ${b.book_title}`
  const lines: string[] = []
  if (link.kind === 'collision') {
    lines.push(`> [!warning] 观点对撞${link.note ? `：${link.note.replace(/\n/g, ' ')}` : ''}`)
  } else {
    lines.push(`> [!quote] 跨书共鸣${link.note ? `：${link.note.replace(/\n/g, ' ')}` : ''}`)
  }
  lines.push('')
  lines.push(`## [[${a.book_title}]]`)
  lines.push('')
  lines.push(`> ${a.content.replace(/\n/g, '\n> ')}`)
  lines.push(`> > —— ${a.chapter || ''}`)
  lines.push('')
  lines.push(`## [[${b.book_title}]]`)
  lines.push('')
  lines.push(`> ${b.content.replace(/\n/g, '\n> ')}`)
  lines.push(`> > —— ${b.chapter || ''}`)
  return {
    page_type: 'comparison',
    ref_id: link.id,
    title,
    body_md: lines.join('\n').trim(),
    links: [a.book_title, b.book_title]
  }
}

// 同一对书的多条共鸣/对撞合并为一页（标题唯一，避免同名页与导出覆盖）
export interface ComparisonPairItem {
  kind: 'twin' | 'collision' | 'manual'
  note: string
  a: { chapter: string; content: string }
  b: { chapter: string; content: string }
}

export function renderComparisonPairPage(
  refId: number,
  bookA: string,
  bookB: string,
  pairs: ComparisonPairItem[]
): RenderedPage {
  const collisions = pairs.filter((p) => p.kind === 'collision')
  const head =
    collisions.length > 0
      ? `> [!warning] 观点对撞（${collisions.length} 处）`
      : `> [!quote] 跨书共鸣（${pairs.length} 对）`
  const lines: string[] = [head, '']
  pairs.forEach((p, i) => {
    if (pairs.length > 1) lines.push(`### 第 ${i + 1} 对${p.kind === 'collision' ? ' · 对撞' : ''}`)
    if (p.note) lines.push('', `*${p.note.replace(/\n/g, ' ')}*`)
    lines.push('')
    lines.push(`**[[${bookA}]]**`)
    lines.push('')
    lines.push(`> ${p.a.content.replace(/\n/g, '\n> ')}`)
    if (p.a.chapter) lines.push(`> > —— ${p.a.chapter}`)
    lines.push('')
    lines.push(`**[[${bookB}]]**`)
    lines.push('')
    lines.push(`> ${p.b.content.replace(/\n/g, '\n> ')}`)
    if (p.b.chapter) lines.push(`> > —— ${p.b.chapter}`)
    lines.push('')
  })
  return {
    page_type: 'comparison',
    ref_id: refId,
    title: `${bookA} · ${bookB}`,
    body_md: lines.join('\n').trim(),
    links: [bookA, bookB]
  }
}

// ---------- 综合页（article → synthesis） ----------

export function renderSynthesisPage(
  article: Pick<ArticleRecord, 'id' | 'title' | 'content_md' | 'version'>,
  fromNebula?: string
): RenderedPage {
  const links: string[] = []
  if (fromNebula) links.push(fromNebula)
  const header = fromNebula
    ? `> [!note] 织星成文 · 源自星云 [[${fromNebula}]] · 第 ${article.version} 版`
    : `> [!note] 织星成文 · 第 ${article.version} 版`
  return {
    page_type: 'synthesis',
    ref_id: article.id,
    title: article.title,
    body_md: `${header}\n\n${article.content_md}`.trim(),
    links
  }
}
