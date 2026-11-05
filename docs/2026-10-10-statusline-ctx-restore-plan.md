# 0.1.49 增量 SL-1 — statusline ctx 统计恒显方案（纯数字式，不恢复进度条）

> **2026-10-10 f4 规划面**（用户要求：「之前版本 statusline 还有 ctx 统计情况，不知道哪次优化给优化掉了，按最新版本的主题方案重新安排回来，并入 0.1.49 实施」）。
> **2026-10-10 用户再裁定（范围收窄）**：「不需要 `▉▉▊░░░░░░░` 进度条，只需优化解决『不显示』的问题，单点挺好」→ **SL-1 = 让纯数字式 ctx 统计恒显（无数据不消失 + 定因数据链），不恢复进度条、不碰 beamTheme/色阶逻辑**。
> **角色**：落码 = Main；gate/生产 lane = e2e；f4 = 判据/核验。release-governance 五段闭环。

## 1. 定因（「哪次优化掉了」= 没被优化掉，是 3 件设计决策叠加）

| # | 事实 | 证据 |
|---|---|---|
| 1 | ctx 段（context-bar）自 78624e4（09-29 壳波）起在默认行，**任何版本未删** | ContextBarSegment.tsx 全史 = 78624e4（创建）→ fbee6de（B2 折入）仅两提交；`context-bar` ∈ DEFAULT_SIMPLE_LINE1（78624e4 原文）；`~/.atlas/statusline.json` 不存在 = 默认段生效 |
| 2 | 现行数字式 `▤ 14k/1000k tok (1%)` 活着 | P0a 探针 2026-10-10 12:54 活捕 `P0-1c-ctx=✅`（regress-048 `2-p0a.log`，deepseek-v4-pro 车道） |
| 3 | **进度条 = 78624e4 前设计决策砍除**（非后续优化回归） | ContextBarSegment.tsx L5 头注「进度条砍除：数字本身是最好的进度指示，方块条视觉粗糙且信息密度低」（78624e4 原文） |
| 4 | **无数据（pct==null）整段隐藏 = 78624e4 原设计** → 用户 Qwen38-27B-TXT 会话查看时无 usage（会话刚起/首轮未完/IFF 响应缺 usage）→ 段不现形 = 「掉了」观感的真因 | ContextBarSegment.tsx L52-55 `if (pct == null) return null`（注「无数据段直接隐藏更好」） |
| 5 | fbee6de（0.1.24 §4b B2）只删独立 autoCompact 预警段（折入本段 ▲）+ 色阶改，**未删 ctx 本身** | 提交 msg「§4b B2 autoCompact 熔断预警折入 context-bar 段（删独立段 + 色阶改）」；0.1.24 release 面 `626e378…fbee6de` |
| 6 | 0.1.35 母题铺开已把光束进度条接 beamTheme（8 阶平滑 + ░ 底纹 + BR-7 档位），**触面 = 通知/设置/MCP，statusline 未接线** | ProgressBar.tsx L28-32（0.1.35 spec §0.1 + MARK_TIER）；全仓唯一 `<ProgressBar>` 消费 = MCPTool/UI.tsx:81（width 20 无色） |
| 7 | **数据链实查（2026-10-10 f4 盘 JSONL + IFF 实况）= ① IFF 缺 usage 证伪**：Qwen38-27B-TXT 实况会话（`7ee3f053`/`aff7ab8d`）assistant 消息**带 usage**（`{input_tokens:19685, output_tokens:153, …}`）；glm-5.1（`615fd6ba`）同样带 usage → IFF 网关对 Qwen38/glm 均正常回 usage。真正无 ctx 的会话 = `7dee6aa3`（**asst=0，0 轮完成**）→ 无 usage 可取 | JSONL 实测 + `getCurrentUsage`（`src/tui/utils/tokens.ts:138` 遍历找首个带 usage 的 assistant，无则 null）+ `calculateContextPercentages`（`context.ts:49` `!currentUsage → {used:null}`） |

**结论（数据定因后）**：用户缺失感 = **③ 无数据整段隐藏（78624e4 设计，`pct==null → return null`）在「会话刚起 / 首轮未完 / 截图时刻 usage 尚未落 messages」时触发**（`7dee6aa3` asst=0 实证）；① IFF 缺 usage **已证伪**（Qwen38 实况带 usage）。**无任何版本回归删除 ctx 段；现行显示形态 = 纯数字式 `▤ used/total tok (pct%)`，非进度条。**

> **2026-10-10 用户裁定（范围收窄）**：用户「不需要 `▉▉▊░░░░░░░` 进度条，只需优化解决『不显示』的问题，单点挺好」→ **SL-1a 进度条重接取消**；SL-1 = 单一目标 = **让纯数字式 ctx 统计恒显（修不显示）**。§1 第 6 条（0.1.35 母题铺开）仅作事实登记，不驱动落码。

## 2. 处置方案（2026-10-10 用户裁定收窄 = 单一目标：让纯数字式 ctx 统计恒显）

> **不恢复进度条**（用户明确不要 `▉▉▊░░░░░░░`）。现状数字式 `▤ used/total tok (pct%)` 已存在且活（§1 第 2 条），本项只做两件事：**(SL-1a) 无数据不再整段消失 + (SL-1b) 定因「为何用户车道不显示」并修**。

### SL-1a 无数据恒显（消「消失」观感，单点主修）— 落码（Main，1 处）

- `ContextBarSegment.tsx` L52-55：`pct == null` 分支现 `return null`（整段隐藏）→ 改 **dim 占位恒显**：
  ```
  <Text color="gray">▤ —/{formatK(total)} tok</Text>
  ```
  - `total` 恒有 = 现代码 `cw.context_window_size`（`StatusLine.buildSegmentInput` 经 `getContextWindowForModel(runtimeModel)` 装配，**动态取当前模型窗口，非写死**）。窗口取值链三层：
    ① `~/.atlas/settings.json` 的 `providers.<p>.models[].contextWindow`（经 `getInitialSettings().providers` → `getProviderContextWindow` 扫描）——用户实况声明 **Qwen38-27B-TXT=256000 / glm-5.1=256000 / deepseek-v4-pro=1000000**；
    ② provider 默认 `providers.<p>.defaultContextWindow`（iff=256000）；
    ③ 仅当模型未在任何 provider 池声明 → `MODEL_CONTEXT_WINDOW_DEFAULT`（`context.ts:7` = **150000**，最后兜底）。
  - 无 usage（会话起点/首轮未完）→ 段不再消失，改 dim `▤ —/{formatK(total)} tok`（**分母 = 当前模型实际窗口，Qwen38 场景 = `—/256k tok`**；有数据即切回正常色阶数字式，L57-68 不动）；
  - ▲ autoCompact 预警（L59-63）保持；`!cw` 支（通道 A 面无输入）保持 null（B 通道恒装配 = StatusLine.tsx L80-83 / L153-156 双处）；
- **零新原语、零色逻辑改动、零 ProgressBar**——只把「无数据 → 消失」改「无数据 → dim 占位」，数字式形态与现行完全一致。
- 用户面预期：`⚡ Qwen38-27B-TXT · 🧠 xhigh · ▶ default · ▤ —/256k tok（dim，无数据）/ ▤ 45k/256k tok (18%)（有数据）· ⌂ ~`（256k = settings 声明 256000，非 150k）。

> **窗口分母精确入口（2026-10-10 用户追问「150K 哪来的」f4 定因）**：占位/数字分母一律走 `getContextWindowForModel(当前模型)` 动态值；150k 只是 `MODEL_CONTEXT_WINDOW_DEFAULT` 最后兜底（仅未声明模型），用户 Qwen38 已声明 256000 走不到 150k。**潜在不一致登记（follow-up，不阻本波）**：context-bar 链兜底 150000 vs 角色/压缩支（`roles.ts:196`）兜底 `HARD_DEFAULT_CONTEXT_WINDOW` 262144，两常量不同；用户已声明模型两边一致，仅「未声明窗口模型」接入时现形。

### SL-1b 数据链定因（e2e 探针，决策⑧ 口径）— 测试侧（e2e）+ 依定因决定是否仓内修

- 新探针 **statusline-ctx（用户模型车道）**：headless TUI + 用户实际模型配置（Qwen38-27B-TXT，IFF `127.0.0.1:8999`）→ 两断言：(a) **0 轮完成时** ctx 段显 dim 占位 `▤ —/256k tok`（Qwen38 声明 256000，SL-1a）；(b) **完成 1 轮后** ctx 段切真实数字（regex `▤\s*\d+k?/256k\s*tok\ (\d+)%`，分母 = settings 声明 256000）；
- 定因三分支（2026-10-10 数据重排，① 已证伪、③ 确认为主因）：
  ③ **会话无数据（首轮未完）= 主因**（`7dee6aa3` asst=0 实证）→ 预期行为，SL-1a 占位即闭环；
  ① IFF 响应无 usage 字段 → **已证伪**（Qwen38/glm 实况 JSONL 均带 usage）→ 非本项目标；
  ② usage 在 JSONL 但 TUI 数据链 drop（`getCurrentUsage`/messages ref 面）→ **仅当 (b) 断言红才命中**（1 轮跑完 usage 已在 JSONL 但段仍不显 = TUI 侧 drop）→ 仓内 Main 修（加 1 处数据链，并入 0.1.49 落码）。
- **定因结果决定 0.1.49 仓内落码量**：(a)+(b) 双绿 = 纯 ③，仅 SL-1a 单点（仓内 1 处占位）；(b) 红 = 命中 ②，加数据链小修（+1 处）。

## 3. gate 判据（e2e）+ 回归重跑清单

| 面 | 判据 |
|---|---|
| 四件套 | 同口径精确一致（tsc 0 · eslint 0e·0w · build · 全量单测） |
| 判别单测（Main 随码，SL-1a） | ContextBarSegment render fixture 2 件：① 有 usage → 数字式 `▤ N/k tok (p%)`（3 色阶分支断言 `<70 cyan/≤90 yellow/>90 red`）② 无 usage（`pct==null`）→ **dim 占位 `▤ —/{total}k tok`（非 return null；total = 传入 `context_window_size` 动态值，fixture 注入 256000 断言 `—/256k`）** |
| statusline-ctx 探针（新，SL-1b） | 用户模型车道两断言：(a) 0 轮完成 → dim 占位 `▤ —/256k tok`（Qwen38 声明 256000）在场（SL-1a 闭环）；(b) 完成 1 轮 → 切真实数字（`▤ Nk/256k (p%)`）；(b) 红 = 命中 ② TUI drop（仓内 Main 修） |
| P0a P0-1c-ctx 正则更新 | 兼容 `—` 占位面 + 数字面（e2e fixture 维护项，非判据变更） |
| 用户面走查层 | ctx 段单行不折行 / 无 CJK 混入 / 无数据 dim 态 vs 有数据正常态视觉（0.1.24 走查层先例） |
| 零回归 | 0.1.42 权限探针 27 项零增减 / /help 50 标签 / P0a+A4F hardFail=0（0.1.48 落地后口径重跑） |

## 4. 0.1.49 并波（波构成，2026-10-10 收窄后）

- **0.1.49 = AD-47（PermissionDenied 发射点 + retry 消费）+ AD-08（sandbox.network.deniedDomains 键+接线+优先级）+ FX-36 verify（ATLAS_LLM_TIMEOUT 活态，30min cap 保持）+ SL-1（ctx 恒显单点：SL-1a 无数据 dim 占位〔仓内 1 处〕+ SL-1b 数据链定因探针〔仓内落码量依定因 ② 是否命中〕）**；
- gate 面互不交叠判据：AD-47 = hook 发射/retry 消费（engine 车道）/ AD-08 = sandbox 配置键+接线（sandbox 车道）/ FX-36 = LLM 超时活态验证 / SL-1 = TUI statusline 恒显 + 数据探针 → **可并车**；
- **SL-1 体量 = 单点小修**（用户裁定「单点挺好」）：仓内主改 1 处（`ContextBarSegment.tsx` 无数据占位）+ 依 SL-1b 定因可能加 1 处数据链；不碰 ProgressBar / beamTheme / 色阶逻辑。

## 5. 波序与 checkpoint

- SL-1 入 **0.1.49**（界① 正式 checkpoint = 0.1.48 完全落地后）；本方案 = 用户预审件（2026-10-10「你先看看方案」），用户可现调或 checkpoint 时再裁。
- 0.1.48 现 gate 状态见当日报告（GATE-OPEN 中段：A4F/V3 时窗竞态定因中，静默重跑指令已发 e2e）。
