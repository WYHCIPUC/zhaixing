// AI 管线异步版（桌面 pipeline.ts / spirit.ts / weave.ts 的双端共享实现）
// 数据操作走 AsyncSqliteExecutor；chat/embed 可注入（测试打桩，运行时用真实客户端）
import { blobToVectors, chat as realChat, cosine, embed as realEmbed, vectorsToBlob } from '../ai/client'
import type { AiConfig } from '../ai/client'
import type {
  ArticleRecord,
  AskSkyResult,
  AiRunReport,
  DailyCount,
  HighlightRecord,
  RewriteStyle
} from '@shared/types'
import type { Db } from './async-repo'
import { createNebula, deleteNebula, listNebulae, setGem, upsertLink } from './async-repo'

export interface AiDeps {
  chat: typeof realChat
  embed: typeof realEmbed
}

export const aiDeps: AiDeps = { chat: realChat, embed: realEmbed }

function jsonFromReply<T>(reply: string): T | null {
  try {
    return JSON.parse(reply) as T
  } catch {
    const m = reply.match(/\{[\s\S]*\}/)
    if (m) {
      try {
        return JSON.parse(m[0]) as T
      } catch {
        return null
      }
    }
    return null
  }
}

// ---------- embedding（对照桌面 nebula.ts setEmbedding/starsWithoutEmbedding/allEmbeddings） ----------

export async function setEmbedding(db: Db, starId: number, vector: number[]): Promise<void> {
  await db.run(`UPDATE highlights SET embedding = ? WHERE id = ?`, [vectorsToBlob(vector), starId])
}

export async function starsWithoutEmbedding(db: Db, limit: number): Promise<{ id: number; content: string }[]> {
  return db.query(`SELECT id, content FROM highlights WHERE embedding IS NULL ORDER BY id LIMIT ?`, [limit])
}

export async function allEmbeddings(db: Db): Promise<Map<number, number[]>> {
  const rows = await db.query<{ id: number; embedding: Uint8Array | ArrayBuffer | string }>(
    `SELECT id, embedding FROM highlights WHERE embedding IS NOT NULL`
  )
  const map = new Map<number, number[]>()
  for (const r of rows) {
    let raw: Uint8Array | ArrayBuffer
    if (typeof r.embedding === 'string') {
      // 兼容移动端桥接把 BLOB 串成 base64 的情况
      const bin = atob(r.embedding)
      raw = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    } else {
      raw = r.embedding
    }
    map.set(r.id, blobToVectors(raw))
  }
  return map
}

// 贪心聚类（桌面 pipeline.greedyCluster 同语义）：与已有簇中心相似度 ≥ 阈值则入簇，否则自立新簇
export function greedyCluster(
  embeddings: Map<number, number[]>,
  threshold: number,
  minSize: number
): number[][] {
  const clusters: { members: number[]; centroid: number[] }[] = []
  for (const [id, vec] of embeddings) {
    let best: { cluster: (typeof clusters)[number]; sim: number } | null = null
    for (const c of clusters) {
      const sim = cosine(vec, c.centroid)
      if (sim >= threshold && (!best || sim > best.sim)) best = { cluster: c, sim }
    }
    if (best) {
      const m = best.cluster.members
      const n = m.length
      for (let i = 0; i < best.cluster.centroid.length; i++) {
        best.cluster.centroid[i] = (best.cluster.centroid[i] * n + vec[i]) / (n + 1)
      }
      m.push(id)
    } else {
      clusters.push({ members: [id], centroid: [...vec] })
    }
  }
  return clusters.filter((c) => c.members.length >= minSize).map((c) => c.members)
}

// 余弦相似度批量检索（桌面 nebula.findSimilarPairs 同语义，只跨书）
export function findSimilarPairs(
  embeddings: Map<number, number[]>,
  bookOf: Map<number, number>,
  minSim: number,
  maxSim: number,
  cap = 400
): { a: number; b: number; sim: number }[] {
  const ids = [...embeddings.keys()]
  const out: { a: number; b: number; sim: number }[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const bi = bookOf.get(ids[i])
      const bj = bookOf.get(ids[j])
      if (bi === undefined || bj === undefined || bi === bj) continue
      const sim = cosine(embeddings.get(ids[i])!, embeddings.get(ids[j])!)
      if (sim >= minSim && sim <= maxSim) out.push({ a: ids[i], b: ids[j], sim })
    }
  }
  out.sort((x, y) => y.sim - x.sim)
  return out.slice(0, cap)
}

// ---------- AI 分析管线（桌面 pipeline.runAnalysis 同语义） ----------

async function ensureEmbeddings(db: Db, cfg: AiConfig, deps: AiDeps, report: AiRunReport): Promise<void> {
  const pending = await starsWithoutEmbedding(db, 2000)
  if (pending.length === 0) return
  const BATCH = 16
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    try {
      const vectors = await deps.embed(cfg, batch.map((s) => s.content.slice(0, 600)))
      for (let k = 0; k < batch.length; k++) await setEmbedding(db, batch[k].id, vectors[k])
      report.embedded += batch.length
    } catch (err) {
      report.errors.push(`embedding: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

async function buildAiNebulae(db: Db, cfg: AiConfig, deps: AiDeps, report: AiRunReport): Promise<void> {
  for (const n of await listNebulae(db)) {
    if (n.source === 'ai') await deleteNebula(db, n.id)
  }
  const embeddings = await allEmbeddings(db)
  if (embeddings.size < 6) return
  const clusters = greedyCluster(embeddings, 0.82, 4)
  const contentOf = new Map(
    (await db.query<{ id: number; content: string; favorite: number }>(
      `SELECT id, content, favorite FROM highlights`
    )).map((r) => [r.id, r])
  )

  for (const members of clusters.slice(0, 24)) {
    const picks = members
      .map((id) => contentOf.get(id))
      .filter((x): x is { id: number; content: string; favorite: number } => Boolean(x))
      .sort((a, b) => b.favorite - a.favorite)
      .slice(0, 12)
    const excerpts = picks.map((p, i) => `${i + 1}. ${p.content.slice(0, 120)}`).join('\n')
    try {
      const reply = await deps.chat(
        cfg,
        [
          {
            role: 'system',
            content:
              '你是读书笔记的主题分析师。根据同一位读者多条跨书划线，提炼它们共同指向的主题。只输出 JSON：{"name":"主题名（2-6字，凝练有意象，如「复利座」不加座字更好）","summary":"两三句话，说明这些划线共同在讨论什么，以及彼此的呼应或张力。"}'
          },
          { role: 'user', content: excerpts }
        ],
        { json: true, temperature: 0.5 }
      )
      const parsed = jsonFromReply<{ name?: string; summary?: string }>(reply)
      if (parsed?.name) {
        await createNebula(db, parsed.name.slice(0, 24), members, parsed.summary?.slice(0, 500) ?? '', 'ai', null)
        report.nebulae++
        report.nebulaStars += members.length
      }
    } catch (err) {
      report.errors.push(`星云命名: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function suggestTwins(db: Db, report: AiRunReport): Promise<void> {
  const embeddings = await allEmbeddings(db)
  const bookOf = new Map(
    (await db.query<{ id: number; book_id: number }>(`SELECT id, book_id FROM highlights`)).map((r) => [
      r.id,
      r.book_id
    ])
  )
  const pairs = findSimilarPairs(embeddings, bookOf, 0.86, 1.01, 300)
  for (const p of pairs) {
    const r = await upsertLink(db, p.a, p.b, 'twin', 'suggested', '', p.sim)
    if (r.added) report.twins++
  }
}

const NEGATION_HINTS = ['不对', '错误', '相反', '并非', '其实不是', '恰恰', 'never', 'wrong', 'but']
const CONFIRM_HINTS = ['不同意', '反对', '然而', '但是', '可是', 'disagree', 'however']

async function detectCollisions(db: Db, cfg: AiConfig, deps: AiDeps, report: AiRunReport): Promise<void> {
  const embeddings = await allEmbeddings(db)
  const bookOf = new Map(
    (await db.query<{ id: number; book_id: number }>(`SELECT id, book_id FROM highlights`)).map((r) => [
      r.id,
      r.book_id
    ])
  )
  const pairs = findSimilarPairs(embeddings, bookOf, 0.62, 0.86, 120)
  const contentOf = new Map(
    (await db.query<{ id: number; content: string }>(`SELECT id, content FROM highlights`)).map((r) => [
      r.id,
      r.content
    ])
  )
  const candidates = pairs.filter((p) => {
    const a = contentOf.get(p.a) ?? ''
    const b = contentOf.get(p.b) ?? ''
    return (
      [...NEGATION_HINTS, ...CONFIRM_HINTS].some((w) => a.includes(w) || b.includes(w)) ||
      Math.random() < 0.25
    )
  })

  for (let i = 0; i < candidates.length && i < 60; i += 5) {
    const chunk = candidates.slice(i, i + 5)
    const listing = chunk
      .map(
        (p, idx) =>
          `【第${idx + 1}对】\n甲(${p.a})：${(contentOf.get(p.a) ?? '').slice(0, 100)}\n乙(${p.b})：${(contentOf.get(p.b) ?? '').slice(0, 100)}`
      )
      .join('\n\n')
    try {
      const reply = await deps.chat(
        cfg,
        [
          {
            role: 'system',
            content:
              '判断每对摘录是否存在观点冲突或立场相悖（主题相近但主张矛盾）。只输出 JSON：{"pairs":[{"i":1,"collision":true,"reason":"一句话说明冲突点"}]}。不冲突的 collision 填 false。'
          },
          { role: 'user', content: listing }
        ],
        { json: true, temperature: 0.2 }
      )
      const parsed = jsonFromReply<{ pairs?: { i: number; collision: boolean; reason?: string }[] }>(reply)
      for (const p of parsed?.pairs ?? []) {
        const target = chunk[p.i - 1]
        if (target && p.collision) {
          const r = await upsertLink(db, target.a, target.b, 'collision', 'suggested', p.reason ?? '', target.sim)
          if (r.added) report.collisions++
        }
      }
    } catch (err) {
      report.errors.push(`对撞检测: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

// 镇星之宝：每本书选一条最具代表性的划线（桌面 pipeline.pickGems 同语义）
export async function pickGems(db: Db, cfg: AiConfig, deps: AiDeps = aiDeps): Promise<number> {
  const report: AiRunReport = { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: [] }
  await pickGemsInto(db, cfg, deps, report)
  if (report.errors.length > 0) throw new Error(report.errors[0])
  return report.gems
}

async function pickGemsInto(db: Db, cfg: AiConfig, deps: AiDeps, report: AiRunReport): Promise<void> {
  const books = await db.query<{ id: number; title: string }>(`SELECT id, title FROM books LIMIT 80`)
  for (const book of books) {
    const stars = await db.query<{
      id: number
      content: string
      favorite: number
      revisit_count: number
    }>(
      `SELECT id, content, favorite, revisit_count FROM highlights WHERE book_id = ?
       ORDER BY favorite DESC, revisit_count DESC, LENGTH(content) DESC LIMIT 15`,
      [book.id]
    )
    if (stars.length < 3) continue
    try {
      const listing = stars.map((s, i) => `${i + 1}. ${s.content.slice(0, 100)}`).join('\n')
      const reply = await deps.chat(
        cfg,
        [
          {
            role: 'system',
            content:
              '读者从一本书里摘了若干划线。选出最能代表这本书、也最可能被这位读者反复回味的一条（镇星之宝）。只输出 JSON：{"pick":序号}'
          },
          { role: 'user', content: `《${book.title}》\n${listing}` }
        ],
        { json: true, temperature: 0.3 }
      )
      const parsed = jsonFromReply<{ pick?: number }>(reply)
      const pick = stars[(parsed?.pick ?? 1) - 1]
      if (pick) {
        await setGem(db, pick.id)
        report.gems++
      }
    } catch (err) {
      report.errors.push(`镇星之宝: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

export async function runAnalysis(db: Db, cfg: AiConfig, deps: AiDeps = aiDeps): Promise<AiRunReport> {
  const report: AiRunReport = {
    embedded: 0,
    nebulae: 0,
    nebulaStars: 0,
    twins: 0,
    collisions: 0,
    gems: 0,
    errors: []
  }
  await ensureEmbeddings(db, cfg, deps, report)
  await buildAiNebulae(db, cfg, deps, report)
  await suggestTwins(db, report)
  await detectCollisions(db, cfg, deps, report)
  await pickGemsInto(db, cfg, deps, report)
  return report
}

// ---------- 织星：文章 CRUD（桌面 articles.ts 同语义） ----------

const ARTICLE_SELECT = `SELECT a.*, n.name AS nebula_name FROM articles a LEFT JOIN nebulae n ON n.id = a.nebula_id`

export async function listArticles(db: Db, nebulaId?: number): Promise<ArticleRecord[]> {
  if (nebulaId !== undefined) {
    return db.query(`${ARTICLE_SELECT} WHERE a.nebula_id = ? ORDER BY a.id DESC`, [nebulaId])
  }
  return db.query(`${ARTICLE_SELECT} ORDER BY a.id DESC LIMIT 100`)
}

async function getArticle(db: Db, id: number): Promise<ArticleRecord | null> {
  const rows = await db.query<ArticleRecord>(`${ARTICLE_SELECT} WHERE a.id = ?`, [id])
  return rows[0] ?? null
}

export async function createArticle(
  db: Db,
  nebulaId: number | null,
  title: string,
  contentMd: string
): Promise<ArticleRecord> {
  await db.run(`INSERT INTO articles(nebula_id, title, content_md) VALUES (?, ?, ?)`, [
    nebulaId,
    title,
    contentMd
  ])
  const rows = await db.query<ArticleRecord>(`${ARTICLE_SELECT} WHERE a.id = last_insert_rowid()`)
  return rows[0]
}

// 保存 = 旧文进历史，版本号 +1（桌面 articles.saveArticleVersion 同语义）
export async function saveArticleVersion(db: Db, id: number, contentMd: string): Promise<ArticleRecord | null> {
  const cur = await getArticle(db, id)
  if (!cur) return null
  const history = JSON.parse(cur.history || '[]') as { version: number; content_md: string; saved_at: string }[]
  history.push({ version: cur.version, content_md: cur.content_md, saved_at: cur.updated_at })
  await db.run(
    `UPDATE articles SET content_md = ?, history = ?, version = version + 1, updated_at = datetime('now','localtime') WHERE id = ?`,
    [contentMd, JSON.stringify(history.slice(-20)), id]
  )
  return getArticle(db, id)
}

export async function updateArticleTitle(db: Db, id: number, title: string): Promise<void> {
  await db.run(`UPDATE articles SET title = ?, updated_at = datetime('now','localtime') WHERE id = ?`, [title, id])
}

export async function deleteArticle(db: Db, id: number): Promise<void> {
  await db.run(`DELETE FROM articles WHERE id = ?`, [id])
}

// ---------- 织星 AI（桌面 weave.ts 同语义） ----------

// 织星成文：星云素材 → AI 起草
export async function draftNebulaArticle(
  db: Db,
  cfg: AiConfig,
  deps: AiDeps,
  nebulaId: number
): Promise<ArticleRecord> {
  const nebRows = await db.query<{ id: number; name: string; summary: string }>(
    `SELECT * FROM nebulae WHERE id = ?`,
    [nebulaId]
  )
  const nebula = nebRows[0]
  if (!nebula) throw new Error('星云不存在')
  const rows = await db.query<{ content: string; book: string; thought: string | null }>(
    `SELECT h.content, b.title AS book, t.content AS thought
     FROM nebula_stars ns
     JOIN highlights h ON h.id = ns.highlight_id
     JOIN books b ON b.id = h.book_id
     LEFT JOIN thoughts t ON t.highlight_id = h.id
     WHERE ns.nebula_id = ? ORDER BY h.id LIMIT 120`,
    [nebulaId]
  )

  const material = rows
    .map((r) => `《${r.book}》摘：${r.content.slice(0, 100)}${r.thought ? `｜我想：${r.thought.slice(0, 80)}` : ''}`)
    .join('\n')
  const reply = await deps.chat(
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
  return createArticle(db, nebulaId, title, content)
}

export const REWRITE_STYLES = {
  tweet: '一条社交动态（140字内，有钩子，不鸡汤）',
  card: '一张金句卡片的文案（金句一行 + 一句延伸）',
  speech: '演讲开场引用（两句，口语有节奏）',
  review: '书评的开头段（三句内，先声夺人）'
} as const

export type RewriteStyleKey = keyof typeof REWRITE_STYLES

export async function rewriteQuote(cfg: AiConfig, deps: AiDeps, content: string, style: RewriteStyleKey): Promise<string> {
  return deps.chat(
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

export async function socraticAsk(cfg: AiConfig, deps: AiDeps, highlight: string, thought: string): Promise<string> {
  return deps.chat(
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

export interface AskSkyCite {
  id: number
  content: string
  chapter: string
  book: string
}

// 与星空对话：embedding 检索读者自己的划线作答
export async function askSky(db: Db, cfg: AiConfig, deps: AiDeps, question: string): Promise<AskSkyResult> {
  const [qvec] = await deps.embed(cfg, [question.slice(0, 300)])
  const embeddings = await allEmbeddings(db)
  const scored: { id: number; sim: number }[] = []
  for (const [id, vec] of embeddings) {
    if (vec.length !== qvec.length) continue
    scored.push({ id, sim: cosine(qvec, vec) })
  }
  scored.sort((a, b) => b.sim - a.sim)
  const top = scored.slice(0, 8)

  const stars: (AskSkyCite & { sim: number })[] = []
  for (const s of top) {
    const rows = await db.query<AskSkyCite>(
      `SELECT h.id, h.content, h.chapter, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id WHERE h.id = ?`,
      [s.id]
    )
    if (rows[0]) stars.push({ ...rows[0], sim: s.sim })
  }

  const context = stars
    .map((s, i) => `[${i + 1}] 《${s.book}》${s.chapter ? s.chapter : ''}：${s.content.slice(0, 160)}`)
    .join('\n')

  const answer = await deps.chat(
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
export async function fallbackCites(db: Db, question: string): Promise<AskSkyResult['cites']> {
  const words = question.split(/\s+/).filter((w) => w.length >= 2)
  if (words.length === 0) return []
  return db.query(
    `SELECT h.id, h.content, h.chapter, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id
     WHERE h.content LIKE ? ORDER BY h.id DESC LIMIT 6`,
    [`%${words[0]}%`]
  )
}

// ---------- 星光节（桌面 ipc stats:daily / spirit.ts 同语义） ----------

export async function dailyCounts(db: Db): Promise<DailyCount[]> {
  return db.query(
    `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count FROM highlights GROUP BY date ORDER BY date`
  )
}

export interface SpiritSpectrum {
  type_name: string
  type_desc: string
  spectrum: { name: string; score: number }[]
  generated_at: string
}

// 精神光谱：AI 分析读者全部划线 → 读者类型判词 + 主题雷达（带 settings 缓存）
export async function spiritSpectrum(db: Db, cfg: AiConfig, deps: AiDeps, refresh = false): Promise<SpiritSpectrum> {
  const cached = (await db.query<{ value: string }>(`SELECT value FROM settings WHERE key = 'spirit_spectrum'`))[0]
    ?.value
  if (cached && !refresh) {
    try {
      return JSON.parse(cached) as SpiritSpectrum
    } catch {
      /* 缓存损坏则重算 */
    }
  }

  const nebulae = await db.query<{ name: string; c: number }>(
    `SELECT n.name, COUNT(ns.highlight_id) AS c FROM nebulae n
     LEFT JOIN nebula_stars ns ON ns.nebula_id = n.id GROUP BY n.id ORDER BY c DESC LIMIT 8`
  )
  const samples = await db.query<{ content: string; book: string }>(
    `SELECT h.content, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id
     ORDER BY h.favorite DESC, h.revisit_count DESC, RANDOM() LIMIT 24`
  )
  const material = samples.map((s) => `《${s.book}》：${s.content.slice(0, 80)}`).join('\n')

  const reply = await deps.chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是阅读分析师。根据读者的摘录与其自聚的主题，给出：读者类型判词（2-4字，如「星轨测绘者」）+ 一句话判语（40字内）+ 5 维精神光谱（0-100，反映该主题在其阅读中的权重）。只输出 JSON：{"type_name":"…","type_desc":"…","spectrum":[{"name":"主题名","score":80}]}'
      },
      {
        role: 'user',
        content: `主题分布：${nebulae.map((n) => `${n.name}(${n.c})`).join('、') || '（尚无主题）'}\n\n代表性摘录：\n${material}`
      }
    ],
    { json: true, temperature: 0.6 }
  )

  const parsed = jsonFromReply<Partial<SpiritSpectrum>>(reply)
  if (!parsed?.type_name || !Array.isArray(parsed.spectrum)) {
    throw new Error('AI 返回格式异常')
  }
  const result: SpiritSpectrum = {
    type_name: parsed.type_name.slice(0, 12),
    type_desc: parsed.type_desc?.slice(0, 80) ?? '',
    spectrum: parsed.spectrum.slice(0, 6).map((s) => ({
      name: String(s.name).slice(0, 10),
      score: Math.max(0, Math.min(100, Number(s.score) || 0))
    })),
    generated_at: new Date().toISOString().slice(0, 10)
  }
  await db.run(
    `INSERT INTO settings(key, value) VALUES ('spirit_spectrum', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [JSON.stringify(result)]
  )
  return result
}

// 供 mobile-api 的 rewriteQuote 签名对齐（starId 仅用于取原文）
export async function rewriteQuoteOfStar(db: Db, cfg: AiConfig, deps: AiDeps, starId: number, style: RewriteStyle): Promise<string> {
  const star = (await db.query<HighlightRecord & { content: string }>(
    `SELECT content FROM highlights WHERE id = ?`,
    [starId]
  ))[0]
  if (!star) throw new Error('星不存在')
  return rewriteQuote(cfg, deps, star.content, style)
}

