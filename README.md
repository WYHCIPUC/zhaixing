<div align="center">

# ✦ 摘星实录

### 读书笔记星空工作台

_不教你记住，只帮你重逢。_

每条划线是你在书页里摘下的一颗星。
它们不该躺在导出文件里落灰——把它们放上星空，连成星座，织成文章。

[![Electron 36](https://img.shields.io/badge/Electron-36-47848F?logo=electron&logoColor=white)](https://www.electronjs.org)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![SQLite + FTS5](https://img.shields.io/badge/SQLite-FTS5-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![tests](https://img.shields.io/badge/tests-47_passing-3fb950)]()
[![platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows11)]()

[功能](#-功能总览) · [快速开始](#-快速开始) · [微信读书同步](#-微信读书同步) · [AI 能力](#-ai-能力) · [技术架构](#-技术架构) · [致谢](#-致谢)

</div>

---

## 为什么做它

微信读书里的划线越多，越没人打开它：

> 划线即遗忘 · 笔记散落多书无法关联 · 导出文件躺在备忘录里吃灰

摘星实录把这条链路彻底重做：**一键同步 → 星空漫步 → 跨书关联 → 重逢回顾 → 织成文章**。

## ✨ 功能总览

| 模块 | 能力 |
|---|---|
| 📥 **导入** | 微信读书 API 一键同步（划线/想法/评分/书评，幂等去重）；或粘贴导出文本，解析器按 4 份真实样本校准、幂等可重放 |
| 📚 **书架** | 章节浏览 · 年轮批注（一颗星多次落笔，看认知变化）· 合并碎片划线 · 星标 · 标签 · FTS5 全文检索 · Markdown 导出（Obsidian 兼容） |
| 🌌 **星穹** | Canvas 星野图谱：每条划线一颗星。AI 聚类星云 · 共创连线（AI 提议你盖章）· 双星对话 · 观点对撞 · 镇星之宝 · 自造星云 · 星座志 |
| ☄️ **流星** | 每天一颗星如约而至 · 时间胶囊（"半年后见"）· 夜航模式。**无打卡、无闪卡、无焦虑** |
| 🕸️ **织星** | 星云 → AI 起草成文 → 你改定署名（版本留存）；金句重写器；苏格拉底追问；与星空对话（用你自己的划线回答你，附出处） |
| 📊 **星光节** | 摘星热力图 · 精神光谱（AI 阅读画像）· 年度星空回放 · 星空壁纸 · 金句分享卡片 |

## 🚀 快速开始

```bash
git clone https://github.com/WYHCIPUC/zhaixing.git
cd zhaixing
npm install        # .npmrc 已配置 npmmirror 镜像
npm run dev        # 开发模式
npm run dist       # 打包 Windows 安装包
```

> ⚠️ 版本约定：`electron@36` + `better-sqlite3@12.11.1`。后者 v13 起不再发布预编译包，升级前请确认新版有匹配 Electron ABI 的 prebuild。

## 📖 微信读书同步

1. 获取 weread-skills 网关的 API Key（`wrk-…`）
2. 应用内：**设置 → 微信读书同步**，填入 Key
3. 书架 → **⟳ 微信读书同步** → 逐本或全部同步
4. 命令行批量模式：`ZHAIXING_SYNC=1 npx electron .`

同步内容：划线（含真实创建时间）、想法（按原文锚点自动挂星）、评分、整本书评（落入短评）。幂等设计——重复同步零新增。原始导出文本永久存档，解析错误可重放。

## 🤖 AI 能力

**设置 → AI 接入**，填入任意 OpenAI 兼容接口（GLM / DeepSeek / Moonshot / OpenAI…）：

| 能力 | 说明 |
|---|---|
| 星云聚类 | embedding 聚类，把跨书同主题划线聚成星云并提名作综述 |
| 共创连线 | 语义相近的跨书划线结成双星；立场相悖的生成观点对撞卡 |
| 镇星之宝 | AI 为每本书选出"最你"的一条 |
| 织星成文 | 星云素材 → 随笔草稿 → 你改定署名，版本留存 |
| 与星空对话 | 用你自己的划线回答你的提问，每句附出处星链 |
| 精神光谱 | 阅读画像：主题雷达 + 读者类型判词 |

未配置 Key 时，所有手动功能照常可用。

## 🛠 技术架构

```
src/
├── main/        # 主进程：SQLite(FTS5) · 微信读书解析/同步 · AI 管线 · IPC
├── preload/     # contextBridge（与共享类型契约编译期校验）
├── shared/      # 双端共用纯逻辑：解析器 / AI 客户端 / 导出 / FTS / Schema
└── renderer/    # React：书架 / 星穹 Canvas 星野 / 流星 / 织星 / 统计
```

- **存储**：本地 SQLite（FTS5 中文检索），数据与备份均在 `%APPDATA%/zhaixing/`
- **星图渲染**：d3-force 力导向 + Canvas 自绘（视口裁剪、隐藏暂停）
- **视觉**：Notion「温暖极简」设计语言，参考 [awesome-design-md](https://github.com/VoltAgent/awesome-design-md)
- **安全**：contextIsolation；数据目录 `app.setName` 钉死；启动滚动备份 ×3；搜索通配符转义；preload 契约编译期校验

## 📦 数据与隐私

- 全部数据存本机，AI 调用仅在配置 Key 并主动触发时发生
- 导入原文永久存档于 `import_archives`，解析规则升级可重放
- 明确不做：SRS / 闪卡 / 打卡——只重逢，不记忆

## 🙏 致谢

- [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) — Notion 设计规范参考
- [weread-skills](https://github.com/VoltAgent) — 微信读书 API 网关
- [electron-vite](https://github.com/alex8088/electron-vite) · [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) · [d3-force](https://github.com/d3/d3-force) · [framer-motion](https://github.com/motiondivision/motion) · [Tailwind CSS](https://tailwindcss.com) · [lucide](https://lucide.dev) · [sonner](https://sonner.emilkowal.ski) · [Radix UI](https://www.radix-ui.com)

---

<div align="center">

✦ 把每一次心动划线，都摘成一颗星。

</div>
