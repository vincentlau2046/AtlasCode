# 0.1.104 回退波工单——0.1.102 三切片整体 revert（用户裁定 2026-11-13）

> 状态：`draft → Atlas-reveiw 审计（快审）→ f4 双信号`。f4 工单（2026-11-13）。
> 上游：用户实机 P0（v0.1.103）——压缩器「N 条已入滚动区」= inline 车道内容真不可见（与「内容必须可查看」根本冲突）+ crash-recovery 异常停止恶化。**用户裁定：0.1.102 三需求版本整体废掉，行为回 0.1.101。**
> 性质：⑤机械回退波（零新行为，revert 面 + 冲突机械解）。

## §0 波前审视（f4 2026-11-13）

1. **revert 对象 = 10 commit**（新→旧序）：`da318752`（0.1.104 在途切片 2 timeoutMs——封存同撤，后续波重落）/ `0373349c`（0.1.104 在途切片 1 watchdog 缺省——2-B 随撤后无意义）/ `9f88c44b` / `be84fb10` / `9e293efe`（切片 3 修形三连）/ `b8a3c850`（切片 3）/ `5eebb92f`（2-C）/ `c87b8621`（2-B）/ `b77c9657`（2-A）/ `21199f14`（切片 1 主题）。
2. **保留面**：0.1.103 S3a 搬移（字节恒等无行为面）+ 0.1.101 起全部既有行为。回退终态 = **S3a 结构 + 0.1.101 行为**。
3. **冲突面预判**：S3a 改写过 0.1.102 触及文件的 import 路径（如 Messages.tsx 消费 kernel utils）/ 测试路径面（S3a 判据套件）/ literal-inventory——逐处机械解，**解净判据 = 行为文件面 diff vs `9b79a635` 恰为空**（S3a 已搬路径除外）。
4. **e2e 盲区登记（gate-104 存照吸收）**：pty 短窗腿未覆盖「长会话/多回合实机演化面」——本波判据含 behavior-equivalence diff 断言补此盲区（字节级），长时实机形登记 revert 后判据面候选（不可 gate 化，用户实机验收补位）。

## §1 波定义

- **波名**：0.1.102 整体回退。**版本**：0.1.104。
- **范围**：§0.1 十 commit 逆序 `git revert` + 冲突机械解 + CHANGELOG 回退条目 + package.json bump 0.1.104 + npm deprecate 0.1.102/0.1.103（release 后，指向 0.1.104）。
- **非目标**：任何新行为/新修复（主题重落、timeoutMs 重落、R3-C 全屏评估均后续独立波）；S3a 搬移回退（保留）；登记池项。
- **性质**：机械波（revert 面零语义新增）。

## §2 Global Constraints

1. 零新行为：canon Δ 恰 revert 面（判据测试随 revert 撤卸）。
2. row F 全程；Atlas-reveiw 快审先于双信号；段 L 硬门双在案。
3. npm 一律 --registry npmjs.org；deprecate 纪律「功能可容忍 ≠ 免标」。

## §3 判据格（预注册）

| # | 格 |
|---|---|
| 1 | **行为恒等格**：`git diff 9b79a635..HEAD -- src/` **恰空（Δ=0）**（§6 吸收 1 必改形）；可选双面格 `git diff 4dac817b..HEAD -- src/` 恰 = S3a 移动集 rename-only |
| 2 | **撤卸恰净格（限定 0.1.102 新增面）**：crashRecovery / loopWatchdog / viewportBudget / InlineViewportCompressor / theme watcher 三源检测 / defer 提示行 / TOOL_TIMEOUT 面全部零残留（码面 + 测试面 + literal-inventory 面）；**AUTO_THEME 裸字面 grep 禁用**（0.1.101 既存面，见 §6 吸收 3） |
| 3 | canon 净域（Δ 恰 = 撤卸测试面）+ standing 14 腿 + TUI smoke |
| 4 | **deprecate 验真格**：npm deprecate 0.1.102/0.1.103 生效 + 指向 0.1.104 文案 |
| 5 | 前滚 standing 14 腿全套（O4 锚等） |

## §4 Review Focus

1. revert 冲突解的机械性（禁借机改行为——diff 断言格 1 兜底）。
2. CHANGELOG 回退条目措辞（用户可见面：0.1.104 = 0.1.101 行为 + S3a 结构，三切片功能撤回及原因）。
3. 0.1.102 已发布面残留引用（docs 工单链接/判据测试互引——撤卸后死链检查）。

## §5 流程

本工单 → Atlas-reveiw 快审 → f4 双信号 → Main revert 段 I → 段 G → 段 L → 生产 lane → deprecate → f4 收口。row F 全程。

## §6 Atlas-reveiw 快审闭环（2026-11-13，通过 + 3 条吸收）

审计结论：**通过**（§0/§0.5 全锚实核：10 commit 全存在连续、唯一插花 7e570d3e 为史面正确保留；交织面穷尽复核无漏——c0c8bb95 对 revert 集触碰恰为 §0.5.2 四文件；死链扫描全过，mcp/lsp 命中为标识符巧合非死链）。吸收后直接发双信号，无需二审。逐条吸收：

1. **格 1 措辞精度（必改）**：9b79a635 基已含 S3a + 全部十 commit，其后触 src/ 者恰 `0373349c`+`da318752` 两件且均在 revert 集 → 全 revert 后 `git diff 9b79a635..HEAD -- src/` 应为**恰空（Δ=0）**（主断言，更强、纯机械）。可选双面格：`git diff 4dac817b..HEAD -- src/` 恰 = S3a 移动集 rename-only（「S3a 结构 + 0.1.101 行为」独立直证面）。
2. **CHANGELOG 回退条目四要素**：① 三切片撤回 + 用户实机 P0 原因 ② 0.1.104 行为 = 0.1.101 + S3a 结构 ③ **ATLAS_LOOP_WATCHDOG_MS 已失效可移除**（按缓解指引设过 =0 者 env 无操作，防配置残留困惑）④ FEATURE_AUTO_THEME 回落关。deprecate 文案与条目互证；0.1.101 不标。
3. **格 2 限定 0.1.102 新增面（防假 RED）**：'AUTO_THEME' 字面在 ThemeProvider/ThemePicker/supportedSettings 三处为 0.1.101 既存面（0.1.102 仅翻 feature.ts ON_BY_DEFAULT，feature() 未知键回落无 throw）——格 2 grep 禁按裸字面 AUTO_THEME=0 执行。同面：user-e2e/p0-01102-gate.ts + p0-01104-gate.ts designation 清单除役/封存标注 = **e2e 自理项，不入本波格**。

## §0.5 Main 段 D 探锚冲突面盘点（2026-11-13，工单引用）

1. **revert 集 = 10 commit**（本工单 §0.1 终裁：含 0.1.104 在途 `0373349c`/`da318752`——**Main 提议 timeoutMs 码正交留树，f4 否**：格 1 行为恒等断言要求 diff vs `9b79a635` 恰为 S3a 路径；WebFetch/WebSearch 预算 = 行为面。纯度优先，后续波重落零成本）。
2. **S3a 交织冲突 4 文件**（c0c8bb95 重写过内部 import 指向 kernel）：`tui/utils/crashRecovery.ts`、`tui/utils/gracefulShutdown.ts`、`tui/screens/REPL.tsx`、`tui/components/Messages.tsx`——机械解 = 撤 0.1.102 功能 hunk、保 S3a import 重锚。
3. **交织自消 2 文件**：`loopWatchdog.ts` + `tests/unit/p0-loop-watchdog.test.ts`——revert 创建者 c87b8621 整删即净（0373349c 改动随文件消亡）；loop.ts 干净 revert。
4. **零后续触碰干净面**：osAppearance/systemTheme/systemThemeWatcher/turnRecovery/DeferSuspendHint/InlineViewportCompressor/viewportBudget + 5 测试文件——直接 revert。
5. **literal-inventory.json**：以现状为基撤 2-B 条目，勿回退 S3a 重锚（eeb08d33）。
6. **toolTimeout.ts + toolExecution 接线 + shared types 字段 + web 声明**（da318752）：随 revert 集撤卸（见 1）。
7. 0.1.104 CHANGELOG/package.json 按 revert 波重写（封存波条目已撤）。

## §7 f4 后续波候位（登记）

- 0.1.105 候位：主题分层检测独立重落（gate-102 全绿、与两事故无因果）/ timeoutMs 重落（已码 canon 绿封存）。**待用户点头**。
- R3-C 全屏形态评估稿（钉底正解，虚拟滚动保全内容可查看）——0.1.104 稳定后呈用户终裁。
- 登记池：crashRecovery 重设计（× Ink 错误边界同域）/ 长会话实机演化判据面候选。
