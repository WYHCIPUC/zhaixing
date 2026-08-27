import type { DB } from '../db/connection'
import { getSettings, setSettings } from '../db/repo'
import { chat, type AiConfig } from '@shared/ai/client'

export interface SpiritSpectrum {
  type_name: string
  type_desc: string
  spectrum: { name: string; score: number }[]
  generated_at: string
}

// 精神光谱：AI 分析读者全部划线 → 读者类型判词 + 主题雷达
export async function spiritSpectrum(db: DB, cfg: AiConfig): Promise<SpiritSpectrum> {
  const cached = getSettings(db)['spirit_spectrum']
  if (cached) {
    try {
      return JSON.parse(cached) as SpiritSpectrum
    } catch {
      /* 缓存损坏则重算 */
    }
  }

  const nebulae = db
    .prepare(
      `SELECT n.name, COUNT(ns.highlight_id) AS c FROM nebulae n
       LEFT JOIN nebula_stars ns ON ns.nebula_id = n.id GROUP BY n.id ORDER BY c DESC LIMIT 8`
    )
    .all() as { name: string; c: number }[]
  const samples = db
    .prepare(
      `SELECT h.content, b.title AS book FROM highlights h JOIN books b ON b.id = h.book_id
       ORDER BY h.favorite DESC, h.revisit_count DESC, RANDOM() LIMIT 24`
    )
    .all() as { content: string; book: string }[]
  const material = samples.map((s) => `《${s.book}》：${s.content.slice(0, 80)}`).join('\n')

  const reply = await chat(
    cfg,
    [
      {
        role: 'system',
        content:
          '你是阅读分析师。根据读者的摘录与其自聚的主题，给出：读者类型判词（2-4字，如「星轨测绘者」）+ 一句话判语（40字内）+ 5 维精神光谱（0-100，反映该主题在其阅读中的权重）。只输出 JSON：{"type_name":"…","type_desc":"…","spectrum":[{"name":"主题名","score":80}]}'
      },
      {
        role: 'user',
        content: `主题分布：${nebulae.map((n) => `${n.name}(${n.c})`).join('、') || '（尚无主题）'}\n\n代表性摘录：\n${material}`
      }
    ],
    { json: true, temperature: 0.6 }
  )

  let parsed: Partial<SpiritSpectrum> | null = null
  try {
    parsed = JSON.parse(reply)
  } catch {
    const m = reply.match(/\{[\s\S]*\}/)
    if (m) parsed = JSON.parse(m[0])
  }
  if (!parsed?.type_name || !Array.isArray(parsed.spectrum)) {
    throw new Error('AI 返回格式异常')
  }
  const result: SpiritSpectrum = {
    type_name: parsed.type_name.slice(0, 12),
    type_desc: parsed.type_desc?.slice(0, 80) ?? '',
    spectrum: parsed.spectrum.slice(0, 6).map((s) => ({
      name: String(s.name).slice(0, 10),
      score: Math.max(0, Math.min(100, Number(s.score) || 0))
    })),
    generated_at: new Date().toISOString().slice(0, 10)
  }
  setSettings(db, { spirit_spectrum: JSON.stringify(result) })
  return result
}

export function clearSpiritCache(db: DB): void {
  setSettings(db, { spirit_spectrum: '' })
}
