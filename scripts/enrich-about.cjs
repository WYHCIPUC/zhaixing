// 丰富 GitHub About：描述 / topics / homepage / Release v0.1.0 + 安装包资产
const { execSync } = require('child_process')
const https = require('https')
const fs = require('fs')

const cred = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', {
  shell: 'bash'
})
  .toString()
  .trim()
  .split('\n')
  .map((l) => l.split('='))
  .reduce((o, [k, ...v]) => ((o[k] = v.join('=')), o), {})

const OWNER = cred.username
const REPO = 'zhaixing'

function api(hostname, path, method, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? (Buffer.isBuffer(body) ? body : JSON.stringify(body)) : null
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          Authorization: `Bearer ${cred.password}`,
          'User-Agent': cred.username,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...headers
        }
      },
      (res) => {
        let chunks = []
        res.on('data', (d) => chunks.push(d))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          if (res.statusCode < 300) {
            const ct = res.headers['content-type'] || ''
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: ct.includes('json') ? JSON.parse(buf.toString('utf8')) : buf
            })
          } else {
            const e = new Error(`${res.statusCode} ${buf.toString('utf8').slice(0, 200)}`)
            e.status = res.statusCode
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function main() {
  // 1. 描述 + 主页链接
  await api('api.github.com', `/repos/${OWNER}/${REPO}`, 'PATCH', {
    description:
      '✦ 摘星实录 — 把微信读书划线变成可漫步的星空：AI 星云图谱 · 跨书关联 · 重逢式回顾 · 织字成文。本地优先，Electron + React + SQLite。',
    homepage: `https://github.com/${OWNER}/${REPO}/releases`
  })
  console.log('✓ 描述与主页已更新')

  // 2. Topics
  const topics = [
    'electron',
    'react',
    'typescript',
    'sqlite',
    'weread',
    'reading-notes',
    'note-taking',
    'knowledge-management',
    'ai',
    'local-first',
    'data-visualization',
    'd3-force',
    'framer-motion'
  ]
  await api('api.github.com', `/repos/${OWNER}/${REPO}/topics`, 'PUT', { names: topics })
  console.log('✓ Topics 已设置:', topics.join(', '))

  // 3. tag v0.1.0 → 当前 main
  const mainSha = (
    await api('api.github.com', `/repos/${OWNER}/${REPO}/git/refs/heads/main`, 'GET')
  ).object.sha
  try {
    await api('api.github.com', `/repos/${OWNER}/${REPO}/git/refs`, 'POST', {
      ref: 'refs/tags/v0.1.0',
      sha: mainSha
    })
    console.log('✓ 标签 v0.1.0 已创建 →', mainSha.slice(0, 8))
  } catch (err) {
    if (!/422/.test(err.message)) throw err
    console.log('标签 v0.1.0 已存在')
  }

  // 4. Release
  let release
  const releases = await api('api.github.com', `/repos/${OWNER}/${REPO}/releases`, 'GET')
  release = releases.find((r) => r.tag_name === 'v0.1.0')
  if (!release) {
    release = await api('api.github.com', `/repos/${OWNER}/${REPO}/releases`, 'POST', {
      tag_name: 'v0.1.0',
      target_commitish: 'main',
      name: 'v0.1.0 · 摘星实录 首个公开版本',
      body: [
        '首个公开版本 ✦',
        '',
        '## 下载',
        '',
        '下载下方 `Zhaixing-Setup-0.1.0.exe`，双击安装即可（Windows 10+，数据全部存本机）。',
        '',
        '## 亮点',
        '',
        '- **微信读书一键同步**：划线 / 想法 / 评分 / 书评自动入库，幂等去重',
        '- **星穹图谱**：AI 星云聚类 · 共创连线 · 双星对话 · 观点对撞 · 镇星之宝',
        '- **重逢式回顾**：流星日报 · 时间胶囊 · 夜航模式（无打卡无闪卡）',
        '- **织星成文**：星云素材 AI 起草随笔，与星空对话（RAG 问答）',
        '- **星光节**：热力图 · 精神光谱 · 年度星空回放 · 金句分享卡片',
        '',
        '## 说明',
        '',
        '- AI 功能需在设置中配置 OpenAI 兼容接口（GLM / DeepSeek / OpenAI 均可）',
        '- 微信读书同步需配置 weread-skills 网关 API Key',
        '- 从源码构建：`npm install && npm run dist`'
      ].join('\n'),
      draft: false,
      prerelease: false
    })
    console.log('✓ Release v0.1.0 已创建, id =', release.id)
  } else {
    console.log('Release v0.1.0 已存在')
  }

  // 5. 上传安装包资产（107MB）
  const ASSET = 'dist/Zhaixing-Setup-0.1.0.exe'
  const hasAsset = (release.assets || []).some((a) => a.name === 'Zhaixing-Setup-0.1.0.exe')
  if (hasAsset) {
    console.log('✓ 安装包资产已存在，跳过上传')
    return
  }
  if (!fs.existsSync(ASSET)) {
    console.log('✗ 本地未找到安装包，跳过上传')
    return
  }
  const size = fs.statSync(ASSET).size
  console.log(`上传安装包（${(size / 1024 / 1024).toFixed(1)} MB）…`)
  const buf = fs.readFileSync(ASSET)
  const up = await api(
    'uploads.github.com',
    `/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=Zhaixing-Setup-0.1.0.exe`,
    'POST',
    buf,
    { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length }
  )
  console.log('✓ 资产上传完成:', up.name, up.state, `${(up.size / 1024 / 1024).toFixed(1)} MB`)
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
