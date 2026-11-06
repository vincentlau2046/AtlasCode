# AtlasCode 现状完整诊断（f4 零码全貌审计）— 2026-11-06

- 触发：用户 2026-11-06「先分析清楚，决策后才可以实施。我想对当前 atlascode 的现状做一次完整而全面的诊断。再考虑继续实施的事情。」——0.1.90 W-opt-1 工单已出稿（58f37586）但**双信号未发、实施冻结**，随本诊断交用户决策。
- 被测锚定：master `16b0d68e`（= v0.1.89 五段闭环终态 + W-opt 研读 docs；f4 三证：master=tag v0.1.89^{commit}=origin ALIGNED + npm live 0.1.89 + SRI 直算三方同值）。
- 事实源：本审计代码实查 + `docs/2026-10-14-p0-closure-audit.md`（P0 收官盘）+ 0.1.67–0.1.89 逐波工单/双报告（user-e2e/reports/ 187 份）+ `docs/2026-10-19-full-picture-wave-plan.md` + `docs/2026-11-06-dsh-study-notes.md`（8 模块研读）+ `docs/release-governance.md` + CHANGELOG。
- 报告格式 = 全局特性列表（特性 | 满足·条件满足·缺口 | 根因 | 处置 | 推导链），禁增量叙述。

## 0. 总判定

**AtlasCode 处于「地基收官后、第二增长曲线决策前」的健康稳定态**：发布链 0.1.48→0.1.89 共 42 版全五段闭环（零 GATE-OPEN 未收口欠账），对齐区间 2.1.89→2.1.303 全闭，已知产品缺口全部登记在册且有归属；主要未决面不在代码（代码债低），而在**三个决策点**（0.1.90 波构成 / W-D 跨 session / 上游 drift 复核）与**一个外部依赖**（强模型池恢复）。

## 1. 产品能力面（全局特性列表）

| 域 | 状态 | 证据/规模 | 缺口与归属 |
|---|---|---|---|
| Agent 核心循环（engine loop） | 满足 | loop.ts（回合级 fallback 有序表 0.1.59 + abort/超时支 + compact 熔断交互）；loop-rob R1 六支 + R3 kill/resume 实跑绿 | 500-storm 优雅快速失败 E-1b-full 登记不修（改默认语义需用户裁） |
| 工具族（Bash/Read/Edit/Grep/Web/WebFetch/MCP/Agent/Skill…cmd32） | 满足 | Grep ENOENT 根修 0.1.44；G2 skilltool-root 0.1.16；MCP 硬化 0.1.57 + K2 17 件 0.1.81 | C4-4 interrupt cancel_queued / C3-6 嵌套转发 = SDK 阻塞登记 |
| Skills / 插件 / hooks | 满足 | K3 30 件 0.1.82 + 插入件 II 产方合形；R-087-3 Step 0 硬化 0.1.88（Tier 1 判据 v2 GREEN） | Tier 2 具名 defer（真强面回归触发 5 补充轮）；@ant×2 未声明 fail-visible 登记 |
| 上下文压缩 | 满足（含本诊断新发现） | autoCompact 阈值/熔断/tracking + compact.ts 1007L + R-085-1 resume 缝修 0.1.86 + Gap A 64 族处置 0.1.89 | **C-2 切点无 pairing 平衡（本次诊断坐实，keepRecent>0 活面）→ 0.1.90 候选主件**；C-1/C-3/C-4 DSH 候补 |
| 会话/恢复/持久化 | 满足 | sessionlist 根因 0.1.38/39；K4 worktree/git/恢复持久化 0.1.83（docker 2.56 双 leg）；K5 Read/编码 0.1.84 | C4-5 /rewind、C10-6 核验面 soft 登记 |
| TUI/渲染 | 满足 | P0 波 0.1.19–26 + K6 28 件 0.1.86 + R-086-1 接线补件 0.1.87（K6-8 中断门 + idle_notification） | K6-2/7 活面限制 + K6-9/10/11 锚登记不排 |
| 权限/沙箱 | 条件满足 | C1-1 hard_deny 双层 0.1.55/59；权限 mailbox 硬化 0.1.36/37；sandbox auto-allow 面 | **SB 族（DSH 对照）：执行时 escalation 词汇 + durable session-mode 事件无**（0.1.90 候补池）；C7 企业族 Q2 裁「不入」登记 |
| headless / SDK 车道 | 满足 | print.ts 单组合根；R4 drain（0.1.66）；headless 兜底 #262 | contextModifier 支维持停件（用户未批） |
| swarm/多代理 | 满足（最小面） | mailbox 0.1.36 硬化 + in-process teammate 面 | S-2 durable continuable children 无（DSH 1545L 语义面，登记 W-opt 中期）；C3-3 fork-by-default 用户终裁不合入 |
| 模型接入（modelprovider） | 满足 | 4206L 薄层；fallback 有序表； Gap A 投影单一事实源 0.1.89 | iff/* 别名 CLI 前缀剥离互操作登记不排 |
| 配置/help 面 | 满足 | cmd32 + /help55 HELP_SET=062 恒等 + 配置模板零码交付（W-B） | 首启引导流 / globalConfig 面登记不排（用户未裁「立」） |
| 品牌系统 | 满足 | Branded House 封口 0.1.35 + de-ant 6 锚 + UA 单一事实源 0.1.21 | — |
| 多 OS | 满足 | 0.1.43 Windows 4 件 gate 6/6 + npm registry 纪律 | Win ACL 沙箱后端无（SB-4 待核面） |

## 2. 工程与质量面

| 面 | 现状 | 证据 |
|---|---|---|
| 代码规模 | src ~527k 行（tui 427k / engine 86k / modelprovider 4.2k / cli 8k / shared 2.9k）+ 测试 447 文件 + user-e2e lane | 实测 |
| gate 体系 | 六判据 fail-closed：判别双面（RED↔GREEN）+ 四件套 + P0a/A4F + 命令恒等 + 回归活面（fam 16/16 + token 对账 34 波 307 项锚 + de-ant）+ 生产 lane（SRI 四值三方 + PONG + cmp Δ=0） | r-20261106-gate-089 / prodlane-089 |
| 测试规模 | 单测 5568/0（0.1.89 gate）+ 判别探针银行（086–089 全 RED↔GREEN 银行化）+ prompt 字节锚 37,754B cmp 全等 | gate-089 |
| 发布链 | 0.1.48→0.1.89 = 42 版全五段闭环终态；SRI 四值纪律 30+ 波零事故；npm `--registry npmjs.org` 纪律 | git tag 94（含历史）/ release commits |
| 流程治理 | 8 步跨 session 矩阵（审计前置 + fail-closed 门禁 + 角色分立）+ 波前审视 + auto-advance 授权 + Atlas-reveiw 每波审计 | release-governance.md |
| 质量教训沉淀 | 字节级 hex 审计（0.1.44）、探针 serving fingerprint 窗口律（Tier 1）、text()≠屏面 pyte 重放（0.1.86）、harness ESM 噪声治本（0.1.89 Option 2）、判据不稀释原则 | 各波工单 |

**质量面判定：无未收口红账。**唯一质量注记 = e2e 探针对 serving 漂移敏感（085→086 R1-delay 事件；已以窗口律 + fingerprint 双记制度化消化）。

## 3. 架构面

| 面 | 状态 | 说明 |
|---|---|---|
| 分层 | 满足 | engine（headless 同构）/ tui / modelprovider 薄层 / shared；engine→TUI import 禁令纪律（0.1.89 attachmentProjection 自含直证） |
| DI/port | 满足 | CompactPorts / deps 注入面（autoCompact port 之下全真）；组合根单点（print.ts / loopDeps / agentLoopDeps） |
| 单一事实源点 | 满足 | identity（UA）/ attachmentProjection（0.1.89）/ attachment 处置登记表 / HELP_SET=062 |
| 已知架构参考 | 登记 | PL-1 Cordis 全插件化 = DSH 参考架构不排；F-4 APIError 双族已并（0.1.79） |
| 死面卫生 | 满足 | 0.1.89 死面三族 tombstone 消费定谳不删（有据）；legacy [] 6 族登记 |

**架构债判定：低。**当前无已知结构性欠账；DSH 对照出的架构级差距（durable children / 事件日志持久化 / 全插件化）均属「第二增长曲线」范畴而非债。

## 4. 对齐面（Claude 商用版）

| 面 | 状态 | 说明 |
|---|---|---|
| 对齐区间 2.1.89→2.1.303 | 满足 | 卷 1（32 卡）+ 卷 2（C1–C11）+ 卷 3（V3-1~V3-9，0.1.80–88）全闭环；登记面（E-1P/OOS/19☆）为裁定终态非缺口 |
| 上游 drift | **缺口（检查项）** | B 镜像 top 2.1.303 @ 2026-10-18 同步，**至今 19 天未同步**——上游是否已发 2.1.304+ 未核；卷 4 触发条件悬置 |
| 长尾 1P 面 | 条件满足 | E-1P-12–27 + OOS-01–06 登记不排（1P 判定基线，国产主面 OOS） |

## 5. 运行环境与模型面

| 面 | 现状 | 风险 |
|---|---|---|
| IFF 网关 | 127.0.0.1:8999 单点；现役 glm-5（vllm serving fingerprint 双记制度化） | **强模型池全灭中**（gpt-6.1-sol 502/503、glm-5.3/deepseek 族 429 月配额、k3 403）——0.1.88 Tier 2 具名 defer 的重入触发（真强面回归 5 补充轮）挂此依赖；Main 探活循环已武装（20min 周期 7 天上限） |
| 探针模型 | Qwen38-27B-VL（探针档）+ seeded 沙箱纪律 | 弱模型行为方差 = 判据面噪声源（0.1.89 事件已制度化消化） |
| npm 供应链 | deps 52 + optionalDeps 6（0.1.88 依赖闭包波）；SRI 四值纪律 | @ant×2 未声明（fail-visible 设计）登记 |

## 6. 登记缺口全景（当前活池，2026-11-06 口径）

| 类 | 项 | 处置归属 |
|---|---|---|
| **a. 候波（工单已出待裁）** | C-2 compaction 切点 pairing（坐实）+ G-1 repeat-tool 连击提醒 | 0.1.90 工单 58f37586，**待用户决策后发双信号** |
| **b. W-opt 候补池（DSH 研读产出）** | C-1 KV-cache 摘要（待 tools/system 奇偶直证）/ C-3 overflow 触发 / C-4 durable 事务标记 / SB-1 escalation 词汇 / SB-2 durable session-mode / SB-4 OS 级后端 / CR-1 代码执行 / G-2 per-tool 超时 / SC-1 批量 framing / SQ-1 会话搜索 / S-2 durable children（中期） | W-opt 后续波逐批裁定 |
| **c. 用户裁定点** | W-D 跨 session 簇（D1–D5 未裁）/ contextModifier 支（停件）/ C3-3 fork-by-default（终裁不合入，可重启）/ C1-6 containment escape（适用性低）/ 多包拆分触发器 / 首启引导 + globalConfig 立否 | 各 memory/工单登记 |
| **d. 外部依赖** | Tier 2 强面回归 5 轮（等强池恢复）/ ④ SDK resumeSession + C3-6 + C4-4（等 SDK） | 触发器挂起 |
| **e. 登记不排（零码终态）** | 500-storm E-1b-full / @ant×2 / K6 锚面 / D4 环境性族 / Option 1 等价物容忍候补 / iff 前缀剥离观察 / E-1P+OOS 长尾 / PL-1 / SC-2 / 硬编码接面 B-1–B-3 | 持续登记 |

## 7. 风险面（f4 视角 top 5）

1. **上游 drift 未核**（§4）——对齐产品的核心前提是「跟住上游」；19 天窗口 + 卷 3 已收口 = 检查空窗。低成本消除（f4 零码镜像同步）。
2. **强模型池持续枯竭**——Tier 2 收口、判据升级（若卷 4 需 adherence 类判据）、以及任何「强面锚」类验证都被阻塞；pool 恢复时间不可控。
3. **e2e 探针 serving 敏感性**——已制度化（窗口律）但每次 serving 变更仍会带来重 bank 成本；模型池越贫乏，单模型方差风险越大。
4. **单点组合根**——print.ts/loopDeps 组合根集中装配（单组合根是设计选择），波动面集中；无即时风险，登记观察。
5. **tui 427k 行体量**——渲染/壳/工具散布同层；K6 后已有锚定面，但进一步增长会抬每次回归成本；第二增长曲线（若含 TUI 扩展）前宜再做一次分域盘点。

## 8. 决策点清单（交用户）

| # | 决策点 | f4 建议 | 紧迫度 |
|---|---|---|---|
| 1 | 0.1.90 W-opt-1（C-2 主件 + G-1 副件）发不发 | **建议发**（C-2 坐实缺口 + 切点面活、G-1 小件；工单已备审计就绪） | 中 |
| 2 | 上游 drift 复核（f4 零码镜像同步 + 若 2.1.304+ 在场出卷 4 分析卡） | **建议做**（零码，先行） | 高（窗口在扩大） |
| 3 | W-D 跨 session（D1–D5 材料已备方案 A） | 维持 defer，材料随要随呈 | 低 |
| 4 | W-opt 后续波构成（候补池 §6.b 排序） | 待 0.1.90 收口后按候补池横排出卷 | 低 |
| 5 | contextModifier 支 / C3-3 重启 / 多包触发 | 维持现裁定，无新证据前不动 | 低 |

## 9. 推导链（三步）

① 能力面逐域核 0.1.48–0.1.89 工单+双报告+活码（§1）→ 产品面无未登记缺口、登记面全部有归属（§6）；② 工程面核 gate/发布链/SRI/教训沉淀（§2）→ 无红账、流程制度化成熟；③ 架构/对齐/环境面核（§3–5）→ 架构债低 + 对齐区间闭合 + 两个外部悬置（drift、强池）→ **总判定成立：决策点 = §8 五项，代码面无阻塞项。**
