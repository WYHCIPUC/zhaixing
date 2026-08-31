import type { DB } from '../db/connection'
import { getDb } from '../db/connection'
import {
  allEmbeddings,
  createNebula,
  deleteNebula,
  findSimilarPairs,
  listNebulae,
  setEmbedding,
  starsWithoutEmbedding,
  upsertLink
} from '../db/nebula'
import { updateBook } from '../db/repo'
import { chat, embed, type AiConfig } from '@shared/ai/client'
import type { AiRunReport } from '@shared/types'

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

// 书架 AI 分区：全部书归入 6~10 个主题分区，写入 books.category（单次 LLM 调用，可重跑覆盖）
export async function classifyBooks(
  db: DB,
  cfg: AiConfig
): Promise<{ categories: { name: string; count: number }[] }> {
  const books = db
    .prepare(
      `SELECT b.id, b.title, b.author, b.short_review FROM books b ORDER BY b.id`
    )
    .all() as { id: number; title: string; author: string; short_review: string }[]
  if (books.length === 0) return { categories: [] }

  const excerptStmt = db.prepare(
    `SELECT content FROM highlights WHERE book_id = ? ORDER BY favorite DESC, LENGTH(content) DESC LIMIT 2`
  )
  const lines = books.map((b) => {
    const ex = (excerptStmt.all(b.id) as { content: string }[])
      .map((e) => e.content.slice(0, 60))
      .join('／')
    return `${b.id}|《${b.title}》${b.author ? ` ${b.author}` : ''}${
      b.short_review ? `｜短评:${b.short_review.slice(0, 40)}` : ''
    }${ex ? `｜摘:${ex}` : ''}`
  })

  const reply = await chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是图书馆的书架管理员。把这位读者的全部书归入 6~10 个主题分区（如「心理学」「历史」「文学小说」「科学思维」），分区名 2-6 字。规则：每本书必须归入恰好一个分区；书太少或主题不明的书并入最接近的分区，宁用通用分区名也不要为孤本单开分区。只输出 JSON：{"categories":[{"name":"分区名","bookIds":[书id数字数组]}]}'
      },
      { role: 'user', content: lines.join('\n') }
    ],
    { json: true, temperature: 0.3 }
  )
  const parsed = jsonFromReply<{ categories?: { name?: string; bookIds?: (number | string)[] }[] }>(reply)
  const cats = (parsed?.categories ?? []).filter((c): c is { name: string; bookIds: (number | string)[] } => Boolean(c?.name))
  if (cats.length === 0) throw new Error('AI 返回无法解析，请重试')

  const result: { name: string; count: number }[] = []
  const tx = db.transaction(() => {
    db.prepare(`UPDATE books SET category = ''`).run()
    const update = db.prepare(`UPDATE books SET category = ? WHERE id = ?`)
    const assigned = new Set<number>()
    for (const c of cats) {
      const name = (c.name ?? '').trim().slice(0, 24)
      if (!name) continue
      let n = 0
      for (const id of c.bookIds ?? []) {
        const numId = Number(id)
        if (!Number.isFinite(numId) || assigned.has(numId)) continue
        update.run(name, numId)
        assigned.add(numId)
        n++
      }
      if (n > 0) result.push({ name, count: n })
    }
    let unassigned = 0
    for (const b of books) {
      if (!assigned.has(b.id)) {
        update.run('未分类', b.id)
        unassigned++
      }
    }
    if (unassigned > 0) result.push({ name: '未分类', count: unassigned })
  })
  tx()
  return { categories: result }
}

// 阈值按 BAAI/bge-m3 实测分布校准（P50 邻近相似度 ≈ 0.61）：
// 集群 0.62 ≈ 中位可入簇；双星 0.68 ≈ 前 10% 强共鸣；对撞带 0.50–0.68 为主张相近但相异的区间
const CLUSTER_SIM = 0.62
const TWIN_SIM = 0.68
// 相似度 ≥70% 自动连线，不再人工盖章（用户规则 2026-08-31）；0.68–0.70 为边缘带留审核
const TWIN_AUTO_CONFIRM = 0.7
const COLLISION_SIM_MIN = 0.5
const COLLISION_SIM_MAX = 0.68

async function ensureEmbeddings(db: DB, cfg: AiConfig, report: AiRunReport): Promise<void> {
  const pending = starsWithoutEmbedding(db, 2000)
  if (pending.length === 0) return
  const BATCH = 16
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    try {
      const vectors = await embed(cfg, batch.map((s) => s.content.slice(0, 600)))
      const tx = db.transaction(() => {
        for (let k = 0; k < batch.length; k++) setEmbedding(db, batch[k].id, vectors[k])
      })
      tx()
      report.embedded += batch.length
    } catch (err) {
      report.errors.push(`embedding: ${err instanceof Error ? err.message : String(err)}`)
      break // embedding 失败则本次不再继续（下次运行会补）
    }
  }
}

// 贪心聚类：与已有簇中心相似度 ≥ 阈值则入簇，否则自立新簇
function greedyCluster(
  embeddings: Map<number, number[]>,
  threshold: number,
  minSize: number
): number[][] {
  const clusters: { members: number[]; centroid: number[] }[] = []
  for (const [id, vec] of embeddings) {
    let best: { cluster: (typeof clusters)[number]; sim: number } | null = null
    for (const c of clusters) {
      let dot = 0
      let na = 0
      let nb = 0
      for (let i = 0; i < vec.length; i++) {
        dot += vec[i] * c.centroid[i]
        na += vec[i] * vec[i]
        nb += c.centroid[i] * c.centroid[i]
      }
      const sim = dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
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

async function buildAiNebulae(db: DB, cfg: AiConfig, report: AiRunReport): Promise<void> {
  // 重建 AI 星云（用户星云不动）
  for (const n of listNebulae(db)) {
    if (n.source === 'ai') deleteNebula(db, n.id)
  }
  // 聚类名回写 ai_tags 的入口：先清空上一轮标签（该列只有 AI 写入）
  db.prepare(`UPDATE highlights SET ai_tags = ''`).run()
  const tagStmt = db.prepare(`UPDATE highlights SET ai_tags = ? WHERE id = ?`)

  const embeddings = allEmbeddings(db)
  if (embeddings.size < 6) return
  const clusters = greedyCluster(embeddings, CLUSTER_SIM, 4)
  const contentOf = new Map(
    (db.prepare(`SELECT id, content, favorite FROM highlights`).all() as {
      id: number
      content: string
      favorite: number
    }[]).map((r) => [r.id, r])
  )

  for (const members of clusters.slice(0, 24)) {
    const picks = members
      .map((id) => contentOf.get(id))
      .filter((x): x is { id: number; content: string; favorite: number } => Boolean(x))
      .sort((a, b) => b.favorite - a.favorite)
      .slice(0, 12)
    const excerpts = picks.map((p, i) => `${i + 1}. ${p.content.slice(0, 120)}`).join('\n')
    try {
      const reply = await chat(
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
        const name = parsed.name.slice(0, 24)
        createNebula(db, name, parsed.summary?.slice(0, 500) ?? '', 'ai', null, members)
        // 可查找性：簇名作为分类标签写给每个成员（v6 B4）
        for (const m of members) tagStmt.run(name, m)
        report.nebulae++
        report.nebulaStars += members.length
      }
    } catch (err) {
      report.errors.push(`星云命名: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

async function suggestTwins(db: DB, report: AiRunReport): Promise<void> {
  const embeddings = allEmbeddings(db)
  const bookOf = new Map(
    (db.prepare(`SELECT id, book_id FROM highlights`).all() as { id: number; book_id: number }[]).map((r) => [
      r.id,
      r.book_id
    ])
  )
  const pairs = findSimilarPairs(embeddings, bookOf, TWIN_SIM, 1.01, 300)
  for (const p of pairs) {
    // 相似度 ≥70% 自动连线（用户规则）；0.68–0.70 边缘带留人工审核
    const status = p.sim >= TWIN_AUTO_CONFIRM ? 'confirmed' : 'suggested'
    const r = upsertLink(db, p.a, p.b, 'twin', status, '', p.sim)
    if (r.added) report.twins++
  }
}

const NEGATION_HINTS = ['不对', '错误', '相反', '并非', '其实不是', '恰恰', 'never', 'wrong', 'but']
const CONFIRM_HINTS = ['不同意', '反对', '然而', '但是', '可是', 'disagree', 'however']

async function detectCollisions(db: DB, cfg: AiConfig, report: AiRunReport): Promise<void> {
  const embeddings = allEmbeddings(db)
  const bookOf = new Map(
    (db.prepare(`SELECT id, book_id FROM highlights`).all() as { id: number; book_id: number }[]).map((r) => [
      r.id,
      r.book_id
    ])
  )
  const pairs = findSimilarPairs(embeddings, bookOf, COLLISION_SIM_MIN, COLLISION_SIM_MAX, 120)
  const contentOf = new Map(
    (db.prepare(`SELECT id, content FROM highlights`).all() as { id: number; content: string }[]).map((r) => [
      r.id,
      r.content
    ])
  )
  // 预筛：至少一条带转折/否定语气词，减少无意义调用
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
      const reply = await chat(
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
          const r = upsertLink(db, target.a, target.b, 'collision', 'suggested', p.reason ?? '', target.sim)
          if (r.added) report.collisions++
        }
      }
    } catch (err) {
      report.errors.push(`对撞检测: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

export async function pickGems(db: DB, cfg: AiConfig, report: AiRunReport): Promise<void> {
  const books = db.prepare(`SELECT id, title FROM books LIMIT 80`).all() as { id: number; title: string }[]
  for (const book of books) {
    const stars = db
      .prepare(
        `SELECT id, content, favorite, revisit_count FROM highlights WHERE book_id = ?
         ORDER BY favorite DESC, revisit_count DESC, LENGTH(content) DESC LIMIT 15`
      )
      .all(book.id) as { id: number; content: string; favorite: number; revisit_count: number }[]
    if (stars.length < 3) continue
    try {
      const listing = stars.map((s, i) => `${i + 1}. ${s.content.slice(0, 100)}`).join('\n')
      const reply = await chat(
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
        updateBook(db, book.id, { gem_highlight_id: pick.id })
        report.gems++
      }
    } catch (err) {
      report.errors.push(`镇星之宝: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
}

// 对话与向量允许分属不同供应商（如 DeepSeek 对话 + SiliconFlow 向量）
export async function runAnalysis(cfg: AiConfig, embedCfg: AiConfig): Promise<AiRunReport> {
  const db: DB = getDb()
  const report: AiRunReport = {
    embedded: 0,
    nebulae: 0,
    nebulaStars: 0,
    twins: 0,
    collisions: 0,
    gems: 0,
    errors: []
  }
  await ensureEmbeddings(db, embedCfg, report)
  await buildAiNebulae(db, cfg, report)
  suggestTwins(db, report)
  await detectCollisions(db, cfg, report)
  await pickGems(db, cfg, report)
  return report
}
