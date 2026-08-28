// 通过 GitHub Git Data API 推送本地 main 分支（github.com 主站被断时走 api.github.com）
// 利用 git 内容寻址：按本地 SHA 逐对象创建，远端提交 SHA 与本地完全一致
const { execSync } = require('child_process')
const https = require('https')

const cred = execSync('printf "protocol=https\\nhost=github.com\\n\\n" | git credential fill', {
  shell: 'bash'
})
  .toString()
  .trim()
  .split('\n')
  .map((l) => l.split('='))
  .reduce((o, [k, ...v]) => ((o[k] = v.join('=')), o), {})

const TOKEN = cred.password
const OWNER = cred.username
const REPO = 'zhaixing'
if (!TOKEN) {
  console.error('NO_TOKEN')
  process.exit(1)
}

function apiOnce(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/${OWNER}/${REPO}${path}`,
        method,
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          'User-Agent': OWNER,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let s = ''
        res.on('data', (d) => (s += d))
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(s ? JSON.parse(s) : {})
          } else {
            const err = new Error(`${res.statusCode} ${s.slice(0, 200)}`)
            err.status = res.statusCode
            reject(err)
          }
        })
      }
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function api(method, path, body) {
  let lastErr
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await apiOnce(method, path, body)
    } catch (err) {
      lastErr = err
      const retryable = !err.status || err.status >= 500 || err.status === 429
      if (!retryable || attempt === 5) throw err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }
  throw lastErr
}

const g = (cmd) => execSync(cmd, { maxBuffer: 256 * 1024 * 1024 })

async function main() {
  const localSha = g('git rev-parse main').toString().trim()
  console.log('local main =', localSha)

  // 远端 ref 已存在且指向同一提交则跳过
  try {
    const ref = await api('GET', '/git/refs/heads/main')
    if (ref.object.sha === localSha) {
      console.log('远端已是最新（sha 一致），无需推送')
      return
    }
    console.log('远端 main =', ref.object.sha, '→ 需推送')
  } catch {
    console.log('远端无 main 分支，开始创建对象…')
  }

  // 收集全部对象（本仓库路径均为 ASCII，直接按行解析）
  const lines = g('git rev-list --objects main')
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
  const blobs = []
  const trees = [] // {sha, path}
  let commitSha = null
  for (const line of lines) {
    const [sha, path = ''] = line.split(' ')
    const type = g(`git cat-file -t ${sha}`).toString().trim()
    if (type === 'blob') blobs.push({ sha, path })
    else if (type === 'tree') trees.push({ sha, path })
    else if (type === 'commit') commitSha = sha
  }
  console.log(`对象：${blobs.length} blobs, ${trees.length} trees`)

  // 1. blobs
  let done = 0
  for (const { sha } of blobs) {
    const content = g(`git cat-file blob ${sha}`)
    try {
      const r = await api('POST', '/git/blobs', {
        content: content.toString('base64'),
        encoding: 'base64'
      })
      if (r.sha !== sha) throw new Error(`blob sha 不一致 ${r.sha} != ${sha}`)
    } catch (err) {
      if (!/422/.test(err.message)) throw err // 422 = 已存在，可接受
    }
    done++
    if (done % 10 === 0) console.log(`  blobs ${done}/${blobs.length}`)
  }
  console.log('blobs 完成')

  // 2. trees（子树在前：按路径深度降序逐轮创建）
  const treeEntries = new Map(
    trees.map(({ sha, path }) => [
      sha,
      parseEntries(
        g(`git cat-file tree ${sha}`),
        path
      )
    ])
  )
  function parseEntries(buf, basePath) {
    const out = []
    let i = 0
    while (i < buf.length) {
      const sp = buf.indexOf(0x20, i)
      const mode = buf.slice(i, sp).toString()
      const nul = buf.indexOf(0x00, sp)
      const name = buf.slice(sp + 1, nul).toString('utf8')
      const sha = buf.slice(nul + 1, nul + 21).toString('hex')
      // git 树对象只存直接子项名；传完整路径会被 GitHub 额外嵌套建树导致 SHA 错位
      out.push({ path: name, mode, type: mode === '40000' ? 'tree' : 'blob', sha })
      i = nul + 21
    }
    return out
  }
  const createdTrees = new Set()
  let pending = trees.map((t) => t.sha)
  while (pending.length > 0) {
    const next = []
    for (const sha of pending) {
      const entries = treeEntries.get(sha)
      const ready = entries.every(
        (e) => e.type === 'blob' || createdTrees.has(e.sha)
      )
      if (!ready) {
        next.push(sha)
        continue
      }
      try {
        const r = await api('POST', '/git/trees', { tree: entries })
        if (r.sha !== sha) throw new Error(`tree sha 不一致 ${r.sha} != ${sha}`)
        createdTrees.add(sha)
      } catch (err) {
        if (!/422/.test(err.message)) throw err
        createdTrees.add(sha)
      }
    }
    if (next.length === pending.length) throw new Error('tree 依赖死锁')
    pending = next
  }
  console.log('trees 完成')

  // 3. commit（保留本地 author/committer/日期，确保 SHA 一致）
  const raw = g('git cat-file commit main').toString('utf8')
  const treeMatch = raw.match(/^tree ([0-9a-f]{40})$/m)
  const authorMatch = raw.match(/^author (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
  const committerMatch = raw.match(/^committer (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
  const message = raw.split(/\n\n/).slice(1).join('\n\n')
  function toIso(unix, offset) {
    const sign = offset[0]
    const hh = offset.slice(1, 3)
    const mm = offset.slice(3, 5)
    const d = new Date(Number(unix) * 1000)
    const p = (x) => String(x).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${sign}${hh}:${mm}`
  }
  const commitBody = {
    message,
    tree: treeMatch[1],
    parents: [],
    author: {
      name: authorMatch[1],
      email: authorMatch[2],
      date: toIso(authorMatch[3], authorMatch[4])
    },
    committer: {
      name: committerMatch[1],
      email: committerMatch[2],
      date: toIso(committerMatch[3], committerMatch[4])
    }
  }
  let newSha
  try {
    const r = await api('POST', '/git/commits', commitBody)
    newSha = r.sha
  } catch (err) {
    if (/422/.test(err.message)) newSha = localSha
    else throw err
  }
  if (newSha !== localSha) throw new Error(`commit sha 不一致 ${newSha} != ${localSha}`)
  console.log('commit 创建成功，SHA 一致')

  // 4. 建分支引用
  try {
    await api('POST', '/git/refs', { ref: 'refs/heads/main', sha: localSha })
  } catch (err) {
    if (!/422/.test(err.message)) throw err
    await api('PATCH', '/git/refs/heads/main', { sha: localSha, force: true })
  }

  // 5. 校验
  const ref = await api('GET', '/git/refs/heads/main')
  console.log(ref.object.sha === localSha ? '✓ 推送完成，远端 SHA 与本地一致' : '✗ 校验失败')
  console.log(`仓库地址：https://github.com/${OWNER}/${REPO}`)
}

main().catch((err) => {
  console.error('PUSH FAILED:', err.message)
  process.exit(1)
})
