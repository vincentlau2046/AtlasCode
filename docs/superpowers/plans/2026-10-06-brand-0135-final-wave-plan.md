# 0.1.35 writing-plan · Brand 专项封口最后一轮（母题铺开 + 动效精修 + 残留项）

> 触发：用户 2026-10-06 裁定 **0.1.35 = Brand 专项封口最后一轮优化**（Brand 序列终版：0.1.29 BR-8 → 0.1.30 BR-4 → 0.1.31 BR-1+2 → 0.1.32 BR-9+5 → 0.1.33 BR-3 mark → **0.1.35 封口终轮**）。
> 事实源：spec `docs/superpowers/specs/2026-10-04-brand-system-design.md` §2.2（母题系统）/ §3（mark）/ §4（色彩）/ §7.4（动词池）/ §9（动效）+ 规划文档 `docs/2026-10-06-0.1.34-0.1.35-version-plan.md` + **e2e 用户视角体验报告 v2 `user-e2e/reports/r-20261006-1408-brand-user-experience.md`（§5.5 视觉舒适度批判 + O-12 设计意见，用户已认可 O-12 发现）**。
> 角色：spec/gate 判据 = brand session（协调）；实施 = **Main**（单一实施者）；验收 = e2e。
> **开波条件 = 0.1.34 闭环后**（BR-7 多终端 CJK 宽度矩阵结论 = 本波 CJK 宽度判据输入）；本 plan 为前瞻规划，**不预启**。

---

## 0. 范围（Brand 封口最后一轮）

### 0.1 母题铺开（spec §2.2 视觉母题系统 = 光锥从"启动屏 mark"扩展到全 UI 触面）
0.1.33 已落地 mark 本体 + tips 光核前缀（D-3）。本波铺开其余触面：

| 触面 | 静态 | 动态（loading/思考） | 现状 |
|---|---|---|---|
| **spinner** | `█████` 光束串 + `<verb>…` 状态行（verb 四轴池 0.1.32 已去 Claude 化，本波加光束串） | 光扫上爬（底→顶逐行点亮，"光"自底向上 = Ascend 攀升） | 旧式点状 spinner → 光束串 |
| **进度条** | `███░░░░` 光束填充 | 光束向前推进 | 普通 `▓▒` 条 → 光锥光束 |
| **分隔线** | `█ █ █` 光束串（Block Elements，CJK 安全） | — | 普通 `-`/`─` → 光束串 |
| **边框角标** | `╱` 斜线角装饰（U+2572 Neutral） | — | 无 → 光锥角标 |
| **空态底纹** | 暗淡 `░` 光锥底纹 | — | 无 → 光锥底纹 |
| **tips 光核** | 前缀 `▀`（0.1.33 已落） | 切换瞬间光扫渐显（80ms） | 已落，本波加渐显 |
| **光核微符号** | `▀`/`·` 光心色块全 UI 复用（watermark/光标等，按需最小集） | 脉冲 | 母题收口 |

### 0.2 动效精修（spec §9.1 always-on + reduced-motion 回落）
- 光扫上爬：loading 时 bottom→top 逐行点亮（0.6s）
- 顶点 spark 脉冲呼吸（0.8s 周期，非快闪）
- tips 切换光扫渐显（80ms 渐入非硬切）
- `prefers-reduced-motion` = 静态 mark + 静态前缀（关动效不留残帧）

### 0.3 Brand 残留项（0.1.34-C 候选未入 0.1.34 者，开波时裁定并入本波）
- exit-reason 日志（gracefulShutdown/signal-exit，e2e 白盒建议，使自发退出可复现定因）
- `detectMultiClauding`/`multi_clauding` 标识符+数据键改名专审（D-10 残留，与 Python 参考交叉引用，回归风险高，需专审）
- **归属开波时裁定（用户/Main），不自动入列**

### 0.4 O-12 宽终端品牌块"左上角聚落"设计（e2e 用户视角设计输入 · **用户已认可此发现 + Main triage 裁定归 0.1.35 母题轮**，master `4bafee0`）

**问题**（200 列抓屏实证）：品牌块（mark 5 行 + wordmark + 双语 tagline + 版本/模型/cwd 3 meta 行，实测 ~70 列宽）恒锚左 ~1/3 屏，右 ~2/3 留白；welcome 分支（`LogoV2.tsx:283`）另有**全宽亮 brand 圆角边框**（200 列宽的亮琥珀长框）。宽终端（≥200 列，用户常态=2 分屏/大窗）下：品牌时刻缩左上角、仪式感被留白稀释；**全宽亮框 + 光锥脉冲顶点 + tips ▀ = 顶部 3 注意捕获元素**，注意力预算超载。
**根因（白盒）**：`calculateLayoutDimensions`（`logoV2Utils.ts:43-65`）horizontal 模式 `leftWidth` 固定取 `optimalLeftWidth`（不随屏宽）+ 右列 `max(30, columns-used)` 弹性撑满 → 屏越宽右列留白越大、品牌块位置不变；welcome 分支直接 `width={columns}` 全宽框。布局机制对"宽屏"无感知。

**分级方案（可拆开裁定，开波时用户逐档拍板）**：

| 档 | 内容 | 成本 | 建议 |
|---|---|---|---|
| **B（核心）** | welcome 全宽亮 brand 边框降为 `inactive`/dim（`LogoV2.tsx:283` `borderColor="brand"`→`"inactive"`，保分组语义、去抢镜；与 O-9 脉冲收敛叠加后 3 注意元素→1〔tips ▀〕） | 1 行 | **默认做**（最低成本、无回归） |
| **A（布局层）** | "品牌卡"条件居中：`columns≥160` 时品牌块组合体 `paddingLeft=(cols−cardWidth)/2` 居中，`<160` 保持左锚定零回归（`cardWidth` 复用 `calculateOptimalLeftWidth`） | 中（布局层，**零行为变化**） | **推荐做**（宽屏仪式感回归） |
| **C（精修）** | 右侧重平衡：`columns≥200` 时低权重元素右对齐（tagline 第 2 行/版本号）或 meta 3 行压 2 行（version+model 合并，cwd 下沉 footer ⌂ 段）；品牌块 8 行→6 行 | 精修 | 随动效轮，可选 |

**明确排除（省裁定带宽）**：品牌块移右下/随机位（破坏"左上→中上"阅读惯例）；删 welcome 边框（分组语义丢失，降级 B 已足够）。

**验证计划（e2e lane 承接，判据已定）**：harness 补 **120/200 列双档**——`≥160` 列断言品牌卡左 margin=`(cols−cardWidth)/2 ±2`；`120` 列=左锚定零 padding 回归断言（方案 A 生效前提）；SGR 断言 welcome 边框=`inactive`（**非** brand 琥珀 SGR，方案 B 生效判据）；用户面走查层双宽度整屏抓屏附报告。

**同批供 0.1.35 参考（边界说明，非本波核心）**：
- **V-6**（光锥腿行 violet `3.37:1` 为 mark 最暗色=结构骨架偏暗，与"光束衰减"隐喻自洽）：0.1.35 动效精修轮评估"腿行提亮一档 vs 保持衰减"，不立项。
- **O-9**（全屏模式顶点**永久** 0.8s 脉冲，与防闪烁诉求相悖）：`AnimatedBeam` 几行，**Main 已裁定 0.1.34-2 加性**（脉冲限 4 拍≈3.2s 后收敛静态全亮 apex，或仅 loading 期间脉冲），本波仅与 B 叠加（顶部 3 注意→1）。
- **O-8**（light 主题光锥 4 色未重映射，白底顶点/焰色不可读 amber `1.73:1`/flame `2.31:1`<`3:1` = **本轮唯一真视觉缺陷**）：**Main 已裁定 0.1.34-2 P0**（默认保形案①：light 主题光锥 4 色出白底安全变体 + 对比度单测断言 ≥3:1 + gate 判据补 light 场景对比度断言；用户可否决；成本更低备选案②=light mark 降级单色 brand_mark `5.02:1`）。**归 0.1.34-2，非本波**；本波动效精修需以 0.1.34-2 的 light 光锥色重映射为前置（避免在不可读色上精修动效）。

---

## 1. 0.1.34 BR-7 spec 侧要点（brand 侧预留支持 · 0.1.34 开波时与 Main 对确）

| 要点 | 内容 | spec 锚点 |
|---|---|---|
| **宽度矩阵定义** | Block Elements U+2580-259F（`█▓▒░▄▀╱`）× 全角字体终端矩阵（iTerm2/WezTerm/Windows Terminal/GNOME/kitty/Alacritty 等）实测宽度行为 | §3.2（CJK 安全约束） |
| **mark 降级策略** | 半块 `▄▀` 个别终端宽度异常 → 该终端档回退实心 `█`（形状不变、仅少"切割"感），单点降级不整版回退 | §3.2 备记 / §15 回退 |
| **全角字体行为规则** | 全角 CJK 字体下 Neutral 宽度字符（U+2580-259F 区段）是否仍恒 1 宽；异常终端识别信号（`stringWidth()` 实测 vs 渲染错位）与降级触发条件 | §3.2 / `src/tui/ink/stringWidth.ts` |
| **e2e 验真纪律** | 本机终端可验项 = 硬项；真多终端项 = 软面定因登记（不阻塞），纪律同 0.1.29-0.1.33 | 协议 §3 INCONCLUSIVE 纪律 |

---

## 2. 逐文件改动清单（Main 实施时细化，实施前对届时 master 重新 diff 核对）
- spinner：光锥光束串组件（替换现点状 spinner 帧）+ 与 0.1.32 动词池（§7.4）同屏（动词行不变，仅 spinner 字形换光束串）
- 进度条/分隔线/边框角标/空态底纹：各触面组件换光锥母题字符（全 Neutral 宽度字符，§3.2）
- tips 渐显：`useDynamicTips` 切换 80ms 光扫渐显（现有 12s 轮播 6 条不变）
- 动效时序：`AnimatedBeam` 光扫上爬 0.6s + 脉冲 0.8s + reduced-motion 回落（§9.1）
- 残留项（开波裁定后入列）：exit-reason 日志 / multi-clauding 改名专审（各附判别单测）

## 3. 四件套 + 品牌 gate（Main 自检）
- `tsc --noEmit` 0 / `eslint src/` 0 / `bun test tests/` 全量 / `bun run build` ✓
- **品牌 gate**：母题字符面在场（spinner 光束串 / 分隔线 `█ █ █` / 边框 `╱` / 空态 `░`）+ 母题字符全 Neutral 宽度（U+2580-259F / U+2572，无 Ambiguous `▲◆`）+ 0.1.33 既有面不回归（mark 棱镜 A 形 / wordmark 双色 / 中文 tagline / tips 光核前缀）

## 4. e2e 前 gate（e2e 验收判据 · 报告命名 `r-YYYYMMDD-HHMM-brand-final-0135.md`）
- ① spinner 光束串 + verb 行同屏（loading 场景 SGR 实捕）
- ② 进度条/分隔线/边框/空态 母题字符在场（CJK 终端宽度不变，以 0.1.34 BR-7 矩阵结论为判据基线）
- ③ 动效：光扫上爬帧序列（loading 屏 SGR 序）+ reduced-motion 回落静态
- ④ tips 切换渐显（非硬切）
- ⑤ 残留项（开波裁定入列者）判别单测绿
- **⑥ O-12 宽终端双档断言**（e2e lane 已定判据）：harness 120/200 列双档——`≥160` 列品牌卡左 margin=`(cols−cardWidth)/2 ±2`（方案 A 生效）；`120` 列=左锚定零 padding 回归断言；SGR 断言 welcome 边框=`inactive`（**非** brand 琥珀 SGR，方案 B 生效）；用户面走查层双宽度整屏抓屏附报告
- **⑦ O-9 脉冲收敛**（若 Main 归 0.1.34-2 加性则本 gate 只验"顶部注意元素≤1"，不验实现；若并入本波则验脉冲限拍收敛）
- ⑧ 回归基线 S-A hardFail=0 + A4F 6 句不回归（P0 封口链无回归）+ 0.1.33 品牌面不回归（mark/wordmark/tagline/tips 前缀）
- ⑨ 报告 + artifact id
- **前置依赖**：⑥-⑦ 动效精修以 **0.1.34-2 的 O-8 light 光锥 4 色重映射（P0）** 为前置（避免在 light 不可读色上精修动效）；开波时若 0.1.34-2 未含 O-8，则 0.1.35 需把 O-8 拉入前置波。

## 5. 时序与收口（5 段闭环，同口径 0.1.29-0.1.33）
1. 实施（Main）：四件套 + 品牌 gate 绿 + 实现提交
2. e2e 前 gate：①-⑦（软面 INCONCLUSIVE 定因登记，纪律不变）
3. 缺陷回环（FAIL 时 3-round 上限）
4. 发布（Main）：bump 0.1.35 → tag → npm publish → packument 验真（D-8 SOP）
5. 生产 lane（e2e）：banner v0.1.35 + ①-⑥ 子集 + 用户面走查层 → **Brand 专项全闭环**

**封口后**：Brand 专项序列全闭环（0.1.29-0.1.32 + 0.1.33 mark + 0.1.35 封口终轮），持续优化止、不预启；后续品牌事项 = 新需求另开波。

## 6. 回退
- 无 feature flag（spec §13.1）；回退靠 `git revert` 发布补丁
- 母题字符 CJK 宽度异常（0.1.34 BR-7 矩阵新发现项）= 单点回退该触面为纯色/原字符（母题降一档，不整版回退）
