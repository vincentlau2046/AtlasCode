# P0 对齐轨道收官盘（2.1.89→2.1.295 双源对齐重锚 + 残留登记面）— 2026-10-14 f4 零码审计

> **2026-10-14 f4 规划面**（用户裁定「你先做 P0 收官盘，完成再考虑后续计划」）。f4 零码 = 只读 docs/git/npm/双源镜像核验，不落码。
> **事实源**：卷 1 PAC `docs/2026-10-10-p0-pac-0148.md`（32 卡）+ 卷 2 PAC `docs/2026-10-12-p0-pac-0155.md`（C1–C11 + Q1–Q7）+ 滚动表 `docs/2026-10-09-p0-pr-log.md`（§1–§7）+ 逐版 e2e 报告（user-e2e/reports/ 108 份）+ git 发布链（0.1.48–0.1.66 全 release commit + tag）+ 双源镜像（B = claude-code-upstream top 2.1.295 / A = claude-code-system-prompts top 2.1.277）。
> **被测锚定**：master **8adfd97 = release v0.1.66**（f4 三证：master = tag v0.1.66^{commit} + npm live 0.1.66 SRI 同值 + 双报告全绿）。
> **报告格式** = 全局特性列表（特性 | 满足·条件满足·缺口 | 根因 | 处置 | 推导链），禁增量叙述。

## 0. 判定

**P0 对齐区间 2.1.89→2.1.295 = 收口完成**（执行面全闭环 + 登记面终态 + 上界已闭合）：
- **卷 1（2.1.89→2.1.120）32 卡** = go 29 + defer 2，**全闭环**（0.1.48/49/50/51 常规波 + 0.1.52–54 AD-45 独占三连 + 0.1.61 AD-07 单列小波，五段闭环终态）。
- **卷 2（2.1.121→2.1.295）C1–C11 3P 执行面** = **全闭环**（0.1.55–0.1.66 十二波；决策项 Q1–Q7 全裁定终态：Q1 defer / Q2 不入 / Q3 独占波✅闭环 / Q4 /goal✅闭环 / Q5 续登记 / Q6 单列✅闭环 / Q7 流程面）。
- **残留 = 登记面（非缺口）**：☆ 低优先/待核/SDK 面 19 项 + E-1P-12–27 + OOS-01–06 = 登记不排（零码终态，P1 轨或后续波另行裁定）。
- **上界闭合**：对齐区间末端 = B 源 top 2.1.295（卷 2 即区间末端，PAC §8「无卷 3」）；**卷 3 触发条件 = 上游发布新版**（B 镜像最后同步 2026-10-08，10-14 时点 6 天同步差，2.1.296+ 是否存在未核 = 登记）。
- **在途面**：0.1.67 用户 bug 修插入波（非 P0 对齐项，走 P0 轨标准三 lane；工单 `docs/2026-10-14-p0-wave-0167-ticket.md` 已出、波号 0.1.67 落定、基线 8adfd97；**双信号未发、Main 落码未启动**〔master 仍 8adfd97、worktrees/ 无 067 面〕）。

## 1. 卷 1（CC 2.1.89→2.1.120）收口面（32 卡 @ PAC 0148）

| 特性（波） | 状态 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| 0.1.48 首车 = A-① 安全两件（FX-27 落码 + FX-37 验证）+ A-② MCP 两件（AD-49 落码 + FX-24 验证）+ A-⑤ PT-20/21/24/10 零码批 | 满足（五段闭环终态） | gate 首跑 GATE-OPEN = A4F/V3 环境性云 429（0.1.47 基线同签名红 = 非回归） | 用户裁定切 Qwen38 本地探针模型复 gate → regate GATE-PASS → release efeb429 + npm（生产 lane 面并入 Main 发布链，早期链先例，无独立报告） | `r-20261010-gate-048.md`（GATE-OPEN 定因链）→ `r-20261010-regate-048-qwen38.md`（GATE-PASS，单信号 86bce4f9） |
| 0.1.49 第二车 = A-③ AD-47（PermissionDenied 发射 + retry 消费）+ A-④ AD-08（sandbox.network.deniedDomains）+ B-2 FX-36（ATLAS_LLM_TIMEOUT verify）+ SL-1a/1c statusline | 满足 | — | gate r-20261010-gate-049 GATE-PASS + 生产 lane r-20261011-prodlane-049 PASS + release 736da46 + tag v0.1.49 | 双报告在场 + release commit 在场 |
| 0.1.50 第三车 = B-1 压缩×会话持久化 6 件（AD-22 PreCompact block + FX-30/31/34/35 --resume 族 + FX-04+PT-04 invoked-skill 保全）+ follow-up 3 件 | 满足 | — | gate + 生产 lane 双报告 GATE-PASS/PASS + release + tag v0.1.50 | 双报告在场（r-20261010 面） |
| 0.1.51 第四车 = C 簇 12 件（C-1 worktree 三件 + C-2 TUI 渲染族 + C-3 memory 族 + C-4 插件源 + C-5 权限降噪 + FX-38a） | 满足 | — | gate + 生产 lane 双报告全绿 + release + tag v0.1.51 | 双报告在场 |
| 0.1.52–0.1.54 = AD-45 独占大波（"defer" 权限决策 + headless 挂起 resume 重评，TOP#1，AD-45 先例 = 大波需界①） | 满足（三连版全 npm live，0.1.54 终态核销全链欠账） | 生产 lane 两次 GATE-OPEN 打回：① --resume 重评路径 Write/Read `TypeError reading 'signal'`（deps 缺 signal 执行字段）② 缺口#2 --resume 重评消费支生产不可达（marker 装载路径结构性排除） | 修波 670e3c2（signal/toolContext 透传 + makeCtx() 注入）→ 0.1.53；修波 5085aa6（recoverDeferredToolUseMarkers 装载面回捞 + 2 新测文件 7 件）→ 0.1.54 r4 **PASS**（SRI 4 值 17792734B 三方同值）= AD-45 独占波 5 段闭环终态 | `r-20261011-gate-052.md` GATE-PASS → release 5632b6b → `r-20261011-prodlane-052.md` GATE-OPEN① → 0.1.53 b76005e → `r-20261011-prodlane-053.md` GATE-OPEN② → 0.1.54 03ceaf0 → `r-20261012-prodlane-054.md` **PASS**（「0.1.53 欠账随终态发布物核销」） |
| defer 2 件终态：AD-45（0.1.52–54）+ AD-07 插件 tag 工具（Q6 裁单列小波） | 满足 | AD-07 2026-10-12 裁「单列小波」入 0.1.61+ 波池首车 | 0.1.61 = release 7ad450d + tag v0.1.61 + npm live；gate r-20261013-gate-061 7 行全绿（单测 21/21 + CI 4114·0·319 + 插件族 46/46）+ 生产 lane PASS（SRI 4/4 + 4 token 1/1/2/1） | 双报告在场 + 0.1.61 五段闭环 |
| 1P/长尾登记区（E-1P-12–19 + OOS-01–04：Managed Agents 云族 / claude.ai 调度 / PushNotification·Remote Control / Computer Use MCP / ultrareview 云 / Opus 4.7 模型表 / Bedrock·Vertex·Mantle / 1P 周边） | 条件满足（登记终态） | 1P 依赖 claude.ai 托管/1P 模型表/1P 云 provider = 1P 判定基线（pr-log §0） | 零码登记不排（E-1P 先例 = 0.1.41 封口波登记入面） | pr-log §4 + §7.1 |

## 2. 卷 2（CC 2.1.121→2.1.295）C1–C11 收口矩阵（@master 8adfd97）

| 簇·项 | 状态 | 落波/根因 | 处置 | 推导链 |
|---|---|---|---|---|
| **C1 auto-mode 安全**：C1-1 hard_deny 第 4 类（2.1.136） | 满足 | 提示词层 0.1.55 + **解析层 0.1.59**（最严聚合 + 用户意图不可清除） | 双层闭环 | 0.1.55 零码批 + 0.1.59 4 件之一（68098f3）；生产 lane 前波 token 恒等 |
| C1-2 transcript JSONL 篡改软块（2.1.205）+ C1-3 git 安全批（2.1.182/200/213）+ C1-4 WebFetch 不可信忠实报告（2.1.265） | 满足 | 0.1.55 提示词零码批（V2-01） | 零码批落码 + 断言单测锁 | 0.1.55 五段闭环 |
| C1-5 多变量 rm 阻断（2.1.216/205） | 满足（✓ 已吸收） | 本仓 Unverifiable Deletion Target 已覆盖（PAC D1 逐字比对） | 无动作 | PAC 0155 §2 C1-5 |
| C1-6 containment escape（2.1.257，云 metadata 凭据抓取） | **缺口（登记）** | 国产替代面 = IFF 自托管，适用性低（decision 面） | ☆ 登记不排（P1 轨或企业面另行裁定） | PAC 0155 §2 C1-6 |
| **C2 跨 session 硬化**（C2-1 crossSessionInbound/dialogExpiry + C2-2 peer authority warning + C2-3 notify_when_idle + C2-4 delivery notice） | **缺口（defer 裁定）** | Q1 = 2026-10-13 0.1.60 收口窗裁「维持 defer」（2026-10-09「非紧急只调研不落码」裁定续） | 调研方案 A 备查（`docs/2026-10-09-cross-session-uds-research.md` D1–D5）；激活 = 0.1.61+ 中–大波（门控默认 OFF）另裁 | PAC 0155 §5.2 Q1 裁定记录 |
| **C3 subagent 编排**：C3-1 background-by-default + run_in_background（2.1.198/212，★ 最大单件缺口） | 满足 | **0.1.65 地基波**（引擎侧异步原语 + needs-input 信号 + 委派纪律批 + P5 时序守卫，零行为变更）+ **0.1.66 翻转波**（a1 翻默认 + 逃生舱 env `ATLAS_AGENT_DEFAULT_FOREGROUND` + R4 headless drain，有意语义变更，off 面恒等锚） | Q3 独占波两波收官（用户 2026-10-14 三项终裁：a1 翻默认 / 两波 / 可选件不合入 / 逃生舱加） | `r-20261014-gate-065`（GATE-PASS 6 判据）+ `r-20261014-prodlane-065`（PASS）+ `r-20261014-gate-066`（GATE-PASS，A4F r3 7 场景 0 fail）+ `r-20261014-prodlane-066`（PASS：本波 10 token @ dist + 前 10 波 52 token 零回归 diff=0 + Δ8910B） |
| C3-2 subagent 200 cap（2.1.212→2.1.224 移除） | 满足（✓ 无缺口） | 上游已移除 cap，本仓无 cap 同口径 | 无动作 | PAC 0155 §2 C3-2 |
| C3-3 fork-by-default（2.1.232） | **缺口（登记）** | 用户 2026-10-14 终裁「0.1.66 可选件不合入，保持干净」（Q3-6 留登记） | ☆ 登记（后续波单独裁定） | 0.1.66 工单「不入境」段 |
| C3-4 委派纪律提示词批（2.1.240/271/211） | 满足 | 成本感知句 0.1.55（V2-02）+ 批完成 0.1.65（Q3-4：usage notes + no-predict + task-notification 语义 + 1P 裁面） | 翻默认纪律前置就位（评估卡 §9 R2 缓解） | 0.1.65 gate「cost-aware 0.1.55 已落防漂移」+ 0.1.66 生产 lane「Be cost-aware about delegating×1」 |
| C3-5 coordinator 编排 + worker 指令（2.1.152/182） | 满足（✓ 已吸收） | 本仓 workerAgent.ts「cc 2.1.271 两源逐字」 | 无动作 | PAC 0155 §2 C3-5 |
| C3-6 subagent 嵌套转发 stream-json（2.1.219） | **缺口（登记）** | SDK 面（☆ 登记，PAC 原判） | ☆ 登记不排 | PAC 0155 §2 C3-6 |
| **C4 loop 鲁棒性**：C4-1 mid-stream partial 保留（2.1.199）+ C4-2 ECONNRESET 退避（2.1.198） | 满足 | 0.1.58（V2-06，用户点名最高优先区；C1/C2/C3/R3 重跑先例） | 闭环 | 0.1.58 双报告 + release 7d030fa |
| C4-3 长工具进度心跳（2.1.214）/ C4-4 interrupt cancel_queued（2.1.219/261）/ C4-5 /rewind before /clear（2.1.191） | **缺口（登记）** | ☆ 低优先 / SDK 面 / 待核验（PAC 原判 ☆） | ☆ 登记不排（低优先波或核验波另行裁定） | PAC 0155 §2 C4 |
| **C5 MCP 硬化**：C5-1 alwaysLoad（2.1.121）+ C5-2 连接失败 reminder（2.1.205） | 满足 | 0.1.57（V2-05） | 闭环 | 0.1.57 双报告 + release 8021d80 |
| C5-3 >2min 自动后台（2.1.212）/ C5-4 能力发现退避（2.1.191） | **缺口（登记）** | ☆ 低优先（PAC 原判） | ☆ 登记不排 | PAC 0155 §2 C5 |
| C5-5 企业 allowlist（managedMcpServers/allowedMcpServers，2.1.259） | 条件满足（裁定终态） | Q2 = 2026-10-13 裁「不入，E-1P/OOS 登记」（企业沙箱/凭据面非国产主面） | 登记不排 | PAC 0155 §5.2 Q2 裁定记录 |
| C5-6 ToolSearch 族 | 满足（✓ 已吸收） | 0.1.4x 波（toolSearchGate/compactPtl 在场） | 无动作 | PAC 0155 §2 C5-6 |
| **C6 memory/压缩**：C6-1 compaction 安全指令保留（2.1.139）+ C6-4 invoked-skills 压缩后历史化（2.1.239） | 满足 | 0.1.55 零码批（V2-03） | 闭环 | 0.1.55 双报告 |
| C6-3 持久教训 per-reply 检查（2.1.212/221） | 满足 | 0.1.55 零码批（V2-02 并入 C6-3） | 闭环 | 0.1.55 双报告 |
| C6-2 memory index 容量预警（2.1.210） | **缺口（登记）** | ☆ 低优先（PAC 原判） | ☆ 登记不排 | PAC 0155 §2 C6 |
| C6-5 memory 格式（kebab/[[links]]） | 满足（✓ 已吸收） | validateMemoryFrontmatter kebab 校验在场 | 无动作 | PAC 0155 §2 C6-5 |
| **C7 sandbox/凭据 settings 族**（C7-1 strictAllowlist / C7-2 credentials+mask / C7-3 filesystem.disabled / C7-4 DirectoryAdded hook） | 条件满足（裁定终态） | Q2 = 2026-10-13 裁「不入，E-1P/OOS 登记」 | 登记不排（C7-4 并入 C8 面同裁） | PAC 0155 §5.2 Q2 裁定记录 |
| **C8 hooks 扩展**：C8-1 PreModelSwitch/PostModelSwitch（2.1.251）+ C8-4 updatedToolOutput 全工具化（2.1.121） | 满足 | 0.1.56（V2-04） | 闭环 | 0.1.56 双报告 |
| C8-2 DirectoryAdded（2.1.219）/ C8-3 MessageDisplay（2.1.152）/ C8-5 terminalSequence+continueOnBlock（2.1.141） | **缺口（登记）** | V2-15「随 V2-04/0.1.60 小波随裁」→ 未裁 = 登记（C7-4 同面） | ☆ 登记不排（小事件族，后续波并入） | PAC 0155 §3 V2-15 |
| **C9 配置/CLI**：C9-1 Tool(param:value) 规则语法（2.1.178）+ C9-3 --permission-prompts none（2.1.259）+ C1-1 hard_deny 解析层（2.1.136）+ C9-4 fallbackModel 有序 3 + 回合级 fallback（2.1.166） | 满足 | **0.1.59 四件**（b2c0c40/68098f3/2588698，release eb887f7 之上波体） | 闭环（gate 4085·0·317 精确增量 + autoMode 判别探针 6/6） | 0.1.59 双报告 + release eb887f7 |
| C9-2 --restricted（2.1.248）/ C9-5 skillOverrides（2.1.129）/ C9-6 classifyAllShell（2.1.193） | **缺口（登记）** | ☆ 低优先（PAC 原判）+ C9-6 企业面 = E-1P/OOS（D6） | ☆ 登记不排 | PAC 0155 §2 C9 |
| C9-7 ANTHROPIC_* 模型 env 族（2.1.236/257） | 条件满足（登记终态） | 国产替代 = IFF 面（E-1P-24 先例） | E-1P 登记 | PAC 0155 §2 C9-7 |
| **C10 TUI 命令**：C10-1 /goal（2.1.139） | 满足 | Q4 裁「不排单独评估」→ 评估后 **0.1.62 核心+持久化（C0×6+P1）+ 0.1.63 演化批（P2–P8 含 ProposeGoal/check-in 定时器）** = **12 演化项全落**（/goal 全面演化对齐达成） | 两波闭环（0.1.63 生产 lane「/goal 全面演化 12 项终态抽验」） | `r-20261013-prodlane-063.md` 行 5 |
| C10-2 /output-style（2.1.269）+ C10-3 /cd（2.1.169）+ C10-5 /reload-skills（2.1.152） | 满足 | 0.1.60 TUI 小波（主链末车，/help 51→54 + cmd 29→32） | 闭环 | 0.1.60 双报告 + release 260387a |
| C10-4 /fork·/branch | 满足（✓ 已吸收） | 命令目录已核（branch.ts forkSession） | 无动作 | PAC 0155 §2 C10-4 |
| C10-6 /permissions 回合中可开 + /add-dir 对话中（2.1.234） | **缺口（待核登记）** | 「核验」面（行为未核，PAC 原判 ☆） | ☆ 登记（核验波） | PAC 0155 §2 C10-6 |
| **C11 提示词注入硬化批**：C11-1 文件名不可信转义（2.1.234）+ C11-3 AskUserQuestion 收紧（2.1.154/216） | 满足 | 0.1.55 零码批（V2-01 并入 C11-1/3） | 闭环 | 0.1.55 双报告 |
| C11-2 ultracode 关键词硬化（2.1.210） | 满足（✓ 已吸收） | Workflow 工具描述「hardened against non-human input」在场 | 无动作 | PAC 0155 §2 C11-2 |
| ④ SDK `unstable_v2_resumeSession`（Q5/V2-13，9521f9f 登记零码） | 条件满足（登记终态） | Q5 = 2026-10-12 裁「续登记」（不扩波 scope）；0.1.66 终裁二次确认留登记 | ☆ 登记不排 | PAC 0155 §5.2 Q5 裁定记录 |
| E-1P-20–27 + OOS-05/06（卷 2 登记区：Artifact 族 / Managed Agents 扩展 / Remote Control·Tag / 模型表 / 云 provider 族 / Cowork·Design Sync / 个人助理族 / gateway 协议族 / PowerShell 映射 / API 参考文档） | 条件满足（登记终态） | 1P 判定基线 + 国产主面 OOS | 零码登记不排 | PAC 0155 §4 |

## 3. 残留登记面（19 项，缺口 = 登记不排，非发布阻塞）

| # | 项 | 源 | 性质 | 处置 |
|---|---|---|---|---|
| 1 | C1-6 containment escape | 2.1.257 | ☆ 适用性低（国产 IFF 面） | 登记 |
| 2 | C2 跨 session 全簇（Q1） | 2.1.166–271 | defer 裁定（中–大波，激活另裁） | 登记（调研方案 A 备查） |
| 3 | C3-3 fork-by-default（Q3-6） | 2.1.232 | ☆ 小（用户终裁不合入 0.1.66） | 登记 |
| 4 | C3-6 subagent 嵌套转发 | 2.1.219 | ☆ SDK 面 | 登记 |
| 5 | C4-3 长工具进度心跳 | 2.1.214 | ☆ 低优先 | 登记 |
| 6 | C4-4 interrupt cancel_queued/still_queued | 2.1.219/261 | ☆ SDK 面为主 | 登记 |
| 7 | C4-5 /rewind before /clear | 2.1.191 | ☆ 待核验 | 登记 |
| 8 | C5-3 MCP >2min 自动后台 | 2.1.212 | ☆ 低优先 | 登记 |
| 9 | C5-4 MCP 能力发现退避 | 2.1.191 | ☆ 低优先 | 登记 |
| 10 | C6-2 memory 容量预警 | 2.1.210 | ☆ 低优先 | 登记 |
| 11 | C8-2 DirectoryAdded 事件 | 2.1.219 | ☆ 小事件（V2-15 随裁未裁） | 登记 |
| 12 | C8-3 MessageDisplay 事件 | 2.1.152 | ☆ 小事件（V2-15 随裁未裁） | 登记 |
| 13 | C8-5 terminalSequence+continueOnBlock | 2.1.141 | ☆ 增强小件 | 登记 |
| 14 | C9-2 --restricted | 2.1.248 | ☆ 低优先 | 登记 |
| 15 | C9-5 skillOverrides | 2.1.129 | ☆ 低优先 | 登记 |
| 16 | C10-6 /permissions 回合中可开核验 | 2.1.234 | ☆ 待核验 | 登记 |
| 17 | ④ SDK unstable_v2_resumeSession（Q5） | 9521f9f | 续登记（零码） | 登记 |
| 18 | D-3 摘要 fallback 模型重试（0.1.67 块 D 借鉴面） | Claude autocompact 差异分析 | ☆ 鲁棒性（与超时族同域可合波） | 登记 |
| 19 | D-5 压缩后 git status 现形 | 同上 | ☆ 低优先 | 登记 |

> 注：C9-6 classifyAllShell 归 E-1P/OOS 登记（D6 裁定，企业面）未入本 19 项；卷 1 长尾 ☆/★ 非 PAC 卡项（pr-log 全文表内 38 FX/49 AD/34 PT 中未入 32 卡者）=「长尾登记不逐条排」（pr-log §1/§2/§3 原口径），不构成本收官盘缺口面。

## 4. 上界裁定（对齐区间是否延伸）

| 特性 | 状态 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| 对齐区间 2.1.89→2.1.295 上界闭合 | 满足 | 卷 2 PAC 明示「2.1.295 = B 源 top，卷 2 即对齐区间末端，无卷 3」；B 镜像本地 top = **2.1.295**（镜像最后 commit 2026-10-08 e47cc82），A 镜像 top = **2.1.277**（A 面局限 = 2.1.278–295 B-only，D7 已裁可接受） | 区间内全簇已收口（§1/§2）；**卷 3 触发条件 = 上游发布新版**（2.1.296+） | 双源镜像 `head CHANGELOG.md` 实读 + git log 镜像日期 |
| 镜像同步差（登记） | 条件满足 | B 镜像 2026-10-08 停更，10-14 时点 = 6 天差；上游是否已发 2.1.296+ 未核 | 可选动作 = 同步双源镜像重查 top（f4 零码）；若新版在场 → 开卷 3（同 PAC 规格：全量读 + D1 live 锚定 + 簇候选卡 + 波排程） | 镜像 git log -1 = 2026-10-08 |

## 5. 在途面（非 P0 对齐项，走 P0 轨标准三 lane）

| 特性 | 状态 | 根因 | 处置 | 推导链 |
|---|---|---|---|---|
| **0.1.67 用户 bug 修插入波**（块 A 超时族 4 件〔缺省 600s→900s + 单位误配提示 + 错误行单位显形 + 超时参数总表文档〕+ 块 B 模型会话级恢复 4 件〔B-1 写侧/B-2 读侧/B-3 allowlist 静默拒绝修复/B-4 零码登记〕+ 块 C autocompact 命名面 4 件〔C-1 命名顶出根修/C-2 显示面兜底/C-3 Windows 写侧 case 归一/C-4 陈旧注释〕+ 块 D Claude 对齐借鉴〔D-1/D-3/D-5 全不入境登记，0.1.68 重审候选〕，12 件 10–15 文件 300–500 行估） | **在途 = Main 落码面（双信号已发）**（2026-10-14 时点：master 仍 8adfd97，落码未合） | 工单 `docs/2026-10-14-p0-wave-0167-ticket.md`（波号 0.1.67 落定，基线 = 0.1.66 release 8adfd97；用户 2026-10-14 三项裁定：单位保持毫秒+误配提示+缺省 900s / 模型恢复 = 会话级记忆 / 出单范围 = 工单交 Main；用户 sign-off「先做 67 波」）；**双信号已发**（Main 落码触发 + e2e 预审登记 task #156 备查不预跑不预占，执行触发 = Main 落码合 master 单信号） | 链自治：Main 落码合 master → e2e gate → release → 生产 lane → 收口 = 五段闭环终态 | 工单 §3 链定义 + 用户 sign-off「先做 67 波」裁定 + e2e 预审登记（判据 6 项备查） |
| **0.1.68 scope = 不预锁定**（用户裁定） | 条件满足（裁定终态） | 用户 2026-10-14 裁定「先做 67 波，完成后基于 67 波的版本再重新审核分析 68 波次」 | 0.1.67 五段终态后 f4 基于 0.1.67 版本重新盘核 D-1/D-3/D-5 + 新增差异面，另出工单 | 用户裁定记录（f4 转述，0.1.67 工单块 D 段） |

## 6. 后续计划（0.1.67 已裁「先做 67 波」，链自治推进；余下裁定项交用户）

| 序 | 裁定项 | 状态/f4 建议 | 依据 |
|---|---|---|---|
| ① | **0.1.67 在途推进**（用户已裁「先做 67 波」，双信号已发） | 无新决策：Main 落码合 master → e2e gate（task #156 预审登记）→ release → 生产 lane → 收口 = 五段闭环终态 | §5 在途面 |
| ② | **0.1.68 重审**（用户已裁「完成后基于 67 波的版本再重新审核分析 68 波次」） | 无新决策：0.1.67 五段终态后 f4 基于 0.1.67 版本重盘 D-1/D-3/D-5 + 新增差异面，另出工单（scope 不预锁定） | §5 0.1.68 裁定行 |
| ③ | **双源镜像同步 + 上界复核**（f4 零码，可选） | 随 0.1.67 收口后顺手做（B 镜像 6 天差）；若 2.1.296+ 在场 → 出卷 3 分析卡（对齐轨道重启） | §4 |
| ④ | **P1 国产替代轨**（W-opt 让位解除裁定） | P0 收官 = 让位条件成熟；开波 = 用户界①（P1 轨评估卡需另出） | memory 国产替代优化轨 W-opt pending |
| ⑤ | **残留登记面 19 项**（§3）是否成波 | 建议不单独开波（全 ☆ 低优先/SDK 面/待核验）；可随 P1 首波或后续 P0 续卷批量裁定（C8-2/3 小事件族 + C4 族 + C5 族 = 一个「小件清尾波」候选） | §3 性质列 |
| ⑥ | **Q1 跨 session 激活**（C2 中–大波） | 维持 defer（2026-10-09 裁定续）；激活需 D1–D5 裁定（门控默认 OFF），非紧急 | §2 C2 行 |

**推导链（三步）**：① 卷 1 32 卡 + 卷 2 C1–C11 逐项核波/核报告/核 git 发布链 = 执行面全闭环（§1/§2，逐行推导链 = 双报告 + release commit + tag + npm 四证）；② 登记面（E-1P/OOS + 19 ☆ + Q1/Q2/Q5 裁定终态）= 登记不排零码终态（非缺口）（§3）；③ 上界 2.1.295 闭合 + 卷 3 触发条件明确 + 在途 0.1.67 状态落定（§4/§5）→ **P0 对齐轨道收官 = 区间内全簇对齐达成**；后续 = 用户裁定后续轨道（§6 ①–⑤）。

---
*f4 零码审计产物（只读 docs/git/npm/双源镜像，不落码）。落码/gate/release = Main/e2e 车道。*
