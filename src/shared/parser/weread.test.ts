import { describe, expect, it } from 'vitest'
import { parseWereadText } from './weread'

const SAMPLE = `《三体》
刘慈欣
◆ 序章 疯狂的年代

>> 我们都是阴沟里的虫子，但总还是得有人仰望星空。

>> 空不是无，是一种存在。要用空这种存在来容纳满。 2024/03/15

// 这句话要反复读 2024/03/15
// 第二次读又有新感受

◆ 第二部

>> 弱小和无知不是生存的障碍，傲慢才是。

《人类简史》
作者：尤瓦尔·赫拉利
>> 一切苦难并非来自噩运、社会不公或是神祇的任性，而是出自人类自己心中所想。
`

describe('parseWereadText', () => {
  it('拆分书名、章节、划线与想法', () => {
    const r = parseWereadText(SAMPLE)
    expect(r.books).toHaveLength(2)
    expect(r.warnings).toHaveLength(0)

    const santi = r.books[0]
    expect(santi.title).toBe('三体')
    expect(santi.author).toBe('刘慈欣')
    expect(santi.chapters).toEqual(['序章 疯狂的年代', '第二部'])
    expect(santi.highlights).toHaveLength(3)

    const first = santi.highlights[0]
    expect(first.content).toBe('我们都是阴沟里的虫子，但总还是得有人仰望星空。')
    expect(first.chapter).toBe('序章 疯狂的年代')
    expect(first.thoughts).toHaveLength(0)

    const second = santi.highlights[1]
    expect(second.content).toBe('空不是无，是一种存在。要用空这种存在来容纳满。')
    expect(second.thoughts).toHaveLength(2)
    expect(second.thoughts[0].content).toBe('这句话要反复读')

    const third = santi.highlights[2]
    expect(third.chapter).toBe('第二部')
  })

  it('识别「作者：」前缀', () => {
    const r = parseWereadText(SAMPLE)
    expect(r.books[1].author).toBe('尤瓦尔·赫拉利')
  })

  it('剥离行尾日期', () => {
    const r = parseWereadText(SAMPLE)
    expect(r.books[0].highlights[1].content).not.toContain('2024')
    expect(r.books[0].highlights[1].thoughts[0].date).toContain('2024')
  })

  it('同一本书出现两次时合并', () => {
    const r = parseWereadText('《A》\n作者\n◆ 一\n>> x\n《A》\n◆ 二\n>> y\n')
    expect(r.books).toHaveLength(1)
    expect(r.books[0].highlights).toHaveLength(2)
  })

  it('无划线的书进入警告', () => {
    const r = parseWereadText('《空书》\n某某\n随便一行字\n')
    expect(r.books).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('空书'))).toBe(true)
  })

  it('悬空想法进入警告', () => {
    const r = parseWereadText('《B》\n作者\n// 没有划线的想法\n')
    expect(r.books).toHaveLength(0)
    expect(r.warnings.length).toBeGreaterThan(0)
  })
})

// ================= 格式 A：App 复制/分享（2026-08 真实样本） =================

const APP_SAMPLE = `《易中天三国经典套装：曹操＋品三国》

易中天
35个笔记

4

◆ 汉代制度，大县长官叫县令，小县叫县长。濮阳以小县而为兖州东郡的郡治

1

◆ 初一又叫朔日，照例要开朝会。崇德殿内，朝廷大臣分两列坐着

◆ 掌管御用文房四宝的守宫令荀

11

◆ 2026/07/21发表想法

三国时期文献中没有变色龙一词,该词作为中文固定词汇广泛流传主要与1884年契诃夫创作的短篇小说《变色龙》有关。

原文：变色龙

13

◆ 京兆尹是长安地区的军政长官。汉代本有两个首都。

2

◆ 豆腐是淮南王刘安的发明。可惜此人谋反事败，畏罪自杀。

◆ 2026/07/24发表想法

出自《左传 昭公四年》，春秋时期，郑国大夫子产推行改革。子产回应道：”苟利社稷，死生以之。“

子产改革比较著名的是作丘赋、铸刑书、不毁乡校。

原文：“苟利社稷，死生以之

6

◆ 挟天子而令诸侯，畜士马以讨不庭

开场白 大江东去

◆ 三国”，通常是指从汉献帝初平元年（公元190年）到晋武帝太康元年（公元280年）共九十年这段历史

-- 来自微信读书`

describe('parseWereadText · App 复制格式（真实样本）', () => {
  it('识别书名、作者与划线总数', () => {
    const r = parseWereadText(APP_SAMPLE)
    expect(r.books).toHaveLength(1)
    const b = r.books[0]
    expect(b.title).toBe('易中天三国经典套装：曹操＋品三国')
    expect(b.author).toBe('易中天')
    // 7 条原划线 + 2 条由「原文：」补建的划线
    expect(b.highlights).toHaveLength(9)
    expect(r.warnings).toHaveLength(0)
  })

  it('纯数字行作为章节号，纯文字行作为章节标题', () => {
    const r = parseWereadText(APP_SAMPLE)
    const b = r.books[0]
    const first = b.highlights[0]
    expect(first.chapter).toBe('4')
    expect(first.content).toContain('大县长官叫县令')
    const opener = b.highlights[b.highlights.length - 1]
    expect(opener.chapter).toBe('开场白 大江东去')
    expect(b.chapters).toContain('开场白 大江东去')
  })

  it('同一章节号下的多条划线正确归组', () => {
    const r = parseWereadText(APP_SAMPLE)
    const b = r.books[0]
    const group = b.highlights.filter((h) => h.chapter === '1')
    expect(group).toHaveLength(2)
  })

  it('想法块：锚点原文不在列表中时补建划线', () => {
    const r = parseWereadText(APP_SAMPLE)
    const b = r.books[0]
    const anchor = b.highlights.find((h) => h.content === '变色龙')
    expect(anchor).toBeDefined()
    expect(anchor!.thoughts).toHaveLength(1)
    expect(anchor!.thoughts![0].date).toBe('2026/07/21')
    expect(anchor!.thoughts![0].content).toContain('契诃夫')
  })

  it('想法块：锚点带引号时剥离，多段想法保留换行', () => {
    const r = parseWereadText(APP_SAMPLE)
    const b = r.books[0]
    const anchor = b.highlights.find((h) => h.content === '苟利社稷，死生以之')
    expect(anchor).toBeDefined()
    expect(anchor!.thoughts).toHaveLength(1)
    const t = anchor!.thoughts![0]
    expect(t.content).toContain('出自《左传')
    expect(t.content).toContain('子产改革比较著名的是作丘赋')
    expect(t.content).toContain('\n')
    expect(t.date).toBe('2026/07/24')
  })

  it('尾注与计数行不产生内容', () => {
    const r = parseWereadText(APP_SAMPLE)
    const b = r.books[0]
    expect(b.highlights.some((h) => h.content.includes('来自微信读书'))).toBe(false)
    expect(b.highlights.some((h) => h.content.includes('个笔记'))).toBe(false)
  })
})
