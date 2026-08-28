// OpenAI 兼容薄客户端：base_url + key 可配，兼容 GLM / DeepSeek / OpenAI 等
// 所有 AI 结果由调用方落库；失败重试 3 次指数退避

export interface AiConfig {
  baseUrl: string
  apiKey: string
  chatModel: string
  embedModel: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class AiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 90_000

async function fetchJson(url: string, body: unknown, apiKey: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new AiError(`HTTP ${res.status}: ${text.slice(0, 300)}`, res.status)
    }
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (err instanceof AiError && err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err // 客户端错误不重试（key 错、模型名错等）
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
    }
  }
  throw lastErr
}

export function isAiConfigured(cfg: Partial<AiConfig> | undefined): cfg is AiConfig {
  return Boolean(cfg?.baseUrl && cfg?.apiKey && cfg?.chatModel)
}

export async function chat(cfg: AiConfig, messages: ChatMessage[], options?: { temperature?: number; json?: boolean }): Promise<string> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const data = (await withRetry(() =>
    fetchJson(
      `${base}/chat/completions`,
      {
        model: cfg.chatModel,
        messages,
        temperature: options?.temperature ?? 0.7,
        ...(options?.json ? { response_format: { type: 'json_object' } } : {})
      },
      cfg.apiKey
    )
  )) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

export async function embed(cfg: AiConfig, texts: string[]): Promise<number[][]> {
  const base = cfg.baseUrl.replace(/\/+$/, '')
  const out: number[][] = []
  const BATCH = 16
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH)
    const data = (await withRetry(() =>
      fetchJson(`${base}/embeddings`, { model: cfg.embedModel, input: batch }, cfg.apiKey)
    )) as { data?: { embedding: number[]; index: number }[] }
    const sorted = (data.data ?? []).sort((a, b) => a.index - b.index)
    for (const d of sorted) out.push(d.embedding)
  }
  if (out.length !== texts.length) throw new AiError('embedding 返回数量不符')
  return out
}

export async function testAi(cfg: AiConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await chat(
      cfg,
      [{ role: 'user', content: '回复「pong」两个字母即可' }],
      { temperature: 0 }
    )
    return { ok: reply.length > 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Float32 LE 编码用 DataView，双端通用（WebView 无 Node Buffer）
export function vectorsToBlob(v: number[]): Uint8Array {
  const buf = new Uint8Array(v.length * 4)
  const view = new DataView(buf.buffer)
  for (let i = 0; i < v.length; i++) view.setFloat32(i * 4, v[i], true)
  return buf
}

export function blobToVectors(buf: Uint8Array | ArrayBuffer | string): number[] {
  // string = base64：移动端插件桥不支持二进制绑定，embedding 以 base64 TEXT 落库
  const bytes =
    typeof buf === 'string'
      ? Uint8Array.from(atob(buf), (c) => c.charCodeAt(0))
      : buf instanceof Uint8Array
        ? buf
        : new Uint8Array(buf)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const v: number[] = []
  for (let i = 0; i < Math.floor(bytes.byteLength / 4); i++) v.push(view.getFloat32(i * 4, true))
  return v
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}
