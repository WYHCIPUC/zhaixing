# MM0 三道门禁结果（2026-08-28）

## 门禁 A · 星野 Canvas 2D 性能 —— ✅ 有条件通过

- 环境：Pixel_7 AVD（API 36, x86_64, WHPX 加速，gfxstream 图形后端）
- 内容：真实 `StarfieldEngine` + 1000 合成星 + d3-force，10 秒采样
- **10s 均值：30.9 FPS**（区间 30–45 → 有条件通过）；日志截图 `mm0-gateA-bench.png`
- 结论与约束：
  - Canvas 2D 方案成立，不触发 WebGL 回退分支
  - 按 MM0 计划约束：MM2 星野引擎实现必须使用预渲染光晕贴图（engine 已是 sprite 方案）+ 视口裁剪，MM2 末复测
  - 注意：模拟器 gfxstream 与真机 GPU 路径不同，此数字仅为基线，MM5 真机终审

## 门禁 B · capacitor-sqlite FTS5 + unicode61 + 中文 —— ✅ 通过

- 环境同上，`@capacitor-community/sqlite@8.1.1`
- 诊断页输出（截图 `mm0-gateB-diag.png`）：
  - `CREATE VIRTUAL TABLE ... USING fts5(tokenize='unicode61')` 成功
  - cjkSplit 预处理写入后，`MATCH "一 颗 星"` 命中，snippet 正常
- 结论：与桌面 `repo.ts` 完全同构的中文检索方案在移动端可用，无需回退（FTS4/定制构建/LIKE）

## 门禁 0 · 构建/安装/运行 —— ✅ 通过

- `npm run build:mobile` → `cap sync` → `gradlew assembleDebug` → 安装启动，书架视图完整渲染（`mm0-scaffold.png`）
- 过程中解决的两个环境问题（已固化进仓库）：
  1. 项目路径含中文 → `android/gradle.properties` 加 `android.overridePathCheck=true`
  2. PATH 上的 java 是无编译器的 Maltego JRE → `org.gradle.java.home` 指向 Android Studio JBR（JDK 21）

## MM0 出口判定

三道门禁全绿（A 有条件通过但无需改设计），**按计划继续 MM1（SQLite 适配层与导入）**。
MM1 开工前置：向用户索取手机端微信读书「复制」导出样本 1–2 份补解析器回归用例。
