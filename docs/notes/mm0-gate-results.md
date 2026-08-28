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
（后续：MM1 的样本前置已被微信读书 API 同步路径取代，见 mm1 记录与 `src/shared/weread/api.ts`）

## MM2 门禁 A 复测（2026-08-28，干净环境）

| 场景 | 10s 均值 | 判定 |
|---|---|---|
| 300 星（bench300 变体） | **51.3 FPS**（实时 60） | 通过 |
| 1000 星（bench 变体） | **41.1 FPS** | 有条件通过（30–45 区间） |
| 1000 星（模拟器长时间高负载后的脏环境） | 12.6 FPS 且触发 ANR | **证实模拟器数字失真**，作废 |

结论：
1. 引擎实测承载力（本模拟器）：300 星满帧、1000 星 ~41 FPS；真实数据（35 星）交互流畅
2. 之前"12.6 FPS 破裂"为模拟器状态劣化假象，重启模拟器后消失——**性能测试前必须确认模拟器为冷启动干净状态**
3. WebGL/pixi 回退分支取消（无必要性证据）；千星交互优化（分批绘制/降 dpr）列入观察项，MM5 真机终审为最终判定
4. bench 页支持 `--mode bench300` 变体（`VITE_STAR_COUNT` 可配）
5. 复测截图：`mm2-gateA-retest.png`（1000 星 41.1）、`mm2-bench300.png`（300 星 51.3）
