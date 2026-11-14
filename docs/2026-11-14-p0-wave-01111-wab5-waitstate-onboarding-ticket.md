# 0.1.111 W-AB5 工单——件 C 等待态注记 + 件 D 首启可跳过（双小件切片，波前审视双前提改形）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-14）。
> 上游：W-AB2 §6 用户裁定件 C = 拆步做（耗时必做/token 先核链）、件 D = 批准预置跳过（@92b82924）。
> **波前审视双前提改形（f4 2026-11-14 活码重核，呈用户知悉）**——两件的「缺通道/缺基建」前提均部分不成立，本波改形为**定谳 + 补缺**（体量降档）。

## §0 波前审视（f4 2026-11-14，活码重核）

### 0.1 件 D 改形：跳过通道已存在 → 主落点 = harness 对称性修形

- `src/tui/interactiveHelpers.tsx:120`——onboarding 门 = `!config.theme || !config.hasCompletedOnboarding`；`hasCompletedOnboarding` 为 GlobalConfig 字段（`utils/config.ts:187`）**可预置**（CC `hasCompletedOnboarding` 完全同构）。
- `interactiveHelpers.tsx:114`——env 通道已有：`IS_DEMO` 直跳（另有 NODE_ENV=test 门）。
- **改形裁定**：W-AB1「23/23 腿次全触发、无可预置跳过面」= **harness 腿未预置 config（对[A/B]称性缺口），非产品缺通道**——UX-7 直证级证据对 fresh-HOME 用户成立，但 A/B 对内 cc 预置而 atlas 未预置 = E 面混入（环境等价格盲区，与 dist 输入面死误判同族）。
- **主落点**：e2e harness 修形（atlas 腿 seeded config 预置 `theme` + `hasCompletedOnboarding: true`）——测试侧，零产品码。
- **产品侧残余（登记不排，呈用户可裁）**：① `IS_DEMO` 语义窄（demo 专用），是否补通用 `ATLAS_SKIP_ONBOARDING` env = 小件可选；② 默认主题预置便利（无 config 也给默认 theme 免门）——两项均非本波必做。

### 0.2 件 C 改形：elapsed + token 基建已在 → 定谳缺注记状态面

- `src/tui/components/Spinner.tsx`——elapsed 计时已在（:116-120 thinking 2s 后显时长；:182 elapsedSnapshot 含 pause 扣除）；token 基建已在（:233 `getTurnOutputTokens()` + :172 teammateTokens 聚合 + :195 `useStalledAnimation` 3s 无新 token 变红）。
- **改形裁定**：W-AB1「braille 无注记」非全量事实——**定谳腿先行**：枚举 spinner 状态 × 形态（主回合/压缩/headless/TUI）注记显形矩阵，定位哪些状态无 elapsed/token 注记（候选：0.1.70 composing-token 断链面〔getTurnOutputTokens 活链核实〕/特定 mode 分支/REPL 双 spinner 消隐路径 :1149）。
- **落码面（定谳后）**：补缺状态注记（elapsed 恒显 + token 注记链通则显/断则挂起待修链波——用户裁定拆步形不变）。

## §1 波定义

0.1.111 双切片：**切片 1（零产品码）** = e2e harness 对称性修形（件 D 预置）+ spinner 注记显形矩阵定谳腿（件 C 判据前置）；**切片 2（产品码，定谳后 lock-face 呈批）** = spinner 补缺注记。工位号 0.1.111；切片 2 若判据零产品码可跳 npm（跳号预注册）。

## §2 Global Constraints

1. 零写真实 ~/.atlas/~/.claude；探针 designated-only seeded；npm --registry npmjs.org；row F 全程；段 L 硬门（若发布）。
2. 件 C token 注记若涉 0.1.70 断链修复 = 另立波（本波禁顺手修链）。

## §3 判据格（预注册）

| # | 格 |
|---|---|
| 1 | **对称性格（切片 1）**：atlas 腿预置 config 后 onboarding 零触发（复跑 W-AB1 抽样腿对表）；未预置腿照常触发（负断言——防把强制首启意外静默跳过，用户裁定回归格兑现） |
| 2 | **注记显形矩阵格（切片 1）**：spinner 状态（thinking/主回合/压缩/teammate 聚合/stalled/leader-idle-teammates-running/defer 挂起）× 形态（TUI/headless -p/probe）× **「数据存在 vs 实际渲染」列**（0.1.70 断链正是「数据存在未接线」形，无此列会把死链误分类为形态缺失）全量在案，缺注记状态逐个归因（链活/死/分支缺失三分类）；形态清单 lock-face 冻结（矩阵维度全枚举后禁中途加维）；headless UX 判读主源 = TUI 腿口径继承 |
| 3 | **补缺格（切片 2，若入）**：缺注记状态补齐后矩阵全绿（链通子集）；token 断链子集显式标注挂起面 |
| 4 | **canon 恰合格**（若产品码入）：净域前滚恰合 |
| 5 | **UX-7 复验格**：定谳报告含 A/B 对称性勘误记录（W-AB2 §1 #4 再裁登记——harness 面贡献份额） |

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 双前提改形的呈报义务是否充分（用户裁定基于旧前提——改形后体量/落点双降，是否须用户再确认而非仅知悉）。
2. 切片 1/2 拆分的段 L 形态（切片 2 零产品码则整波无发布——跳号纪律边界）。
3. IS_DEMO/ATLAS_SKIP_ONBOARDING 语义分离面（若补通用 env：demo 通道语义不污染）。
4. spinner 显形矩阵的形态清单完备性（headless -p 腿 UX 判读主源=TUI 腿先例的口径继承）。
5. 0.1.70 断链核实的判定面（getTurnOutputTokens 活链直证法——reqlog/composing token 事件流对表）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → 切片 1（e2e 主跑：对称性修形 + 注记矩阵定谳）→ lock-face（切片 2 形态呈批）→ Main 落码（若入）→ gate → f4 收口；呈用户改形知悉随双信号附。

## §6 Atlas-reveiw 审计闭环（2026-11-14，通过 + 1 呈报裁定 + 4 吸收，@81d053a9 全锚实核）

1. **呈报裁定 = 知悉即可 + 两处升格**：两改形均降档 + 用户裁定意图（CC 同构预置跳过/耗时注记）仍兑现，非方向翻转。升格 (a)：**UX-7 证据面翻转（直证级 → harness 对称性缺口）= W-AB2 定谳台账正式勘误条目**（非本波报告附段——已落 W-AB2 §7）；升格 (b)：产品侧残余两项 = 新产品面提案**建议封存不排**（见 3），若用户要排须逐件点头禁默认携带。
2. **吸收 2（复采语料版本面）**：修形复跑 atlas 腿标注 **v2 语料**（含「预置 vs 未预置」维度标签），W-AB1 17 腿基线仍为二期验收对照基（防混源，W-AB4 口径冻结同族）；**「config/状态预置对称」补入环境等价格维度清单**（0.1.107 格 8 预警的实例印证）。
3. **吸收 3（残余两项建议封存）**：① ATLAS_SKIP_ONBOARDING 不建议（config 预置已是 CC 同构通道，新 env = CC 无有面反对齐；目标用户仅自动化环境切片 1 已解；真实 fresh 用户需要 onboarding）；② 无 config 默认 theme 免门反对齐（CC 首启问 theme）。若用户仍裁补 env：名域分离钉死（IS_DEMO 不别名 + envPrefixLiteral 预注册）。焦点③在「不补」前提下消解。
4. **吸收 4（断链判定三步直证链）**：① loopEvents.ts 转发粒度实锚（审计预扫 `onUpdateLength` 零命中 = 断链先验仍在）；② Spinner 订阅回调实调证据（事件流 reqlog 对表 = 权威 + spy 单测辅助）；③ 端到端 TUI 腿 token 注记显形实测。证实断链 → 挂起不修链（§2.2），修链波候选登记（0.1.70 插入波遗留账挂账面更新）。
5. **吸收 5（矩阵增列）**：「数据存在 vs 实际渲染」列入格 2；维度 lock-face 冻结禁中途加维。
6. **顺带登记（禁本波顺手清）**：interactiveHelpers.tsx:114 `isEnvTruthy(false)` 死表达式 + `"production" as string === 'test'` 编译伪影 = CC 编译遗留面，登记不排。
7. **波序注记**：0.1.110 段 L 完结后起（或在途并行则 gate 基锚分列标注）；切片 2 零产品码 → 0.1.111 跳号入 W-AB3+ 序列账面。

**审计结论：通过——吸收后发双信号，改形知悉随双信号附。**
