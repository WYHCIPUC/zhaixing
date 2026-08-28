import { app } from 'electron'
import { closeDb } from './db/connection'
import { getDb } from './db/connection'
import { listNotebooks, syncBook, wereadKey } from './sync/weread'
import { getSettings } from './db/repo'
import { runAnalysis } from './ai/pipeline'
import { isAiConfigured, type AiConfig } from '@shared/ai/client'

function aiConfig(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: s.ai_base_url?.trim(),
    apiKey: s.ai_api_key?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}

// 向量供应商可独立配置，留空沿用主配置
function embedConfig(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: (s.ai_embed_base_url || s.ai_base_url)?.trim(),
    apiKey: (s.ai_embed_key || s.ai_api_key)?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}

// 无界面 AI 分析模式：ZHAIXING_AI=1 npx electron . 时执行
export async function runHeadlessAi(): Promise<void> {
  const log = (s: string): void => console.log(s)
  try {
    const cfg = aiConfig()
    if (!cfg) throw new Error('未配置 AI（设置 → AI 接入）')
    const embedCfg = embedConfig()
    if (!embedCfg) throw new Error('未配置向量模型接口')
    log(`[ai] 模型：${cfg.chatModel} / ${cfg.embedModel}，开始全量分析…`)
    log('[ai] 流程：embedding → 星云聚类 → 双星 → 观点对撞 → 镇星之宝')
    const r = await runAnalysis(cfg, embedCfg)
    log(
      `[ai] 完成：嵌入 ${r.embedded} · 星云 ${r.nebulae}（${r.nebulaStars} 星）· 双星建议 ${r.twins} · 对撞 ${r.collisions} · 镇星之宝 ${r.gems}`
    )
    if (r.errors.length > 0) {
      log(`[ai] 部分失败 ${r.errors.length} 项：`)
      r.errors.slice(0, 5).forEach((e) => log(`  - ${e}`))
    }
    closeDb()
    app.exit(r.errors.length > 0 && r.embedded === 0 ? 1 : 0)
  } catch (err) {
    console.error('[ai] 终止：', err instanceof Error ? err.message : String(err))
    closeDb()
    app.exit(1)
  }
}

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
