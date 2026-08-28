// 用本机凭据管理器中的 GitHub 凭据创建仓库（令牌不落盘、不回显）
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
const USER = cred.username
if (!TOKEN) {
  console.error('NO_TOKEN')
  process.exit(1)
}

const body = JSON.stringify({
  name: 'zhaixing',
  description: '摘星实录 — 微信读书笔记星空工作台（Electron + React + SQLite）',
  private: true,
  has_issues: true,
  has_wiki: false,
  auto_init: false
})

const req = https.request(
  {
    hostname: 'api.github.com',
    path: '/user/repos',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'User-Agent': USER,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  },
  (res) => {
    let s = ''
    res.on('data', (d) => (s += d))
    res.on('end', () => {
      if (res.statusCode === 201) {
        const j = JSON.parse(s)
        console.log('CREATED:', j.html_url)
        console.log('PRIVATE:', j.private)
      } else if (res.statusCode === 422) {
        console.log('ALREADY_EXISTS')
      } else {
        console.log('API_FAIL:', res.statusCode, s.slice(0, 300))
        process.exit(1)
      }
    })
  }
)
req.on('error', (e) => {
  console.error('NETWORK:', e.message)
  process.exit(1)
})
req.write(body)
req.end()
