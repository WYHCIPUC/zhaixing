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

// ================= 样本二：《中国式秘书》纯文字章节 =================

const SECRETARY_SAMPLE = `《中国式秘书（全三册）》

丁邦文
28个笔记

第三章

◆ 。平常，冯开岭以为人谦虚、随和而著称，可往往就是这种外观谦逊的领导，内心里却城府很深

第五章

◆ 秘书职业有许多顾忌，快嘴快舌、多嘴多舌都是其中的重点。

第九章

◆ 送礼也得看菜吃饭、对症下药

第三章

◆ 所谓调整人，实际上就是调人与整人的合二而一。

-- 来自微信读书`

describe('parseWereadText · 纯文字章节（中国式秘书）', () => {
  it('章节标题行正确识别', () => {
    const r = parseWereadText(SECRETARY_SAMPLE)
    expect(r.books).toHaveLength(1)
    const b = r.books[0]
    expect(b.author).toBe('丁邦文')
    expect(b.highlights).toHaveLength(4)
    expect(b.chapters).toContain('第三章')
    expect(b.chapters).toContain('第五章')
    expect(b.highlights[3].chapter).toBe('第三章')
    expect(b.highlights.some((h) => h.content.includes('来自微信读书'))).toBe(false)
  })
})

// ================= 样本三：《剑来》书评块与想法锚点 =================

const JIANLAI_SAMPLE = `《剑来》

烽火戏诸侯
34个笔记

点评

◆ 2020/12/30 认为好看

莫向外求，反求诸己

我与我周旋久，我心光明

第四百六十章 诸事皆宜，百无禁忌

◆ 因为天地生养万物，并无偏私。

第五百一十二章 明月当空（上）

◆ 2020/09/01发表想法

登快阁 宋 · 黄庭坚
万里归船弄长笛，此心吾与白鸥盟

原文：落木千山天远大，澄江一道月分明。

第六百二十三章 宝瓶洲的现在和未来

◆ 2020/09/26发表想法

余光中先生的散文集也提到过

原文：，人生如逆旅，我亦是行人

◆ 人生如逆旅，我亦是行人

第八百八十九章 锦上添花

◆ 2020/11/08发表想法

志意修则骄富贵
摘自《荀子·修身》

原文：志意修则骄富贵，道义重则轻王公。

◆ 2020/11/08发表想法

出自《荀子·乐论》

原文：贱礼义而贵勇力，贫则为盗，富则为贼。

-- 来自微信读书`

describe('parseWereadText · 书评块与想法锚点（剑来）', () => {
  it('「认为好看」点评块落入书籍短评', () => {
    const r = parseWereadText(JIANLAI_SAMPLE)
    const b = r.books[0]
    expect(b.short_review).toBe('莫向外求，反求诸己\n\n我与我周旋久，我心光明')
    expect(b.highlights.some((h) => h.content.includes('认为好看'))).toBe(false)
  })

  it('锚点前导标点归一化后与后续划线合并为一条', () => {
    const r = parseWereadText(JIANLAI_SAMPLE)
    const b = r.books[0]
    const matches = b.highlights.filter((h) => h.content === '人生如逆旅，我亦是行人')
    expect(matches).toHaveLength(1)
    expect(matches[0].thoughts).toHaveLength(1)
    expect(matches[0].thoughts![0].content).toContain('余光中')
  })

  it('想法锚点补建划线；连续两个想法块各自落位', () => {
    const r = parseWereadText(JIANLAI_SAMPLE)
    const b = r.books[0]
    const anchor1 = b.highlights.find((h) => h.content === '落木千山天远大，澄江一道月分明。')
    expect(anchor1?.thoughts).toHaveLength(1)
    const anchor2 = b.highlights.find((h) => h.content === '志意修则骄富贵，道义重则轻王公。')
    expect(anchor2?.thoughts).toHaveLength(1)
    const anchor3 = b.highlights.find((h) => h.content === '贱礼义而贵勇力，贫则为盗，富则为贼。')
    expect(anchor3?.thoughts).toHaveLength(1)
  })
})

// ================= 样本四：《权力密码》缩进跨段划线 =================

const POWER_SAMPLE = `《权力密码：当历史遇见经济学》

王伟
122个笔记

第一章 前言 历史与「智慧经济」

◆ 历史的价值，其实取决于你怎么看和看什么。

第二章 权力，人所欲也

◆ 所谓“权力”，说得直白点，就是你可以让别人去做他不喜欢做的事

第六章 尾声

◆ 知识不等于智慧，知识有书籍作为载体，我们只要肯去学。

    在一次次对历史的解剖中，我相信智慧会在不知不觉间慢慢地渗入我们的头脑。

-- 来自微信读书`

describe('parseWereadText · 缩进跨段（权力密码）', () => {
  it('缩进续行并入上一条划线，带空格章节标题正确识别', () => {
    const r = parseWereadText(POWER_SAMPLE)
    const b = r.books[0]
    expect(b.author).toBe('王伟')
    expect(b.highlights).toHaveLength(3)
    const last = b.highlights[2]
    expect(last.content).toContain('\n在一次次对历史的解剖中')
    expect(last.chapter).toBe('第六章 尾声')
    expect(b.chapters).toContain('第一章 前言 历史与「智慧经济」')
  })
})
