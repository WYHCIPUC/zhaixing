# 摘星实录

> 摘星实录不教你记住，只帮你重逢。

把微信读书的划线与想法，变成一座可以漫步的星空：每条划线是一颗星，AI 把跨书的共鸣连成星座与星云，笔记的终点是作品。

## 功能总览

- **导入**：微信读书 API 一键同步（划线/想法/评分/书评自动入库，幂等去重）或手动粘贴导出文本（解析器按 4 份真实样本校准，带回归测试）
- **书架**：章节浏览、年轮批注（一颗星多次落笔）、合并碎片划线、星标、标签、全文检索（FTS5）、Markdown 导出（Obsidian 兼容）
- **星穹**：Canvas 星野图谱（d3-force + 自绘渲染），AI 聚类星云、共创连线、双星对话、观点对撞、镇星之宝、自造星云、星座志
- **流星**：每日一颗星 + 时间胶囊 + 夜航模式（重逢系回顾，无打卡无闪卡）
- **织星**：星云 → AI 起草成文（版本留存）、金句重写器、苏格拉底追问、与星空对话（RAG 问答）
- **统计**：摘星热力图、精神光谱（AI 阅读画像）、年度星空回放、星空壁纸、金句分享卡片

## 技术栈

Electron 36 · React 18 · TypeScript · electron-vite · better-sqlite3 12（FTS5）· Tailwind CSS v4 · framer-motion · lucide-react · sonner · Radix Tooltip · d3-force

> ⚠️ **版本锁定**：`electron@36` + `better-sqlite3@12.11.1`。better-sqlite3 v13+ 不再发布预编译包，升级前必须确认新版有匹配 Electron ABI 的 prebuild，否则需要本地编译工具链。

## 开发

```bash
npm install        # 安装依赖（.npmrc 已配置 npmmirror 镜像）
npm run dev        # 开发模式
npm run test       # vitest（解析器回归 + 契约测试）
npm run typecheck  # 双端类型检查
npm run dist       # 打包 Windows 安装包（electron-builder）
```

### 微信读书同步

1. 获取 weread-skills 网关的 API Key（`wrk-…`）
2. 应用内：设置 → 微信读书同步 → 填入 Key
3. 书架 → 「⟳ 微信读书同步」→ 逐本或全部同步；命令行批量：`ZHAIXING_SYNC=1 npx electron .`

### AI 功能

设置 → AI 接入 → 填 OpenAI 兼容接口（base_url / key / 模型名，GLM / DeepSeek / OpenAI 均可）→ 测试连接 → 星穹页跑「AI 分析」。未配置 Key 时所有手动功能照常可用。

## 数据与安全

- 数据全部存本地：`%APPDATA%/zhaixing/zhaixing.db`（应用已 `app.setName` 钉死，dev 与打包版共用同一数据目录）
- 每次启动自动滚动备份最近 **3 份**（`zhaixing.backup.0/1/2.db`）
- 原始微信读书导出文本永久存档于 `import_archives` 表，解析错误可重放
- AI 调用仅在你配置了 Key 并主动触发时发生，只发送所选文本

## 已知风险与约定

- **不要多个 Agent/进程同时写入本项目源码**——曾发生并发编码覆盖事故（样本存于 `scripts/corrupted-backup/`）
- 微信读书 API 仅能导出划线与想法，书签只有数量
- 无 SRS/闪卡/打卡——产品哲学：只重逢，不记忆
- Backlog：多来源解析（Kindle/PDF）、全局摘星、金句视频、星空网页发布
