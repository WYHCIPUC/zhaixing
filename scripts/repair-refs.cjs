// 校验远端 git 对象完整性：缺失即补建，直至 commit 对象可达，然后更新 main ref
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

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: `/repos/WYHCIPUC/zhaixing${path}`,
        method,
        headers: {
          Authorization: `Bearer ${cred.password}`,
          'User-Agent': cred.username,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let s = ''
        res.on('data', (d) => (s += d))
        res.on('end', () => {
          if (res.statusCode < 300) resolve(s ? JSON.parse(s) : {})
          else {
            const e = new Error(`${res.statusCode} ${s.slice(0, 120)}`)
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

const g = (c) => execSync(c, { maxBuffer: 256 * 1024 * 1024 })

function parseEntries(buf, basePath) {
  const out = []
  let i = 0
  while (i < buf.length) {
    const sp = buf.indexOf(0x20, i)
    const mode = buf.slice(i, sp).toString()
    const nul = buf.indexOf(0x00, sp)
    const name = buf.slice(sp + 1, nul).toString('utf8')
    const sha = buf.slice(nul + 1, nul + 21).toString('hex')
    out.push({ path: name, mode, type: mode === '40000' ? 'tree' : 'blob', sha })
    i = nul + 21
  }
  return out
}

async function exists(type, sha) {
  try {
    await api('GET', `/git/${type}s/${sha}`)
    return true
  } catch (err) {
    if (err.status === 404 || err.status === 409) return false
    throw err
  }
}

async function main() {
  const commitSha = g('git rev-parse main').toString().trim()
  const lines = g('git rev-list --objects main')
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
  const blobs = []
  const trees = [] // {sha, path, depth}
  for (const line of lines) {
    const [sha, path = ''] = line.split(' ')
    const type = g(`git cat-file -t ${sha}`).toString().trim()
    if (type === 'blob') blobs.push(sha)
    else if (type === 'tree') trees.push({ sha, path, depth: path.split('/').length })
  }
  // 深层子树在前
  trees.sort((a, b) => b.depth - a.depth)
  console.log(`核对 ${blobs.length} blobs + ${trees.length} trees + 1 commit`)

  for (let round = 1; round <= 3; round++) {
    let missing = 0

    for (let i = 0; i < blobs.length; i++) {
      if (!(await exists('blob', blobs[i]))) {
        const content = g(`git cat-file blob ${blobs[i]}`)
        try {
          await api('POST', '/git/blobs', { content: content.toString('base64'), encoding: 'base64' })
          missing++
          console.log(`  补建 blob ${blobs[i].slice(0, 8)}`)
        } catch (err) {
          if (!/422/.test(err.message)) throw err
        }
      }
      if (i % 100 === 99) await new Promise((r) => setTimeout(r, 800))
    }

    for (const t of trees) {
      if (!(await exists('tree', t.sha))) {
        const entries = parseEntries(g(`git cat-file tree ${t.sha}`), t.path)
        try {
          await api('POST', '/git/trees', { tree: entries })
          missing++
          console.log(`  补建 tree ${t.sha.slice(0, 8)} (${t.path})`)
        } catch (err) {
          if (!/422/.test(err.message)) throw err
          missing++ // 可能子对象未就绪，下一轮再试
        }
      }
    }

    const commitExists = await exists('commit', commitSha)
    if (!commitExists) {
      const raw = g('git cat-file commit main').toString('utf8')
      const treeMatch = raw.match(/^tree ([0-9a-f]{40})$/m)
      const authorMatch = raw.match(/^author (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
      const committerMatch = raw.match(/^committer (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
      const message = raw.split(/\n\n/).slice(1).join('\n\n')
      const toIso = (unix, offset) => {
        const d = new Date(Number(unix) * 1000)
        const p = (x) => String(x).padStart(2, '0')
        return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${offset.slice(0, 1)}${offset.slice(1, 3)}:${offset.slice(3, 5)}`
      }
      try {
        await api('POST', '/git/commits', {
          message,
          tree: treeMatch[1],
          parents: [],
          author: { name: authorMatch[1], email: authorMatch[2], date: toIso(authorMatch[3], authorMatch[4]) },
          committer: { name: committerMatch[1], email: committerMatch[2], date: toIso(committerMatch[3], committerMatch[4]) }
        })
        missing++
        console.log('  补建 commit')
      } catch (err) {
        if (!/422/.test(err.message)) throw err
      }
    }

    console.log(`第 ${round} 轮：补建 ${missing} 个对象`)
    if (missing === 0) break
    await new Promise((r) => setTimeout(r, 3000))
  }

  // 更新 ref（最终一致性：多试几次）
  for (let i = 1; i <= 8; i++) {
    try {
      try {
        await api('POST', '/git/refs', { ref: 'refs/heads/main', sha: commitSha })
      } catch (err) {
        if (!/422/.test(err.message)) throw err
        await api('PATCH', '/git/refs/heads/main', { sha: commitSha, force: true })
      }
      const r = await api('GET', '/git/refs/heads/main')
      console.log(r.object.sha === commitSha ? '✓ 推送完成，远端 SHA 与本地一致' : '✗ SHA 不一致')
      console.log(`https://github.com/WYHCIPUC/zhaixing`)
      return
    } catch (err) {
      console.log(`ref 更新第 ${i} 次失败：${err.message.slice(0, 60)}，重试…`)
      await new Promise((r) => setTimeout(r, 5000))
    }
  }
  process.exit(1)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
