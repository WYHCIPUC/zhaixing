// 双供应商：向量接口可独立配置（留空沿用主配置）
const fs = require('fs')

// 1. ipc.ts
let ipc = fs.readFileSync('src/main/ipc.ts', 'utf8')
const anchor = `function aiConfigFromSettings(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: s.ai_base_url?.trim(),
    apiKey: s.ai_api_key?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}`
if (!ipc.includes(anchor)) {
  console.log('ipc anchor MISS')
  process.exit(1)
}
ipc = ipc.replace(
  anchor,
  anchor +
    `

// 向量供应商可与对话分属不同平台（留空则沿用主配置）
function embedConfigFromSettings(): AiConfig | null {
  const s = getSettings(getDb())
  const cfg: Partial<AiConfig> = {
    baseUrl: (s.ai_embed_base_url || s.ai_base_url)?.trim(),
    apiKey: (s.ai_embed_key || s.ai_api_key)?.trim(),
    chatModel: s.ai_chat_model?.trim(),
    embedModel: s.ai_embed_model?.trim()
  }
  return isAiConfigured(cfg) ? cfg : null
}`
)
ipc = ipc.replace(
  "    if (!cfg) return { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: ['未配置 AI'] }\n    return runAnalysis(cfg)",
  "    if (!cfg) return { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: ['未配置 AI'] }\n    const embedCfg = embedConfigFromSettings()\n    if (!embedCfg) return { embedded: 0, nebulae: 0, nebulaStars: 0, twins: 0, collisions: 0, gems: 0, errors: ['未配置向量模型接口'] }\n    return runAnalysis(cfg, embedCfg)"
)
ipc = ipc.replace(
  "    return askSky(getDb(), cfg, question)",
  "    const embedCfg = embedConfigFromSettings()\n    if (!embedCfg) throw new Error('未配置向量模型接口')\n    return askSky(getDb(), cfg, embedCfg, question)"
)
fs.writeFileSync('src/main/ipc.ts', ipc)
console.log('ipc.ts OK')

// 2. SettingsView：新增向量独立配置字段（可选）
let sv = fs.readFileSync('src/renderer/src/views/SettingsView.tsx', 'utf8')
const embAnchor = "  { key: 'ai_embed_model', label: '向量模型', placeholder: 'embedding-3', hint: 'M2 星穹图谱的语义聚类使用' }"
if (sv.includes(embAnchor)) {
  sv = sv.replace(
    embAnchor,
    embAnchor + ",\n  { key: 'ai_embed_base_url', label: '向量 API 地址（可选）', placeholder: 'https://api.siliconflow.cn/v1', hint: '向量与对话分属不同平台时填写，留空沿用主配置' },\n  { key: 'ai_embed_key', label: '向量 API Key（可选）', placeholder: 'sk-…', password: true, hint: '例如 SiliconFlow 的 BAAI/bge-m3 免费向量' }"
  )
  fs.writeFileSync('src/renderer/src/views/SettingsView.tsx', sv)
  console.log('SettingsView OK')
} else {
  console.log('SettingsView anchor MISS（可能已改过）')
}
