# bun 升级评估——1.4.2（现役）→ 1.4.4（最新 stable）收益/风险对表

> f4 评估档（2026-11-17，用户授权评估；任务 #49）。来源：S0 交付波 e2e gate 运行面 bun 测试进程段错误 ×2 登记（docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md §7）。
> 环境现况：本机 bun 1.4.2；CI pin `.github/workflows/ci.yml:21` `bun-version: "1.4.2"`；bun.lock lockfileVersion 2。

## §1 版本面

| 版本 | 日期 | 性质 |
|---|---|---|
| 1.4.2（现役） | 2026-09-05 | 基线 |
| 1.4.3 | 2026-10-10 | **含 bun test --isolate/--parallel 崩溃修复束**（§2） |
| 1.4.4（最新 stable） | 2026-10-22 | bun test 稳定性 + Runtime/GC 稳定性束（§2） |

## §2 收益面（changelog 修复直击我们路径的部分）

**1.4.3 —— 与本仓段错误同型的崩溃修复（canon = `bun test --isolate ./tests/`，逐条对路径）**：
- `--isolate/--parallel` 下已完成测试文件的 FinalizationRegistry 回调跨文件漂移执行 → **GC 落点恰在文件切换时即崩**（修复）
- `--isolate/--parallel` 下已完成文件遗留 in-flight Bun.\* 对象 → **bun test --isolate 崩溃**（修复）
- node:vm 上下文 / `--isolate` 文件 global 被 GC 时 FinalizationRegistry 回调仍在队列 → 崩溃（修复）
- 全部测试通过后 NAPI FATAL ERROR 崩溃（原生 addon 在飞工作，如 sqlite3 族）（修复）
- `--isolate/--parallel` 下前文件遗留 promise/timer/server 泄入后文件（修复——稳定性面，可能改变既有 flaky 形态）
- 测试断言打印深嵌套值崩溃 / spyOn 崩溃 / `--parallel` worker 崩溃后进程残留（修复）

**1.4.4**：
- `bun test` 及 `--changed` "various stability issues"（束）
- Runtime：Linux GC 稳定性 + 启动稳定性（束）——本仓 Linux 单一环境直接受益面

**判读**：本仓两次段错误（gate 运行面）与 1.4.3 修复束中 `--isolate` GC/FinalizationRegistry/NAPI 三族同型概率高——修复面**直击 canon runner 路径**，非泛泛升级。

## §3 风险面

| # | 风险 | 评估 | 缓解 |
|---|---|---|---|
| R1 | **cli.js 锚变更**：`prepublishOnly` 构建链 = `bun build`——bun 1.4.2→1.4.4 打包器输出可能字节级漂移 → 0.1.120→122 三版连续 Δ=0 恒等链断 | 高确定性（同 major 内 bundler 修复多条，漂移概率不可忽视，方向不保证） | 下一产品版 release 前预注册「工具链升版 → 锚变更披露」，SRI 记新锚；S0 配对锚（web-contract 7,975B / runtime 85,213B 等）同面同步披露 |
| R2 | canon 判读漂移：runner 修复改变 flaky 形态（跨文件泄漏修复可能让此前「靠泄漏才过」的测试翻红） | 低-中（本仓测试纪律强，泄漏依赖面预期零） | 升级波内 canon 全量 ×2 独立跑（两轮全绿零 skip 波动即判稳定）+ 与 1.4.2 计数对表（pass/file 数应恰等） |
| R3 | 环境一致性破口：本机/CI/e2e 三 lane 不同步升 | 设计即消除 | **三 lane 同步升**为本方案硬条件（单边升 = 违「测的=发布的」口径，不采） |
| R4 | bun.lock/依赖面：1.4.x 内 lockfileVersion 2 不变 | 零 | 无需 migrate；`bun install --frozen-lockfile` CI 复验 |
| R5 | 段错误未根除（1.4.4 仍非零崩溃率） | 存在 | gate 判定已有重跑纪律兜底；升级后段错误频率作为升级后效观察项（再发 ×2 同型即回评） |

## §4 同步升方案（若批准）

1. **独立环境面小波（零产品码）**：本机 `bun upgrade`（1.4.2→1.4.4）+ `ci.yml:21` pin 改 `"1.4.4"`（Main 落，一行 diff + 零码豁免形同 0.1.122 口径）。
2. **验证格**：canon 全量 ×2（f4 独立跑）恰等 0.1.122 基线计数；CI 一轮全绿；`bun install --frozen-lockfile` 零 diff。
3. **锚披露预注册**：下一产品版（0.1.123 候）release 前在工单记「bun 工具链 1.4.4，cli.js/runtime/contract 锚预期变更，SRI 记实测新锚」——禁事后追认（锚披露形纪律）。
4. **后效观察**：升级后首个 gate 波起，段错误发生频次入波报告判读披露（×2 同型 → 回评降版面）。

## §5 f4 荐案

**升（1.4.2→1.4.4）**：修复面直击本仓段错误同型路径（§2），风险面全部有既定纪律缓解（R1 锚披露形 / R2 canon 对表 / R3 同步硬条件）；段错误虽未阻塞过判定，但每次发生消耗 gate 重跑周期，且 1.4.3 修复束与 canon 口径（`--isolate`）精确对口——症状-修复对应度高，收益/风险比成立。
备选：若你优先保 cli.js 恒等链连续性（0.1.120-122 三版 Δ=0 记录价值），可延至 0.1.123 code 件合波同升（一次锚变更披露承载两事）——f4 亦认可，二选一呈你。

## §6 升级执行记录（2026-11-17，方案 A 批准；f4 侧）

1. **本机升 1.4.4 落地**（官方 install 脚本，bun upgrade 通道提示手动升级）。
2. **canon ×2（1.4.4）**：6144 pass / 1 fail / 504 files（两轮一致）——fail = `wave0179-skill-overrides.test.ts:116` C9-5 源级锚（断言 `docs/atlas-config-reference-and-template.md` 含 `"skillOverrides"`，0.1.122 A3 已将该文件换 stub）。
3. **差分定谳（非 bun 因）**：回装 1.4.2 跑同测试文件 = 同一 1 fail 复现（50 pass/1 fail）→ fail 为 **0.1.122 A3 漏项**（docs 波改文件破产品测试锚，零码豁免链未跑全量 canon 致漏检——bun 验证跑带出），与 bun 版本无关。已回升 1.4.4 终态。
4. **bun 升级判定 = 升级中性成立**：两版本 canon 形态全等（6144/1），其余 6144 件 1.4.4 全绿；R2 风险面实证零漂移。
5. **派生件转 Main**：① wave0179 测试锚修形（指向 settings.md 新权威面）= tests/ 域，Main 落（0.1.123 候并入）；② ci.yml pin 1.4.2→1.4.4（Main 落）；③ 0.1.123 工单须预注册「bun 工具链 1.4.4 → 锚变更披露」。

## §7 闭环补记（2026-11-17，f4 独立复核）

Main 双件落地（292007c5 缺陷修形 + 1f4ea599 ci pin）f4 活码复核：修形 diff 吻合（含 Main 自行发现的断言形差——新 settings.md 反引号形 `skillOverrides` 无双引号，字面断言对齐采认）；f4 独立复跑 = wave0179 文件 51/51 GREEN + **canon 全量 6145/0/504 GREEN（bun 1.4.4，基线全复）**——bun 升级验证在绿 canon 上完整成立，本评估档销项。0.1.123 锚披露预注册义务随 ci pin commit message 在档。
