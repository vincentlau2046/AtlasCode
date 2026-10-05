# TUI 专项 · P0 封口状态（2026-10-05 立 / 2026-10-06 终判封口）

> 一页恢复入口：任何 session 打开此文件即可接续。判据事实源 = 主计划 §4b/§6 + spec v4；本文件只记「状态 + 挂起项 + 恢复入口」，不重复判据。
> **2026-10-06 终判：P0 正式封口 Option B 达成（0.1.28）**——e2e 生产 lane 收口验真 6/6 PASS + 0 INCONCLUSIVE（全 6 句 A4 硬绿 + banner v0.1.28 + shasum `ae04768a…` MATCH + 控制面 hardFail=0，artifact `A4F-1791228364680-6lr1`，报告 `r-20261006-1835`）。前后 lane 同构（发布规则①满足）。封口链 = 0.1.24（P0 全落地）→ 0.1.25（#265 修）→ 0.1.26（4/6 可达）→ 0.1.27（崩修+波 C，5/6）→ **0.1.28（D-279-r1 渲染修，6/6 全绿）= P0 封口**。BR-8 品牌波 → 0.1.29（已开 e2e 验收，brand lane）。
> **历史裁定**（2026-10-05，两次）：① P0 功能/代码 100% 闭环（0.1.24 发布 + 31 探针 0 FAIL + 生产 lane 全绿 + 单测 48/48）。② 用户追加「P0 验收零空洞再彻底封口」→ Option 2 → 后递进到 Option B（守全 6 句绿）→ 0.1.28 达成。第二波（P1a-v2 讨论 + P1b）确认不启动，维持挂起。
>
> **P0 无未闭环的判定（重申）**：0.1.24 已把 P0 全部子项落地；后续 0.1.25–0.1.28 是验收零空洞收口（A4 6 句 e2e 全绿）+ prod P0 崩修（metadata stub）+ 渲染修。12 项 INCONCLUSIVE 中的 A4×6 已全转绿；余 A1×3 + B1×2 归终审/loop-robustness 基建，不阻塞 P0 封口。

## 1. 已收口（发布 + 验真 + 生产 lane 全绿）

| 版本 | 内容 | 状态 |
|---|---|---|
| 0.1.19 | P0a 可解释审批（verdict 一行） | ✅ |
| 0.1.20 | P0b 两后端新信号（回退/熔断/网关不可达方向性） | ✅ |
| 0.1.21 | P1a 侧抽屉 + #272 UA 品牌串 | ✅（P1a 后被回退） |
| 0.1.22 | P1a R1 双修复 | ✅（含 P0a 回归 → 0.1.23） |
| 0.1.23 | P0a 回归双 cede + #271 #4/#5 | ✅ |
| **0.1.24** | **A 审批行为修复（A1 always session 域 / A2 No 不退出 / A3 automode 确认门 / A4 why 全英文真字段 / A5 标签三态）+ B 持续监控（B1 ↦fast 折 model 段 / B2 熔断折 context-bar 色阶；B3 已批砍）+ C P1a 全量回退（抽屉删净）** | ✅ master `6be29bd` + tag v0.1.24 + packument 双通道验真 + 生产 lane 6 项全绿（含用户面走查层） |
| **0.1.25** | **#265 = #263+#264 修（S1 `>` 重定向只读守卫 + S2 TUI BashTool checkPermissions 委托 engine 模式门控，堵恒-allow stub）** | ✅ master `837f72f` + tag v0.1.25 + packument 验真（shasum `46d216…`）+ A4F 重验确认静默放行洞已堵（#265 收口波，用户委托 Main） |
| **0.1.26** | **P0 A4 可解释审批全可达（#278）：A4-mode P0 修（decisionReason 透传）+ allow-face 三 allow 句（成功卡渲染面）+ R1 skip 早退门 + R2 数据侧（engine gate 快路径 setAllowVerdict）+ BASH_CLASSIFIER no-op 根因文档 → 4/6 A4 句 e2e 可达** | ✅ **全链收口**（master `89efabc` + tag v0.1.26 + npm packument 验真 latest=0.1.26 shasum `ab2467…` + gate e2e A4F PASS + **生产 lane 回归 PASS**〔hardFail=0，banner v0.1.26，artifact `A4F-1791205033472-dd26`〕+ **worktree-278 清**）；classifier 2 句 INCONCLUSIVE 为预期（live-model 依赖，归 live-gateway 波） |
| **0.1.28** | **P0 封口版（metadata 崩修 + 波 C + D-279-r1 渲染修，全链 native semver）**：0.1.27（c1a563a）= metadata 崩修（`1b47c39`）+ 波 C（`d64467c`）；0.1.27 gate FAIL 5/6 → D-279-r1 渲染修（`1f01f6f` FilePermissionDialog 接 verdictLine）→ **0.1.28 发布**（`e1f79d3` release，native semver——0.1.27.1 4 段版 npm 不可表达 [`semver.valid=null`/coerce 撞 0.1.27]，用户裁定 #7 = 0.1.28 独立发 P0 封口，BR-8 品牌波顺延 0.1.29） | ✅ **P0 正式封口 Option B 达成（2026-10-06）**：e2e 复验 dc0b37f = PASS releasable=true **全 6 句 A4 绿**；**0.1.28 已发布**（master `e1f79d3` + tag v0.1.28 + npm latest=0.1.28 shasum `ae04768a…` MATCH + 四件套绿）；**生产 lane 收口验真 PASS**（npm 0.1.28 产物 6/6 PASS + 0 INCONCLUSIVE + banner v0.1.28 + 控制面 hardFail=0，artifact `A4F-1791228364680-6lr1`，报告 `r-20261006-1835`，规则①前后同标准满足）。**f4 终判封口**。**BR-8 品牌波 → 0.1.29**（已开 e2e 验收，brand lane，worktree-0.1.29 @ 4f35656）。事实源 `docs/release-governance.md` + `r-20261006-1830-a4f-279-dc0b37f-p0-closure.md` + `r-20261006-1835` |

worktree 卫生：0.1.24/0.1.25/0.1.26 列车 worktree 已清；**`worktree-279` 保留至 0.1.27 生产 lane 验真**（波 C，Main 在制）；保留 `worktree-0.1.23-p0a-fix-loop` / `worktree-loop-robustness`（各 owner 定）。

## 2. 挂起项（按触发条件排好，不会丢）

### 2.1 第二波（**等用户启动**，任何 session 不预启）
- **P1a-v2 设计讨论**：干净基线（消息流 + /diff + statusline 持续监控）后重议第二层钻取面。讨论序（教训：先场景后组件）：① 用户使用场景 → ② 形态+触发（含可发现性）→ ③ 与 P1b 边界 → ④ 决策面与 #263 时序。候选方向（未定稿）记在 spec v4 P1a 段。
- **P1b 开波**：spec §4 P1b 两门禁；Main ①-④ 决策输入先行；#261 S-F（非 git 项目 skill）复验。
- **顺带项**：`PermissionRuleExplanation.tsx` 详情面 pre-A4 旧措辞对齐（一行 patch，随波走）。

### 2.2 终审补测（12 项 INCONCLUSIVE，非 P0 未闭环 = 验收覆盖项，归终审/loop-robustness/#263 各管一段）
| 项 | 原因 | 归属 | 前置 |
|---|---|---|---|
| A1×3（always allow-reason / no-dialog / dangerous-no-always） | #263 已修（#265 S2，0.1.25 发布）：default 模式 Bash 弹框可达 | **0.1.25 重验（A4F harness）** | #265 修后重跑这 3 探针 → PASS（无新 harness） |
| A4×5（rule-allow / classifier×2 / mode / bypass 句式，除 rule-ask 外 5 句） | 0.1.24 实测「结构性 unreachable」：verdictLine 仅 Bash·PowerShell ASK 面，#263 恒-allow 弹不出框 → 5 句死代码 | **0.1.25 重验（A4F harness）** | #265 S2 修 #263 后 ASK 面可达 → 预期 INCONCLUSIVE **翻 PASS** |
| B1×2（↦fast 现形/消失） | 回退难强制 | 终审 + loop-robustness | 需 fault-proxy 注入（跨 loop-robustness 基建） |
| A2-esc / B3-gw-down | 软项 | 记录 | 无（A2-esc 单测已覆盖；B3 已砍项预期缺席） |
全部有单测覆盖（48/48），非缺陷，是「验收没跑到」。**#265（0.1.25）已修 #263 → A4×5 + A1×3（7 项）现可于 0.1.25 上重验**（A4F harness 预期 INCONCLUSIVE 翻 PASS）；B1×2（↦fast 现形/消失）仍待 fault-proxy（loop-robustness 基建，不阻塞 P0 封口）。

### 2.3 #263 / #264 收口波（= #265，**已 code-complete 并 0.1.25 发布**）
- 工单：`docs/2026-10-04-permission-gaps.md`；**已修 = #265**（`69407b8` S1 `>` 重定向只读守卫 + `41649ec` S2 `checkPermissions` 委托 engine 模式门控，堵恒-allow stub）
- **0.1.25 已发布**（用户 #265 收口委托 Main 执行，f4 git 验真通过：master/tag `837f72f` + origin sync + #265 进 origin + npm latest=0.1.25；f4 仅版本归属，不代发授权）
- 影响已除：#263 修后 default 模式 Bash 弹框可达 → **A1×3 + A4×5（7 项）可于 0.1.25 上重验**（= P0 封口前置 gate，用户 Option 2）

### 2.4 P0 封口结论（2026-10-05，用户裁定 + A4F 重验）
- **P0 阶段（P0a A1–A5 + P0b B1/B2）功能/代码全闭环**：0.1.24 发布验真 + 31 探针 0 FAIL + 生产 lane 全绿 + 单测 48/48，无「P0 没做完」项。
- **用户追加「P0 验收零空洞再彻底封口」→ 判 = Option 2**：#265 已 0.1.25 发布（git 验真通过）→ f4 触发 e2e A4F 重验（7 项 A4×4+A1×3 + 5 控制）。
- **A4F 重验 verdict = FAIL（hardFail=1，2026-10-05）**：① **A1-no-dialog / A1-dangerous-no-always PASS** + 控制×5 全绿；**#265 静默放行洞已确认修复**（no-rule `touch`/`rm -rf` default 模式现弹框现形 + Esc 正确拒绝，0.1.24 时均静默放行）。② **暴露新 P0：A4-mode verdict 行断裂**（S-024L 弹框现形但 `Verdict:` 行缺席，危险 rm 同 0 命中）——根因疑 runtime `decisionReason` 未透传（`BashTool.checkPermissions` 委托 engine 后 TUI 桥接映射丢失；engine 侧已 emit，疑 TUI 桥接层丢）。**已打回 Main 3-round 修（红线①约束 + 修 TUI 桥接层）**。③ **A4×4 = rule-allow/bypass/classifier-dangerous/classifier-approved 四句 = 结构性不可达**（2a/2b 恒 allow 无 ASK 面 / `BASH_CLASSIFIER` 默认 off）→ **产品面局限记录项（非缺陷，单测 48/48 覆盖），非 e2e 可补空洞**。
- **P0 封口判据 = 用户裁定 Option B（2026-10-05 终裁，逐次递进：强修 4 句 → 守全 6 句绿）**：Main 白盒实证 = A4 六句里 **rule-ask（0.1.24）/rule-allow/bypass/mode 四句可 e2e 强制**，**classifier 2 句（危险 flag/自动放行）只能经 live auto-mode yolo 分类器产 `decisionReason:{type:'classifier'}`**（唯一产出处 = `permissions.ts:755-778` `classifyYoloAction` 真 LLM，需 gateway+live 模型；TUI 车道 `BASH_CLASSIFIER` 是 ANT-ONLY stub、flip 无效，Main 已正确撤销 no-op）→ **PTY 不可强制**。**用户裁定 = 守「全 6 句 e2e 绿」判据 → P0 暂封不了，封口推迟到 live-gateway 分类器 e2e 波**（跨 loop-robustness/fault-proxy 基建 + LLM 非确定，让 classifier 2 句 e2e 可强制后才封 P0；version TBD，需用户排期）。
- **0.1.26 = P0 改进波（非封口）已发布（2026-10-05）**：全波 5 提交（worktree SHA `a59f6d3`/`94edd40`/`d991f95`/`29316c7`/`c1c3b46` → master 新 SHA `f04182d`/`92f49e8`/`33a88bf`/`548eb8c`/`f61deca`）= ①A4-mode P0 修（decisionReason 透传）②allow-face 三 allow 句 ③BASH_CLASSIFIER no-op 根因文档 ④**R1 skip 早退门**（`29316c7`，`hasSuccessCardMarker` 纯面）⑤**R2 数据侧**（`c1c3b46`，engine gate 快路径 setAllowVerdict，判定逻辑零改动加性修，f4 白盒逐 diff 核过 4 文件 +102/−2 零触红线）。**gate = e2e A4F R2 复跑 PASS（hardFail=0：4 硬句 a4rallow/a4bypass/A4-mode/a1danger 全绿 + classifier 2 句 INCONCLUSIVE + A1×3 + 控制×7 + S-A 不回归，artifact `A4F-1791180416454…`→`A4F-1791202099591-qoyo`）+ f4 git 现场核验**（origin/local sync + release `89efabc` 仅 package.json+CHANGELOG + tag `v0.1.26`→`89efabc`）→ **已发布**（npm packument latest=0.1.26，shasum `ab2467996851…` MATCH；四件套 master 口径 3519/0/244）。**3-round 收口**：R1 渲染面修对但非根因 → R2 数据侧根因（auto-allow 被 engine gate 快路径短路 → allowVerdicts 恒空）命中。**生产 lane 回归 in-flight（e2e，npm 0.1.26 产物；Main 触发）**。**发 0.1.26 = 修 A4-mode 缺陷 + 4/6 A4 句 e2e 可达；P0 封口仍待 live-gateway 波**（classifier 2 句）。BR-8 顺延 0.1.27。
- **协议增量（2026-10-05 用户经 f4 核实确认，plan §2.4/§2.5 已落）**：① A4F 复跑触发权 f4→Main（单一出口仍单一：触发=Main，gate 权+判据归属不变归 f4）② npm 发布时序 = e2e gate 全绿闭环后 + 一 wave 一版 ③ 回合内 npm 发布免用户逐次授权（Main 直接发；classifier 安全纪律不变）。peer 转述的裁定均经 f4 向用户核实后才落协议。
- **第二波（P1a-v2 讨论 + P1b）= 确认不启动**，挂起（§2.1），任何 session 不预启。
- **B1×2（↦fast 现形/消失）仍待 fault-proxy**（loop-robustness 基建，不阻塞 P0 封口）。

## 3. 裁定项（用户已拍板，2026-10-05）
- [x] **P0 封口判据 = Option B（守全 6 句绿 → P0 暂封不了，封口推迟 live-gateway 分类器 e2e 波）**：classifier 2 句 live-model 依赖 PTY 不可强制，用户坚持全 6 句 e2e 绿判据 → P0 验收完成里程碑推迟到该基建波（version TBD，需用户排期）。
- [x] **0.1.26 = P0 改进波已发布**（A4-mode P0 修 + allow-face 三句 + R1 早退门 + R2 数据侧 + BASH_CLASSIFIER no-op 文档；4/6 A4 句 e2e 可达）。gate = e2e A4F PASS + f4 git 核验 → master `89efabc` + tag v0.1.26 + npm latest 验真；**生产 lane 回归 in-flight（e2e）→ f4 housekeeping 收口**。
- [x] **#263/#264 = #265（0.1.25）已修已发布**（独立 P0 patch，先于 BR-8）。
- [ ] **P0 封口 classifier 2 句 = 用户拍板拆两波（`docs/2026-10-05-live-gateway-classifier-e2e-wave.md`，2026-10-05 定稿）**：白盒新结论 = ① #4 自动放行**直接**可强制（脚本 `shouldBlock:false`→成功卡）② #3 危险句平铺拦截=`deny` 不进 ASK（A4 危险句只在 ASK 弹框渲染；当前唯一可达面=拒绝上限回退，用户不认此口径）。**用户拍板（三问，2026-10-05 全定）**：① #3 走**产品波（波 C）「分类器拦截 `deny`→`ASK 弹框`」**（steerable-trust，src/ Main 实施）② e2e 基建波（波 A）**现在开**（e2e 侧，零 src/ 不占号，收 #4）③ **波 C 拉前 → 波 C = 0.1.27，BR-8 品牌波 = 0.1.28**（brand session 已同步，commit `634d9b5`：BR-8 0.1.28 落定 + 完整品牌梯队 0.1.29=BR-4 / 0.1.30=BR-1+2 / 0.1.31=BR-9+5 / BR-3 待用户审；BR-8 开波触发 = P0 封口达成〔波 C 落地 + 全 6 句绿〕，f4 回传 verdict 触发）。**∴ P0 封口 = 波 A + 波 C + e2e 复验 #3 现形 → 全 6 句绿封 P0（0.1.27 达成）**。波 C 安全 = f4 默认 available-拦截 ASK + unavailable/headless 仍 fail-closed 硬 deny（最小放宽）。
- [x] **0.1.27 = metadata 崩修 + 波 C 合并（用户裁定 #5，2026-10-05 根因定因后）**：e2e A4F gate 首跑发现「分类器 e2e 车道从不 fire」→ 微诊断定因 = **metadata stub 崩**（`getPromptCache1h*` 返 `{}` → `should1hCacheTTL` `allowlist.some` TypeError → 分类器 `unavailable` 恒 deny，挡 #3+#4 两句），**非 engine 门路由（架构波证伪）**，且 **prod P0**（`dist/cli.js:123455` 已随 0.1.26 发布）。用户裁定 = 0.1.27 = metadata 1 处防御修（Main lane，`metadata.ts`）+ 波 C（`d64467c` 拦截→ASK）合并；崩修后 e2e 复验 S-024N/O 全 6 句绿 → 封 P0。**BR-8 品牌波仍 0.1.28（不动）**。

## 4. 恢复入口（下次启动读这三处）

1. `docs/2026-10-04-tui-program-plan.md` §4b（0.1.24 列车全判据）+ §6（状态快照至收口）
2. `docs/tui-differentiation-spec.md` v4（P0a 行为修复 / P0b 持续监控 / P1a 回退+v2 挂起 / §5 终审含用户面走查层）
3. 记忆 `tui-optimization-division.md` 末段（0.1.24 全链收口 + 残留清单）；e2e 侧 `user-e2e/tui-diff/PLAN.md`（S-H/P1a 探针退役标记 + 0.1.24 探针表）
4. **0.1.27 波（metadata 崩修 + 波 C，进行中）**：spec `docs/2026-10-05-live-gateway-classifier-e2e-wave.md` §4（根因 + 崩修 + 波 C 分工 + 时序）+ 根因一手 `user-e2e/reports/r-20261005-2330-a4f-278-classifier-rootcause-definitive.md`（e2e 23:30 定因）+ §1 0.1.27 行（本文件）。

**角色不变**：atlascode-f4 = 规划/管理 · Main = 实施 · e2e = 验收（逐项探针 + 用户面走查层为固定判据）。
