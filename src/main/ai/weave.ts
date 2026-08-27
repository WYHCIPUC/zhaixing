import type { DB } from '../db/connection'
import { allEmbeddings } from '../db/nebula'
import { createArticle } from '../db/articles'
import { chat, cosine, embed, type AiConfig } from '@shared/ai/client'

export interface AskSkyResult {
  answer: string
  cites: { id: number; content: string; book: string; chapter: string }[]
}

// 织星成文：星云素材 → AI 起草
export async function draftNebulaArticle(db: DB, cfg: AiConfig, nebulaId: number): Promise<{ title: string; content: string }> {
  const nebula = db.prepare(`SELECT * FROM nebulae WHERE id = ?`).get(nebulaId) as
    | { name: string; summary: string }
    | undefined
  if (!nebula) throw new Error('星云不存在')
  const rows = db
    .prepare(
      `SELECT h.content, b.title AS book, t.thought
       FROM nebula_stars ns
       JOIN highlights h ON h.id = ns.highlight_id
       JOIN books b ON b.id = h.book_id
       LEFT JOIN thoughts t ON t.highlight_id = h.id
       WHERE ns.nebula_id = ? ORDER BY h.id LIMIT 120`
    )
    .all(nebulaId) as { content: string; book: string; thought: string | null }[]

  const material = rows
    .map((r) => `《${r.book}》摘：${r.content.slice(0, 100)}${r.thought ? `｜我想：${r.thought.slice(0, 80)}` : ''}`)
    .join('\n')
  const reply = await chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是一位代笔人，为一位读者把TA的跨书划线与想法织成一篇随笔。要求：以读者第一人称口吻；引用素材时自然化用并注明出自哪本书；600-900字；不用套话与空泛总结；结尾落回读者自己的思考。只输出 JSON：{"title":"标题","content":"正文 markdown"}'
      },
      {
        role: 'user',
        content: `主题：「${nebula.name}」\n读者自己的综述：${nebula.summary || '（无）'}\n\n素材：\n${material}`
      }
    ],
    { json: true, temperature: 0.8 }
  )
  let parsed: { title?: string; content?: string } | null = null
  try {
    parsed = JSON.parse(reply)
  } catch {
    const m = reply.match(/\{[\s\S]*\}/)
    if (m) parsed = JSON.parse(m[0])
  }
  const title = parsed?.title?.slice(0, 60) || `${nebula.name} · 拾星札记`
  const content = parsed?.content || reply
  createArticle(db, nebulaId, title, content)
  return { title, content }
}

// 金句重写器
export const REWRITE_STYLES = {
  tweet: '一条社交动态（140字内，有钩子，不鸡汤）',
  card: '一张金句卡片的文案（金句一行 + 一句延伸）',
  speech: '演讲开场引用（两句，口语有节奏）',
  review: '书评的开头段（三句内，先声夺人）'
} as const

export type RewriteStyle = keyof typeof REWRITE_STYLES

export async function rewriteQuote(cfg: AiConfig, content: string, style: RewriteStyle): Promise<string> {
  return chat(
    cfg,
    [
      {
        role: 'system',
        content: `把读者给出的书中摘录改写成：${REWRITE_STYLES[style]}。保留原意，直接输出成品，不要任何解释与引号包裹。`
      },
      { role: 'user', content }
    ],
    { temperature: 0.85 }
  )
}

// 苏格拉底追问
export async function socraticQuestion(cfg: AiConfig, highlight: string, thought: string): Promise<string> {
  return chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是苏格拉底。针对读者刚写下的想法，提出一个尖锐但友善的追问，逼TA把概念想得更清楚。只输出一个问题，不超过40字，不加任何前缀。'
      },
      { role: 'user', content: `摘录：${highlight.slice(0, 150)}\n读者的想法：${thought}` }
    ],
    { temperature: 0.8 }
  )
}

// 与星空对话：embedding 检索读者自己的划线作答
export async function askSky(db: DB, cfg: AiConfig, question: string): Promise<AskSkyResult> {
  const [qvec] = await embed(cfg, [question.slice(0, 300)])
  const embeddings = allEmbeddings(db)
  const scored: { id: number; sim: number }[] = []
  for (const [id, vec] of embeddings) {
    if (vec.length !== qvec.length) continue
    scored.push({ id, sim: cosine(qvec, vec) })
  }
  scored.sort((a, b) => b.sim - a.sim)
  const top = scored.slice(0, 8)

  const stars = top
    .map((s) => {
      const row = db
        .prepare(
          `SELECT h.id, h.content, h.chapter, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`
        )
        .get(s.id) as { id: number; content: string; chapter: string; book: string } | undefined
      return row ? { ...row, sim: s.sim } : null
    })
    .filter((x): x is { id: number; content: string; chapter: string; book: string; sim: number } => Boolean(x))

  const context = stars
    .map((s, i) => `[${i + 1}] 《${s.book}》${s.chapter ? s.chapter : ''}：${s.content.slice(0, 160)}`)
    .join('\n')

  const answer = await chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '回答读者关于TA自己摘录笔记的问题。只依据给出的摘录素材作答，引用时标注 [编号]。素材不足以回答时直说。150字内，直接给答案。'
      },
      { role: 'user', content: `我的摘录：\n${context || '（无）'}\n\n问题：${question}` }
    ],
    { temperature: 0.4 }
  )
  return { answer, cites: stars.map(({ id, content, book, chapter }) => ({ id, content, book, chapter })) }
}

// 兜底：无 embedding 时退化为关键词检索
export function fallbackCites(db: DB, question: string): AskSkyResult['cites'] {
  const words = question.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return []
  const rows = db
    .prepare(
      `SELECT h.id, h.content, h.chapter, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id
       WHERE h.content LIKE ? ORDER BY h.id DESC LIMIT 6`
    )
    .all(`%${words[0]}%`) as { id: number; content: string; chapter: string; book: string }[]
  return rows
}
