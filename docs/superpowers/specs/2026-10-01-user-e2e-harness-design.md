# user-e2e：用户视角全量测试方案（独立维护 · 指定才跑 · 夜间全量 + 双报告）

> 状态：待审核。审核通过后端到端实施（harness → 用例 → 全量跑测 → 报告 + 定位报告），
> 2026-10-01 夜间执行，次日晨可看结果。

## 1. 背景与目标

**用户报障（2026-10-01 02:19）**：Atlas TUI 只有第一次消息有响应，后续消息无响应；
IFF 网关监控显示 `Qwen38-27B-TXT 200 0/0 — — 1ms`（200 但 0 token、1ms 空返回）；
基本功能不正常，核心 loop 不稳定。

**交付物（本方案范围）**：

1. 一套**用户视角 e2e 测试套件**：所有 slash command 遍历 + 短/中/长程任务，
   **独立文件夹维护、仅显式指定才跑**（时长长，不属于开发必测，不进 CI / `bun test`）。
2. 全部输入输出收敛在**该文件夹内**，不污染其他目录（仓库源码、`~/.atlas`、`tests/`）。
3. 基于跑测输出两份报告：**用户侧完整测试报告** + **问题定位报告**
   （作为下一轮功能补齐的重点输入）。

**非目标**：不修 bug（本轮只测、只定位、只出报告）；不覆盖单测/func 已覆盖的
引擎内部门面（`tests/` 既有体系不动）。

## 2. 基线事实（2026-10-01 02:42–02:46 实测，方案依据）

| # | 事实 | 证据 |
|---|------|------|
| F1 | IFF 网关活：`GET 127.0.0.1:8999/v1/models` → 200，~1ms；模型池含 `Qwen38-27B-TXT`（local/ninfer） | curl 实测 |
| F2 | `~/.atlas/settings.json`：三角色池（small/fast/premium）全指 `iff/Qwen38-27B-TXT`，defaultRole=small，effort xhigh | settings 读取 |
| F3 | **headless 单轮通**：`atlas -p` 沙箱 HOME 一发 → `result=success, "OK", num_turns=1` | 02:44 预探 |
| F4 | 用户监控的 `200 0/0 1ms` 行形态与网关 health/`/v1/models` 探针一致（0 token、1ms）——**须区分健康探针与真实 chat 回合**（后者耗时 60–110s、带 token），定位时引用网关日志须先做此区分 | 监控行形态分析 |
| F5 | TUI 多轮存疑：用户报障 = 仅首轮有响应。预探 PTY 三轮探针（marker α/β/γ）已于 02:46 后台启动，结果并入 T1 证据 | 探针 bk7devy8n |
| F6 | TUI 启动面：`bun run src/atlascode/cli.ts`（无参 = TUI，G-1 已接线 bin 同款）；`IS_DEMO=1` 跳 onboarding（interactiveHelpers 先例）；PTY 用 `script -qec` 包裹（func 层先例，CI 无 PTY 会挂） | cli.ts / func 探针 |
| F7 | slash 命令注册表 ≈64 项（feature/dev 门控 6 项默认关 → 实际 ≈58）；runner **运行时直读注册表**（`getCommands`/`builtInCommandNames`），不手抄清单，清单永不过期 | commands.ts 静态计数 |
| F8 | headless 多轮可用 `--resume <session_id>`（parse.ts 已接线）；`-r` 支持 | parse.ts:627 |
| F9 | 配置目录 `~/.atlas` 经 HOME 解析 → **沙箱 HOME 隔离成立**（会话/历史/配置全落沙箱） | configDir.ts |
| F10 | 弱模型（Qwen38-27B）确定性判据先例：marker 词「回复且仅回复：X」指令遵循实测可靠，marker 出现 ≥2 次 = 回显 + 渲染双证（func PTY 探针标定） | func 探针头注 |

## 3. 目录设计（独立文件夹，物理隔离）

```
user-e2e/                        # 仓库顶层，与 tests/ 平级——bun test 只扫 tests/，天然不进必测
  README.md                      # 触发方式 + 「指定测试、非必测」声明 + tier 说明 + 报告索引
  run.ts                         # 唯一入口（下 §4）
  lib/
    pty.ts                       # PTY 驱动：script -qec 起 TUI + 尾随日志 marker 等待（expect 式，非固定 sleep）
    headless.ts                  # headless 驱动：管道 stdin + stream-json 事件解析 + --resume 多轮
    gates.ts                     # T0 门控：网关探针 + healthCheck + settings 装载校验
    fixture.ts                   # 中/长程 fixture 工程生成（运行时生成 git 仓，不提交嵌套 .git）
    ansi.ts                      # ANSI 剥净
    classify.ts                  # 失败分层（L1–L4，§7）
    report.ts                    # checkpoint JSONL + report.md / diagnosis.md / summary.json 生成
  cases/
    core/                        # T1（代码定义，精确断言）
    slash-meta.yaml              # T2：逐命令分类/安全位/预期（LLM-gated / local / net-gated / auth-gated / danger）
    short/  medium/  long/       # T3–T5：数据驱动 case 定义（prompt / fixture / 断言 / 时间盒）
  fixtures/                      # fixture 模板（源文件 + 植入 bug + 测试脚本；无 .git，运行时生成）
  workspaces/<run-id>/<case>/    # (gitignore) 每 case 独立工作区（TUI 的 cwd / fixture 落点），跑完即弃
  home/<run-id>/                 # (gitignore) 沙箱 HOME（.atlas/settings.json 复制件，插件面关闭）
  artifacts/<run-id>/            # (gitignore) 原始留痕：PTY 转录（ANSI 原样 + 剥净双份）、stream-json、逐 case 计时
  reports/<run-id>/              # 交付：report.md（用户视角）+ diagnosis.md（定位）+ summary.json
```

**必测面零影响保证**（三重）：① 目录不在 `tests/` 下（`bun test --isolate tests/` 不触碰）；
② `package.json` 不新增 scripts（触发方式只登记在 `user-e2e/README.md`）；
③ 不进 `tests/ci` 门禁。`.gitignore` 增补 3 行（workspaces/home/artifacts），
`reports/` 与套件代码入库（可追溯、可复跑）。

**隔离保证**（不污染）：TUI/headless 全部以 `HOME=user-e2e/home/<run-id>` +
`cwd=user-e2e/workspaces/<run-id>/<case>` 运行 → 会话历史、shell-snapshots、
project 级 `.atlas/` 全落沙箱；真实 `~/.atlas` 只读复制 settings.json（模型配置），不写入。

## 4. 执行模型

**触发（指定才跑）**：

```bash
bun run user-e2e/run.ts --tier all            # 全量（= 今晚执行方式）
bun run user-e2e/run.ts --tier core           # 只跑 T0+T1（快速回归，~10 分钟）
bun run user-e2e/run.ts --tier slash,medium   # 组合
bun run user-e2e/run.ts --resume <run-id>     # 断点续跑（per-case checkpoint）
bun run user-e2e/run.ts --full-home           # 可选：完整复制 ~/.atlas（含插件面），默认关闭
```

**门控（skip-clean 不红，func 层双门先例）**：

- T0 preflight：网关 `/v1/models` 探针（5s）+ `modelProvider.healthCheck('small')`
  （经组合根，同 func 探针语义）+ settings 装载。任一失败 → 后续 LLM 面 case 全
  `SKIP(GATE)`，本地命令面 case 照跑；生成「门控失败」简版报告（不红、不误导）。
- 单 case 看门狗：硬超时到 → kill 进程组，记 `TIMEOUT` + 尾屏证据，不拖垮整轮。

**时间盒**：per-case 时间盒（下表）+ 全量预算（§9）。checkpoint 实时落盘
（`artifacts/<run-id>/checkpoint.jsonl`：case 级 verdict + 耗时 + 证据路径），
**任何时刻中断，reports/ 里都有已完成面的完整报告**。

## 5. 用例矩阵（T0–T5）

| tier | case | 内容 | 断言（确定性判据） | 驱动 | 时间盒 |
|------|------|------|--------------------|------|--------|
| T0 | preflight | 网关探针 + healthCheck + settings | 三项全绿 | — | 30s |
| T1 | core-1 **多轮复现（报障核心）** | TUI 单 session 4 轮 marker 对话（α β γ δ），逐轮等 marker ≥2 | 第 2/3/4 轮 marker 均出现（直接判「仅首轮有响应」是否成立） | PTY | 8min |
| T1 | core-2 | headless `--resume` 2 轮同 session | 第 2 轮 result=success + marker | 管道 | 5min |
| T1 | core-3 工具回合 | fixture 仓内 1 个 echo 型工具任务 | 工具调用渲染 + 磁盘产物 ground truth | PTY+管道 | 5min |
| T2 | slash-sweep | 注册表全量 ≈58 内置命令逐条（运行时读，单一真源）；每命令 = 发送 → 等渲染稳定 → 断言 → 等输入框恢复 → 下一条；`/exit` 最后 | 按 slash-meta.yaml 分类断言（§6.2） | PTY（单 session 连发，auth/danger 面独立 session） | 60min |
| T3 | short ×4 | 确定性短任务：单轮 marker / 多轮续答 / 文件写任务 / 简单工具任务 | marker ≥2；磁盘产物 | PTY+管道双跑 | 15min |
| T4 | medium ×2 | fixture 迷你 git 仓（5 文件 + 植入 bug + 测试脚本）：任务=修 bug 使测试过 | **磁盘 ground truth**：测试脚本 exit 0 + git diff 含修复；工具调用渲染面 | PTY+管道 | 25min/个 |
| T5 | long ×1 | 多步任务：init 仓 → 加模块 → 写测试 → 跑 → 修 → commit（工具预算 ≤25 次） | 磁盘 ground truth：测试过 + git log 含 commit + 步序正确 | 管道 | 45min |
| T5 | soak ×1 | 单 TUI session 连续 10 轮 marker（抓 loop 漂移/泄漏，第 k 轮响应时延单调记录） | 10/10 轮 marker；逐轮时延曲线 | PTY | 25min |

**优先级与快速失败**：T1 先跑——若核心 loop 断（多轮不通），T4/T5 会 fail-fast，
时间盒快速收掉，报告聚焦 core loop（这正是本次报障的假设，省时且定位更聚焦）。

## 6. 确定性判据（弱模型 Qwen38-27B 下可判）

1. **marker 判据**（F10 先例）：「回复且仅回复标记词：X」→ X 在剥净转录中 ≥2 次
   （输入回显 1 次 + assistant 渲染 1 次）。弱模型该指令遵循已实测可靠。
2. **磁盘 ground truth 优先**：工具/编码任务只信磁盘（文件存在、测试 exit 0、
   git log/diff），不信模型自述——弱模型自述不可判。
3. **LLM-gated 命令**：只断言「回合完成」（assistant 文本渲染 + 输入框恢复），
   不断言内容质量。
4. **local 命令**：断言预期 UI 片段或优雅报错 + 输入框恢复（命令未把 TUI 打死）。
5. **外部依赖类**（share/oauth/login/logout/autofix-pr/pr_comments/install-slack-app）：
   沙箱 HOME 无凭据 → 断言「优雅降级文案/无崩溃/不悬挂」，**不触发真实外部写**。
6. **danger 位**：`/exit` 排 T2 末尾；`/rewind`、`/force-snip` 仅在 fixture 工作区跑（隔离）。

### 6.2 slash-meta.yaml 分类（≈58 命令，示例行）

```yaml
- name: help        cls: local   expect: ["可用命令" 或命令表]
- name: clear       cls: local   expect: 屏清 + 输入框恢复
- name: doctor      cls: llm     expect: turn-completed        # 诊断类走真 LLM 一轮
- name: share       cls: auth    expect: 优雅降级（未登录态文案）  danger: false
- name: commit      cls: llm     expect: turn-completed + git log 新增（fixture 仓）
- name: exit        cls: danger  expect: 进程干净退出（独立 session，最后执行）
```

分类由实施期逐命令核对注册表 metadata（type: local/local-jsx/prompt + 外部依赖）
一次性写入，跑测时机器执行；**新增命令自动落 `unknown` 桶**（断言 = 不崩 + 输入恢复，
并在报告列出待补分类），保证 sweep 永不因清单过期而漏/挂。

## 7. 失败分层与定位方法

每失败 case 归入唯一主层（可加辅层），报告逐条给证据（artifact 路径 + 行号）：

| 层 | 判据 | 嫌疑代码区（定位报告引用面） |
|----|------|------------------------------|
| L1 TUI 渲染/消息队列 | headless 同 case 过、TUI 挂；或 TUI 转录显示输入已入队但无渲染 | `src/tui/utils/processUserInput/`、`queueProcessor`、`loopEvents.ts` |
| L2 engine loop | headless 第 2 轮起 `result` 缺失/`is_error`/空 assistant；stream-json 事件流断点 | `src/engine/query/`（queryAgentLoop）、`src/engine/loop/` |
| L3 modelprovider | healthCheck 失败 / 「No models configured for role (empty pool)」/ 请求未发出 | `src/modelprovider/` |
| L4 IFF 网关 | 请求发出且响应 200 但 0 token（`0/0` 形态，非 F4 健康探针形态）| 网关侧（引用用户 IFF 监控日志时段对照） |

**双向对照定位**（本方案的核心定位能力）：T1/T3/T4 关键 case 同时跑 TUI（PTY）
与 headless（管道）两条——**同 case 结果差异即分层信号**（TUI 挂 + headless 过
= L1；双挂且事件流断 = L2；双挂且请求 0 token = L3/L4）。

诊断报告另做两项交叉对照：
① 与 `docs/product-status.md` 的 `[ATLAS-HOLD]` 残口表（IFF 网关 56 行/31 文件换值项
等）逐条比对，区分「已知残口」vs「新故障」；
② 网关日志时段对照（用户 IFF 监控）：把失败时刻的 `0/0 1ms` 行按 F4 规则分类
（健康探针 vs 空 chat 响应），避免把探针行误读为故障。

## 8. 报告规范（两份，中文）

**`reports/<run-id>/report.md`（用户侧完整测试报告）**
- 环境块：版本（0.1.2）、宿主、网关地址/模型、执行窗口、总时长
- 逐 tier 结果表：case / verdict（PASS/FAIL/SKIP/TIMEOUT）/ 时长 / 一句话用户可见症状
- 失败汇总 + Top 问题（按用户影响排序）
- 判据说明（§6）+ 复跑方式（`--resume` / 单 tier）

**`reports/<run-id>/diagnosis.md`（问题定位报告 = 下一轮功能补齐输入）**
- 逐失败：主层（L1–L4）+ 证据索引（artifact:行）+ 嫌疑代码区（file 级，不擅自改码）
- 已知残口 vs 新故障 交叉对照表（§7②）
- **下一轮修复清单：P0/P1/P2 分级**（P0 = 核心 loop 断 / 基本功能不可用）
- 附：soak 逐轮时延曲线（loop 稳定性量化）

**`summary.json`**：机器可读总表（供后续轮次 diff：上轮 FAIL → 下轮 PASS 核销）。

## 9. 今晚执行时间表（2026-10-01，CST）

| 窗口 | 阶段 | 内容 |
|------|------|------|
| 02:50–03:45 | P1 实施 | harness 核心（pty/headless/gates/report/classify）+ T0 + T1；**先答「多轮到底断没断、断在哪层」**（02:46 预探探针结果此时回收合并） |
| 03:45–05:15 | P2 跑测 | T2 slash sweep（local ≈46 × ~20s + LLM-gated ≈12 × ~2.5min）+ T3 short |
| 05:15–06:15 | P3 跑测 | T4 medium ×2（fixture 修 bug，TUI+headless 双跑） |
| 06:15–07:30 | P4 跑测 | T5 long（45min 时间盒）+ soak 10 轮 |
| 07:30–08:30 | P5 收口 | 双报告生成 + 交叉对照 + 修正 + `summary.json` |

预算核对：LLM 回合 ≈73 轮 × 100s ≈ 2h 纯 LLM 墙钟 + 本地命令面/开销 ≈ 全量 5.5h，
08:30 前收口，留 1h 缓冲至 09:30（晨可看）。**若 T1 证实核心 loop 断**：T4/T5
fail-fast，收口提前至 ~06:30，报告聚焦 core loop + 修复清单（对下一轮更有价值）。

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 弱模型指令遵循漂移（marker 不吐） | 双判据（marker + 磁盘 ground truth）；T2 LLM-gated 只判回合完成 |
| 长回合 60–110s 导致全量超时 | per-case 时间盒 + checkpoint 续跑 + 优先级排序（core 在前） |
| PTY 悬挂 | 看门狗硬超时 kill 进程组；func 层 `script -qec` 先例 |
| 网关夜间抖动 | T0 门控 skip-clean；`--resume` 重跑断点 |
| 插件/技能面命令数膨胀（用户 settings 启 10+ 插件） | 默认 `--full-home` 关闭：sweep = 内置命令；插件/技能面报告仅**枚举计数**，全量扫 = 后续指定轮次 |
| 会话/历史污染真实 `~/.atlas` | 沙箱 HOME（§3），真实目录零写 |

## 11. 审核项（请确认）

1. **目录** = 仓库顶层 `user-e2e/`（`reports/` 与套件代码入库；workspaces/home/artifacts gitignore）——可？
2. **沙箱 HOME 默认关闭插件面**（确定性优先；插件面只枚举不扫，`--full-home` 留口）——可？
3. **时间预算**：全量 ≤6h（08:30 收口）；T5 long 时间盒 45min；T1 断则 T4/T5 fail-fast——可？
4. **跑完不自动 commit**：harness + 报告以未跟踪文件落盘，报告末尾列「建议下一步」（含 commit 建议），由你晨起决定——可？

**审核通过后动作**：实施 harness → 建用例 → 全量跑测（夜间，增量 checkpoint）→
双报告 + summary.json 落 `user-e2e/reports/<run-id>/`，全程只在 `user-e2e/` 内产生 I/O。
