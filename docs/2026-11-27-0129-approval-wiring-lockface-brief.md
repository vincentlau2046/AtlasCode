# 锁面呈批书 — 0.1.129候（审批接线切片 形 A：carrier 结构化审批事件增补 + AtlasWeb runner requestApproval 接线）

> **状态：候 f4 批复**（锁面预注册纪律——批复前零落码）。本档为预注册形，
> 采证三源：工单 `AtlasWeb docs/2026-11-27-first-wave-closure-ticket.md`
> @42c5251 行 77/79/83/88（形 A 裁定 + 七字段纪律 + carrier 增补支定谳）；
> AtlasCode `src/cli/print.ts:1271-1298`（ask 支路由点）+
> `src/kernel/execution/executionKernel.ts:270-294/:380`（requestApproval
> 供给面 + approval.decide 结算面）；AtlasWeb
> `packages/web-host/src/execution/upstream.ts`（spawnCliTurnRunner 现状：
> 零 requestApproval 消费、stdin 'ignore'）。
>
> **L4 预授权在案**：用户 2026-11-27 于 atlas-mainline-f4 session 亲键
> 「版本候 0.1.129，L4 届时候你亲署，我已经授权过了，直接干就可诶」（f4
> 落档 @AtlasWeb 66549f9）——§6 折入授权记录（归 f4 落档），条件面照旧
> （授权非跳门：GATE-PASS + 本呈批书批复双门先达）。

## §0 波定位

收尾工单行 88 carrier 分支定谳：0.1.128 stdout stream-json 事件类型面
（assistant/connected/control_response/deferred/error/error_during_execution/
json_schema/pending/result/success/tool_use/user）**无审批请求事件形**；审批
现形仅 = `control_request`/`can_use_tool`（SDK 控制协议 = 禁复用面）+ mailbox
`permission_request`（非 stdout 面）→ **增补支成立**：carrier 契约增补结构化
审批事件 → 新 carrier 版本（候 0.1.129）走段 L 形发布链 → AtlasWeb runner
接线（形 A）→ pw 审批正腿补齐（工单行 55「pw 审批腿补齐入总验收全形跑」，
受阻登记 R2 翻转为销项）。

**形 A 权威路径（工单行 77，钉死）**：「runner 收 requestApproval」实义 =
runner 调用 **kernel 供给的 `requestApproval`** → host approvals 仅**证据
落档**（七字段纪律）→ UI ApprovalCard → decide **经 kernel** 结算 → runner
消费 kernel 判决继续/终止。**实现不得绕 kernel 直通 host（零 host 直通
旁路）**。

## §1 carrier 预注册形（AtlasCode，C1 + C2）

### C1 — `-p` 审批通道（cli 域）

- **C1-a opt-in flag**：`--approval-channel=stream-json`（parse.ts 注册 +
  print.ts 透传）。**flag 缺席 = 零行为变更**（既有 -p 消费面/单测/E2E/回归
  逐字节不动；ask 决断现形不变）。
- **C1-b ask 支路由**（print.ts:1278 `verdict.ask` 支）：flag 在场 → 不进
  structuredIO.createCanUseTool SDK 协议（禁复用面，文件头纪律句原文保留），
  改发 stdout `approval_request` 事件 + await stdin 决策行；flag 缺席 →
  现行路径原样。
- **C1-c wire 形（两事件，stream-json 面加性）**：
  - stdout：`{"type":"approval_request","approval_id":"<uuid>","tool_name":
    "<name>","input_digest":{...},"session_id":"<sid>"}`
  - stdin：`{"type":"approval_response","approval_id":"<uuid>","decision":
    "approved"|"denied"|"expired"}`
  - `input_digest` = 受控摘要键白名单（file_path / command / description /
    url / pattern），值截断 200 字符。**正文/令牌/待批内容禁入**（七字段纪律
    carrier 侧子集；UI 展示面同源同界——kernel 侧七字段全形见 C2-b）。
- **C1-d 决策读取 pending-gated**：引擎仅在 `approval_request` 已发出且未决
  时打开一次 stdin 行读取；**无审批回合零 stdin 读取**（r-20261122
  atlasweb-b2-gate 防悬挂定谳兼容面——stdin 不再必然闭，但读取仅 pending
  窗口内发生，零窗口 = 零读取 = 零悬挂）。未知 approval_id / 无 pending 的
  决策行 → log warn + 丢弃（fail-closed，不崩溃不悬挂）。
- **C1-e 超时唯一权威 = kernel**：carrier 零独立超时。引擎侧 Promise 终态
  完备性由 runner↔kernel 契约保证（§2 W1-a 四终态映射）——approved/denied/
  expired 经 wire 行回写；voidedByCancel 不走 wire（runner abort→kill，
  引擎 AbortError 路径既有）。malformed 决策行 → warn + 继续等待（kernel
  权威；引擎永不因坏行悬挂或误判）。
- **C1-f carrier 单测腿**：① flag 缺席 ask → 零 approval_request 事件
  （回归腿）；② flag 在场 ask → 事件形断言（字段面 + 白名单摘要）；
  ③ 决策行 approved→allow / denied→deny / expired 行→deny(reason=expired)；
  ④ malformed 行 → warn + 等待；⑤ abort → AbortError。
- **C1-g 补注册（f4 补钉② 前置枚举结论，2026-11-27 折入，先于落码）**：
  引擎 stdin 读取面全量枚举（grep process.stdin src/ 全量）——① 启动期
  探测面 = `dispatch.ts getInputPrompt`（非 TTY text 模式收集管道数据至
  prompt 解析完成、listener 即移除；与 channel pending-gated 读取**零并发
  窗口冲突**——probe 结束先于 runHeadless）；② TUI 面（earlyInput/
  gracefulShutdown/mcp auth/ink）-p print 车道不可达；③ LSP process.stdin
  = 写向 LSP 子进程（writer 非读）。**唯一窗口外并发面 = `--input-format
  stream-json`**（structuredIO.input = process.stdin 持续消费）→ 补注册
  **互斥**：`--approval-channel` 与 `--input-format stream-json` 同给 →
  启动期 fail-closed error exit。同批补注册：flag 仅支持 `--output-format
  stream-json` 组合（text 输出写 JSON 行会污染 stdout——同给 → 启动期
  fail-closed error）；approval 分支先于 SDK prompt 路由（canUseTool）分支
  （flag 显式 opt-in 优先序）。

### C2 — kernel 扩形（kernel 域，同版加性）

- **C2-a deps 扩形**：`ExecutionTurnRunnerDeps.requestApproval(req:
  { toolName: string; actionDigest: Record<string, unknown> })`（现无参调用
  点零破坏——参数加性，JS 运行时旧调用兼容）。
- **C2-b approval.requested 载荷七字段全形**：现 `{approvalId}` 扩为
  `{approvalId, toolName, actionDigest, workspaceId, turnId, requestedAt,
  sourceLane: 'execution-upstream'}`（加性；现消费面兼容）。工具名/动作摘要/
  工作区 id/turnId/approvalId/请求时点/来源车道——**事件字段，非正文/令牌/
  待批内容**（工单行 79 原文）；UI 展示面同源同界。

## §2 AtlasWeb runner 接线预注册形（形 A，W1）

- **W1-a spawnCliTurnRunner**：spawn args 追加 `--approval-channel=stream-json`；
  stdio 由 `['ignore','pipe','pipe']` 改 `['pipe','pipe','pipe']`（仅本 lane）。
  stdout 行泵新增 `approval_request` 支：解析 approval_id/tool_name/
  input_digest → 调 `deps.requestApproval({ toolName, actionDigest })`
  （kernel 供给）→ 终态映射：approved→写 `approved` 行 / denied→写 `denied`
  行 / expired→写 `expired` 行 / **voidedByCancel→零写入**（turn 取消 →
  abort handler kill 路径既有，进程随终止）。决策写入 = child.stdin 单行
  JSON + `\n`；**写入仅在响应已发出的 approval_request 时发生**（无审批回合
  stdin 零字节——防悬挂定谳兼容）。
- **W1-b 形 A 纪律**：host approvals 仅证据落档（approval.requested 七字段
  入证据）；decide 经 kernel（既有 `approval.decide` 路由 + E5 三元组归属
  绑定不变）；**零 host 直通旁路**（防滑点，工单行 77）。
- **W1-c web-host 单测腿**：① approval_request → requestApproval 调用 +
  决策回写形断言；② denied → 引擎收 deny、回合继续至 completed；③ expired
  行回写；④ voidedByCancel 零写入；⑤ **无审批回合 stdin 零字节 + 回合
  settle（completed）+ 子进程正常退出**（flag 在场、零审批回合下引擎不得
  挂起等输入——r-20261122 悬挂定谳 pipe 车道机械复跑腿，close/settle 必达；
  Atlas-reveiw 备核补钉 2026-11-27 折入）。

## §3 pw 审批正腿预注册形（E1，first-wave-execution.pw.ts 第 7/8 腿）

前置事实（采证）：`launchInstalledBinExecution` spawn **零 permission flag**
（installedApp.ts:75-80 实证）→ 引擎 default 权限模式 → Write 工具 = ask →
审批腿可达。

- **腿 7 `approve grants the pending tool and records kernel evidence`**：
  prompt 要求在工作区创建文件（Write → ask）→ pending 审批卡在场
  （ApprovalCard data 面）→ 批准 → **隔离文件实际创建**（fs 证据）+ 回合
  终态 + JSONL 落盘 + host 审批证据（approved）。
- **腿 8 `deny leaves the workspace untouched`**：同 prompt → 拒绝 →
  **文件零出现** + 回合终态（deny 后引擎以拒答文本继续收口 → 预注册
  completed；若实现为 failed 按实况报并注明归因）+ host 审批证据（denied）。
- 文件头受阻登记段（:28-32 R2）翻转为销项注记（审批正腿入总验收全形跑）。

## §4 发布序（两仓耦合序，预注册）

carrier↔consumer 版本耦合（AtlasWeb gate 跑 pin @atlaswork/atlascode 制品）
→ **carrier 先行发布，consumer 随后**：

1. **AtlasCode 落码**（本批复后）：C1（cli 域 1 commit）+ C2（kernel 域
   1 commit，单测随车）→ AtlasCode 全量 gate → merge master。
2. **段 L 0.1.129**：L1 release prep（bump 0.1.128→0.1.129 + CHANGELOG）→
   L2 build 紧贴 publish（staging tgz）→ L3 push 安全审查补查 → **L4 发布
   动作（预授权在案，执行单点 = atlas-mainline-f4）**：tag v0.1.129 → push
   origin master+tag → gitcode 镜像双推 → npm publish（D-8 SOP，
   `--registry https://registry.npmjs.org`）→ @atlaswork 镜像双发（同一
   staging tgz 仅改 name，禁独立重建）→ packument 验真三步 → L5 SRI 留档 →
   L6 生产 lane（单信号 → e2e）。
3. **AtlasWeb 落码**（0.1.129 published 后）：W1（web-host 接线 + 单测
   1 commit）+ pin bump 0.1.128→0.1.129 + **E1 pw 腿（1 commit）** →
   AtlasWeb 全仓 gate（现基线 538 pass/1 skip/0 fail 之上新绿）+ pw 全腿。
4. **格 I 三元同步**（L7 等价件，一 commit）：gateTruthTable EXPECTED 重锚
   （registry 实发制品 sha）+ gezi-i.json 重出证 + pin 断言同步。

## §5 预注册形（Δ 账 + 回退）

1. **Δ 账预估**：cli.js **变**（print.ts/structuredIO/parse.ts 增补）；
   executionSha256 **变**（kernel deps 扩形入 execution bundle）；
   runtimeSha256 **变**（kernel approval.requested 载荷扩面）。三值全变
   （诚实预估；0.1.128 executionSha256 偏离先例——按实况报并注明归因）。
   d.ts 树：kernel/execution 类型面扩形 +1 预计。
2. **exports 面**：零新增 subpath（wire 加性在既有 -p stdout 面内；
   `--approval-channel` 为 CLI flag 非 API 面）。
3. **回退形**：publish 后 gate/生产 lane RED → 硬门条款补丁版 + npm
   deprecate 标注，无豁免面。

## §6 L4 预授权记录（f4 开卷后折入落档）

- **授权原文**：用户于 2026-11-27 在 atlas-mainline-f4 session 亲键「版本候
  0.1.129，L4 届时候你亲署，我已经授权过了，直接干就可诶」——段 L 形链
  （carrier 增补版候 0.1.129）L4 全范围预授权（f4 落档 @AtlasWeb 66549f9）。
- **条件面（授权非跳门）**：L4 执行仍以 **GATE-PASS + 本呈批书 f4 批复双在
  案**为前置；亲署仅消除「候亲署」等待支（0.1.128 呈批书 §5 同形）。
- **执行单点**：atlas-mainline-f4（0.1.128 L4 亲执同形）；本 session（落码
  方）L3 完成后单信号移交 staging tgz + 验真链予执行单点，不自执 L4。

## §7 Gate 判据（预注册）

- AtlasCode：`FORCE_COLOR=3 bun test --isolate tests/` 全量（**tests/ 纯面
  准绳**；bun 位置参数 = 子串过滤器注记）0 fail + `bun run typecheck` 0。
- AtlasWeb：`FORCE_COLOR=3 bun test` 全仓 ≥538 pass / 0 fail + pw 全腿
  （8 腿，含新 2 审批腿）GREEN。
- 生产 lane（L6）：e2e 同套判据（0.1.129 registry 实发制品重跑）。

## §8 验收件（发布后）

gate 判定单终态 + f4 批复记录 + SRI v0.1.129.md（三值实况对 §5 预注册）+
packument 双 org 验真输出 + 生产 lane 收口单 + AtlasWeb pin bump / 格 I
三元同步回执 + pw 审批腿 GREEN 判定单（受阻登记销项）+ 工单 §6 切片核销。

## §9 f4 批复（2026-11-27，atlas-mainline-f4，job 9d1c80df）

**终判：批复 PASS——零必改，非阻注记 3 条。Main 即开 C1 落码（预注册纪律确认：偏离形先回本档改注册再实现）。**

**活码核真四锚（f4 独立实勘 @ b5d8cde8 时点 master）**：

1. **print.ts ask 支**：实勘 `if (verdict.ask && hasPromptRoute)` @
   **:1277**（呈批书载 :1278，±1 行，零影响）——ask → structuredIO
   can_use_tool control_request 路由 + 「禁复用面」文件头纪律句在场，
   C1-b flag 在场绕行改道设计与之咬合；
2. **executionKernel.ts**：`requestApproval` 现零参调用点 + `approval.requested`
   现载荷 `{approvalId}` + 300s timer kernel 侧（settleApproval expired）+
   `approval.decide` E5 三元组归属绑定——C2-a 参数加性（旧调用零破坏）与
   C2-b 七字段扩形（{approvalId} → 全形）预注册与活码相符；
3. **upstream.ts:106**：`stdio: ['ignore','pipe','pipe']` 实勘逐字 + 全文件
   零 approval 消费（grep 实证）——W1-a stdio 改形仅本 lane + 行泵加支
   前提成立；
4. **installedApp.ts:394-400**：`launchInstalledBinExecution` spawn argv
   （port/scope/execution/workspace/actor-id）**零 permission flag** 实勘
   ——default 模式 Write=ask，§3 腿 7/8 可达预判成立。

**形 A 对表七点全合**（对 收尾工单 @42c5251 §6 钉死节）：runner 调 kernel
供给 requestApproval ✓ / host approvals 仅证据落档 ✓ / decide 经 kernel（E5
不变）✓ / 零 host 直通旁路 ✓ / 300s 超时唯一权威 = kernel ✓ / 禁复用
control-request 面 ✓ / 七字段纪律（C1-c 白名单摘要 + C2-b 全形，正文/令牌/
待批内容禁入）✓。r-20261122 防悬挂定谳兼容（C1-d pending-gated 零窗口零
读取 + W1-a 无审批零写入）+ voidedByCancel 零写入 + 回退形照硬门条款 +
发布序合 §J 定形序（carrier 先行，pin bump 在 publish 后、格 I 取 registry
实发 sha）——逐项核可。

**非阻注记 3 条**：

1. §1 C1-b 锚点实勘 :1277（呈批书 :1278，±1 行，落码以实码为准）；
2. §3 腿 8 deny 终态 completed/failed 「按实况报并注明归因」预注册维持
   （两形均 GREEN 可采，判定单如实记录）；
3. 审计覆盖注记：本呈批书执行面 = 收尾工单 @42c5251 审计 PASS 形之机械
   细化（0.1.128 段 L 呈批书同形先例，无独立审计轮）；Atlas-reveiw 知会
   单信号发出备核。

**§6 授权记录激活**：核真 ≡ AtlasWeb 66549f9 §7-5 逐字一致（原文/条件面/
执行单点三点），随本批复生效；0.1.129 段 L L3 完成后 Main 单信号移交
staging tgz + 验真链，L4 由本 session（执行单点）亲执。

> 呈批 b5d8cde8 → 批复（本节）。L1–L3 候 Main；L4–L6 候双门达成
> （GATE-PASS + 本批复——本批复即第二门落定）。

**补钉折入（Atlas-reveiw 备核回执 2026-11-27，落码前生效，非阻批复）**：
r-20261122 悬挂定谳 pipe 车道机械复跑——① §2 W1-c 腿 ⑤ 扩形（flag 在场 +
无审批回合 → stdin 零写入 **+ 回合 settle completed + 子进程正常退出**，
已折入正文）；② **C1 落码前置 grep 项**：引擎 stdin 读取面全量枚举（启动期
input/structuredIO 探测面在内），确认 flag 在场下仅 pending 窗口读取——若
存在审批窗口外读取路径需改动，**回本档补注册再实现**（预注册纪律自文首
条款）。L4 执行后回执含发布事实链（tag/push 双远端/npm 双 org/镜像
name-only/SRI 三值）供 Atlas-reveiw 事后核。

## §10 判词侧复证（Atlasweb-F4，2026-11-27）

**终判：复证 PASS——§9 批复维持；四锚/形 A 七点/§6 预授权记录经判词侧独立
实勘全部成立；折入件 2（复证必改 1 = §4 序修形，W1/step 3 执行前折入，
不阻 C1/C2 AtlasCode 落码；复证注记 2 = §3 引用勘误，非阻）。**

**四锚独立实勘（@ af5684e9 committed state，`git show` 锚定，判词侧活码直证）**：

| 锚 | 实勘 | 结果 |
|---|---|---|
| 1 print.ts ask 支 | :1278 `if (verdict.ask && hasPromptRoute)`（±1 同 §9 注 1）+ :567 `structuredIO.createCanUseTool` SDK 协议路由在位（禁复用面现形） | 成立 |
| 2 executionKernel | :27 `EXECUTION_APPROVAL_TIMEOUT_MS=300_000`；:40-41 deps `requestApproval: () => Promise<…>` **零参现形**（C2-a 参数加性前提）；:270-294 `approval.requested` 载荷 `{approvalId}` + setTimeout expired + turn 三元组绑定；:380-396 `approval.decide` notFound + E5 归属绑定 | 成立（C2-b 七字段扩形以 :288 `{approvalId}` 为基线，加性） |
| 3 upstream.ts | :106 `stdio: ['ignore','pipe','pipe']` 逐字 + 全文件零 approval 消费（grep 实证）+ :99-105 注释直证 r-20261122 悬挂定谳（stdin 必闭纪律现形来源） | 成立 |
| 4 installedApp spawn | `e2e/fixtures/installedApp.ts` :352 `launchInstalledBinExecution`、:394-400 argv（`--port 0/--scope/--execution/--workspace/--actor-id`）**零 permission flag** | 成立（§3 前言引 :75-80 系错行，见注记 2；§9 锚 4 引用正确） |

**对表**：§0 事件类型 11 型枚举 ≡ 判词侧独立枚举（增补支 ≡ @670f931）✓；
形 A 七点 ✓；C1-c 载体子集 + C2-b 七字段全形两层面纪律 ✓（事件字段非正文/
令牌/待批内容）；§6 预授权 ≡ AtlasWeb 66549f9 §7-5 三点逐字 ✓；§5 Δ 账诚实
预估（三值全变）✓；§7 gate 判据合 tests/ 纯面口径 ✓；**9506a312 补钉采认**
（W1-c 腿⑤扩形「无审批回合 stdin 零字节 + settle completed + 子进程正常
退出」+ C1 落码前置 grep 项）——恰覆盖 stdio pipe 化后无审批回合悬挂回归
险面（r-20261122 定谳车道机械复跑），折叠形合格。

**复证必改 1（§4 序修形——W1/step 3 执行前折入本档，不阻 C1/C2）**：step 3
「pin bump → AtlasWeb 全仓 gate」与 step 4「格 I 三元同步」顺序倒置。格 I =
机器硬耦合（`packages/web-host/test/gateTruthTable.test.ts` :41-43
`table.carrierVersion` ≡ pin；:55-70 attestation 负腿 pin-mismatch/
anchor-mismatch → gap 即红）——pin bump 0.1.129 后全仓 gate 必红
（EXPECTED/attestation 仍 0.1.128），step 3 之 gate 判据在该序下不可达。
修形 = 0.1.128 先例 4f892ab 同形：**pin bump + 格 I 三元同步合一 commit，
全仓 gate 判据移其后**（step 4 并入 step 3 尾；registry 实发 sha 依 §J
不变；§9「发布序合 §J 定形序」判词按修形后序成立）。

**复证注记 2（引勘误，非阻）**：§3 前言「installedApp.ts:75-80 实证」错行
（该域 = mkdtemp/cleanup 辅助面）；正址 = `e2e/fixtures/installedApp.ts`
:352/:394-400。以 :394-400 为准（§9 锚 4 已正）。

> 复证链：af5684e9 全文读毕 → 9506a312 补钉核读 → 四锚活码实勘（git show
> 锚定 committed state）→ 格 I 硬耦合实勘（gateTruthTable.test.ts）→ 本节。
> 双门状态：第二门（§9 批复）已落定；第一门（AtlasCode gate）候 C1/C2 落码；
> 复证必改 1 折入后 §4 即为 W1 执行准绳。
