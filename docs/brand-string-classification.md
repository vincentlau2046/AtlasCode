# AtlasCode 品牌串预分类表（Tier 3 第4项）

> **目的**：旧仓 AtlasHarness → 新仓 AtlasCode 迁移时，品牌串机械化替换的参照表。F 波执行前完成预分类，F 波按本表机械替换。
> **扫描日期**：2026-09-21 · **扫描范围**：旧仓 `/home/vince/projects/AtlasHarness/AtlasHarness` 全仓（排除 node_modules/dist/.git/ascend-official/tests/fixtures）
> **规则基线**：charter L7 命名三层（repo `atlascode` / 对外品牌 `AtlasCode` / 内部 `atlas`）+ L8 规则（旧「规则 6/7」= L8 STR-3 组合根 / AUT-1 状态自治，v0.8 起统一 ID）+ b 裁定 + 本文五特判裁定。

## 数字总览（修正 charter 附录 A）

charter 附录 A 原记"145 处/62 文件"——那只覆盖 src/ 下 .ts/.tsx/.js。全仓实际：

| 指标 | charter 原记 | 全仓实测 |
|---|---|---|
| 总命中 | 145 | **379** |
| 总文件 | 62 | **123** |
| src 代码 (.ts/.tsx/.js) | 145/62 | 146/63（吻合，charter 数字即此 scope） |

**charter 附录 A 数字待更新为 379/123 + scope 说明**（src 代码 146/63 是 F 波机械替换主战场，其余 tests/docs/web 随各自迁移波次处理）。

> **⚠️ 口径警示（2026-09-21 复核）**：本表 379 处/123 文件是**分类规则快照，非完整文件枚举**。raw grep（`grep -rl 'AtlasHarness'` 排除 node_modules/dist/.git/ascend-official/tests/fixtures，case-sensitive）实测 ≈ **235 文件**，高于表内 123——明细表未枚举全部命中文件。**F 波执行前必须以全仓 `grep -rl 'AtlasHarness'` 重跑结果作为权威文件清单，本表五类 + 五特判仅作"每命中归哪类/怎么处置"的分类规则，不作为文件枚举基线**。数字随仓内新增漂移，非精确基线。

## 分类规则（五类，修正扫描 agent 误读）

扫描 agent 把 73 处物理路径标 [冻结]——**误读**。旧仓 CLAUDE.md 的"物理路径冻结"指旧仓路径 `/home/vince/projects/AtlasHarness` 在旧仓侧不动；迁移到新仓 `/home/vince/projects/AtlasCode/` 后，tests/scripts 里那些路径**必须换新仓路径**，非冻结。真正冻结仅 MDM key 2 处。

| 类 | 处置 | 修正后处数 |
|---|---|---|
| **① 对外品牌文本** | `AtlasHarness` → `AtlasCode`（机械替换） | ~108 |
| **② 文档/注释** | `AtlasHarness` → `AtlasCode`（机械替换） | ~172 |
| **③ 物理路径** | `/home/vince/projects/AtlasHarness[/AtlasHarness]` → `/home/vince/projects/AtlasCode` | ~73 |
| **④ 真冻结** | 不动（仅 MDM registry key 2 处） | 2 |
| **⑤ 特判点** | 逐个裁定（见下五特判） | ~24 |

> **④ 修正（v0.7 冻结层重判后）**：MDM key 2 处 `Policies\AtlasHarness` 不再"真冻结不动"。旧仓"不动"是因有已部署 MDM profile 依赖；新仓是全新产品无此依赖 → **解冻改 `Policies\AtlasCode`**（D 波，和 atlasDesktop.ts 特判3 同批）。新仓**零真冻结品牌串**。详见 charter L8.1 冻结层清单。

### ① 对外品牌文本 → AtlasCode

TUI 启动横幅、`--version`、CLI description、help、README、给用户的错误消息、权限提示、logo 文本、欢迎屏、insights HTML 标题、install/update 消息、attribution 文案、MCP Client title/description（用户可见协议元数据）、shell completion 注释头、commit auto-stash 前缀等。**机械 `AtlasHarness` → `AtlasCode`**。

### ② 文档/注释 → AtlasCode

md 文件正文、代码 JSDoc/注释描述性文本、issue URL 注释（历史引用，特判2 另议）、vault 路径引用（特判4 另议）。**机械 `AtlasHarness` → `AtlasCode`**（issue URL 注释 + vault 路径按特判2/4 处理）。

### ③ 物理路径 → 换新仓路径

`/home/vince/projects/AtlasHarness/AtlasHarness` → `/home/vince/projects/AtlasCode`。分布在 tests/（mock.module 路径 + getCwdState/getProjectRoot 返回值 + CWD 常量，~62）、tests/.md（cd 命令 + bun test 命令，~8）、scripts/（SRC 常量，2）、probe-executor-shell.ts（1）。**机械换路径**，随 tests 迁移波次（F 测试迁移策略）处理。

### ④ 真冻结 → 不动（已修正：解冻改 AtlasCode）

> **v0.7 冻结层重判修正**：原标"真冻结不动"是旧仓视角。新仓是全新产品，无已部署 MDM profile 依赖（个人开发者项目，MDM 是 Claude Code fork 继承的企业代码）。macOS 域已是 `com.atlas.atlas`，Windows key 仍 `AtlasHarness` 不一致。→ **解冻改 `Policies\AtlasCode`**（D 波壳层，和特判3 atlasDesktop.ts 同批）。新仓零真冻结品牌串。

原 2 处（`src/utils/settings/mdm/constants.ts` L23/L25 `Policies\AtlasHarness`）→ D 波改 `Policies\AtlasCode`。归入特判3 同批（壳层 identity/路径统一）。

### ⑤ 特判点（五项裁定）

---

## 特判1 · ATLASHARNESS.md 迁移逻辑 → 消解

**涉及**：`src/utils/memoryFileMigration.ts`（L33/34 迁移源文件名 + L10 JSDoc）+ `tests/unit/memoryFileMigration.test.ts`（15 命中）+ `src/main.tsx:1609` 迁移注释 + ATLAS.md/CLAUDE.md 文档描述。

**裁定（用户 2026-09-21）**：**消解**。新仓使用 `~/.atlas/` 及 `ATLAS.md`，不需要 ATLASHARNESS.md → ATLAS.md 迁移。`memoryFileMigration.ts` + 15 个测试**删除，新仓不带**。

**前置（实施前手动）**：
1. 提前备份一份 `~/.atlas/` 下的 settings json 文件（用户本地调试数据，唯一有加载值的）
2. 清理 `~/.atlas/` 及相关文件
3. archive 旧数据
4. 新仓启动即用干净的 `~/.atlas/` + `ATLAS.md`，无迁移逻辑

**时序**：A 波前（用户手动清理）+ F 波（代码删迁移逻辑 + 测试）。charter A 波条目补"前置清理 ~/.atlas/"。

---

## 特判2 · GitHub repo URL → AtlasCode repo + 旧仓 archive 保留

**新仓 repo**：`https://github.com/vincentlau2046-sudo/AtlasCode`

**两类分别处置**：

| 子类 | 涉及 | 处置 |
|---|---|---|
| **代码 URL/allowlist**（releaseNotes.ts L29/31 CHANGELOG/raw URL、commitAttribution.ts L28/29 repo allowlist、Feedback.tsx L31 issues URL） | 5 处 | → 改 `vincentlau2046-sudo/AtlasCode` |
| **注释 issue URL**（api.ts、toolSearch.ts×2、fsOperations.ts×2、changeDetector.ts、worktreeModeEnabled.ts、entrypoints/mcp.ts、lsp/manager.ts、mcp/auth.ts、secureStorage/fallbackStorage.ts，~10 处） | ~10 处 | **保留指向旧仓 archive**（旧仓 e 裁定 archive 后 URL 仍有效，历史 issue 编号有意义） |

**旧仓处置**：暂时保留旧仓（不立即 archive，e 裁定新仓稳定 4-8 周后 archive）。注释 issue URL 指向旧仓，有效。

---

## 特判3 · atlasDesktop.ts Desktop 配置路径 → AtlasCode Desktop

**涉及**：`src/utils/atlasDesktop.ts` L27（macOS `~/Library/Application Support/AtlasHarness/`）+ L75（Windows `AppData/Roaming/AtlasHarness/`）。

**裁定（用户 2026-09-21）**：AtlasHarness Desktop 应用**改名为 AtlasCode Desktop**。路径 → `AtlasCode`。

**注意**：atlasDesktop.ts 是 Claude Code fork 继承的 Claude Desktop 集成代码。若新仓确认无 Desktop 应用集成需求，此文件可能整体死代码——D 波（壳层）实施时核查：有 Desktop 集成则改路径，无则删文件。本表先记"改路径"。

---

## 特判4 · vault 路径引用 → 新开 16-AtlasCode 目录

**涉及**：md 文档 + README 引用 Obsidian vault 路径 `01-项目/15-AtlasHarness/`（~15 处）。

**裁定（用户 2026-09-21）**：
- vault **新开 `01-项目/16-AtlasCode/` 目录**
- **不直接拷贝 15-AtlasHarness 的文件**——基于新项目视角重新规划材料
- 15-AtlasHarness 里 latest（最新）内容可**提取**过来，非拷贝
- 路径引用 `15-AtlasHarness` → `16-AtlasCode`

**vault 组织**：15-AtlasHarness 保留（旧项目历史归档），16-AtlasCode 是新项目独立目录。两目录并存，不合并。

---

## 特判5 · coordinatorMode.ts prompt 示例 repo 路径 → AtlasCode

**涉及**：`src/coordinator/coordinatorMode.ts:309` prompt 示例文本 `vincentlau2046-sudo/AtlasHarness as reviewer`。

**裁定**：改 `vincentlau2046-sudo/AtlasCode`。无争议（机械替换，归特判2 同一 repo 名规则）。

---

## 全量逐文件明细

### 一、src/ .ts/.tsx/.js 代码（63 文件，146 命中）—— F 波主战场

#### 品牌文本 → AtlasCode（机械）

| 文件 | 行 | 原形态 | 上下文 |
|---|---|---|---|
| projectOnboardingState.ts | 34 | AtlasHarness | onboarding 文案 |
| commands.ts | 158 | AtlasHarness | 命令描述 |
| launcher.ts | 2,4 | AtlasHarness | stderr 启动屏/FATAL |
| cli.ts | 46,71,124,140 | AtlasHarness | CLI description/output/启动屏 |
| main.tsx | 518,883,930,3065,3128,3178,3195,3404 | AtlasHarness | debug/Commander help/CLI help |
| screens/REPL.tsx | 1103,3652,3799×3 | AtlasHarness | 终端标题/挂起消息 |
| constants/github-app.ts | 1 | AtlasHarness | PR 标题 |
| core/modelprovider/errorMessaging.ts | 124,175,181,470 | AtlasHarness | 错误消息 |
| tools/SendMessageTool/... | 589 | AtlasHarness | 确认消息 |
| utils/apiErrors.ts | 252,253 | AtlasHarness | 错误消息 |
| utils/attribution.ts | 74,319,365 | AtlasHarness | attribution 文案 |
| utils/autoUpdater.ts | 82,429 | AtlasHarness | 更新提示/WSL 警告 |
| utils/completionCache.ts | 127 | AtlasHarness | shell completion 注释头 |
| utils/computerUse/wrapper.tsx | 57 | AtlasHarness | 冲突消息 |
| utils/localInstaller.ts | 124 | AtlasHarness | 错误消息 |
| utils/nativeInstaller/installer.ts | 800,816 | AtlasHarness | 错误消息 |
| utils/nativeInstaller/pidLock.ts | 182 | AtlasHarness | 日志消息 |
| utils/permissions/filesystem.ts | 639,650,661,1042,1061,1075,1119,1186,1218,1355,1402 | AtlasHarness | 权限提示（11 处） |
| utils/preflightChecks.tsx | 122 | AtlasHarness | 连接错误 |
| utils/Shell.ts | 128,233 | AtlasHarness | 错误消息 |
| utils/statusNoticeDefinitions.tsx | 77,105 | AtlasHarness | 状态通知 |
| utils/teleport/api.ts | 190 | AtlasHarness | 错误消息 |
| utils/teleport/environments.ts | 37 | AtlasHarness | 错误消息 |
| components/ModelSetup.tsx | 132 | AtlasHarness | 对话框标题 |
| components/TeleportError.tsx | 155,156 | AtlasHarness | 对话框 |
| components/grove/Grove.tsx | 55 | AtlasHarness | 隐私通知 |
| components/HelpV2/HelpV2.tsx | 141 | AtlasHarness | help 标题 |
| components/LogoV2/Clawd.tsx | 110,136 | AtlasHarness | TUI logo 文本 |
| components/LogoV2/CondensedLogo.tsx | 51 | AtlasHarness | 精简 logo |
| components/LogoV2/LogoV2.tsx | 204,205 | AtlasHarness | logo 边框标题 |
| components/LogoV2/WelcomeV2.tsx | 12,31,116 | AtlasHarness | 欢迎屏 |
| components/mcp/MCPRemoteServerMenu.tsx | 100,257 | AtlasHarness | 消息 |
| components/permissions/.../permissionOptions.tsx | 108 | AtlasHarness | 权限对话框 |
| components/permissions/rules/AddWorkspaceDirectory.tsx | 43 | AtlasHarness | 权限提示 |
| commands/insights.ts | 215,2321,2327,2868 | AtlasHarness | insights 标签/HTML |
| commands/install.tsx | 208,213,224,235,277 | AtlasHarness | install 消息 |
| commands/plugin/PluginTrustWarning.tsx | 25 | AtlasHarness | 信任警告 |
| cli/update.ts | 121,129,139,142,145,153,159,226,239,313 | AtlasHarness | update 消息（10 处） |
| services/mcp/client.ts | 925,927,3144,3146 | AtlasHarness | MCP Client title/description（用户可见协议元数据，归品牌） |
| utils/model/model.ts | 280,282 | AtlasHarness | author name 模板（commit trailers，归品牌） |
| utils/git.ts | 432 | AtlasHarness | "AtlasHarness auto-stash" commit 前缀（归品牌） |
| package.json | 4 | AtlasHarness | description 字段（name/bin 已是 atlas） |

#### 特判点（src 代码）

| 文件 | 行 | 特判 | 处置 |
|---|---|---|---|
| utils/memoryFileMigration.ts | 10,33,34 | 特判1 | 消解（删文件 + 测试） |
| main.tsx | 1609 | 特判1 | 删迁移注释 |
| utils/releaseNotes.ts | 29,31 | 特判2 | → AtlasCode repo URL |
| utils/commitAttribution.ts | 28,29 | 特判2 | → AtlasCode repo allowlist |
| components/Feedback.tsx | 31 | 特判2 | → AtlasCode repo issues URL |
| utils/atlasDesktop.ts | 27,75 | 特判3 | → AtlasCode Desktop 路径（D 波核查死代码） |
| coordinator/coordinatorMode.ts | 309 | 特判5 | → AtlasCode repo |

#### 注释 issue URL → 保留旧仓 archive（特判2）

| 文件 | 行 |
|---|---|
| entrypoints/mcp.ts | 73 |
| services/lsp/manager.ts | 215 |
| services/mcp/auth.ts | 1278 |
| utils/api.ts | 235 |
| utils/fsOperations.ts | 422,543 |
| utils/settings/changeDetector.ts | 193 |
| utils/toolSearch.ts | 173,280 |
| utils/worktreeModeEnabled.ts | 7 |
| utils/secureStorage/fallbackStorage.ts | 36 |
| hooks/notifs/useNpmDeprecationNotification.tsx | 5 |

#### 文档/注释 → AtlasCode（机械，src 内）

| 文件 | 行 | 上下文 |
|---|---|---|
| utils/configDir.ts | 28,29,31,32 | 注释 |
| utils/plugins/marketplaceManager.ts | 1589 | 注释 |
| utils/plugins/marketplacePreset.ts | 3 | JSDoc |
| utils/model/model.ts | 271,272,275×2 | JSDoc |
| utils/modelSetup.ts | 3 | 注释（旧路径 .atlasharness→.atlas 描述） |
| utils/settings/mdm/constants.ts | 10,18 | JSDoc/注释 |
| utils/settings/mdm/settings.ts | 7,8 | 注释 |
| components/LogoV2/Clawd.tsx | 98,124 | 注释 |

#### 真冻结（src 代码）

| 文件 | 行 | 内容 |
|---|---|---|
| utils/settings/mdm/constants.ts | 23 | `'HKLM\SOFTWARE\Policies\AtlasHarness'` |
| utils/settings/mdm/constants.ts | 25 | `'HKCU\SOFTWARE\Policies\AtlasHarness'` |

---

### 二、src/ .md README（2 文件，6 命中）→ 特判4 vault 路径

| 文件 | 行 | 处置 |
|---|---|---|
| core/memory/README.md | 103,104,106 | `15-AtlasHarness` → `16-AtlasCode` |
| core/orchestrator/README.md | 207,208,209 | 同上 |

---

### 三、tests/ .ts（16 文件，88 命中）—— 随 F 测试迁移波次

#### 物理路径 → 换新仓路径（~62 命中）

| 文件 | 行 |
|---|---|
| preload-path.ts | 11×2 |
| e2e/coding-agent.test.ts | 8×2 |
| e2e/tui.test.ts | 7×2 |
| integration/web-bridge.test.ts | 115×2, 222×2 |
| selftest/selftest_web.ts | 217×2, 347×2 |
| unit/messages-toolref-snip.test.ts | 61×2, 539×2, 611×2, 616×2, 791×2, 793×2 |
| unit/messages-mocks.ts | 53×2, 492×2, 564×2, 565×2, 736×2, 738×2 |
| unit/coverage-attack-r4-messages.test.ts | 61×2, 536×2, 608×2, 609×2, 780×2, 782×2, 1838×2, 1925×2, 1926×2 |
| unit/__dbg2.test.debug.ts | 18,19 |
| unit/__dbg6.test.debug.ts | 10×2 |
| unit/__skdebug.test.debug.ts | 211×2 |

#### 特判1 消解（memoryFileMigration.test.ts 15 命中）→ 删测试

#### 品牌文本 → AtlasCode（mock 错误消息）

| 文件 | 行 |
|---|---|
| e2e/coding-agent.test.ts | 58（断言 `expect(log).toContain('AtlasHarness v')`） |
| unit/messages-toolref-snip.test.ts | 256,263 |
| unit/coverage-attack-r4-messages.test.ts | 253,260 |

#### 文档/注释 → AtlasCode

| 文件 | 行 |
|---|---|
| selftest/selftest.ts | 3 |
| selftest/selftest_agent.ts | 5 |
| selftest/selftest_full.ts | 10 |
| unit/plugin-manifest-legacy.test.ts | 13,16,20 |

---

### 四、tests/ .md（14 文件，30 命中）

#### 物理路径 → 换新仓路径（~8）

| 文件 | 行 |
|---|---|
| tests/README.md | 25×2, 29×2, 46×2 |
| full-feature-tests/README.md | 138×2 |

#### 特判4 vault 路径

| 文件 | 行 |
|---|---|
| tests/README.md | 21 |

#### 文档/注释 → AtlasCode（机械）

| 文件 | 行 |
|---|---|
| tests/README.md | 1 |
| tests/TEST_BENCHMARK.md | 1 |
| tests/TEST_PRIORITY_LIST.md | 3 |
| full-feature-tests/README.md | 1 |
| full-feature-tests/templates/report-template.md | 52 |
| full-feature-tests/reports/.../总报告.md | 1 |
| full-feature-tests/cases/.../S01.md | 10,13,27,35 |
| full-feature-tests/cases/.../S02.md | 14 |
| full-feature-tests/cases/.../S03.md | 10×2 |
| full-feature-tests/cases/.../S10.md | 11 |
| full-feature-tests/cases/.../F02-CLI.md | 24,54 |
| tests/tui/L0-冒烟层.md | 3,12 |
| tests/tui/L1-基本交互层.md | 3 |
| tests/tui/report-2026-09-14.md | 1,3 |

---

### 五、docs/ .md（17 文件，52 命中）→ 文档机械 + 特判4 vault

全部 `AtlasHarness` → `AtlasCode`（机械），其中 vault 路径 `15-AtlasHarness` → `16-AtlasCode`（特判4）。文件清单：P1.2-实现计划、atom-feature-function-audit、P1.1-residual-repair、11-CLI-System-Audit、17-TUI设计方案、test-reports/测试报告-2026-09-09、decoupling-simplification-plan、09-WebGUI模块设计、10-架构落地规划-v3、src-代码瘦身审计报告、06-Model-Provider模块设计、ANT残留专项排查、15-架构改造总纲、P4-Provider方案优化设计、test-reports/测试报告-2026-09-04、07-Sandbox模块设计、P1.1-类型迁移实施方案。

**注意**：docs/ 是旧仓设计文档。charter"资产保留、包袱清零"——这些文档是否迁新仓？新仓已有 charter（架构层）。旧 docs 是实施细节文档，部分被 charter 吸收。**D/F 波实施时判定逐文档去留**，本文表只标"若迁则 AtlasCode"。

---

### 六、web/ .md（4 文件，9 命中）→ 文档机械 + defer D 波

Web GUI 是 charter Phase 3 未决项（upcoming）。web/docs/ 4 文件全 `AtlasHarness` → `AtlasCode`（机械）。**随 Web GUI 实施波次（D 波后）处理**，本期不动。

---

### 七、scripts/ .ts（2 文件，2 命中）→ 物理路径

| 文件 | 行 |
|---|---|
| import_graph.ts | 6 |
| scan_dual_ext.ts | 5 |

→ 换新仓路径。scripts/ 是否迁新仓视工具链需要。

---

### 八、package.json（1 命中）→ 品牌文本

L4 description `AtlasHarness — Ascend C Operator Development Agent` → `AtlasCode — ...`。name/bin 已是 atlas（不动）。

---

### 九、probe-executor-shell.ts（1 命中）→ 物理路径

L25 → 换新仓路径。root stray 文件，可能不迁。

---

### 十、ATLAS.md / CLAUDE.md（22 命中）→ 新仓重写

新仓 instruction file 是 `ATLAS.md`（新写）。旧仓 ATLAS.md/CLAUDE.md 内容**不直接迁**——基于新仓视角重写（特判4 同精神：提取 latest 非拷贝）。旧仓这两个文件归 archive。

---

### 十一、.atomcode/memory.md（22 命中）→ 不迁

IDE memory 文件，新仓 IDE 重新生成。不迁。

---

## F 波执行清单

1. **src 代码品牌文本**（~108）：机械 `AtlasHarness` → `AtlasCode`
2. **特判1 消解**：删 `memoryFileMigration.ts` + `memoryFileMigration.test.ts` + `main.tsx:1609` 注释
3. **特判2**：代码 URL/allowlist（5）→ AtlasCode repo；注释 issue URL（~10）保留旧仓
4. **特判3**：atlasDesktop.ts 路径（2）→ AtlasCode Desktop（D 波先核查死代码）
5. **特判4**：vault 路径引用（~15）→ `16-AtlasCode`
6. **特判5**：coordinatorMode.ts:309 → AtlasCode repo
7. **物理路径**（~73）：换 `/home/vince/projects/AtlasCode`
8. **MDM key**（2）：D 波改 `Policies\AtlasCode`（特判3 同批，非真冻结）
9. **文档/注释**（~172）：机械 `AtlasHarness` → `AtlasCode`
10. **前置（A 波前用户手动）**：备份 ~/.atlas/ settings json → 清理 ~/.atlas/ → archive

## 冻结层 charter 缺口（2026-09-21 已闭环）

已闭环：冻结层清单（WIRE/URL/MDM/物理路径四项重判 + [ATLAS-HOLD] 全貌 18 处/14 文件）已落盘 charter **L8.1**。原「待补」系 L8.1 落盘前所写，此节仅留档。品牌串预分类仅受 MDM key 影响（2 处，D 波改 `Policies\AtlasCode`）。
