// async-repo 契约测试：与桌面 repo.ts/sync-weread.ts 行为逐条对照
// 用 node:sqlite 测试执行器跑（与两端同一 SQLite 引擎）
import { beforeEach, describe, expect, it } from 'vitest'
import { applySchema } from './apply-schema'
import { createTestExecutor, type TestExecutor } from './test-executor'
import {
  addArchive,
  deleteStar,
  deleteThought,
  findBook,
  getBook,
  getSettings,
  insertHighlight,
  insertThoughtIfNew,
  listArchives,
  listBooks,
  listStars,
  mergeStars,
  overview,
  search,
  setSettings,
  setStarTags,
  updateStar,
  updateThought,
  wereadSyncBook
} from './async-repo'
import { parseWereadText } from '../parser/weread'
import { importParsed } from './async-repo'

let db: TestExecutor

beforeEach(async () => {
  db = createTestExecutor()
  await applySchema(db)
})

const SAMPLE = `《测试书》
王小波
◆ 第一章 起点
>> 黑夜总给人错觉。
// 这句话值得记住。2024/03/15
>> 一颗星星在书页里发光。
◆ 第二章 终点
>> 想法太多，星太少。
`

describe('导入与去重（对照桌面 importParsed）', () => {
  it('真实解析样本入库：书/划线/想法计数正确', async () => {
    const parsed = parseWereadText(SAMPLE)
    expect(parsed.books.length).toBe(1)
    const r1 = await importParsed(db, parsed.books)
    expect(r1.booksAdded).toBe(1)
    expect(r1.highlightsAdded).toBe(3)
    expect(r1.thoughtsAdded).toBe(1)

    const report = { added: r1.highlightsAdded, skipped: r1.highlightsSkipped, books: r1.booksAdded }
    await addArchive(db, SAMPLE, report)
    const archives = await listArchives(db)
    expect(archives.length).toBe(1)
    expect(archives[0].preview.length).toBeGreaterThan(0)
  })

  it('同内容二次导入零新增（哈希去重）', async () => {
    const parsed = parseWereadText(SAMPLE)
    await importParsed(db, parsed.books)
    const r2 = await importParsed(db, parsed.books)
    expect(r2.booksAdded).toBe(0)
    expect(r2.highlightsAdded).toBe(0)
    expect(r2.highlightsSkipped).toBe(3)
  })
})

describe('书（对照桌面 BOOK_LIST_SQL/updateBook）', () => {
  it('列表带划线/想法计数与最近笔记时间，按最近笔记倒序', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const books = await listBooks(db)
    expect(books.length).toBe(1)
    expect(books[0].highlight_count).toBe(3)
    expect(books[0].thought_count).toBe(1)
    expect(books[0].last_note_at).toBeTruthy()

    await importParsed(db, [
      { title: '另一本', author: '某某', chapters: [], highlights: [] }
    ])
    const again = await listBooks(db)
    expect(again.length).toBe(2)
    expect(again[0].title).toBe('测试书') // 有笔记的排前面
  })

  it('updateBook 短评与评分', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const book = await findBook(db, '测试书', '王小波')
    await importParsed // noop 保持 import 完整
    const { updateBook } = await import('./async-repo')
    await updateBook(db, book!.id, { rating: 4, short_review: '值得重读' })
    const updated = await getBook(db, book!.id)
    expect(updated!.rating).toBe(4)
    expect(updated!.short_review).toBe('值得重读')
  })
})

describe('星与想法（对照桌面 listStars/updateStar/mergeStars）', () => {
  it('listStars 附带想法，favorite 更新生效', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const book = (await listBooks(db))[0]
    const stars = await listStars(db, book.id)
    expect(stars.length).toBe(3)
    const withThought = stars.find((s) => (s.thoughts?.length ?? 0) > 0)
    expect(withThought?.thoughts?.[0].content).toBe('这句话值得记住。')

    await updateStar(db, stars[0].id, { favorite: true })
    const after = await listStars(db, book.id)
    expect(after.find((s) => s.id === stars[0].id)?.favorite).toBe(true)
  })

  it('mergeStars：其余星删除、想法迁移、正文替换', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const survivor = await mergeStars(db, [stars[0].id, stars[1].id], '合并后的内容')
    const all = await listStars(db, (await listBooks(db))[0].id)
    expect(all.length).toBe(2)
    const merged = all.find((s) => s.id === survivor)!
    expect(merged.content).toBe('合并后的内容')
  })

  it('setStarTags 全量替换', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    await setStarTags(db, stars[0].id, ['历史', ' 好句 '])
    await setStarTags(db, stars[0].id, ['历史'])
    const stars2 = await listStars(db, (await listBooks(db))[0].id)
    expect(stars2.find((s) => s.id === stars[0].id)?.tags).toEqual(['历史'])
  })

  it('deleteStar 级联清理 FTS', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const target = stars.find((s) => s.content.includes('一颗星星'))!
    await deleteStar(db, target.id)
    const hits = await search(db, '一颗星星')
    expect(hits.length).toBe(0)
  })

  it('updateThought/deleteThought 后 FTS 同步', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const t = stars.find((s) => (s.thoughts?.length ?? 0) > 0)!.thoughts![0]
    await updateThought(db, t.id, '牢记在心的想法')
    expect((await search(db, '牢记在心')).length).toBe(1)
    await deleteThought(db, t.id)
    expect((await search(db, '牢记在心')).length).toBe(0)
  })
})

describe('检索（对照桌面 search：FTS 优先 + LIKE 回退）', () => {
  it('中文多词命中', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const hits = await search(db, '星星 发光')
    expect(hits.length).toBeGreaterThanOrEqual(1)
    expect(hits[0].book_title).toBe('测试书')
  })

  it('单字走 LIKE 回退', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    expect(await search(db, '黑')).toHaveLength(1)
    expect(await search(db, '  ')).toHaveLength(0)
  })
})

describe('设置与统计', () => {
  it('settings upsert 与 overview 计数', async () => {
    await setSettings(db, { ai_key: 'sk-1' })
    await setSettings(db, { ai_key: 'sk-2', base_url: 'https://x' })
    const s = await getSettings(db)
    expect(s.ai_key).toBe('sk-2')
    expect(s.base_url).toBe('https://x')

    await importParsed(db, parseWereadText(SAMPLE).books)
    const o = await overview(db)
    expect(o).toMatchObject({ bookCount: 1, highlightCount: 3, thoughtCount: 1, archiveCount: 0 })
  })

  it('insertThoughtIfNew 幂等', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const sid = stars[0].id
    expect(await insertThoughtIfNew(db, sid, '重复想法', 'user')).toBe(true)
    expect(await insertThoughtIfNew(db, sid, '重复想法', 'user')).toBe(false)
  })
})

describe('微信读书同步（对照桌面 sync/weread.ts syncBook，打桩数据）', () => {
  it('划线入库、想法按原文挂载、书评转短评、star 换算评分', async () => {
    const t = 1700000000
    const report = await wereadSyncBook(db, {
      bookmarks: {
        book: { title: '剑来', author: '烽火戏诸侯' },
        chapters: [
          { chapterUid: 1, chapterIdx: 1, title: '第一章' },
          { chapterUid: 2, chapterIdx: 2, title: '第二章' }
        ],
        updated: [
          { markText: '天不生我李淳罡。', chapterUid: 1, createTime: t },
          { markText: '大道虽宽，各走一边。', chapterUid: 2, createTime: t + 10 }
        ]
      },
      reviews: [
        // 划线想法：abstract 命中已有划线
        { review: { content: '热血！', abstract: '天不生我李淳罡。', chapterUid: 1, createTime: t + 20, star: 90 } },
        // 新想法：abstract 不在划线里 → 补建划线再挂想法
        { review: { content: '记下这句话', abstract: '“新的原文”', chapterUid: 2, createTime: t + 30 } },
        // 整本书评 → 短评
        { review: { content: '年度最佳。', createTime: t + 40 } }
      ]
    })
    expect(report.bookTitle).toBe('剑来')
    expect(report.highlightsAdded).toBe(3)
    expect(report.thoughtsAdded).toBe(2)
    expect(report.ratingSet).toBe(true)

    const book = await findBook(db, '剑来', '烽火戏诸侯')
    expect(book!.rating).toBe(Math.round(90 / 20))
    expect(book!.short_review).toBe('年度最佳。')

    const stars = await listStars(db, book!.id)
    const withThought = stars.find((s) => s.content === '天不生我李淳罡。')
    expect(withThought?.thoughts?.map((x) => x.content)).toContain('热血！')

    // 二次同步全跳过
    const report2 = await wereadSyncBook(db, {
      bookmarks: {
        book: { title: '剑来', author: '烽火戏诸侯' },
        chapters: [{ chapterUid: 1, chapterIdx: 1, title: '第一章' }],
        updated: [{ markText: '天不生我李淳罡。', chapterUid: 1, createTime: t }]
      },
      reviews: [{ review: { content: '热血！', abstract: '天不生我李淳罡。', chapterUid: 1, createTime: t + 20, star: 90 } }]
    })
    expect(report2.highlightsAdded).toBe(0)
    expect(report2.highlightsSkipped).toBe(1)
    expect(report2.thoughtsAdded).toBe(0)
    expect(report2.thoughtsSkipped).toBe(1)
  })
})

// ---------- 星穹图谱（对照桌面 nebula.ts） ----------

describe('星穹图谱（对照桌面 getStarMap/createNebula/listLinks/bumpRevisit）', () => {
  it('建星云 → getStarMap 返回成员/星云/镇星', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const { listBooks } = await import('./async-repo')
    const book = (await listBooks(db))[0]
    const stars = await listStars(db, book.id)

    const { createNebula } = await import('./async-repo')
    const neb = await createNebula(db, '重逢星云', stars.slice(0, 2).map((s) => s.id), '测试星云', 'user', '#aabbcc')
    expect(neb.star_count).toBe(2)
    expect(neb.name).toBe('重逢星云')

    const { getStarMap, setGem } = await import('./async-repo')
    await setGem(db, stars[0].id)
    const map = await getStarMap(db)
    expect(map.stars.length).toBe(3)
    expect(map.nebulae.length).toBe(1)
    expect(map.links.length).toBe(0)
    const first = map.stars.find((s) => s.id === stars[0].id)!
    expect(first.is_gem).toBe(true)
    expect(first.nebula_ids).toContain(neb.id)
    expect(first.book_title).toBe('测试书')
  })

  it('手动连线 upsert（含 dismissed 复活）与决定/删除', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const { createManualLink, listLinks, decideLink, deleteLink } = await import('./async-repo')
    await createManualLink(db, stars[0].id, stars[1].id, '共鸣')
    let links = await listLinks(db, 'confirmed')
    expect(links.length).toBe(1)
    expect(links[0].from_content).toBe(stars[0].content)
    expect(links[0].to_book).toBe('测试书')

    // 重复建 → added=false
    const { upsertLink } = await import('./async-repo')
    expect((await upsertLink(db, stars[0].id, stars[1].id, 'manual', 'confirmed', 'x', null)).added).toBe(false)

    // dismissed → 建议复活
    await decideLink(db, links[0].id, 'dismissed')
    expect(await listLinks(db, 'confirmed')).toHaveLength(0)
    const revived = await upsertLink(db, stars[0].id, stars[1].id, 'manual', 'suggested', 'y', 0.9)
    expect(revived.added).toBe(true)
    expect(await listLinks(db, 'suggested')).toHaveLength(1)

    await deleteLink(db, links[0].id)
    expect(await listLinks(db, 'suggested')).toHaveLength(0)
  })

  it('重访计数与 topRevisited 排序', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const { bumpRevisit, topRevisited } = await import('./async-repo')
    await bumpRevisit(db, stars[0].id)
    await bumpRevisit(db, stars[0].id)
    await bumpRevisit(db, stars[1].id)
    const top = await topRevisited(db, 10)
    expect(top[0].id).toBe(stars[0].id)
    expect(top[0].revisit_count).toBe(2)
    expect(top[0].book_title).toBe('测试书')
  })

  it('星云增删成员与更新/删除', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const { createNebula, addStarsToNebula, removeStarFromNebula, updateNebula, deleteNebula, getStarMap } =
      await import('./async-repo')
    const neb = await createNebula(db, 'N', [stars[0].id], '', 'user', null)
    await addStarsToNebula(db, neb.id, [stars[1].id, stars[1].id])
    await removeStarFromNebula(db, neb.id, stars[0].id)
    await updateNebula(db, neb.id, { name: 'N2', color: '#ffffff' })
    let map = await getStarMap(db)
    expect(map.nebulae[0]).toMatchObject({ name: 'N2', star_count: 1, color: '#ffffff' })
    expect(map.stars.find((s) => s.id === stars[1].id)!.nebula_ids).toContain(neb.id)
    await deleteNebula(db, neb.id)
    map = await getStarMap(db)
    expect(map.nebulae).toHaveLength(0)
    expect(map.stars.every((s) => s.nebula_ids.length === 0)).toBe(true)
  })
})

// ---------- 流星与时间胶囊（对照桌面 meteor.ts） ----------

describe('流星与时间胶囊（对照桌面 getMeteor/createCapsule/nightFlightStars）', () => {
  it('无数据时返回空流星', async () => {
    const { getMeteor } = await import('./async-repo')
    const m = await getMeteor(db)
    expect(m.logId).toBe(0)
    expect(m.star).toBeNull()
  })

  it('随机流星：每天只生成一次，markMeteorRevisited 只计一次', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const { getMeteor, markMeteorRevisited, listStars } = await import('./async-repo')
    const m1 = await getMeteor(db)
    expect(m1.star).toBeTruthy()
    expect(m1.source).toBe('random')
    const m2 = await getMeteor(db) // 同一天再查 → 同一条
    expect(m2.logId).toBe(m1.logId)
    expect(m2.star?.id).toBe(m1.star?.id)

    await markMeteorRevisited(db, m1.logId)
    await markMeteorRevisited(db, m1.logId) // 重复标记不重复计数
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const hit = stars.find((s) => s.id === m1.star!.id)!
    expect(hit.revisit_count).toBe(1)
  })

  it('到期胶囊优先成为流星并标记已投递', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const { createCapsule, getMeteor, listCapsules } = await import('./async-repo')
    await createCapsule(db, stars[2].id, '2026-01-01', '来自过去的星')
    const m = await getMeteor(db)
    expect(m.source).toBe('capsule')
    expect(m.capsuleMessage).toBe('来自过去的星')
    expect(m.star?.id).toBe(stars[2].id)
    const capsules = await listCapsules(db)
    expect(capsules[0].delivered).toBe(1)
  })

  it('未到期胶囊不投递、正常列出', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const stars = await listStars(db, (await listBooks(db))[0].id)
    const { createCapsule, getMeteor, listCapsules } = await import('./async-repo')
    await createCapsule(db, stars[0].id, '2099-12-31', '未来')
    const m = await getMeteor(db)
    expect(m.source).toBe('random')
    const capsules = await listCapsules(db)
    expect(capsules.length).toBe(1)
    expect(capsules[0].book_title).toBe('测试书')
  })

  it('nightFlightStars 偏向低重访星且带书名', async () => {
    await importParsed(db, parseWereadText(SAMPLE).books)
    const { nightFlightStars } = await import('./async-repo')
    const nf = await nightFlightStars(db, 2)
    expect(nf.length).toBe(2)
    expect(nf[0].book_title).toBe('测试书')
  })
})
