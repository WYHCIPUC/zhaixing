# 摘星实录 手机App（Android 优先）开发计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把「摘星实录」桌面应用复用为 Android 手机App——同一套 React 视图、同一个 `window.api` 契约、同一套 SQLite schema，手机上可导入、浏览、检索、重逢。

**Architecture:** Capacitor 壳承载现有 React renderer（零改写）；Electron 主进程的职责（SQLite / 解析 / AI / 导出）在手机端由「shared 纯函数 + 异步 SQLite 适配器 + CapacitorHttp」重新实现为 `ZhaixingApi` 的移动实现，通过启动时 shim 注入 `window.api`，渲染层不感知平台。

**Tech Stack:** Capacitor 7 · `@capacitor-community/sqlite`（FTS5 可用性见门禁 B）· CapacitorHttp（绕 WebView CORS）· Vitest（better-sqlite3 内存库作测试执行器）· 现有 React 19 + Tailwind 4 + Canvas 2D 星野

---

## 0. 与桌面设计文档的关系

本计划是 `2026-08-27-zhaixing-design.md` 的移动端延伸，**不修改**该文档的任何决策，只做移动端映射：

| 维度 | 桌面（已定） | 手机（本计划） |
|---|---|---|
| 壳 | Electron | Capacitor（WebView 承载同一 renderer） |
| `window.api` | preload + IPC + better-sqlite3 | 启动 shim + `@capacitor-community/sqlite` 直连（异步） |
| 解析器 | `src/main/parser/weread.ts` | 迁至 `src/shared/parser/`，双端同一份 |
| schema | `connection.ts` 内嵌 SCHEMA | 迁至 `src/shared/db/schema.ts`，双端同一份 |
| FTS 中文 | `repo.ts` 的 `cjkSplit` | 抽为 `src/shared/db/fts.ts`，双端同一份（含查询侧） |
| 去重哈希 | `node:crypto` SHA-1（同步） | shared `hash.ts` 用 `crypto.subtle` SHA-1（双端输出必须逐字节一致，见 Task 1.2） |
| AI 客户端 | `src/main/ai/client.ts`（Node fetch） | 迁至 shared，WebView fetch + CapacitorHttp 绕 CORS |
| 导出 | 保存对话框 | Markdown → 系统分享面板；db 文件 → 文件分享/选取 |
| 输入 | 桌面粘贴导出文本 | 应用内粘贴（同桌面）+ Android 系统分享接收（v1.x 增量） |
| 星野渲染 | d3-force + Canvas 2D | 同一引擎；性能是门禁（门禁 A），不达标走回退分支 |
| 备份 | 启动轮换 `zhaixing.backup.db` | 同语义：启动轮换备份一份 |
| 平台 | Windows | Android 8.0+（minSdk 23）；iOS 列入「以后可能」 |
| 互通 | 单机 | v1 无自动同步；Markdown 双端互认 + db 备份文件导入导出 |

**一套代码双端复用的推论**：renderer 视图层（书架/星穹/流星/织星/统计/设置）只写一次，桌面与手机同时受益。因此手机里程碑不是重写功能，而是「桌面侧功能就绪 → 手机侧适配 + 门禁」。星穹视图依赖桌面侧星野引擎就绪（见依赖行）。

## 1. 决策日志（移动端新增）

| 选项 | 选择 | 理由 | 否决项及原因 |
|---|---|---|---|
| 移动框架 | Capacitor 7 包壳现有 renderer | `window.api` 契约 `[public]` 且渲染层零 Node 依赖 → 换一个 api 实现即可全量复用；桌面 renderer 本就是 Chromium WebView，Canvas 星野行为可平移 | React Native/Expo：视图、framer-motion、星野全要重写（Skia），双份 UI 违背 DRY，个人工具养不起 |
| 移动存储 | `@capacitor-community/sqlite`（原生 SQLite，支持事务与 blob） | 执行原生 SQL → schema 字符串可原样复用；embedding BLOB 直接存 | sql.js（WASM）：持久化要自己接管、体积大；IndexedDB：检索与 FTS 做不动 |
| 测试执行器 | Vitest + better-sqlite3 内存库包成 `AsyncSqliteExecutor` | 零新依赖；与桌面同一 SQLite 引擎，契约测试语义一致 | 真插件进 CI：慢且无法在 Node 单测里跑 |
| 哈希实现 | `crypto.subtle` SHA-1（shared，异步） | Node 19+/WebView/浏览器原生都有 `crypto.subtle`，双端输出一致 | 纯 JS sha1 库：多余依赖；保持 `node:crypto`：手机端没有 node:crypto |
| 网络请求 | CapacitorHttp（插件原生转发） | WebView 内 fetch 受 CORS 限制，用户自配 AI 端点不一定带 CORS 头 | WebView 直接 fetch：被 CORS 卡死任意端点；自建代理：过度设计 |
| 分发 | 本地 gradle 出签名 APK，侧载安装 | 个人工具，不上应用市场；本机已有 SDK 35 + JDK 17 + Pixel_7 模拟器 | EAS/应用市场：无需账号、无需审核 |
| 平台顺序 | Android 先行，iOS 以后可能 | 本机 Windows 无 Mac 签名条件；用户无 iOS 设备诉求 | iOS 同期开发：需 Mac + 开发者账号 + share extension 成本高 |

## 2. 假设清单（移动端）

| 维度 | 假设 | 验证方式 | 若破裂的回退 |
|---|---|---|---|
| 渲染性能 | Canvas 2D 星野在移动 WebView 可跑 | 门禁 A（MM0，模拟器基线 + MM5 真机复测） | 预渲染光晕贴图替代 shadowBlur → 粒子预算减半 → 换 WebGL（pixi.js）重写星野引擎 |
| SQLite 能力 | 插件支持 FTS5 + unicode61 | 门禁 B（MM0，诊断页跑真实 SQL） | FTS4 → 自带 SQLite 定制构建 → LIKE 兜底（个人规模可接受） |
| 输入样本 | 手机端微信读书「复制」文本与桌面样本同构 | MM1 前向用户索取手机路径样本 1–2 份补回归用例 | 解析规则放宽 + 导入预览逐条修正 |
| WebView 环境 | Android System WebView 经 Play 自动更新，引擎现代 | 门禁机型 Android 10+；minSdk 23 下限 | minSdk 提到 26（放弃极老旧机型，个人工具无负担） |
| 互通需求 | v1 靠导出/导入即可满足双端使用 | MM5 演示走查 | 以后可能：局域网同步（桌面为权威端，单独立项） |
| 构建环境 | 本机 SDK/模拟器可用（已确认：Pixel_7 AVD, API 36, WHPX 加速） | MM0 Task 1 实跑 | 装 Android Studio 补齐 |

## 3. 里程碑总览

| 里程碑 | 内容 | 门禁/验收 | 依赖 |
|---|---|---|---|
| MM0 | 脚手架 + 共享代码抽取 + 三道可行性门禁 | 三道门禁全绿，否则走回退分支 | 无 |
| MM1 | SQLite 适配层 + 导入 + 书架/星卡/检索 | 真实手机样本解析 100%；重复导入零新增；FTS 中文命中 | MM0 |
| MM2 | 星穹：星野引擎上机 + 手势 + 星卡/年轮 | 移动端星图交互压测基线达标 | MM1；桌面侧星野引擎就绪 |
| MM3 | 流星日报 + 时间胶囊（+可选本地通知） | 启动日报走查；胶囊到期重现 | MM1；桌面侧流星/胶囊就绪 |
| MM4 | AI 管线 + 设置页（CapacitorHttp） | 测试连接通过；无 key 时手动功能全可用 | MM1；桌面侧 AI 管线就绪 |
| MM5 | 互通（Markdown 分享、db 导出/导入）+ 签名 APK + 真机走查 | 真机全功能走查清单通过 | MM1–MM4 |

节奏约定：每里程碑结束必须「模拟器可安装、可演示」（与桌面 Success Criteria 同源）；MM2–MM5 开工前先做一次细节化补全（把该里程碑任务表展开为 MM0/MM1 级别的 bite-sized 步骤），因为细节取决于前置里程碑的产出。

---

## MM0：脚手架与可行性门禁

> MM0 的唯一使命：用最小成本验证三道门禁（构建跑通、星野性能、FTS 可用），任何一道破裂都改变后续设计，所以必须最先做。

### Task 0.1: git 初始化

**Files:** 无新建（`.gitignore` 已存在且已覆盖 `node_modules/ out/ dist/`，需补一行 `dist-mobile/` 与 `android/` 下构建产物）

**Step 1:** 修改 `.gitignore`，追加：

```
dist-mobile/
android/.gradle/
android/app/build/
android/local.properties
*.keystore
```

**Step 2:**

```bash
git init && git add -A && git commit -m "chore: 桌面端现状基线"
```

**验收:** `git status` 干净。

### Task 0.2: 解析器迁移到 shared

**Files:**
- Move: `src/main/parser/weread.ts` → `src/shared/parser/weread.ts`
- Move: `src/main/parser/weread.test.ts` → `src/shared/parser/weread.test.ts`
- Modify: `src/main/ipc.ts`（import 改为 `@shared/parser/weread`）

**Step 1:** 移动两个文件；`git mv` 保留历史。

**Step 2:** 全仓 grep `from './parser` / `from '../parser`，把 main 内引用改为 `@shared/parser/weread`。

**Step 3:** 运行 `npm test && npm run typecheck`。Expected: 原 22 个用例全 PASS，typecheck 零错误。

**Step 4:** `git commit -m "refactor: 解析器迁至 shared，桌面引用改走 @shared"`

### Task 0.3: AI 客户端与 Markdown 导出器迁移到 shared

**Files:**
- Move: `src/main/ai/client.ts` → `src/shared/ai/client.ts`
- Move: `src/main/exporters/markdown.ts` → `src/shared/exporters/markdown.ts`
- Modify: `src/main/ipc.ts` 等引用方

**Step 1:** 移动 + 改引用。**注意**：两文件必须保持零 Node/Electron import（读文件确认）；若发现 Node 依赖，只把纯函数部分迁入 shared，Node 依赖留在 main。

**Step 2:** `npm test && npm run typecheck` 全绿。

**Step 3:** `git commit -m "refactor: AI 客户端与 markdown 导出器迁至 shared"`

### Task 0.4: schema、FTS 纯函数、哈希函数共享化

**Files:**
- Create: `src/shared/db/schema.ts`（内容 = `connection.ts` 的 `SCHEMA` 常量 + `SCHEMA_VERSION = 1`）
- Create: `src/shared/db/fts.ts`（`cjkSplit` / `buildFtsQuery` 从 `repo.ts` 原样迁出）
- Create: `src/shared/hash.ts`（新增，见下）
- Modify: `src/main/db/connection.ts`（改为 `import { SCHEMA } from '@shared/db/schema'`）
- Modify: `src/main/db/repo.ts`（`cjkSplit`/`buildFtsQuery`/`starHash` 改引用 shared）
- Test: `src/shared/db/fts.test.ts`

**Step 1: 写失败测试** `src/shared/db/fts.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { buildFtsQuery, cjkSplit } from './fts'
import { starHashAsync } from '../hash'

describe('cjkSplit', () => {
  it('中文逐字切分', () => {
    expect(cjkSplit('书页里摘下的一颗星')).toBe('书 页 里 摘 下 的 一 颗 星')
  })
})

describe('buildFtsQuery', () => {
  it('中文关键词转短语查询', () => {
    expect(buildFtsQuery('一颗星')).toBe('\"一 颗 星\"')
  })
})

describe('starHashAsync 与 node:crypto 逐字节一致', () => {
  it('已知向量', async () => {
    // 期望值 = createHash('sha1').update('1\n第一章\n星星').digest('hex') 的结果，
    // 先在桌面端用 node:crypto 算出并填入：
    expect(await starHashAsync(1, '第一章', '星星')).toBe('<填入已知十六进制>')
  })
})
```

**Step 2:** 运行 `npx vitest run src/shared/db/fts.test.ts`，Expected: FAIL（模块不存在）。

**Step 3:** 写最小实现。

`src/shared/hash.ts`：

```ts
// 双端通用 SHA-1：Node 19+ 与 WebView 均内置 crypto.subtle
// 输出必须与桌面 repo.ts 的 node:crypto 版本逐字节一致（db 互通的前提）
export async function starHashAsync(bookId: number, chapter: string, content: string): Promise<string> {
  const data = new TextEncoder().encode(`${bookId}\n${chapter}\n${content}`)
  const buf = await crypto.subtle.digest('SHA-1', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}
```

`src/shared/db/fts.ts`：`cjkSplit` / `buildFtsQuery` 原样迁出，`repo.ts` 改为 import。

**Step 4:** 测试 PASS；`npm test && npm run typecheck` 全绿。

**Step 5:** `git commit -m "refactor: schema/cjkSplit/FTS 查询/哈希共享化，哈希双端一致性用例"`

### Task 0.5: Capacitor 脚手架 + 手机构建脚本

**Files:**
- Create: `capacitor.config.ts`（仓库根）
- Create: `vite.config.mobile.ts`（仓库根）
- Create: `android/`（`cap add android` 生成）
- Modify: `package.json`（scripts + 依赖）
- Modify: `src/renderer/src/main.tsx`、Create: `src/renderer/src/api/platform.ts`、Create: `src/renderer/src/api/mock-api.ts`

**Step 1:** 安装依赖：

```bash
npm i @capacitor/core @capacitor/android @capacitor-community/sqlite @capacitor/filesystem
npm i -D @capacitor/cli
```

**Step 2:** `capacitor.config.ts`：

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zhaixing.app',
  appName: '摘星实录',
  webDir: 'dist-mobile',
  server: { androidScheme: 'https' },
  plugins: {
    CapacitorHttp: { enabled: true } // WebView fetch 走原生转发，绕 CORS
  }
}
export default config
```

**Step 3:** `vite.config.mobile.ts`（renderer 单独为手机构建）：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  build: { outDir: resolve(__dirname, 'dist-mobile'), emptyOutDir: true }
})
```

**Step 4:** `package.json` scripts 追加：

```json
"build:mobile": "vite build --config vite.config.mobile.ts",
"cap:sync": "npm run build:mobile && cap sync android",
"cap:run": "npm run cap:sync && cap run android"
```

**Step 5:** `src/renderer/src/api/platform.ts`——启动 shim，渲染层不感知平台：

```ts
import { Capacitor } from '@capacitor/core'
import type { ZhaixingApi } from '@shared/types'
import { createMockApi } from './mock-api'

export function ensurePlatformApi(): void {
  const w = window as unknown as { api?: ZhaixingApi }
  if (w.api) return // 桌面：preload 已注入
  if (Capacitor.isNativePlatform()) {
    // MM1 在此接入 createMobileApi()；MM0 先用 mock
    w.api = createMockApi()
  } else {
    w.api = createMockApi() // 纯浏览器开发
  }
}
```

`src/renderer/src/api/mock-api.ts`：实现 `ZhaixingApi` 全方法的内存版（数组存 records，方法签名与 `src/shared/types.ts:136` 的接口逐一对齐；导入方法内部直接调 `@shared/parser/weread` 返回真实解析结果，入库用内存数组）。

`src/renderer/src/main.tsx` 顶部第一行逻辑前调用 `ensurePlatformApi()`。

**Step 6:** 生成 Android 壳并跑模拟器：

```bash
npm run build:mobile
npx cap add android
npm run cap:sync
```

用 zcode android-emulator 插件（或 `npx cap run android`）在 Pixel_7 AVD 上安装启动。Expected: 模拟器出现书架视图（mock 数据），截图留档到 `docs/notes/mm0-scaffold.png`。

**Step 7:** `git commit -m "feat(mobile): Capacitor 脚手架，renderer 双端构建，启动 api shim"`

### Task 0.6: 门禁 A —— 星野 Canvas 2D 性能基线

**Files:**
- Create: `src/renderer/src/bench/StarfieldBench.tsx`（1000 粒子压测页，路由 `/__bench`）
- Create: `docs/notes/mm0-gate-results.md`（门禁记录）

**实现要点**（不依赖桌面星野引擎，独立压测页）：
- 1000 粒子，位置由 `d3-force` 驱动（与规划引擎同款），每帧 `requestAnimationFrame` 重绘
- **发光必须用预渲染径向渐变贴图（offscreen canvas drawImage），禁用 `shadowBlur`**（后者是移动 WebView 头号性能杀手）
- 页面显示实时 FPS 与 10 秒均值，`devicePixelRatio` 参与计算

**Step 1:** 模拟器安装压测版，跑 10 秒，把均值 FPS 记入 `docs/notes/mm0-gate-results.md`。

**判定标准：**
- 均值 ≥ 45fps：门禁通过，Canvas 2D 方案成立
- 30–45fps：有条件通过——MM2 星野引擎实现必须用预渲染贴图 + 视口裁剪，并在 MM2 末复测
- < 30fps：门禁破裂 → 回退分支：用 pixi.js（WebGL）写 300 行内的星野原型再压测，MM2 设计随之改变

**Step 2:** 结果与决定写入 `docs/notes/mm0-gate-results.md`，`git commit -m "docs(mobile): 门禁A性能基线记录"`

### Task 0.7: 门禁 B —— capacitor-sqlite 的 FTS5 + unicode61 + 中文

**Files:**
- Create: `src/renderer/src/bench/DiagPage.tsx`（开发诊断页，路由 `/__diag`，MM5 前删除）
- Modify: `docs/notes/mm0-gate-results.md`

**Step 1:** 诊断页内嵌按钮执行以下序列（通过插件 `execute`/`run`）：

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS diag_fts USING fts5(body, tokenize = 'unicode61');
INSERT INTO diag_fts(body) VALUES ('书 页 里 摘 下 的 一 颗 星');  -- 内容按 cjkSplit 预处理
SELECT snippet(diag_fts, 0, '[', ']', '…', 8) FROM diag_fts WHERE diag_fts MATCH '"一 颗 星"';
DROP TABLE diag_fts;
```

**Step 2:** 判定：
- MATCH 命中且 snippet 正常：门禁通过（与桌面 `repo.ts` 的 cjkSplit 方案完全同构）
- 报 `no such module: fts5`：门禁破裂 → 回退分支按顺序尝试：① FTS4（`CREATE VIRTUAL TABLE ... USING fts4(tokenize=unicode61)`）② 自带定制 SQLite 构建 ③ LIKE 兜底检索（万级规模毫秒级可接受），决定记入门禁文档并修订 MM1 的检索任务

**Step 3:** 记录 + `git commit -m "docs(mobile): 门禁B FTS 验证记录"`

**MM0 出口条件：** 三道门禁均有记录结论；模拟器可安装可演示；`npm test`、`npm run typecheck`、桌面 `npm run dev` 全部不回归。

---

## MM1：存储适配层与导入（核心里程碑）

> 目标：手机端拥有与桌面语义一致的 `ZhaixingApi` 真实实现。**前置动作：向用户索取手机端微信读书「复制」导出样本 1–2 份**，为解析器补手机路径回归用例（沿用桌面 TDD 流程）。

### Task 1.1: `AsyncSqliteExecutor` 抽象 + 双实现

**Files:**
- Create: `src/shared/db/executor.ts`：

```ts
// 手机端插件与测试执行器的最小公共面
export interface AsyncSqliteExecutor {
  exec(sql: string): Promise<void>
  run(sql: string, params?: unknown[]): Promise<void>
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
}
```

- Create: `src/renderer/src/api/capacitor-executor.ts`（包 `@capacitor-community/sqlite` 的 createConnection/execute/query）
- Create: `src/shared/db/test-executor.ts`（better-sqlite3 内存库包成 async，**仅测试引用，禁止被 renderer/mobile 构建引用**）：

```ts
import Database from 'better-sqlite3'
import type { AsyncSqliteExecutor } from './executor'

export function createTestExecutor(): AsyncSqliteExecutor & { raw: Database.Database } {
  const raw = new Database(':memory:')
  raw.pragma('foreign_keys = ON')
  return {
    raw,
    exec: async (sql) => { raw.exec(sql) },
    run: async (sql, params = []) => { raw.prepare(sql).run(...(params as never[])) },
    query: async (sql, params = []) => raw.prepare(sql).all(...(params as never[])) as never
  }
}
```

### Task 1.2: schema 装载 + 迁移占位（TDD）

**Files:**
- Create: `src/shared/db/apply-schema.ts`（`applySchema(exec)`：读 `PRAGMA user_version` → 为 0 则 exec SCHEMA + 设 `user_version = 1`；大于 SCHEMA_VERSION 则拒绝初始化并抛错——为 MM5 的 db 文件互通上保险）
- Test: `src/shared/db/apply-schema.test.ts`

**Step 1: 失败测试**：空 executor → `applySchema` → 断言 `sqlite_master` 含 books/highlights/thoughts/nebulae/links/capsules/meteor_logs/highlights_fts 全部表；`user_version === 1`；向 highlights 插同一 `(book_id, content_hash)` 两次第二次抛错（去重唯一索引生效）；中文 FTS 写入后 MATCH 命中；损坏的 `user_version = 99` 库初始化抛错。

**Step 2–4:** 红 → 实现 → 绿。`connection.ts`（桌面）同步改为校验 `user_version` 后 exec 同一份 SCHEMA（行为不变）。

**Step 5:** `git commit -m "feat(db): applySchema 双端装载 + user_version 迁移护栏"`

### Task 1.3: mobile-api 逐组实现（TDD，契约测试）

**Files:**
- Create: `src/renderer/src/api/mobile-api.ts`（`createMobileApi(): ZhaixingApi`，内部持有 executor）
- Test: `src/renderer/src/api/mobile-api.test.ts`（vitest + test-executor；每实现一组方法先写用例）

**实现顺序与关键语义**（每条 = 失败用例 → 实现 → 绿 → commit）：

1. **导入**：`parseWereadText`（直接调 shared parser）；`confirmImport` = parse → 逐条 `starHashAsync` 去重（`INSERT OR IGNORE` + 统计 skipped）→ 写 `import_archives` 原文 → 全程 `BEGIN/COMMIT` 事务，语义对齐桌面 `repo.ts`（成功 N/跳过 M 报告）
2. **书**：listBooks（含 highlight_count/thought_count 子查询，SQL 对照 `repo.ts` 的 `BOOK_LIST_SQL`）/ get/update/delete（级联删除靠 `foreign_keys = ON`，capacitor 连接参数显式开启）
3. **星**：list/get/updateStar/deleteStar/mergeStars/addThought/updateThought/deleteThought/setStarTags——**每次写后按桌面 `reindexStar` 同语义同步 FTS**（用 shared `cjkSplit`）
4. **检索**：`search` 用 shared `buildFtsQuery`，返回 snippet，用例覆盖中文关键词命中
5. **导出**：`exportMarkdown` 调 shared exporter（MM5 才接系统分享，本里程碑先返回字符串）
6. **设置/统计/备份**：getSettings/setSettings/overview；`backupNow` 用 Filesystem 插件复制 db 文件为 `zhaixing.backup.db`（轮换语义同桌面；插件具体 API 以官方文档为准，验收 = 备份文件存在且可被 `applySchema` 校验通过）

**契约对齐策略**：`mobile-api.test.ts` 的用例与桌面 `repo` 行为逐条对照（同一输入 → 同一记录/报告/计数）；断言写入用例注释标明对应桌面函数名。

**Step N:** `npm test`（桌面+shared+mobile 全量）、`npm run typecheck` 全绿；`main.tsx` 的 `platform.ts` 切换为 `w.api = createMobileApi()`。

### Task 1.4: 导入向导与浏览视图的移动端适配

**Files:**
- Modify: `src/renderer/src/components/ImportWizard.tsx`（textarea 高度自适应软键盘、预览列表触控滚动、粘贴按钮用 Clipboard 插件兜底）
- Modify: `src/renderer/src/views/BookshelfView.tsx`（网格触控目标 ≥ 44px、长按出操作菜单替右键）

**验收：** 模拟器完成「粘贴真实手机样本 → 预览 → 确认入库 → 书架出现该书 → 点进星卡列表 → 检索中文关键词命中」全流程录屏/截图，存 `docs/notes/mm1-demo/`。

**MM1 出口条件：** 手机样本解析 100%；同内容二次导入 highlightsSkipped == 总数；FTS 中文命中；桌面全量测试不回归；模拟器可演示。

---

## MM2–MM5（任务框架，开工前做细节化补全）

### MM2 星穹：星野上机与手势

| 任务 | Files | 要点 |
|---|---|---|
| 星野引擎参数化 | `src/renderer/src/starfield/` | 视口裁剪 + 分批绘制（桌面 NFR 已定）必须内置；发光按门禁 A 结论选 shadowBlur/贴图/WebGL 方案 |
| 手势层 | 星穹视图 + 手势 hook | 单指拖=平移、双指捏=缩放（惯性阻尼）、点星=选中、长按=星卡抽屉；触摸目标校准 |
| 性能复测 | 压测页改真实数据源 | 1000 真实星（可造数）交互压测，对照门禁 A 基线写入 `docs/notes/` |
| 星卡/年轮移动适配 | 星卡组件、想法年轮 | 底部抽屉（bottom sheet）替桌面弹窗；想法按时间叠放年轮视图触控滑动 |

**依赖**：桌面侧星野引擎与星穹视图就绪。**出口**：模拟器星图交互流畅度 ≥ 门禁基线；星卡/年轮全功能触控可用。

### MM3 流星与胶囊

| 任务 | 要点 |
|---|---|
| 流星日报 | 启动时查当日 `capsules` 到期项 → 无则低重访星补位（语义同桌面）；日报卡移动端排版 |
| 时间胶囊 | 摘星入胶囊（选日期+留言）、到期列表；`delivered` 标记 |
| 可选：本地通知 | `@capacitor/local-notifications` 每日一条「今日流星」摘要通知；用户在设置里可关。默认不做，演示后再定 |

**依赖**：桌面侧流星/胶囊就绪。**出口**：冷启动看到当日流星；胶囊到期在日报中出现。

### MM4 AI 管线与设置

| 任务 | 要点 |
|---|---|
| 设置页移动适配 | base_url/key/model 表单 + 「测试连接」按钮；`testAi` 走 CapacitorHttp（已在 capacitor.config 全局启用，验证其生效即可） |
| embedding + 星云 | 选书 → 批量 embedding（进度条可中断）→ blob 入库 → 聚类成星云（ai 来源），JS 余弦与桌面同源 shared 化 |
| links 建议流 | 跨书相似对 → `links(suggested)` → 逐条确认/忽略的触控交互 |
| 无 key 降级走查 | 未配 key 时全部 AI 入口隐藏、手动功能可用的走查清单（桌面 Success Criteria 平移） |

**依赖**：桌面侧 AI 管线就绪。**出口**：配 GLM/DeepSeek 任一真实 key 跑通「星云 + 建议连线」；无 key 走查通过。

### MM5 互通、发布与真机验收

| 任务 | 要点 |
|---|---|
| Markdown 分享导出 | `exportMarkdown` → Filesystem 写 Cache → `@capacitor/share` 调系统分享面板 |
| db 备份导出/导入 | 导出：分享 `zhaixing.db`；导入：系统文件选择器选取 → `user_version` 校验（不匹配拒绝）→ 覆盖前自动轮换备份。**这是 v1 的双端互通路径** |
| 签名 APK | `keytool` 生成 keystore（不入库）→ `android/app/build.gradle` 配 signingConfig → `gradlew assembleRelease` → 侧载真机 |
| 删除开发面 | 移除 `/__bench`、`/__diag` 路由与 mock-api 引用（保留文件供浏览器开发） |
| 真机走查 | 用户 Android 真机按走查清单全功能验收 + 星野真机 FPS 复测（门禁 A 终审）+ 手机样本实导 |

**出口 = 项目验收：** 真机全功能走查清单通过；桌面/手机 Markdown 互导无损；桌面 db 导入手机（或反向）可用；release APK 可安装可日常使用。

---

## 4. 验收标准总表（平移桌面 Success Criteria）

| 验收标准 | 验证方法 | 验证时机 |
|---|---|---|
| 三道 MM0 门禁有结论（构建/星野/FTS） | `docs/notes/mm0-gate-results.md` | 前置（MM0 出口） |
| 手机路径样本解析 100% 正确 | 解析器回归用例 | 前置（MM1 开工索取样本即写用例） |
| 同内容二次导入零新增 | 重复导入计数断言（复用桌面用例语义） | 同步（随 mobile-api TDD） |
| FTS 中文关键词命中 | 真机/模拟器诊断页 + 人工验收 | MM1 后置 |
| 未配 key 时全部手动功能可用 | 功能走查清单 | MM4 后置 |
| 移动端星图 1000 星交互流畅 | 压测脚本（模拟器基线 + 真机终审） | MM2 / MM5 |
| 每里程碑模拟器可安装、可演示 | `npm run cap:run` 实跑 + 截图存档 | 同步（每里程碑） |
| 双端数据互通（Markdown + db 文件） | 互导验收 | MM5 后置 |

## 5. 风险与回退（移动端专属，桌面风险见原设计文档）

| 风险 | 概率 | 回退 |
|---|---|---|
| Canvas 2D 星野移动端不达标 | 中 | 预渲染贴图 → 粒子减半 → pixi.js/WebGL 重写引擎（MM0 门禁 A 已前置暴露） |
| 插件 SQLite 无 FTS5 | 中 | FTS4 → 定制构建 → LIKE 兜底（MM0 门禁 B 已前置暴露） |
| CapacitorHttp 与部分 AI 端点不兼容（如 SSE 流式） | 低 | v1 AI 功能均非流式（embedding/聚类/摘要），非流式 POST 已覆盖；流式列入以后可能 |
| 手机样本与桌面样本格式漂移 | 中 | 解析规则放宽 + 预览修正 UI（与桌面同策） |
| 模拟器性能数字失真（快于或慢于真机） | 高 | 只做基线记录，真机终审在 MM5；门禁阈值取保守值 |
| db 文件互通引入 schema 漂移 | 低 | `user_version` 护栏 + 不匹配即拒绝导入（MM1 Task 1.2） |

## 6. 移动端 YAGNI 边界

**永不**：iOS 同期开发（需 Mac/账号，用户无此条件）；自动云同步（违背数据本地硬约束）；应用市场上架；深链/Widget/手表等生态功能。

**以后可能**（不做，预留或不预留）：
- 局域网桌面↔手机直同步（桌面为权威端）→ v1 的 db 导出/导入即是其迁移路径，无额外预留
- Android 系统分享接收（微信读书直接分享进 App）→ MM1 后按需加 intent-filter，纯清单配置增量
- AI 流式输出、金句卡片生成分享图 → 独立增量，不预留
