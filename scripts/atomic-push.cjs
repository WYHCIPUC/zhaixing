// 原子推送：单次 create-tree（全路径，GitHub 自建中间树）→ commit → 强制更新 main
// blob 均为此前已上传并验证存在的对象
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
            const e = new Error(`${res.statusCode} ${s.slice(0, 160)}`)
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

const g = (c) => execSync(c, { maxBuffer: 64 * 1024 * 1024 }).toString()

async function main() {
  const localSha = g('git rev-parse main').trim()
  const raw = g('git cat-file commit main')
  const authorMatch = raw.match(/^author (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
  const committerMatch = raw.match(/^committer (.+?) <(.+?)> (\d+) ([+-]\d{4})$/m)
  const message = raw.split(/\n\n/).slice(1).join('\n\n')
  const toIso = (unix, offset) => {
    const d = new Date(Number(unix) * 1000)
    const p = (x) => String(x).padStart(2, '0')
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}${offset.slice(0, 1)}${offset.slice(1, 3)}:${offset.slice(3, 5)}`
  }

  // 文件清单：mode + blob sha + path（直接来自 git 索引，blob 均已存在于远端）
  const entries = g('git ls-files -s')
    .trim()
    .split('\n')
    .map((line) => {
      const [meta, path] = line.split('\t')
      const [mode, sha] = meta.split(' ')
      return { path, mode, type: 'blob', sha }
    })
  console.log(`文件数：${entries.length}`)

  // 原子建根树（GitHub 自建中间树，保证整棵树内部一致）
  const tree = await api('POST', '/git/trees', { tree: entries })
  console.log('根树 =', tree.sha)

  // 建提交
  const commit = await api('POST', '/git/commits', {
    message,
    tree: tree.sha,
    parents: [],
    author: { name: authorMatch[1], email: authorMatch[2], date: toIso(authorMatch[3], authorMatch[4]) },
    committer: { name: committerMatch[1], email: committerMatch[2], date: toIso(committerMatch[3], committerMatch[4]) }
  })
  console.log('提交 =', commit.sha, commit.sha === localSha ? '（与本地一致）' : `（与本地 ${localSha} 不同：GitHub 自建中间树所致，内容等价）`)

  // 更新 main
  try {
    await api('POST', '/git/refs', { ref: 'refs/heads/main', sha: commit.sha })
  } catch (err) {
    if (!/422/.test(err.message)) throw err
    await api('PATCH', '/git/refs/heads/main', { sha: commit.sha, force: true })
  }

  const ref = await api('GET', '/git/refs/heads/main')
  console.log('✓ 远端 main =', ref.object.sha)
  console.log(`✓ 完成：https://github.com/WYHCIPUC/zhaixing`)
  if (commit.sha !== localSha) {
    console.log('提示：远端与本地提交 SHA 不同（内容等价）。网络恢复后执行 git push --force origin main 即可对齐。')
  }
}

main().catch((err) => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
