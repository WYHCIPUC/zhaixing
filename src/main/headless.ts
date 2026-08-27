import { app } from 'electron'
import { closeDb } from './db/connection'
import { getDb } from './db/connection'
import { listNotebooks, syncBook, wereadKey } from './sync/weread'

// 无界面全量同步模式：ZHAIXING_SYNC=1 npx electron . 时执行，供命令行批量导入
export async function runHeadlessSync(): Promise<void> {
  const log = (s: string): void => console.log(s)
  try {
    const key = wereadKey()
    if (!key) throw new Error('未配置微信读书 API Key')
    log('[sync] 拉取笔记本概览…')
    const notebooks = await listNotebooks(key)
    log(`[sync] 共 ${notebooks.length} 本有笔记的书，开始同步（并发 3）…`)

    let done = 0
    let added = 0
    let skipped = 0
    let thoughts = 0
    let failed = 0
    const queue = [...notebooks]
    const db = getDb()

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const item = queue.shift()
        if (!item) break
        const name = item.book?.title ?? item.bookId
        try {
          const r = await syncBook(db, key, item.bookId)
          done++
          added += r.highlightsAdded
          skipped += r.highlightsSkipped
          thoughts += r.thoughtsAdded
          log(
            `[sync ${done}/${notebooks.length}] ${r.bookTitle} +${r.highlightsAdded}星 ${r.thoughtsAdded}想法` +
              (r.highlightsSkipped ? ` (重复${r.highlightsSkipped})` : '') +
              (r.ratingSet ? ' (评分)' : '')
          )
        } catch (err) {
          done++
          failed++
          log(`[sync ${done}/${notebooks.length}] 失败 ${name}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    }
    await Promise.all(Array.from({ length: 3 }, () => worker()))
    log(`[sync] 完成：新增 ${added} 星 / 重复跳过 ${skipped} / 想法 ${thoughts} / 失败 ${failed} 本`)
    closeDb()
    app.exit(0)
  } catch (err) {
    console.error('[sync] 终止：', err instanceof Error ? err.message : String(err))
    closeDb()
    app.exit(1)
  }
}
