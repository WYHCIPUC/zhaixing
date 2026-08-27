// 双端通用 SHA-1：Node 19+ 与 WebView 均内置 crypto.subtle
// 输出必须与桌面 repo.ts 的 node:crypto 版本逐字节一致（db 互通的前提，见 fts.test.ts 固定向量）
export async function starHashAsync(bookId: number, chapter: string, content: string): Promise<string> {
  const data = new TextEncoder().encode(`${bookId}\n${chapter}\n${content}`)
  const buf = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}
