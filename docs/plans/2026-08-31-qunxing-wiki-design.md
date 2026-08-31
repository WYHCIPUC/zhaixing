# 群星（摘星智库）设计 · 融合 llm_wiki 路径一/v2

## Spec Changelog
- 2026-08-31 · 初版 · 全文 · 用户确认：知识网络须在应用内浏览（v2 原生方案），模块名「群星」；llm_wiki/Obsidian 降为可选导出出口

## 背景与目标
- 一句话目标：把 llm_wiki 的"增量编译 wiki"模式原生长进摘星实录——wiki 页面在应用内编译、存储、浏览，`[[互链]]` 可点；llm_wiki 兼容导出作为可选出口。
- 动机：用户明确"整个知识网络要在我的智库里直接打开看"，不接受以 Obsidian/llm_wiki 为必需查看端。

## 范围外
- **永不**：修改 llm_wiki 代码（GPL-3.0 传染边界）；MCP/HTTP 直连（路径二）
- **以后可能**：AI 实体提取（人物/组织独立页面）——页面模型已预留 page_type 扩展；llm_wiki API 回读其它来源关联

## 决策日志
- 代码合并 vs 互操作 → **原生实现 + 兼容导出** → 技术栈不同（Tauri/Rust vs Electron）且 GPL-3.0 传染 MIT → 否决代码合并
- 查看端 → 应用内自渲染 → 用户硬需求 → 否决"依赖 llm_wiki/Obsidian 查看"
- v1 编译 → **确定性编译**（零 AI 成本、秒级、可测）→ 数据已有（书/星云/连线/文章）→ 否决 v1 即上 AI 实体提取（留二期）
- 渲染库 → marked + wikilink 预处理 → 轻量、内容自生成风险可控 → 否决 react-markdown（重）
- 增量 → body 内容哈希比对，未变跳过 → 143+ 页重复编译保持秒级

## 假设清单
- 数据规模：页面 ≤ 500，全量渲染列表无压力 → 验证：实测 / 破裂回退：分页
- 第三方契约：llm_wiki 摄取接受 md+frontmatter（README 声明 Obsidian 兼容即 md 标准）→ 验证：用户实测导入 / 破裂回退：调 frontmatter 字段
- 并发：编译与导出均主进程串行 → 不适用

## 架构与组件
- `src/shared/wiki/render.ts` [public]：纯函数页面渲染器——renderBookPage/renderConceptPage/renderComparisonPage/renderSynthesisPage；标题即 `[[]]` 链接约定（书页=书名、概念页=星云名、综合页=文章标题、对比页=「书A · 书B」）
- `src/main/wiki/compiler.ts` [internal]：DB 编排——遍历书/星云/已确认连线/文章 → 调渲染器 → SHA1 增量写 `wiki_pages`
- `src/main/wiki/exporter.ts` [internal]：导出适配器——frontmatter(type/title/sources/zhaixing) + 子目录 books/concepts/comparisons/synthesis；幂等覆盖
- `wiki_pages` 表（schema v3）：page_type/ref_id 唯一、body_md、links(JSON 标题数组)、content_hash、compiled_at
- WikiView（群星视图）：类型过滤 + 搜索 + 页面渲染 + `[[]]` 跳转（历史栈）+ 反向链接面板 + 「编译」「导出」+ 同步后自动导出开关（设置 wiki_auto_export/wiki_export_dir）

## 数据流
编译：DB 查询 → 纯渲染 → 哈希比对 → 增量写库；浏览：list → get → marked 渲染（wikilink→a[data-title]）→ 点击 getByTitle；导出：compile → 逐页 frontmatter+body → 写目录；同步钩子：syncBook 成功且 wiki_auto_export=1 → compile+export 至 wiki_export_dir

## 错误处理
- 输入异常：空星云(<3成员)跳过；无已确认连线不出 comparisons；文件名非法字符净化
- 依赖故障：导出目录不可写 → toast 报错；部分写失败 → 继续并汇总
- 状态冲突：重复编译幂等（哈希跳过）；导出覆盖旧文件（以最新为准）

## NFR
- 性能：全量编译 ≤ 2s（确定性渲染）；无其它硬约束
- 数据合规：导出仅用户自己的笔记 → 非约束

## Success Criteria
- 编译 143 书+14 星云+连线+文章 → 页面数一致，二次编译 0 新增（同步，vitest 纯渲染断言 + 手工验证）
- `[[]]` 点击跳转正确、反向链接含引用页（后置，人工）
- 导出目录含 books/concepts/comparisons/synthesis 子目录且 frontmatter 合规（同步：导出器单测路径结构）
