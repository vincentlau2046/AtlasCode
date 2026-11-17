# 0.1.122 docs 归一化波报告（零产品码）

> 状态：终态（0.1.122）
> 工单：docs/2026-11-17-0122-docs-normalization-ticket.md（@59b51175；审计闭环 @05155aec）
> 判据：工单 §2 六格（零码版）。基线 = 0.1.121 发布链终（release 2c94f90f / SRI d6f03531）。

## §1 A 段五件

### A1 reference 12 件活码复核刷新

逐件处置（机械面 = 引用 src 路径存在性全量机器核 + 符号 grep 实核；语义面 ≥3 断言/件）：

| 件 | 处置 | 勘误清单 |
|---|---|---|
| slash-commands.md | **新写（A2 项，归 A1 面统计）** | 工单「cmd 32」口径订正 → 实际 61 个不同 slash 名（63 entry，/context 与 /goal 同名双 entry） |
| settings.md | **新写（A3 项）** | 工单「ATLAS_CONFIG_NAME」订正 → 实际符号 `ATLAS_CONFIG_DIR_NAME`（旧名全仓零命中） |
| ide-integration.md | **重写（A4）** | entrypoint env 订正 → `ATLAS_ENTRYPOINT`（ATLAS_CODE_ENTRYPOINT/CLAUDE_CODE_ENTRYPOINT 全仓零命中） |
| cli-reference.md | 增量订正 | headless 表补 --thinking/--fallback-models/--enable-auth-status + headless 约束三支；权限表补 --restricted/--permission-prompts none；新增「开发面入口」节（**勘误：dev 入口实为 `src/cli/dev.ts`（`DEV_FLAGS` 五件），非 `src/cli.ts`（不存在）**——B5 抽查处） |
| hooks.md | 重写主体 | 事件面 31 事件全列（对 `src/hooks/hookEvents.ts` `HOOK_EVENTS` grep 实核）；四类判别联合；门控四态 |
| network-config.md | 批量修 4 处 | types 路径 → `src/kernel/settings/types.ts`；`"baseUrl"` → `"baseURL"`；modelRoles 删不存在 "main" 角色（`MODEL_ROLES = ['premium','fast','small']` 实核）；`ATLAS_MAIN_MODEL` → `ATLAS_SMALL_MODEL` 族 |
| sandboxing.md | sed 修 1 处 | `src/tui/utils/settings/types.ts` → `src/kernel/settings/types.ts` |
| mcp.md | 增量披露 | 补 0.1.57 AD-49 5 秒有界连接 + C5-2 连接失败 reminder（原 fail-soft 行仅述非阻塞） |
| overview.md | 修 2 处 | 角色池删 "main"（同 network-config 实核）；env 示例 `ATLAS_MAIN_MODEL` → `ATLAS_SMALL_MODEL`（`<ROLE>` ∈ PREMIUM/FAST/SMALL） |
| security.md | 核毕零改（B5 补 1 处路径精度） | `src/permissions/autoMode.ts` → `src/permissions/autoMode/`（实为目录）；5 权限模式对 `EXTERNAL_PERMISSION_MODES` 实核一致 |
| memory.md / remote-control.md / keybindings.md | 核毕零改 | 与活码一致 |

**禁行号纪律**：全波零行号引用，一律符号名/导出名引用（工单审计焦点②钉）。

### A2/A3/A4

- **A2 slash-commands.md**：61 名全清单表（命令/别名/type/门控/说明）+ 条件注册与开发命令表 + 英文速查节；事实源 `src/tui/commands.ts` `COMMANDS()` + `INTERNAL_ONLY_COMMANDS`；语义断言 ≥3（/branch 条件别名 = FORK_SUBAGENT 门 / /usage availability 门（OPENAI_API_KEY/OPENAI_BASE_URL/ATLAS_MODEL 任一）/ /context /goal 同名双 entry）。
- **A3 settings.md**：全字段参考（模型角色/provider/env/MCP/沙箱权限/hooks/压缩/会话/团队/计费/技能）+ configDir 链（`ATLAS_CONFIG_DIR` > `ATLAS_CONFIG_DIR_NAME` > product.configDirName > `.atlas`）+ 五源级联（pluginBase → userSettings → policySettings → flagSettings；project/local 不在级联，S-3a）+ env vs settings 先经链（issue #3-3）+ JSONC 模板 + 英文速查；权威面 `src/engine/config/types.ts` + `src/kernel/settings/types.ts`。
- **A4 ide-integration.md**：集成模型（MCP 载体 sse-ide/ws-ide）+ 发现机制（lockfile `<port>.lock` + `LockfileJsonContent`）+ 连接方式（/ide 手选 vs `--ide` 恰好一个自动连）+ headless/第三方 IDE 驱动（stream-json 约束 + variadic stdin gotcha + stdout 协议 sentinel `[stdout-guard]` + `ATLAS_ENTRYPOINT`）。

### A5 issue #3 三件并入

- README Provider 表 +2 ⚠️（#3-1 裸 id 不归一；#3-2 baseURL `/v1` 后缀）+ 鉴权条目 +1 ⚠️（#3-3 settings 先经链）。
- settings.md / cli-reference.md / network-config.md 同步落同三注记。
- 判读披露：**README 示例 JSON 池内仍为裸 id 形（`"models": ["Qwen38-27B-TXT"]`）**，与 #3-1 新注记表面矛盾——示例按「providers 表内 id + 池内裸 id 会失败」的既有发布语境保留（iff provider 场景小写 id 直配），修复面归 0.1.123 代码版（normalizeRef 归一化）后统一改全 ref 形示例。候 f4 抽核裁定。
- 对端 docs PR：开工前核实 GitHub #3 无关联 PR 在途（curl 200 + 空 PR 列表），走 Main 补写形。

## §2 B 段五面

- **B1 命名统一**：morning-decisions-2026-10-02.md → 2026-10-02-morning-decisions.md；review-2026-09-22.md → 2026-09-22-review.md（charter 引用 sed 改指）；r3-jsonl-double-write-root-cause.md **留名豁免**（src/tests/CHANGELOG 引用面禁触，格 1/格 6）。
- **B2 状态头注统一**：122 件 dated docs 补状态行（收口/活文档/进行中三形）；0122-registration 特设「进行中」。
- **B3 过期归档**：21 件 git mv → `docs/archive/2026-10/`（三条件合取式逐件验：状态 ∈{收口,终态} ∧ git 实质 commit 龄 ≥30 天 ∧ 非白名单；龄用 `git log -1 --format=%cs` 禁文件名前缀）；`docs/archive/INDEX.md` 归档判据 + 映射表 + 引用面处置判读披露（活文档 10 处 sed 改指；历史冻结记录零回写——CHANGELOG/user-e2e/tests/src 溯源文本非导航链接，INDEX 为路由表）。
- **B4 release-governance 制度对表**：四纪律落档（§「制度对表新增四纪律」）——①交付波 lock-face 可达性推演必答项（S0-R2 §6-1 原文逐字）；②docs-push 悬挂窗双方确认形（0.1.119）；③巡检催办链订正条款（0.1.119）；④锚预注册过估披露形（0.1.104 恰空 / gate-113 注 A / S0-R2 §8-3 三例同族）。逐条对实际先例工单（格 5）。
- **B5 制度一致性抽查**：见 §3。

## §3 B5 漂移清单（机械 sweep + 分类处置）

**机械 sweep**：全 docs（含 archive）引用 src 路径 543 个去重，逐一 `-f` 存在性核。缺引用按 B2 状态头注分类：

| 分类 | 处置 |
|---|---|
| 历史冻结记录（dated 工单/报告/lockface/计划/brand 设计稿/execution-strategy/c1-verification/wordmark，~90 缺引用） | **零回写**（B3 同款判读：溯源文本非导航链接；execution-strategy 为裁定记录冻结面） |
| 可修即修（活文档机械漂移） | **已修 4 处**：cli-reference dev 入口 `src/cli.ts`→`src/cli/dev.ts`（+`bun run src/atlascode/cli.ts --e2e` 调用形）；security `autoMode.ts`→`autoMode/`；roadmap `bun run src/cli.ts --e2e`→`bun run src/atlascode/cli.ts --e2e`；timeout-params-table powershell parser → `src/kernel/utils/powershell/parser.ts` |
| 需裁定项（登记不修） | ①**brand-string-classification.md（活文档）**6 缺引用（src/coordinator/*、src/main.tsx、atlasDesktop.ts、memoryFileMigration.ts、settings/mdm/constants.ts 均已迁/删）——设计溯源稿，建议下波改「快照时间点」头注或刷新；②**architecture-charter.md（活文档）**4 缺引用（wire.ts/vcr.ts/log.ts/main.tsx）——同款裁定 |

## §4 判读披露汇总（候 f4 抽核）

1. 工单事实订正两处：slash 命令 32→61 名（63 entry）；`ATLAS_CONFIG_NAME` → `ATLAS_CONFIG_DIR_NAME`。
2. B3 引用面：活文档 10 处改指 + 历史冻结记录零回写（INDEX.md 路由表兜底）。
3. README 示例裸 id 保留判读（见 §1 A5）。
4. B4 纪律 2/3 细案以 f4 侧 0.1.119 采认记录为准（release-governance.md 落档注记已声明，f4 抽核如与本侧原文有出入以其为准订正）。
5. A1 复核中 reference 族勘误 11 处（§1 表右列汇总），全部对活码符号实核。
6. B5 漂移清单 2 项需裁定登记（brand-string-classification / architecture-charter 刷新 vs 快照标注）。

## §5 格自检

- **格 1 零产品码**：见 §6 实证（gate 豁免申请附）。
- **格 2 事实性**：机械面全量机器核（543 路径 sweep + 符号 grep）；语义断言 ≥3/新写件；零行号引用。
- **格 3 完整性**：A2 对 `COMMANDS()` 全清单（61 名）；A3 对双权威面全字段。
- **格 4 归档三条件合取式**：逐件验（INDEX.md 有映射表）。
- **格 5 制度格**：B4 四纪律逐条先例对表。
- **格 6 回归格**：README 触碰仅 A5 三注记；CHANGELOG 仅发布 commit（段 L）触碰。
