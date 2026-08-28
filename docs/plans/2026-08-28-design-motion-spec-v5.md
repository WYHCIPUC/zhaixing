# 摘星实录 · 视觉与动效升级总体 Spec（v5）

日期：2026-08-28 · 状态：待评审 → 分阶段实施
规范来源：`apple-design` + `emil-design-eng`（原则/细节）、`animation-vocabulary`（术语）、`find-animation-opportunities`（机会门控）、`improve-animations`（审计与计划）、`review-animations`（验收标准），辅以 `minimalist-ui` / `stitch-design-taste` 的排版与性能纪律。
基线：**v4「Notion 温暖极简」令牌不推翻，只增补修订**（styles.css）。本 spec 是后续所有 UI/动效改动的唯一依据；执行任何改动前先读本文。

---

## 0. 定位一句话

**「亮房间里推开窗看星空的安静书房」。**
外壳是温暖极简的书房（炭墨×白灰×琥珀单强调），星穹是房间里的深空观景窗。气质是**专业的克制**，不是玩具的活泼——动效整体偏短、偏少、无弹跳；弹跳只留给稀有时刻。

性格参数（stitch 语境）：Density 5（书房不拥挤）· Variance 3（结构对称可预期）· **Motion 4**（流体但克制——执行层选 Static 侧）。

---

## 1. 设计原则（apple-design 八原则 → 摘星六条）

1. **即时反馈**：按压在 pointer-down 就有反馈（`:active` scale），不等 click；拖拽 1:1 跟手。
2. **可打断**：一切动效可被新操作打断并从当前值续接（transition/spring，禁用不可打断的 keyframes 做动态 UI）。
3. **空间一致**：从哪来回哪去；抽屉从右进从右出；弹层从触发器长出来（modal 例外，居中）。
4. **频率决定动静**：越常见的操作动效越短越少；键盘触发的操作（Ctrl+K 等）零动效。
5. **只动该动的**：每次动效必须能说出目的（反馈/空间指引/状态说明/避免跳变/讲解），说不出就不动。
6. **打磨即信任**：排版、对齐、令牌全部可辩护，无随机值；reduce-motion 下保留理解性过渡、去掉位移。

---

## 2. 视觉令牌 v4.1（增量修订，全部进 styles.css `:root`）

### 2.1 不变项（重申纪律）
色彩、圆角（按钮 8 / 卡片 12）、阴影三档、莫兰迪书色盘、琥珀单强调——**维持 v4**。
组件类必须写在 `@layer components` 内（历史事故约定）。书架/详情渐进披露结构不动。

### 2.2 修订项

| 项 | 现状 | 修订 | 依据 |
| --- | --- | --- | --- |
| Toast 配色 | `App.tsx:52-53` 紫调阴影 `rgba(150,100,180,.18)`、墨色 `#322b3d` | 影 `var(--shadow-lg)`、字 `var(--text)`，底改 `rgba(255,255,255,.88)` | 令牌一致性（现偏离 v4 色域） |
| 排印 | 全局 14px/1.55，无 scale | 增补字阶（下表） | apple-design §15 |
| 材质 | 仅 toast/search 用 blur | 浮动层材质规范（下） | apple-design §12 |

**字阶（外壳）**——层级靠 字重+字号+行高 组合，不靠加大字号：
- display（各屏标题）：20px / 600 / lh 1.2 / **letter-spacing −0.01em**
- h2 区块题：15px / 600 / lh 1.35 / −0.005em
- 正文：14px / 400 / lh 1.55 / 0
- caption 辅注：12px / 400 / lh 1.4 / +0.01em
- 数字一律 `tabular-nums`（body 已设，删除处需补回）

**浮动层材质**（SearchOverlay / Hint / 移动端顶栏 / toast）：
`background: rgba(255,255,255,.72); backdrop-filter: blur(20px) saturate(180%); border: 1px solid rgba(255,255,255,.6);`
规则：轻材质不叠轻材质（抽屉 StarDrawer 保持不透明白）；材质上的文字对比要加档（不用 `--text-faint`）；材质进出场 scale+blur 同动，不是纯 fade。
**z 阶固化**：画布 0 < 内容 10 < NebulaPanel 50 < StarDrawer 60 < LinkReview 70 < 材质浮层(搜索/Hint) 80 < toast（sonner 默认）。

---

## 3. 动效系统（核心）

### 3.1 动效令牌（新增到 `:root`，全项目只准用这套值）

```css
/* 缓动 —— 进出/响应一律 ease-out 家族；屏内位移用 in-out；禁 ease-in */
--ease-out:      cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out:   cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer:   cubic-bezier(0.32, 0.72, 0, 1);   /* 抽屉/ sheet 专用 */

/* 时长档 —— UI 一律 ≤300ms；超档需在代码注释写明目的 */
--dur-1: 120ms;  /* 按压/hover/焦点 */
--dur-2: 200ms;  /* 弹层、tooltip、小面板、视图切换 */
--dur-3: 280ms;  /* 抽屉、大面板进场 */
--dur-4: 450ms;  /* 仅「稀有时刻」白名单可用（见 §5） */

/* 弹簧预设（framer-motion v13 支持 bounce/duration API） */
/* settle：默认，无弹跳 —— 抽屉、面板、布局变化 */
{ type: 'spring', duration: 0.4, bounce: 0 }
/* flick：仅跟手手势的释放 —— bounce ∈ [0.15, 0.2] */
{ type: 'spring', duration: 0.5, bounce: 0.18 }

/* stagger */
--stagger: 40ms;   /* 组进出场间隔，30–80ms 区间取中 */
```

**收敛映射**：现存散落参数全部归位——`stiffness 420/damping 34`、`300/32`、`500/32` 等→ `settle`；`damping 15–18` 的弹跳→ 仅手势场景改 `flick`；`duration 0.14/0.18`→`--dur-1/2`；`0.22/0.35`→`--dur-2/3`；`0.5/0.6`→`--dur-3`（说明用途）；`0.9/1.2`（非 spinner）→ 压到 `--dur-3`；`SyncDialog` 1.2s `linear` 无限旋转**保留**（spinner 用 linear 正确）。

### 3.2 摘星频率地图（动效判定的第一问）

| 频层 | 面 | 动效政策 |
| --- | --- | --- |
| 100+/会话 | 侧栏导航、Ctrl+K 搜索开关、按钮/hover、卡片悬停 | 反馈只留 `--dur-1` 微动；**搜索开启零动效**（键盘触发，禁动画） |
| 10+/会话 | StarDrawer 开关、想法输入、标签、流星翻星 | 标准短动效（--dur-2/3），抽屉可跟手 |
| 偶尔 | AI 分析运行、织星起草、导入向导、同步、设置 | 标准动效 + 过程状态动画 |
| 稀有 | 摘星入库、夜航、年度回顾、镇星之宝揭示、AI 成文完成 | **delight 预算**：允许 bounce、stagger 慷慨、--dur-4 |

### 3.3 十条硬规则（= 验收门，源自 review-animations）

1. 每个动效能答「为什么动」（五个目的之一）；高频面上「好看」不成立。
2. 频率匹配（§3.2 地图）；键盘触发动作为零动效。
3. 进出用 `--ease-out` 家族；`ease-in` 是 block。
4. UI ≤300ms；超时须注释理由。
5. 起跳从不 `scale(0)`——用 `scale(0.95~0.97)+opacity:0`；弹层 origin 跟触发器，modal 居中豁免。
6. 动态 UI 必须可打断：transition 或 spring，禁 keyframes（纯装饰/预定路径除外）。
7. 只动 `transform`/`opacity`；framer-motion 重负载场景写 `transform` 字符串而非 `x/y/scale`。
8. `prefers-reduced-motion`：保留 opacity/颜色过渡（200ms），去位移/视差/无限循环；`@media (hover:hover) and (pointer:fine)` 门控 hover 动效（Capacitor 端必查）。
9. 进出不对称：进场 `--dur-3`，退场 ≈ `--dur-2` 且同路径；「用户在决定」的慢（长按确认 2s linear）与「系统响应」的快分开。
10. 气质统一：全应用一套缓动一套时长档；删不掉理由的动效就删。

---

## 4. 分面规格

### 4.1 全局壳
- **视图切换**（App.tsx:63-71）：现 180ms fade+y 基本合格。修订：进场 `y:10→0, opacity, 200ms --ease-out`；退场 `y:0→-6, opacity, 140ms --ease-out`（退场更快）；`AnimatePresence mode="wait"` 保留。
- **Toast**（sonner）：默认动效保留（进出同边、可拖拽甩出），只修配色（§2.2）。
- **Hint(Tooltip)**：`125ms --ease-out, scale 0.97→1, origin 跟锚点`；连续悬停多个时后续零延迟零动画。
- **SearchOverlay**：Ctrl+K 触发 → **挂载即现，无进场动画**；Esc 关闭可留 120ms fade。材质按 §2.2。
- **按钮**：`:active { transform: scale(0.97) }` + `transition: transform 160ms var(--ease-out)`（现 0.98/0.1s ease 收敛到统一值）；`.btn-primary` 同规格。

### 4.2 书架 / 书详情
- 网格卡片进场均 `opacity:0 + translateY(8px) + scale(0.98)` → 复位，`--dur-3 --ease-out`，组内 stagger `--stagger`，首屏一次（reload 不重放）；stagger 纯装饰，不阻塞交互。
- `panel-hover` 保留 translateY(-1px)+影，transition 属性列明并改 `var(--ease-out)`。
- 开书 = 渐进披露已定稿；书内章节/笔记列表展开用高度+opacity 过渡（accordion 模式），禁瞬间 `{open && <div>}`。
- `BookshelfView.tsx:80` 的 `duration:3 repeat:∞` 环境浮动：**删除**；若为空态插画保留动效，则仅空态用且纳入 reduce-motion 降级。

### 4.3 星穹 SkyView + 三抽屉
- **画布（starfield/engine.ts）**：深空观景窗是产品灵魂，**环境动效保留**（星尘/银河/辉光为身份性存在，归「Rare 高预算」）；但必须：① `prefers-reduced-motion` 时停在单帧（无闪烁/无漂移），② 帧预算 60fps，星星增量渲染，③ 之上浮层文字满足 vibrancy 对比。
- **StarDrawer（z60 不透明）**：右侧滑入，`--ease-drawer 280ms` 进 / `200ms` 出，同边退场；移动端跟手拖拽 + 速度甩出判定 `|距离/时长| > 0.11px/ms`，边界 rubber-band 不硬挡。
- **NebulaPanel（z50）**：面板从触发星云方向 scale 0.96+opacity 进场（origin 指向画布锚点）。
- **LinkReview（z70）**：卡片切换 crossfade 200ms，观感发虚则加 `filter: blur(2px)` 桥接（<20px）。
- 分析运行态：雷达扫描类动画可保留，但参数从 `scale(0.3) rotate(-30deg)` 起跳改 `scale(0.96)+opacity`（见 §6）。

### 4.4 流星 / 统计 / 织星 / 设置
- 流星拖入（2.2s easeOut）：稀有面，保留；reduce-motion 降级为 crossfade 换卡。
- 统计（StatsView）：数字滚动用 tabular-nums + `--dur-3 --ease-out`（现 0.6–0.9s 收敛）；柱/格入场 stagger 40ms、单格 `scale(0.96)+opacity`；图表是**要读的数据**——除进场外不加装饰动。
- 织星（WeaveView）：AI 起草等待用骨架屏（shimmer 按布局尺寸，`--ease-in-out` 1.2s linear 循环，reduce-motion 时改静态占位）；成文完成属稀有时刻，正文 `opacity + blur(2px→0)` 450ms 材质化进场。
- 设置：普通表单，仅 --dur-1 反馈；开关类组件保留即时切换。

### 4.5 稀有时刻 delight 预算（唯一允许 --dur-4 / bounce 的清单）
1. 摘星入库成功：金色 `--gold` 微光 pop（bounce 0.18, 450ms）+ sonner 确认。
2. 夜航 NightFlight：片级编排可用 stagger 60–80ms；可打断、可跳过。
3. 年度回顾 YearReplay：讲解型，时长可超 300ms，但提供跳过。
4. 镇星之宝揭示：单次 scale 0.96→1 + 辉光渐显。
预算原则：这四處之外出现 bounce/长动画 = 违规。

---

## 5. 动效机会清单（find-animation-opportunities 门控后，按杠杆排序）

| # | 位置 | 现状 | 目的 | 频率 | 建议动效（精确参数） |
| --- | --- | --- | --- | --- | --- |
| 1 | StarDrawer / LinkReview | 开关为动画但参数散落 | 空间一致 | 10+/会话 | §4.3 规格：`--ease-drawer` 280/200ms，移动端速度甩出 0.11px/ms |
| 2 | 全局按钮/可按元素 | 部分 0.98/0.1s 不统一 | 反馈 | 高频 | `:active scale(0.97)`，`transition: transform 160ms var(--ease-out)` |
| 3 | 各列表/网格首屏 | 多处瞬间出现 | 避免跳变 | 每次进屏 | `opacity+translateY(8px)+scale(0.98)`，--dur-3，stagger 40ms，仅首屏 |
| 4 | WeaveView AI 等待 | （核对）若为空白等待 | 状态说明 | 偶尔 | 布局尺寸骨架屏 shimmer；完成 blur 材质化 450ms |
| 5 | 想法/标签增删 | 瞬间增删（核对） | 避免跳变 | 10+/会话 | transition 高度+opacity；CSS transition 非 keyframes，快速连击可续接 |
| 6 | 摘星入库 | 无庆祝（核对） | 反馈+delight | 稀有 | §4.5-1 金光 pop |
| 7 | 弹层 origin | Hint/面板部分居中缩放 | 空间一致 | 每次触发 | `transform-origin` 指向触发器 |

**明确不动清单（rejected，同等重要）**：
- 侧栏切换/键盘快捷路径 → 高频键盘类，**永不加动效**。
- 统计图表数据本身（柱子长高动画保留一次性进场后不再循环）→ 要读的数据，装饰有害。
- 书籍卡片 hover 放大 >1.02、阴影跳跃 → 高频 hover，只留 1px 抬升。
- 视图切换视差/大位移 → 违背「安静书房」气质。
- 星穹画布加 CSS 层动效 → 画布已有 rAF 引擎，叠层徒耗帧预算。

---

## 6. 现状修正清单（审计即改项）

| 位置 | 问题 | 修法 | 级别 |
| --- | --- | --- | --- |
| `styles.css` cell-in | `scale(0.5)` 起跳=凭空出现（ImportWizard/MobileChrome/NightFlight/StatsView 在用） | `scale(0.96)+opacity:0` 起跳，0.4s→`--dur-3 --ease-out` | HIGH |
| `styles.css` radar-in | `scale(0.3) rotate(-30deg)` 同上 | `scale(0.96)+opacity`，rotate 删除或 ≤4deg | HIGH |
| 全项目 | 无任何 `prefers-reduced-motion` | 建立全局降级段（§3.3-8），抽屉/画布/循环各自接入 | HIGH |
| `App.tsx:52` toast | 紫调阴影/墨色偏离令牌 | 换 `--shadow-lg`/`--text` | MEDIUM |
| framer-motion 散参 | 19 文件 20+ 组 stiffness/damping/duration | 收敛为 §3.1 两弹簧+四时长档（映射表） | MEDIUM |
| `BookshelfView.tsx:80` | 3s 无限循环在常驻视图 | 删除或仅空态+reduce-motion 降级 | MEDIUM |
| `styles.css` floaty/twinkle | 无限循环 ambient 未门控 | 仅空态/画布内使用，reduce-motion 停 | MEDIUM |
| panel-hover / btn transition | `ease` 泛用、transform 0.1s | 统一 `var(--ease-out)` 与 §4.1 值 | LOW |

---

## 7. 无障碍与性能（一次性立规矩）

- `prefers-reduced-motion: reduce`：全局降级段写进 styles.css——transform 类动画改 200ms crossfade；无限循环（floaty/twinkle/画布漂移）停止；spring 位移降为 fade。
- `prefers-reduced-transparency`：材质层背景升至不透明、去 blur。
- hover 动效一律 `@media (hover:hover) and (pointer:fine)` 门控（Capacitor 复用 renderer，触屏误触必查）。
- 触摸目标 ≥44px（移动端底部导航复核）。
- GPU 纪律：只 transform/opacity；抽屉跟手不得用父级 CSS 变量驱动子元素 transform；长列表动画期间避免与渲染争主线程。
- 排版可用性：正文保持 14px 不因字阶缩小；`rem` 间距随用户字号缩放。

---

## 8. 实施路线（四阶段，每阶段过验收门再进下一步）

| 阶段 | 内容 | 产出 | 验收 |
| --- | --- | --- | --- |
| P0 令牌 | §2.2 修订 + §3.1 动效令牌进 styles.css；toast 修色；全局 reduce-motion 段 | styles.css 一处 diff | review 十条 5/6/8 通过 |
| P1 基元 | 按钮/输入/弹层/抽屉统一到令牌；`useDrawerSpring`、`Stagger` 两个共享封装；cell-in/radar-in 重写 | components 基元 | 抽屉 280/200 同边退场；起跳无 scale<0.9 |
| P2 分面 | §4 各屏 pass + §6 修正清单清零；散参按映射表收敛 | 各 view/components diff | 慢放 2–5× 复查无跳变；隔日复看 |
| P3 delight | §4.5 四个稀有时刻 + 画布 reduce-motion 单帧 + 移动端手势（速度甩出/rubber-band/44px） | 稀有时刻动效 | 移动端真机手感；reduce-motion 全量走查 |

**验收门 = §3.3 十条**，外加两个动作：慢放检查（时长×2–5 看衔接）、隔日复看。任何新动效 PR 按 review-animations 的 Before/After/Why 表格式自评。

## 9. 明确不做（否决史固化，勿回头路）

深色整体壳 · 古典纸感衬线大标题 · 糖果渐变/极光四色 · 白底小圆点星空 · 「全部笔记直接铺开」式详情 · 万物皆动的过度动效 · Inter 之外的字体折腾（排印升级走字阶与 tracking，不换字体族）。

---
*执行时的 Skill 调用顺序：apple-design/emil-design-eng 定做法 → animation-vocabulary 对齐术语 → find-animation-opportunities 复核新机会 → improve-animations plan 产出单点计划 → review-animations 终审。*
