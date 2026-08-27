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
