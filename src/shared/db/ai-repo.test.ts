// ai-repo 契约测试：chat/embed 打桩，不触网；语义对照桌面 pipeline/spirit/weave/articles
import { beforeEach, describe, expect, it } from 'vitest'
import type { AiConfig } from '@shared/ai/client'
import { applySchema } from './apply-schema'
import { createTestExecutor, type TestExecutor } from './test-executor'
import { importParsed, listBooks, listStars } from './async-repo'
import { parseWereadText } from '../parser/weread'
import {
  allEmbeddings,
  createArticle,
  dailyCounts,
  deleteArticle,
  draftNebulaArticle,
  findSimilarPairs,
  greedyCluster,
  listArticles,
  runAnalysis,
  saveArticleVersion,
  spiritSpectrum,
  updateArticleTitle,
  type AiDeps
} from './ai-repo'

let db: TestExecutor

beforeEach(async () => {
  db = createTestExecutor()
  await applySchema(db)
})

const CFG: AiConfig = { baseUrl: 'http://stub', apiKey: 'sk-stub', chatModel: 'stub-chat', embedModel: 'stub-embed' }

// 确定性向量：内容长度决定落在哪一簇
function stubEmbed(): AiDeps['embed'] {
  return async (_cfg, texts) =>
    texts.map((t) => (t.length % 2 === 0 ? [1, 0, 0] : [0, 1, 0]))
}

// 打桩 chat：按 system 提示词角色返回确定性 JSON
function stubChat(replyFor: (system: string) => string): AiDeps['chat'] {
  return async (_cfg, messages) => {
    const sys = messages.find((m) => m.role === 'system')?.content ?? ''
    return replyFor(sys)
  }
}

const SAMPLE = `《测试书》
测试者
◆ 第一章
>> 甲一内容若干字。
>> 乙二内容另些字。
>> 丙三内容更多一些的字。
>> 丁四内容再来一条凑数。
◆ 第二章
>> 戊五内容再来一条长些。
>> 己六内容有两条。
>> 庚七内容两条整。
>> 辛八内容一条。
`

describe('embedding 存取（对照桌面 nebula.ts）', () => {
  it('写读往返（Float32 LE blob）', async () => {
    const { setEmbedding } = await import('./ai-repo')
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    await setEmbedding(db, stars[0].id, [0.25, -0.5, 2])
    const map = await allEmbeddings(db)
    expect(map.get(stars[0].id)!.map((v) => Math.abs(v))).toEqual([0.25, 0.5, 2])
  })
})

describe('聚类与跨书配对（对照桌面 greedyCluster/findSimilarPairs）', () => {
  it('greedyCluster 按相似度分簇并过滤小簇', () => {
    const m = new Map<number, number[]>([
      [1, [1, 0]],
      [2, [0.98, 0.1]],
      [3, [0, 1]],
      [4, [0.02, 0.99]]
    ])
    expect(greedyCluster(m, 0.8, 2)).toEqual([
      [1, 2],
      [3, 4]
    ])
  })

  it('findSimilarPairs 只返回跨书对', () => {
    const m = new Map<number, number[]>([
      [1, [1, 0]],
      [2, [1, 0]],
      [3, [1, 0]]
    ])
    const bookOf = new Map([
      [1, 10],
      [2, 10],
      [3, 20]
    ])
    const pairs = findSimilarPairs(m, bookOf, 0.9, 1.01)
    expect(pairs.map((p) => [p.a, p.b].sort())).toEqual([[1, 3], [2, 3]])
  })
})

describe('AI 分析管线（对照桌面 runAnalysis，打桩）', () => {
  it('embedding → 星云命名 → 双星 → 镇星 全链路', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const chat = stubChat((sys) => {
      if (sys.includes('主题分析师')) return '{"name":"星海拾遗","summary":"关于积累与成长的划线呼应。"}'
      if (sys.includes('对撞检测')) return '{"pairs":[]}'
      if (sys.includes('镇星之宝')) return '{"pick":1}'
      return '{}'
    })
    const deps: AiDeps = { chat, embed: stubEmbed() }
    const report = await runAnalysis(db, CFG, deps)

    expect(report.embedded).toBe(8)
    expect(report.gems).toBe(1)
    const { getStarMap } = await import('./async-repo')
    const book = (await listBooks(db))[0]
    expect(book?.gem_highlight_id).toBeTruthy()
    const map = await getStarMap(db)
    // 8 星按奇偶分成两簇，≥4 的簇才成星云 → 恰好 2 个 AI 星云
    expect(map.nebulae.length).toBe(2)
    expect(map.nebulae.every((n) => n.source === 'ai')).toBe(true)
  })

  it('embedding 不足 6 颗时跳过星云聚类但不报错', async () => {
    await importParsed(db, [
      { title: '小书', author: '谁', chapters: [], highlights: [{ content: '只有一条。', chapter: '一', thoughts: [] }] }
    ])
    const chat = stubChat(() => '{}')
    const report = await runAnalysis(db, CFG, { chat, embed: stubEmbed() })
    expect(report.errors).toHaveLength(0)
  })
})

describe('织星文章 CRUD（对照桌面 articles.ts）', () => {
  it('创建 → 保存版本历史 → 改题 → 删除', async () => {
    const a = await createArticle(db, null, '初稿', '第一版内容')
    expect(a.version).toBe(1)

    const v2 = await saveArticleVersion(db, a.id, '第二版内容')
    expect(v2?.version).toBe(2)
    const history = JSON.parse(v2!.history) as { version: number }[]
    expect(history).toHaveLength(1)
    expect(history[0].version).toBe(1)

    await updateArticleTitle(db, a.id, '定稿')
    const list = await listArticles(db)
    expect(list[0]).toMatchObject({ title: '定稿', version: 2 })

    await deleteArticle(db, a.id)
    expect(await listArticles(db)).toHaveLength(0)
  })

  it('draftNebulaArticle 打桩起草并存库', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const { createNebula } = await import('./async-repo')
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const neb = await createNebula(db, '积累', stars.map((s) => s.id), '', 'user', null)
    const chat = stubChat(() => '{"title":"论积累","content":"# 论积累\\n正文……"}')
    const article = await draftNebulaArticle(db, CFG, { chat, embed: stubEmbed() }, neb.id)
    expect(article.title).toBe('论积累')
    expect(article.nebula_id).toBe(neb.id)
    expect(article.nebula_name).toBe('积累')
    expect(await listArticles(db)).toHaveLength(1)
  })
})

describe('星光节（对照桌面 stats:daily / spirit.ts）', () => {
  it('dailyCounts 按日期聚合计数', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const counts = await dailyCounts(db)
    expect(counts.length).toBeGreaterThanOrEqual(1)
    expect(counts[0].count).toBe(8)
  })

  it('spiritSpectrum 打桩生成 + 缓存生效（第二次不再调用 chat）', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    let calls = 0
    const chat = stubChat(() => {
      calls++
      return '{"type_name":"星轨测绘者","type_desc":"在书页间绘图。","spectrum":[{"name":"积累","score":80}]}'
    })
    const deps: AiDeps = { chat, embed: stubEmbed() }
    const s1 = await spiritSpectrum(db, CFG, deps)
    expect(s1.type_name).toBe('星轨测绘者')
    expect(s1.spectrum[0].score).toBe(80)
    await spiritSpectrum(db, CFG, deps)
    expect(calls).toBe(1)
    // refresh=true 强制重算
    await spiritSpectrum(db, CFG, deps, true)
    expect(calls).toBe(2)
  })
})
