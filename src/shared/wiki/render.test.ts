import { describe, expect, it } from 'vitest'
import {
  renderBookPage,
  renderComparisonPage,
  renderComparisonPairPage,
  renderConceptPage,
  renderSynthesisPage
} from './render'
import type { BookRecord, HighlightRecord } from '../types'

const book = (over: Partial<BookRecord> = {}): BookRecord =>
  ({
    id: 1,
    title: '剑来',
    author: '烽火戏诸侯',
    color: '#c97b4a',
    rating: 5,
    status: 'finished',
    short_review: '',
    gem_highlight_id: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...over
  }) as BookRecord

const star = (over: Partial<HighlightRecord> = {}): HighlightRecord =>
  ({
    id: 10,
    book_id: 1,
    chapter: '第五百一十二章',
    chapter_order: 1,
    content: '落木千山天远大，澄江一道月分明。',
    favorite: false,
    ai_tags: [],
    revisit_count: 0,
    last_revisit_at: null,
    created_at: '2026-01-02',
    thoughts: [],
    tags: [],
    ...over
  }) as HighlightRecord

describe('renderBookPage', () => {
  it('按章节组织划线，想法嵌在划线下', () => {
    const s1 = star({ thoughts: [{ id: 1, highlight_id: 10, content: '此心吾与白鸥盟', source: 'user', created_at: '2026-01-02' }] })
    const p = renderBookPage(book(), [s1])
    expect(p.page_type).toBe('book')
    expect(p.title).toBe('剑来')
    expect(p.body_md).toContain('## 第五百一十二章')
    expect(p.body_md).toContain('> 落木千山天远大')
    expect(p.body_md).toContain('💭 此心吾与白鸥盟')
  })

  it('多章节切标题，短评进档案头', () => {
    const s1 = star({ chapter: '一' })
    const s2 = star({ id: 11, chapter: '二', content: '第二条' })
    const p = renderBookPage(book({ short_review: '好书' }), [s1, s2])
    expect((p.body_md.match(/^## /gm) ?? []).length).toBe(2)
    expect(p.body_md).toContain('短评：好书')
  })
})

describe('renderConceptPage', () => {
  it('按书分组、成员划线带 [[书名]] 出链', () => {
    const p = renderConceptPage(
      { id: 3, name: '寻光', summary: '黑暗中寻找光明', source: 'ai' },
      [
        { book: { id: 1, title: '剑来' }, stars: [{ id: 1, content: '愿为灯火', chapter: '一' }] },
        { book: { id: 2, title: '三体' }, stars: [{ id: 2, content: '仰望星空', chapter: '' }] }
      ]
    )
    expect(p.title).toBe('寻光')
    expect(p.body_md).toContain('## [[剑来]]')
    expect(p.body_md).toContain('- 愿为灯火（一）')
    expect(p.body_md).toContain('- 仰望星空') // 无章节不加括号
    expect(p.links).toEqual(['剑来', '三体'])
  })

  it('同书去重出链', () => {
    const p = renderConceptPage(
      { id: 3, name: 'X', summary: '', source: 'user' },
      [
        { book: { id: 1, title: '剑来' }, stars: [{ id: 1, content: 'a', chapter: '' }] },
        { book: { id: 1, title: '剑来' }, stars: [{ id: 2, content: 'b', chapter: '' }] }
      ]
    )
    expect(p.links).toEqual(['剑来'])
  })
})

describe('renderComparisonPage', () => {
  it('双星并排，出链两端书名，标题为「书A · 书B」', () => {
    const p = renderComparisonPage(
      { id: 7, kind: 'twin', note: '' },
      { book_title: '荀子', chapter: '修身', content: '志意修则骄富贵' },
      { book_title: '剑来', chapter: '八百九', content: '志意修，则骄富贵' }
    )
    expect(p.page_type).toBe('comparison')
    expect(p.title).toBe('荀子 · 剑来')
    expect(p.body_md).toContain('## [[荀子]]')
    expect(p.body_md).toContain('## [[剑来]]')
    expect(p.links).toEqual(['荀子', '剑来'])
  })

  it('对撞带 warning 标注与理由', () => {
    const p = renderComparisonPage(
      { id: 8, kind: 'collision', note: '珍惜观相反' },
      { book_title: 'A', chapter: '', content: '轻易得来的不懂珍惜' },
      { book_title: 'B', chapter: '', content: '得到后就不再珍惜' }
    )
    expect(p.body_md).toContain('观点对撞')
    expect(p.body_md).toContain('珍惜观相反')
  })
})

describe('renderSynthesisPage', () => {
  it('源星云出链 + 版本头', () => {
    const p = renderSynthesisPage({ id: 9, title: '拾星札记', content_md: '正文', version: 2 }, '际遇')
    expect(p.body_md).toContain('[[际遇]]')
    expect(p.body_md).toContain('第 2 版')
    expect(p.links).toEqual(['际遇'])
  })
})

describe('renderComparisonPairPage', () => {
  it('同一对书多对共鸣合并一页，编号分节', () => {
    const p = renderComparisonPairPage(1, '荀子', '剑来', [
      { kind: 'twin', note: '', a: { chapter: '修身', content: '志意修则骄富贵' }, b: { chapter: '八百九', content: '志意修，则骄富贵' } },
      { kind: 'twin', note: '', a: { chapter: '荣辱', content: '自知者不怨人' }, b: { chapter: '九百九', content: '即心即佛，莫向外求' } }
    ])
    expect(p.title).toBe('荀子 · 剑来')
    expect(p.body_md).toContain('跨书共鸣（2 对）')
    expect(p.body_md).toContain('### 第 1 对')
    expect(p.body_md).toContain('### 第 2 对')
    expect(p.links).toEqual(['荀子', '剑来'])
  })

  it('含对撞时头部标注对撞数', () => {
    const p = renderComparisonPairPage(2, 'A', 'B', [
      { kind: 'collision', note: '珍惜观相反', a: { chapter: '', content: 'x' }, b: { chapter: '', content: 'y' } }
    ])
    expect(p.body_md).toContain('观点对撞（1 处）')
    expect(p.body_md).toContain('珍惜观相反')
  })
})
