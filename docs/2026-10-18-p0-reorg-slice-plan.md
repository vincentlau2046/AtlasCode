# 归整波切片规划 + 排期（架构归整 > 登记项单独成波）— 2026-10-18 f4 零码

- 日期：2026-10-18
- 触发：用户 2026-10-18 指示（Main 转达）「架构归整 > 登记项单独成波，请 f4 出归整波切片规划并排期实施」。
- 基线：**4d007bd = v0.1.74**（主链 0.1.55–0.1.74 二十波全清；de-ant 登记面 C-3e 已销项）。
- 事实源：架构落地规划 v3.3（`AtlasHarness/docs/10-架构落地规划-v3.md`，Phase 5 = 编排层归位 + Core/APP 分离，P-1~P-7 可独立 Patch 终点）+ 当前仓 @ v0.1.74 代码面 f4 实查 + 0.1.73/0.1.74 工单登记面。
- 角色：f4 = 规划/判据/排期（零码）；落码/gate/release = Main/e2e 车道。

## 0. f4 盘核结论（当前态 @ v0.1.74，实查 grep）

| 判据（v3 P-1~P-7） | 当前态 | 结论 |
|---|---|---|
| P-1 五域门面唯一 | `engine/modelprovider/memory/sandbox/executor` 各 `index.ts` 门面 **5/5 在场** | ✅ 已达成 |
| P-2 依赖方向单向 | APP 层（tui+cli）深路径 import engine 内部（非门面）= **0 处**（import 语句级实查） | ✅ 已达成 |
| P-5 旧路径清零 | `sandbox-adapter`/`runCannCommand` 活码 = **0**（6 处 grep 命中全为注释/文档） | ✅ 已达成 |
| 登记面销项 | C-3e MCP 远端车道 = 0.1.74 销项；**C-2c `getOauthProfile` 文件已删**（0.1.73 裁，src grep 0） | ✅ 已清 |
| **剩余实体①** | **C-2b `sessionIngress` 1P 远端 session 车道**（§8.74.29 1P 簇裁 #200，9 消费文件可达，国产 IFF 面 OOS，前向缝域换 gateway 未决） | **唯一剩余实质大裁剪** |
| **剩余实体②** | **per-server oauth 块级 scope-gating**（0.1.74 新增登记 f4 设计项，MEDIUM 安全：untrusted scope 的 oauth 块须整体显式 allowlist；单字段门控已裁拒 = 信任单元不劈裂） | **安全设计件，待落点** |
| 剩余实体③ | P-4（五域契约测试锁定）/ P-7（五域直测）/ P-3（单实例不变式断言）验收核 | 归整收官验证面 |

**判定**：仓体结构已基本达成 v3 Phase 5「Core/APP 分离」目标态（P-1/P-2/P-5 全绿）→ **归整波 = 剩余 gap 收口，非大迁移**。切片 = ① 先删后整的前置删除批（C-2b）② scope-gating 设计件落点 ③ P-1~P-7 验收核收官。

## 1. 归整波切片规划（对齐 v3 收敛序：先删后整再收口，每切片 = 一个版本波走标准五段链）

> v3 收敛序 = 绞杀者（旧路径最后删）+ 行为零变化分界 + 测试防线先行 + 行为快照 + worktree 流。归整波沿用：**切片① 先删（C-2b 登记项，前置）→ 切片② 整（scope-gating 设计件）→ 切片③ 收口（P-1~P-7 验收核）**。

| 切片 | 波号 | 内容 | 体量 | 前置 |
|---|---|---|---|---|
| **① de-ant 残项删除批**（前置·先删后整） | **0.1.75** | C-2b `sessionIngress` 1P 远端 session 车道整裁（9 文件可达性核验 → 定裁面 + 恒等锚；C-2c 已裁不重复） | 中（9 消费文件，1P-only 面裁，通用/local 面恒等） | 无（基线 4d007bd） |
| **② per-server oauth 块级 scope-gating**（f4 设计件落点） | **0.1.76** | untrusted scope 的 oauth 块（clientId/authServerMetadataUrl/clientMetadataUrl 整体）须显式 allowlist；单字段门控不劈裂信任单元 | 小–中（mcp/auth.ts + config.ts + constants/oauth.ts + McpAuthTool + MCPSettings 显示面） | 0.1.75 五段闭环 |
| **③ P-1~P-7 终态验收核**（归整收官） | **0.1.77** | 五域契约测试锁定（P-4）+ 五域直测（P-7）+ 单实例不变式断言（P-3）+ P-1/P-2/P-5 grep 终核 + 旧路径/兼容 shim 全清 | 小（验证为主，低行为风险） | 0.1.76 五段闭环 |

### 切片① 0.1.75 — C-2b sessionIngress 1P 远端 session 车道整裁

**9 文件可达性（f4 实查 @ v0.1.74）**：`sessionIngress.ts`（1P 车道本体，`getOAuthHeaders` anthropic-version 冻结字面量已内联 + teleport/api 已整裁）/ `sessionIngressAuth.ts` / `main.tsx` / `sessionStorage.ts` / `caches.ts` / `MCPSettings.tsx` / `mcp/client.ts` / `constants/oauth.ts` / `attribution.ts` + `AgentTool`（sessionUrl 面）。

**裁面 + 恒等锚（f4 判据，Main 落码时逐 site 定裁）**：
- **裁面 = 1P 远端 session 专属面**：`sessionIngress` 日志/ingress 写入支 + `sessionIngressAuth` 1P 远端认证支 + 各消费文件的 1P-remote 分支。
- **恒等锚（零扰动）**：local/generic session 存储、generic MCP 车道（sse/http/ws + per-server oauth）、AgentTool local（非 remote）面、attribution local 面、`constants/oauth.ts` 已中性化值。
- **裁面定性**：逐消费文件判「1P-only（整文件删）vs 共享（选择性裁 1P 支）」——1P-only 文件（sessionIngress.ts/sessionIngressAuth.ts 若纯 1P）= 整删 + import 面清零；共享文件 = 只裁 1P 远端分支，local/generic 行为字节级恒等（判别单测锚）。
- **判据（fail-closed）**：① 判别单测红→绿（1P 车道缺席 + local/generic 恒等锚全绿）② 四件套 + CI 顶层 ③ P0a + A4F `--release-gate 0.1.75` ④ /help 55 + cmd **32** 恒等（e2e 勘误：0.1.73/0.1.74 gate 实测口径 = cmd 32/32，gate 以探针实测为准）⑤ 前波探针族零回归恒等 + 新活探针「1P 远端 session 车道缺席」（gate 触发后起稿）⑥ 生产 lane SRI D-8 + PONG-075 + 本波 token@dist + **前 19 波（0.1.56–0.1.74）零回归**（e2e 勘误：0.1.73 C-2a 中性化面 + 0.1.74 C-3e 销项 token 面必入，0.1.74 生产 lane 已立基线）+ Δ8910B。

### 切片② 0.1.76 — per-server oauth 块级 scope-gating（f4 设计件）

**设计（f4 定案，Main 落码）**：
- **信任单元不劈裂**（0.1.74 4th-review 裁定延续）：per-server `oauth` 块（`clientId` / `authServerMetadataUrl` / `clientMetadataUrl`）= 一个信任单元，**块级整体 scope-gating**，不做单字段门控（单字段 = 半门控假安全面，已裁拒）。
- **门控语义**：oauth 块来自 **untrusted scope**（project/plugin 提交、非操作者显式信任）时，须**显式 allowlist**（操作者 pin）方可生效；trusted scope（操作者/部署控制）= 恒通过。
- **落点面**：`services/mcp/auth.ts`（oauth 块消费 + getter 优先级链）/ `services/mcp/config.ts`（scope 来源判定）/ `constants/oauth.ts`（allowlist 面）/ `McpAuthTool.ts`（OAuth 行显形 untrusted-gated）/ `MCPSettings.tsx`（TUI 显示 untrusted 块待 allowlist 态）。
- **与既有纪律关系**：env 部署控制优先（0.1.74 D-2 getter 链）= 操作者可 pin 可信 CIMD URL 覆盖 repo 提交值（已落）；本切片 = 补「untrusted scope oauth 块整体须显式 allowlist」的门控层，与 env pin 面正交叠加。
- **判据**：① 判别单测红→绿（untrusted 块未 allowlist = oauth 面不生效红→绿 / trusted 块恒等 / 单字段不劈裂守卫〔clientId 与 authServerMetadataUrl 同门控恒等〕）② 四件套 + CI 顶层 ③ P0a + A4F ④ /help 55 + cmd **32** 恒等（gate 以探针实测为准）⑤ 前波探针族零回归 + 新活探针「untrusted oauth 块门控」⑥ 生产 lane SRI + PONG-076 + token + **前 20 波（0.1.56–0.1.75）零回归** + Δ8910B。

### 切片③ 0.1.77 — P-1~P-7 终态验收核（归整收官）

- **验收清单（v3 §2.2 达标清单，逐项 grep/断言落盘）**：P-1 五域门面唯一（APP 深路径 import grep=0）/ P-2 依赖方向单向（D1–D4 grep）/ P-3 组合根唯一 + 单实例不变式**固化为断言测试** / P-4 五域对外契约独立测试锁定（改实现不动契约全绿）/ P-5 旧路径 grep=0 / P-6 每域「换实现不改调用方」既定路径被证明 / P-7 五域直测文件在场。
- **性质** = 验证为主（低行为风险），把 v3 P-1~P-7 从「已达成但未固化」转「断言/测试锁定不回归」= **归整波收官**，主链 0.1.55–0.1.77 收口，架构归整 > 登记项单独成波达成。
- **判据**：① P-1~P-7 逐项断言/单测全绿（新增 P-3/P-4/P-7 测试）② 四件套 + CI 顶层 ③ P0a + A4F ④ /help 55 + cmd **32** 恒等（gate 以探针实测为准）⑤ 前波探针族零回归 ⑥ 生产 lane SRI + PONG-077 + **前 21 波（0.1.56–0.1.76）零回归** + Δ8910B。

## 2. 排期（切片序 + 版本波号 + Main 开工时序）

| 波 | 切片 | 启动时序 | 收口条件 |
|---|---|---|---|
| **0.1.75** | ① C-2b 删除批（前置·先删后整） | **f4 双信号即起**（Main 落码触发 + e2e 预审登记）；Main 收到触发信号即开工 | 五段闭环（gate GATE-PASS → release + tag v0.1.75 + npm → 生产 lane PASS → 收口）|
| **0.1.76** | ② scope-gating 设计件 | 0.1.75 五段闭环后（前波未落地不启后波） | 同上五段闭环 |
| **0.1.77** | ③ P-1~P-7 验收核 | 0.1.76 五段闭环后 | 同上五段闭环 + 架构归整收官 |

- **链定义（每波标准三 lane）**：f4 出工单 + 双信号 → Main 落码合 master 单信号 → e2e gate（判据 6 项）→ Main release（chore 0.1.7x + tag + npm `--registry https://registry.npmjs.org` + SRI 四值 D-8）→ 生产 lane PASS → e2e 报 Main PASS 收口 → Main 单点报用户 = 五段闭环终态。
- **开工时序**：Main 侧 = 0.1.75 立即（f4 双信号收到即起）；0.1.76/0.1.77 严格串行（前波未落地不启后波，用户 2026-10 节奏裁定延续）。
- **波后**：主链 0.1.55–0.1.77 全清，架构归整（v3 Phase 5 目标态）收官；后续 = P1 国产轨 / 19 项残留清尾 / Q1 跨 session（均待用户界①，非本归整波范围）。

## 3. 裁定项（用户 界①，Main 启动门不放宽）

- ① 切片① 0.1.75 = C-2b 删除批**前置先删**（与归整波第一切片合并为一个发布波，用户 2026-10-18 裁定延续）——确认
- ② 切片② 0.1.76 = scope-gating **块级整体门控**（untrusted scope oauth 块须显式 allowlist，单字段不劈裂信任单元）——确认
- ③ 切片③ 0.1.77 = P-1~P-7 验收核**固化为断言/测试**（非纸面达成）——确认
- ④ 三切片严格串行（前波未落地不启后波）——确认
- ⑤ C-2c 已裁（getOauthProfile 0.1.73 删）不重复入切片①——确认

---
*f4 零码规划产物（规划/判据/排期，不落码）。落码/gate/release = Main/e2e 车道。切片①②③ 各工单在 Main 开工前由 f4 分别落盘（docs/2026-10-1[89]-p0-wave-017[567]-ticket.md）。*
