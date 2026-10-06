# 2026-10-07 0.1.36 权限/harness 硬化波 工单（f4 → Main，单信号）

> **Lane 分工**：f4（atlascode-f4 session）= 规划/管理/同步（本工单 + 分析归档）；**Main = 实施 + 全部版本/master 操作**；**e2e = 原有定位**（gate/生产 lane/回归/报告/verdict，不碰版本/master）。
> **事实源**：`docs/2026-10-06-permission-harness-trace-analysis.md`（P1–P13 + §8 plan 状态机 + §9 全 loop 矩阵 + **§10 裁定记录 R1–R4（用户 2026-10-07 拍板）**）+ `docs/release-governance.md`（三支柱）。
> **Main ACK = 接手 + 开 `worktree-0.1.36` 启动切片①**。

---

## 0. 今晚必达（2026-10-07）

**切片①（P1 mailbox 硬化）5 段完整闭环**：实施 → e2e 前 gate → 发布（tag+npm）→ 生产 lane → 闭环。
**列车条件**：若 0.1.35（Brand 封口波）未闭环，0.1.36 发布/生产 lane 按列车序顺延；**但切片① code-complete + gate PASS 仍为今晚必达**（不发布）。

## 1. 波内切片序（Main 实施）

| 切片 | 内容 | 出处 P 项 | 实施要点（回源复核后落码） | gate 探针 |
|---|---|---|---|---|
| ①【今晚必达·闭环】 | P1 mailbox 硬化 | P1 + P6-a | `inProcessRunner.ts:583-703`：mailbox 兜底加**协作式 deadline**（参照 deepseek-harness `guard/timeout-policy`：仅本层 timer 先到期才替换结果；到期 = fail-closed deny，`unavailable` 语义**结构化 tool_result(is_error + code)**，模型可见、回合继续）+ poller timer（:630，500ms）**unref()** + 到期/abort 时清理 + `pendingCallbacks` 随 deadline 失效清理 + **P6-a drop 审计事件**（`permissionPoller.ts:111-143` drop 路径发 `decided: unavailable` 审计 + debug 日志） | V3 |
| ② | P11-① 补 plan×auto 支 | P11（R1 裁定=①） | `prepareContextForPlanMode` 补 auto 语义支（`shouldPlanUseAutoMode`/`setAutoModeActive`/`strip·restoreDangerousPermissions`）+ plan 退出 kick-out 通知；**逐行对照 CC `permissionSetup.ts:602-641` + `:1233-1248`**（restored-src，本地可查）；弹框 exit 侧消费支（ExitPlanModePermissionRequest.tsx:339-342/:383-404）保留不动 | V8 + plan×auto 断言 |
| ③ | P2-①③ 恢复层 | P2（R3 裁定） | ① engine loop provider 错误路径 413/prompt-too-long → `reactiveCompactOnPromptTooLong`（体 `contextBodies/reactiveCompact.ts` 已存在，TUI 端口已接线 `contextHostWiring.ts:191-199`；**engine loop 补 413 消费点**，delta 小；**一次性/回合**：压缩后重试一次仍 413 → 结构化错误行 + 用户面状态，**不循环**；若本仓无 REACTIVE_COMPACT flag 则新增入 `feature.ts` ON_BY_DEFAULT 族，env `FEATURE_REACTIVE_COMPACT=false` 可杀；既有 413 语义单测锁）③ 断路器跳闸（autoCompact.ts:532-535）= TokenWarning 增 "auto-compact 已暂停（N 次失败）" 态 + 行动建议（/compact·换小模型·新会话）+ 模型侧告知 | V4 / V7 |
| ④ | 廉价同族批 | P4 / P5 / P9 / P12 | P4：`createPermissionGate` TPC 缺失 warn 启动日志 + headless lane 显式注入 dontAsk 语义 TPC（fail-closed）+ 单测锁；P5：`dispatch.ts:82-92` 非 print lane SIGINT 复用 TUI `gracefulShutdown` 装配（abort 在途 turn + session 冲刷 + hook + exit 0，仿 `-p` lane print.ts 先例）；P9：键位模态不变量单测（弹窗打开时侧栏 context 解析优先级低于 Confirmation）+ 侧栏注册模态门（可选加固）；P12：`localShellTask.ts:111` timer 加 unref（一行，对照 TUI 正例 LocalShellTask.tsx:99） | 单测 + V1 |
| ⑤ | **调研后重裁定**（0.1.37 候选） | R2 清单 | **先调研后写码**（见 §2）；调研通过前不排版本 | — |
| ⑧【deferred 显式命名 → 切片④/0.1.37】 | pane-worker TUI 真消费面硬化（V3 实证新缺口） | P1 相邻面（非切片① engine 两文件 scope） | TUI `useSwarmPermissionPoller`（pane worker 真消费面）加 **deadline + P6-a drop 审计 + interval unref** = 封 pane-worker 用户面「杀 leader→挂死」（切片① 只硬化了 engine `inProcessRunner`/`permissionPoller` 两文件，pane worker 的 TUI poller 是独立消费面）。**2026-10-07 02:40 e2e 前 gate 裁定 (a)**：0.1.36 按 in-scope engine 侧收口发布，⑧ 显式顺延（不扩 scope 不重 gate，release-governance 支柱① deferred 显式命名）；并入切片④（廉价批，同 unref/审计同族）或 0.1.37 | V3-⑧（pane-worker 杀 leader 真面） |

**版本归属（2026-10-07 04:30 f4 拍定，Main 0.1.37 提案对齐）**：
- **0.1.36 = 仅切片①（P1 引擎侧 settle 第 4 终态）**——今晚 5 段闭环收口（T3 已发 `a540e49`/tag v0.1.36/npm 已验真 + **T4 生产 lane PASS verdict（04:05）→ 5 段闭环终态达成、f4 已记档**）。
- **0.1.37 = 封口版（P1 完整交付）= ⑧ + ② + ③ + ④〔+ ⑤ 若调研通过〕**，切片序 **⑧ 殿 ②③④ 前**（P1 用户面封口优先于 P11/P2，不拆 0.1.36.x，避免二次生产 lane + 尊重 02:40 ⑧ 裁定 (a) scope）；**封口版 fail-closed = ⑧+②③④（+⑤）全绿方可发布**（release-governance 规则②/③）。
- **⚠️ ③（P2 恢复层）冻结 = 待用户明早 §7 六问裁定**（用户 2026-10-07 夜指令"明早看 P2 评估完整报告 `docs/2026-10-07-p2-compaction-evaluation.md` 后裁定 P2"；R3 风险预估不可替代用户终裁，防返工）→ **Main 并行可做 = ⑧/②/④（worktree-0.1.36），③ 明早转用户 §7 裁定后再落码并入 0.1.37**。
- **0.1.37 全量 gate = 0.1.36 T4 终态 + 明早 P2 裁定 + ③ 落码之后**（⑧/②/④ 可先行子集 gate：V3-⑧ + V8 + ④ 廉价批探针；③ 的 V4/V7 随 ③ 落码并入）；⑤（R2 调研）维持调研前置不动。

**每切片实施前**：回源复核本工单引用的 file:line（"问题先闭环再发"，house 纪律）；逐切片四件套（单测/类型/构建/lint）绿。

**进度状态（2026-10-07 04:00 更新）**：切片①（P1 mailbox 硬化）= **code-complete（d5f0614）+ e2e 前 gate PASS 6/6**（报告 `r-20261007-0240-0136-slice1-gate.md`，0 hard FAIL / 0 无定因 INCONCLUSIVE）+ **T3 发布完成**（Main 常设授权自跑：release commit **`a540e49`**（master）+ cherry-pick `4e34fb4`（实施 d5f0614）+ tag **v0.1.36** → GitHub 双 push + npm **@atlasharness/atlascode@0.1.36**（DNS-pin 通道）shasum **`403ec2ac84889dfd970b7f12dee0266ce797f163`** + unpackedSize **17583246** + packument 验真 MATCH；**f4 独立交叉验真全绿**（origin tag/master 指向 + registry shasum/unpackedSize 三项全 MATCH））；⑧ 裁定 = (a) 顺延切片④/0.1.37（见上表，显式命名不丢）；**e2e 接 T4 生产 lane**（报告 `r-20261007-prodlane-036.md`，⑧ 面 2 soft 项按顺延标注不计硬 FAIL）→ 全绿 = **P1 5 段闭环终态**（f4 记档；06:30 终检为明早裁定前基线）。**04:10 更新：T4 生产 lane verdict = PASS（e2e 04:05 单信号，`r-20261007-prodlane-036.md` A–J 全满足 + 0 硬 FAIL / 0 无定因 INCONCLUSIVE + ⑧ 面 2 soft 按裁定 (a) 顺延标注不计硬 FAIL + npm 三方 MATCH + 规则②同口径回放满足）→ **P1（切片①）5 段闭环终态达成，f4 已记档**（独立验核 = Verdict 已回填 + 3 artifacts 在盘 `A4F-…5907`/`P0a-…xk10`/`V3-…3nj`）；夜间 cron 剩余项（06:30 终检）已删，夜间链完成，今晚必达项达成**。
**04:40 更新：⑧（0.1.37 切片）code-complete + 四件套全绿（Main `5b94524` shared 收敛〔新 `src/shared/permissionDeadline.ts` 单一事实源：PERMISSION_MAILBOX_DEADLINE_MS=30000 + resolveMailboxPermissionDeadlineMs + approvalUnavailableReason；engine inProcessRunner 本地 deadline 定义块删除改经 shared 消费；swarm/index 0.1.36 公开面保持〕+ `1e1f9e1` TUI ⑧〔swarmWorkerHandler worker 侧 promise 第 4 终态=协作式 deadline 首胜 claim + unref + fail-closed buildReject(unavailable 措辞) + 注册表/abort 释放 + allow/reject cleanup；useSwarmPermissionPoller P6-a 3 支 drop 结构化审计 decided:unavailable + 500ms interval unref 撤 usehooks-ts + pendingPermissionCallbackCount 观测缝；PermissionContext/permissionLogging unavailable reject source union + sourceToString 支；2 测试文件〕，worktree-0.1.36，全量 3678/0·263 文件〔+11=⑧ unit 10+func 1+套件内增量 1〕detached verify-0.1.37）→ **f4 已发 V3-⑧ e2e 验收请求 = 0.1.37 ⑧ 波先行子集 gate**（gate 基线 worktree-0.1.36 @ `1e1f9e1` 含 `5b94524`；判据 = ⑧ 面 2 soft 转 PASS〔V3-TURN-CONTINUE 杀 leader 后 pane-worker 回合继续 + V3-DENY-LINE unavailable deny 行现形 approvalUnavailableReason 措辞，TUI poller 面同口径〕+ 回归 S-A/A4F 6 句/P0a 隔离同口径 + 四件套 3678/0·263 独立复核 + **双消费面同口径核验**〔5b94524 改 0.1.36 engine 侧 mailbox deadline 消费路径 → 核 0.1.36 面 ① 已发行为不回归 + swarm/index re-export 公开面保持〕；**0.1.37 发布 = 明早 P2 §7 裁定 + ③ 落码 + 全量 gate，不在本次先行子集**）。② P11 并行开工中（V8 待 ② code-complete 后 f4 另发）；③ 冻结维持（明早 P2 §7 裁定后 f4 转 Main 解锁）。

## 2. 参照调研清单（R2：切片⑤ 前置，产出 = 对照表）

| 项 | 调研对象（本地可查） | 产出 |
|---|---|---|
| P6-c | CC 全量源码（restored-src）/clear 与 pending approval 交互 | 行为对照表 |
| P13 | CC SDK control 协议错误帧 + host 侧可消费性 | 协议对照表 + 宿主兼容结论 |
| P6-b | deepseek-harness retry/backoff 面 + CC 重试策略 | 重试曲线有出处版本 |
| P7 | CC mcp 子命令错误面 + 通用 CLI 惯例 | 错误码/文案/退出码基线 |
| P8 | CC `max_tokens_escalate`（restored-src query.ts:1204） | 标记形态有出处版本 |
| P3 粒度 | deepseek-harness guard 包 code 体系 | code 命名对照表 |
| P2-② | spec + deepseek `compaction-tool-result-pruner` 全量研读（replay-safety 不变量） | 0.1.37 spec |

P2-④ 软复位 = **已砍（R3，不调研）**，登记待 soak 数据。

## 3. gate 判据（e2e，前后 lane 同标准 = release-governance 规则①）

- **前 gate**（逐切片，e2e lane）：S-A 零回归 + A4F 6 句封口链 + P0a 隔离重跑 hardFail=0 + 4 件套独立复核 + 本切片新探针（V3 / V8 / V4+V7 / 单测族）+ 全量单测绿。
- **生产 lane**（发布后，e2e lane）：banner 版本号 + wire 复证 + 探针子集 + A4F 全绿 + P0a + npm shasum MATCH。
- **fail-closed（规则②）**：e2e/测试任一未闭环 → 不发布；波内**最后一个发布版本必须全闭环**方可发布（封口版规则，R4）；特殊 case 顺延 0.1.37（规则③）。
- **信号链**：f4 → e2e 验收请求（单信号）→ e2e verdict（x/y PASS + z INCONCLUSIVE 定因）→ Main 发布（版本/master 操作归 Main）。

## 4. Main ACK 与同步

- 本工单 = f4 侧单信号（housekeeping 已入 master）。**Main 回复 ACK**（ACK = 接手 + worktree-0.1.36 开波 + 切片① 启动）。
- 各切片 gate verdict 回 f4（verdict 单信号，e2e 出报告 f4 收口）；今晚 切片① 闭环终态（release commit + tag + npm shasum + 生产 lane 报告号）回 f4 记档。
- 波外事项（0.1.35 波内冲突、C 桶 ②③ 完整纵切）不动本波 scope（版本=收口契约，in-scope 收口 / deferred 显式命名）。
