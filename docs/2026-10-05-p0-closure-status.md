# TUI 专项 · P0 封口状态（2026-10-05）

> 一页恢复入口：任何 session 打开此文件即可接续。判据事实源 = 主计划 §4b/§6 + spec v4；本文件只记「状态 + 挂起项 + 恢复入口」，不重复判据。
> 封口裁定（用户 2026-10-05，两次）：① P0 功能/代码 100% 闭环（0.1.24 发布 + 31 探针 0 FAIL + 生产 lane 全绿 + 单测 48/48）。② **用户追加「P0 验收零空洞再彻底封口」→ 判 = Option 2：等 0.1.25（#265）发布后 7 项重验（A4×5+A1×3）转绿再封**（#265 已 0.1.25 发布，现处「e2e 7 项重验 in-flight」）。第二波（P1a-v2 讨论 + P1b）确认不启动，维持挂起。
>
> **P0 无未闭环的判定**：0.1.24 已把 P0 全部子项落地 + 发布 + 生产 lane 验真（§1）。12 项 INCONCLUSIVE 是「P0 做完、验收没强制到」的**验收覆盖**项，归终审/loop-robustness/#263 各管一段，**不属于 P0 阶段未闭环**；#263/#264 是用户裁定的独立收口波，非 P0 的活。

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
| **0.1.26** | **P0 A4 可解释审批全可达（#278）：A4-mode P0 修（decisionReason 透传）+ allow-face 三 allow 句（成功卡渲染面）+ R1 skip 早退门 + R2 数据侧（engine gate 快路径 setAllowVerdict）+ BASH_CLASSIFIER no-op 根因文档 → 4/6 A4 句 e2e 可达** | ✅ master `89efabc` + tag v0.1.26 + npm packument 验真（latest=0.1.26，shasum `ab2467…`）；gate = e2e A4F PASS（4 硬句绿 + classifier 2 INCONCLUSIVE）+ f4 git 现场核验；**生产 lane 回归 in-flight（e2e，npm 0.1.26 产物）** |

worktree 卫生：0.1.24/0.1.25 列车 worktree（p1a-sidebar / 023·024-prodlane / http-useragent / 024-prodlane / 265-bash-perm-fix）已清；保留 `worktree-0.1.23-p0a-fix-loop` / `worktree-loop-robustness`（各 owner 定）/ **`worktree-278-a4-verdict` 保留至 0.1.26 生产 lane 验真**。

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
- [ ] **live-gateway 分类器 e2e 波（新开，P0 封口前置）**：跨 loop-robustness/fault-proxy 基建 + LLM 非确定，让 classifier 2 句（危险 flag/自动放行）e2e 可强制 → 全 6 句绿后封 P0。version TBD（若需产品版本则 BR-8 再顺延）。**待用户排期启动。**

## 4. 恢复入口（下次启动读这三处）

1. `docs/2026-10-04-tui-program-plan.md` §4b（0.1.24 列车全判据）+ §6（状态快照至收口）
2. `docs/tui-differentiation-spec.md` v4（P0a 行为修复 / P0b 持续监控 / P1a 回退+v2 挂起 / §5 终审含用户面走查层）
3. 记忆 `tui-optimization-division.md` 末段（0.1.24 全链收口 + 残留清单）；e2e 侧 `user-e2e/tui-diff/PLAN.md`（S-H/P1a 探针退役标记 + 0.1.24 探针表）

**角色不变**：atlascode-f4 = 规划/管理 · Main = 实施 · e2e = 验收（逐项探针 + 用户面走查层为固定判据）。
