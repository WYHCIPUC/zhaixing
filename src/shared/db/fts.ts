// FTS 中文按字切分：unicode61 不会切 CJK，入库与查询统一加空格成短语
// 双端共用（桌面 repo / 手机 mobile-api），保证索引与查询口径一致
export function cjkSplit(text: string): string {
  return text
    .replace(/([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildFtsQuery(q: string): string {
  const terms = q.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return ''
  return terms.map((t) => `"${cjkSplit(t)}"`).join(' ')
}
