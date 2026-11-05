# Ascend 三总纲预设技能（doctor / optimism / 算子开发）需求分析与实施计划 — 2026-11-02 f4

> f4 零码规划产物。状态 = 需求分析 + 实施编排，非开工声明；0185 补闭环在飞、K6=0186 已定，本方向排 0187，最终版本号/总计划同步归 Main。

## 1. 需求分析（全局特性列表）

| 特性 | 现状/根因 | 处置方向 | 推导链 |
|---|---|---|---|
| ascend-doctor 总纲（诊断域） | 产品已有 5 运行时 skill（generate/validate/debug/optimize/model-adapt）+ 6 域知识 skill，但缺跨域"诊断入口总纲"；用户点名 ms-agent 最新技能与 MCP 预设 | 薄路由 SKILL.md：故障分类树（编译/精度/运行时/性能/部署/环境）→ 路由到既有 debug/precision-debug/runtime-debug/测试 skill + msprof-mcp MCP 预设 + ms-agent skill 集 | ms-agent=Apache-2.0，`ms-agent-skills/`（SKILL.md+references+scripts）；本机 ascend-agent-skills 市场已含 mindstudio-profiling/precision-debug、common-ops(fault_diagnose)、vllm-tests-failure-analysis 等诊断族 |
| ascend-optimism 总纲（性能优化+实施域） | 既有 ascend-optimize/perf-optimize 偏单算子；缺模型级/部署级优化与落地实施总纲 | 总纲覆盖三层：算子级（perf-optimize/tiling 重纠）→ 模型级（msmodelslim 量化压缩/megatron-FSDP 训练优化/vLLM-ascend 部署）→ 实施级（cann-recipes-infer/train recipe 落地路径） | cannbot plugins-official 有 model-infer-optimize/ops-perf-optimize；cann-recipes-infer（accelerator/benchmark/models/recipes_ops）+ cann-recipes-train 同构；本机 cannbot-model-infer-skills、mindspeed-*、ascend-transformer-boost 全族在场 |
| 算子开发总纲（名称建议 ascend-opdev） | 既有 ascend-generate 是端到端流水线，但缺"按语言/框架选开发技能集"的路由层 | 决策树路由：DSL 需求→cannbot-dsl；TileLang→tilelang-op-orchestrator+ops-tilelang；Triton→triton-op-generator；CUDA 迁移→cuda2ascend-simt；AscendC→community-ascendc/catlass；PyTPO→pypto-op-orchestrator；直调→ops-direct-invoke | cannbot-dsl 有 skill/ + first-operator.md；ops-tilelang 独立仓（src/tests/docs）；本机 cannbot-tilelang/catlass/triton/cuda2ascend/pypto/community-ascendc 插件全族在场 |
| 预集成基础设施 | **已存在**：marketplace 5 步预装链（kill-switch→registry→policy→git→clone，gitcode 源 + cannbot submodule）；bundled skill 单一事实源模式；World A/B 知识验真（pin+drift+integrity） | 三总纲走既有链，不新造预装机制 | ascendMarketplaceStartupCheck.ts + marketplacePreset.ts + ascend-official.manifest.yaml 实读 |
| 系统提示词衔接 | `src/ascend/prompt.ts` → systemPromptSection('ascend_agent') 现平铺 11 条 skill 行 | 重构为分组路由（诊断/优化/开发三域 + 既有流水线行），总纲各 1 行 + 子技能按需渐进披露；防 prompt 膨胀 | prompt.ts 实读：11 条已较长，31 插件全铺不可行 |
| 命令面/恒等风险 | bundled skill 默认 `userInvocable:true` → 每个新 skill 注册 slash 命令 → cmd32//help55 恒等破 | 三总纲显式 `userInvocable:false`（纯自动触发+域路由），不新增命令面；若用户要显式 /ascend-doctor 则需 cmd 基线重订 | bundledSkills.ts:75–99 实读 |
| MCP 预设 | settings.mcpServers + src/mcp/mcpConfig.ts/mcpPolicy.ts 在场；本机 msprof-mcp 已验证可用 | doctor 总纲内嵌预设说明（连接串/工具目录/seeded 沙箱要求），不静默改用户 MCP 配置；capabilities 元数据不可信教训沿用 | mcp/types.ts、mcpPolicy.ts 实读 |
| 内容信任与许可 | 外部仓为不可信内容；产品不允许运行时拉取执行 | 总纲正文自持（路由逻辑内嵌），子技能内容走既有 marketplace pin+验真链；ms-agent 内容若引入需 Apache-2.0 归属 + 版本 pin | 既有 licenseInference.ts + manifest 验真先例 |

## 2. 实施编排（0.1.87 候选，串行于 0185→0186 之后）

### 任务 A：三总纲 SKILL.md 内容与单一事实源
- Create: `src/ascend/skills/ascendDoctor.ts`、`ascendOptimism.ts`、`ascendOpdev.ts`（对齐既有 5 skill 的 SKILL_MD/NAME/DESCRIPTION/WHEN_TO_USE/ALLOWED_TOOLS 五件套模式）；`src/ascend/skills/index.ts` 聚合导出。
- TUI 壳 `src/tui/skills/bundled/` 三同构文件，`registerBundledSkill({userInvocable:false})`。
- 总纲正文要求：各 ≤120 行；触发条件/域边界/子技能路由表（含未预装插件的"建议安装"指引而非死链）；doctor 域内嵌 MCP 预设段（msprof-mcp 连接参数模板 + 零写真实 HOME 约束）；明确"总纲不替代子技能方法论"。
- 代码内子技能路由表 = 单一事实源，prompt 分组渲染消费同一张表（防 prompt/正文漂移）。

### 任务 B：系统提示词重构（衔接核心）
- Modify: `src/ascend/prompt.ts`（域单一事实源）+ tui 壳 re-export。
- 结构：保留既有 11 条流水线/域 skill 行不变（零回归锚）；追加三域分组头 + 3 条总纲行（何时进总纲、总纲再路由）；总篇幅增量硬帽（如 ≤+8 行，gate 实测 token 面）。
- 判别测试：prompt 分组渲染含总纲且不含死链；技能路由表与 prompt 行一致性断言；既有 11 行逐字不变。

### 任务 C：ms-agent 技能 + MCP 预设接入（doctor 域）
- ms-agent `ms-agent-skills` 以 pin 版本快照进 ascend marketplace 清单（不运行时 fetch）；license 归属 Apache-2.0 入 manifest。
- MCP 预设 = 文档级模板（settings.mcpServers 示例 + msprof-mcp 工具目录），不自动写用户配置；mcpPolicy 既有约束不放宽。
- 判别：快照 pin/验真走 World B 锚；预设模板不触网、不写盘。

### 任务 D：recipe/orchestrator 插件预装面（optimism/opdev 域）
- 评估 cann-recipes-infer/train 与 ops-tilelang 进 marketplace 清单的形态（独立插件 vs 现有 cannbot submodule 引用）；倾向先引用既有 cannbot submodule 内已含插件（零新增 clone 面），recipe 仓 pin 后续波。
- 未预装项一律"建议安装"指引，总纲不得死链。

### 任务 E：gate 判据（e2e）
- 判别双面：三总纲在 9b62ee5 基线为 import-error/未注册（非行为红），fixed GREEN 自动触发路由正确（fixture 场景：故障→doctor、性能诉求→optimism、新算子→opdev）。
- cmd32/help55 HELP_SET=062 恒等（userInvocable:false 保恒等）；prompt token 面实测增量在帽内且前 29 波 token 锚不回归。
- 活面：seeded 沙箱至少各 1 轮三总纲真实触发 + 路由到正确子技能；doctor 域 msprof-mcp 真连接（capabilities 不采信，实际工具调用为准）。
- 内容安全：总纲/子技能无运行时 fetch；许可归属在场。

## 3. 边界与开放点（用户 2026-11-02 已裁定）

1. **排波**：用户确认 0185→0186(K6)→0187(本方向)。
2. **第三总纲命名**：用户裁定按继承由 f4 定 → `ascend-opdev`（与 ascend-* 五件套命名一致）。
3. **命令面**：用户裁定总纲不注册 slash 命令（系统提示词关联已够）→ 三总纲 `userInvocable:false`，cmd32/help55 恒等保持。
4. **ms-agent 引入深度**：f4 自决 = 仅 pin 其 ms-agent-skills 快照（Apache-2.0 归属），不引入框架面。
5. 0185/K6 收口前本方向不发实施信号，严格串行；工单出稿后交独立审计（用户 2026-11-02 要求方案给 review session 审计）。

## 4. 审计闭环（2026-11-02）

- Atlas-review 独立审计 @98d45c8：活码五项吻合（0185 A–D 四提交不触 ascend 面）；6 项意见 = ①marketplace 真身路径精确化（src/atlascode/marketplace 为 stub）②1 skill_listing 可见性显式判别 ②2 L16 计数行例外单列 ②3 listing 预算完整性 ②4 optimism↔optimize 反例 fixture ②5 manifest license schema 待核 ②6 cmd 计数直接断言。
- 全部吸收进 `docs/2026-11-02-p0-wave-0187-ticket.md`（Global Constraints/Review Focus/§0/任务 A–E/gate ③④⑤⑥）。0187 工单即本方向终版实施方案。

## 5. 追加需求（用户 2026-11-02）：总纲执行前远端源检查更新

- 用户要求：三总纲调用前检查远端 skill 源是否有更新，更新后再执行 → 工单新增任务 F（`AscendSkillSourceCheck` 单工具：check=ls-remote 对比本地 sha；update=钉住官方源 fetch+fast-forward+submodule+integrity 验真，pin 信任锚不动）+ 三总纲 SKILL_MD "Step 0" 段 + gate ⑤ 增加 Step 0 先于路由、真实 drift→update 轮、unreachable fail-visible 轮。
- 既有「零运行时 fetch / 不新增 ascend 工具」约束按用户指令修订为单点例外；断网/验真败 = 明示暂缓执行（不静默旧快照作答），歧义折中已在工单 §5 明示可裁。

---
*f4 零码；实施归 Main、验收归 e2e、发布复核归 f4。*
