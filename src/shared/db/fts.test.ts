import { describe, expect, it } from 'vitest'
import { buildFtsQuery, cjkSplit } from './fts'
import { starHashAsync } from '../hash'

describe('cjkSplit', () => {
  it('中文逐字切分', () => {
    expect(cjkSplit('书页里摘下的一颗星')).toBe('书 页 里 摘 下 的 一 颗 星')
  })
  it('中英混排只切 CJK', () => {
    expect(cjkSplit('读《React》笔记')).toBe('读 《React》笔 记')
  })
})

describe('buildFtsQuery', () => {
  it('中文关键词转短语查询', () => {
    expect(buildFtsQuery('一颗星')).toBe('"一 颗 星"')
  })
  it('多词转 AND 短语', () => {
    expect(buildFtsQuery('  星空  深夜 ')).toBe('"星 空" "深 夜"')
  })
  it('空查询返回空串', () => {
    expect(buildFtsQuery('   ')).toBe('')
  })
})

describe('starHashAsync 双端一致性', () => {
  it('与 node:crypto 版本逐字节一致（固定向量，离线用 node:crypto 预先算出）', async () => {
    expect(await starHashAsync(1, '第一章', '星星')).toBe('c935d523a57d2e01570697f5719147d396c1a305')
  })
})
