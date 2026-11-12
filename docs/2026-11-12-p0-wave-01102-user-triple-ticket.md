# 0.1.102 P0 插入波工单——用户三问题修复（主题分层检测 / 循环自恢复 A+B+C / 输入框钉底 R3-A+B）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-12）。
> 上游：设计稿 `docs/2026-11-12-p0-triple-user-report-design-proposal.md` v2 @8a81cd9c（用户裁定：① 排波同意 ② A+B+C+DSH 形校准 ③ 全模式钉底重分类 ④ ENV 专项独立波）。
> 排期裁定（用户 2026-11-12「根据原则执行排期」）：0.1.102 = 本波 → 0.1.103 = S3a（lock-face 冻结等待）→ 0.1.104 候位 = ENV 专项。

## §1 波定义

- **波名**：P0 用户三问题修复。**版本**：0.1.102。
- **三切片**（判据独立，可分段落码分段 gate 报告，统一 release）：
  - **切片 1 主题分层检测**：systemThemeWatcher 真实现（OSC 11 query+超时+解析回填，parse 面 systemTheme.ts:66 已有）+ AUTO_THEME 入 ON_BY_DEFAULT + COLORFGBG 缺失 fallback 改 OS 外观判别（macOS `AppleInterfaceStyle` / Windows 注册表 AppsUseLightTheme；禁恒 'dark' 兜底）+ 三源优先序钉死（显式设置 > OSC 11 实测 > COLORFGBG > OS 外观 > dark）+ OSC 失败静默降级禁卡启动。
  - **切片 2 循环自恢复 A+B+C**：A = uncaughtException/unhandledRejection 升格（错误行上屏 + queryGuard 强制复位可重入 + 后台任务流 LocalMainSessionTask 收编；参照 DSH installFailLoud 形，超集 = 不退进程）；B = loop 级 no-event watchdog（缺省 120s 无 stream event/heartbeat/工具心跳 → fail-visible 中止 + 可重入，env 可调 ATLAS_LOOP_WATCHDOG_MS，0 = 关）；C = AD-45 defer 挂起可视化（常驻提示行「等待权限裁定，Esc 中止」+ 挂起超时提示）。
  - **切片 3 输入框钉底 R3-A+B**：A = inline 视口压缩器（动态渲染面强制 ≤ 视口高度：yoga 实测高度预算器，预算分配序 = 输入框/提示行全保 → 流式块限高 → 消息区自尾截断，截断锚延 UUID 面〔CC-941/1174 教训域〕+ 「N 条已入滚动区」提示行）；B = 全屏钉底完备性探针（流式长块/permission overlay/modal/小终端 <20 行/teammate hideSticky 全场景，RED 缝即修）。
- **非目标**：R3-C 全屏翻转缺省（独立评估挂用户终裁）；per-tool timeoutMs 声明面（登记池）；自动回合重建（登记池）；ENV 专项（0.1.104）。
- **性质**：能力+修复波（判据密集，三切片各自独立 gate 格）。

## §2 Global Constraints

1. atlascode 默认行为变更面 = **仅判据格显式覆盖的三点**（主题检测路径 / 错误可见化 / watchdog）——其余零行为变更（canon 前滚面）。
2. row F 全程；判据面冻结先于落码；Atlas-reveiw 审计先于双信号。
3. 段 L 硬门条款生效（e2e GATE-PASS + f4 采认双在案）；build 紧贴 publish + SRI 记 tree commit。
4. 真实环境零污染（e2e seeded HOME）；探针 designated-only。

## §3 工作段

段 D lock-face（三切片各点终形：三源优先序实现形 / watchdog 计时面〔事件源枚举〕/ 视口预算器分配序 + 完备性探针清单）→ 段 I 落码（切片序 1→2→3）→ 段 G（§4 判据格 + 前滚 standing 0.1.101 面 + canon 净域）→ 段 L → f4 收口。

## §4 判据格（预注册，e2e 侧承接）

| 切片 | 格 |
|---|---|
| 1 主题 | 三源优先序逐层注入格；macOS 无 COLORFGBG 模拟 → 判 light 格；stub 文件删除单源格；明暗两底 × 六主题 WCAG 3:1 判别格（inactive/subtle/inverseText/brand）；live 切换格（OSC 响应翻转 → 跟随） |
| 2 循环 | 逃逸异常注入 → 错误行可见 + 循环可重入格（RED→GREEN）；no-event watchdog → 可见中止 + 可重入 + 心跳活动不误杀格；defer 挂起 → 提示行格；后台任务流异常可见格 |
| 3 钉底 | inline：流式 1000+ 行输出 → 输入框钉底可见格（pty 断言末行 = prompt 边界）+ 提示行在场格；全屏：完备性探针腿（五场景）；tmux -CC 自动降级路径格 |
| 全波 | 前滚 standing 14 腿全套（O4 锚/Form A 零写盘/durable OFF 零写盘/team=default 零命中/TEAMS-TASKS-ZERO-DIFF/TypeError 0）+ 零持久残留 + canon 净域（Δ 容许 = 新格族面） |

## §5 Review Focus（Atlas-reveiw 焦点建议）

1. 切片 1：OS 外观读取面跨平台实现（macOS defaults read 子进程 vs node 原生面）；首帧时序（同步判别可用性——defaults read 是异步子进程，首帧 fallback 序）；AUTO_THEME 翻缺省对既有 light 用户回归面。
2. 切片 2：watchdog 事件源枚举完备性（哪些活动计为「活动」——stream_delta/tool_heartbeat/permission 等待交互面须豁免或计活，防交互等待误杀）；A 升格与 cli crashBackstop 双注册冲突面。
3. 切片 3：高度预算器与 Messages UUID 锚截断交互（CC-941 回归面）；流式一帧超限窗口（预算器计算时点 vs yoga 布局时点）；全屏探针腿的 pty 断言可行性。
4. 判据格 WCAG 实算面（rgb 解析 + 对比度公式，测试内实现无新依赖）。

## §6 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D lock-face → 段 I（切片序）→ 段 G → 段 L → f4 收口。row F 全程。

## §6 Atlas-reveiw 审计闭环（2026-11-12，有修改通过）+ f4 吸收（六项入 lock-face/判据面）

1. **watchdog 状态机分域四豁免**（误杀面收窄）：(a) 轮间 idle 豁免——仅回合内 armed（query 起→turn 终）；(b) permission/defer 等待暂停——与切片 C 共用 defer 检测单源，禁第二 defer 判定实现；(c) 在途工具无输出 = 计活（心跳枚举不全工具走「在途计活」，lock-face 列工具清单）；(d) retry backoff 窗计活。**判据格增补：REPL 空闲 >120s 不触发格**。
2. **OS 外观翻转三钉**：异步翻转走既有 theme switch 路径禁 UI 重建；读取失败/超时静默降级（defaults read 子进程须超时）；读一次缓存不轮询（触发点 = 启动一次 + OSC 失败兜底读）。首帧 = 同步源（既有播种架构消解首帧问题）。CHANGELOG 登记句备好（未设置用户 = 修复本意行为变化）。
3. **A 升格注册拓扑三 lane 点名**（TUI/headless/probe）：挂既有两注册点同链扩展，禁第三注册；错误行「恰一次」格增补；queryGuard 强制复位清单 lock-face 写死（queryGuard/流状态/在途工具 abort）；**TypeError 0 格分域注记**——A 上屏 ≠ 主循环零逃逸计数归零，两格分域（TypeError 0 格照登）。
4. **切片 3 三钉**：截断锚单源（预算器消息截断**必须复用既有 UUID 锚实现**，禁第二截断实现）；小终端 <20 行退化规则 lock-face 定形（输入框 min 高度/滚动切换）；判据格增补**流式单帧超限不破钉底格**。
5. **账面勘误**：S3a 工单版本行顺延 0.1.103/0.1.104，ENV 专项 0.1.105（row F 账面一致性，随本节落）。
6. 审计结论：吸收后直接发双信号，无需二审。

段 D lock-face 必答清单更新：§6.1 工具心跳清单 + defer 检测单源 / §6.2 OS 读取触发点枚举 / §6.3 复位清单 + 三 lane 挂载点 / §6.4 小终端退化规则 + UUID 锚复用点。

## §7 f4 批复：段 D lock-face（2026-11-12，@c9f9a4c8）

**五项必答全部批准**（实锚抽查：computeSliceStart Messages.tsx:186 已 export + cap 参数化复用面确认；defer 单源 toolExecution.ts:214-223 → loop.ts:612 链确认）。三项确认裁定：

1. **watchdog 挂 engine 侧 loop.ts 批准**——豁免信息视野在 engine（permission 未决/在途集/backoff）论证成立；活动源单点 reset = deps.emit 汇聚处；「在途即活」统一包裹形消心跳白名单面。
2. **三常数批准**：OSC 2s / OS 读 500ms / 流式帽 24 行——须具名常量（禁 magic number）+ 流式帽与「流式单帧超限不破钉底格」联动断言；OS 读失败路径 = 静默降级下一源（与 §6.2 三钉一致）。
3. **<5 行完全退化规则批准**——退化态 = 既有行为（无压缩），探针腿断言口径 = 退化不崩溃 + 不误截输入框；<20 行保底集规则照批。

批复后段 I 落码（切片序 1→2→3），row F 全程。

## §8 段 G 核销（Main，2026-11-13 @b8a3c850）

**段 I 落码**：切片 1 `21199f14` / 2-A `b77c9657` / 2-B `c87b8621` / 2-C `5eebb92f` / 3 `b8a3c850`，已推 gitcode master（ALIGNED）。核销明细见 lock-face 文档 §⑥。

**§6 审计增补三格——Main 侧判据面核验**（e2e 侧 pty 格留 gate 承接）：

| 增补格 | Main 侧证据 |
|---|---|
| 空闲不触发格（§6.1） | `tests/unit/p0-loop-watchdog.test.ts:69`「未 armed（disarmed）不 fire —— 轮间空闲不触发格」+ arm/disarm 事件驱动面（round_start arm / round_end·loop_end disarm） |
| 恰一次格（§6.3） | `tests/unit/p0-crash-recovery.test.ts:30`（首错主体 + 窗内折叠 additionalCount + 恰一次 dispatch）+ `:62`（窗关后新错误开新窗重新恰一次） |
| 流式单帧不破钉底格（§6.4） | `tests/unit/p0-viewport-compressor.test.ts:54`（预算分配序单帧总高恒 ≤ 视口三重循环）+ capStreamingText 任意输入输出 ≤ 24 行联动断言 |

**canon 净域**：5924 pass / 0 fail（2026-11-13，125.6s；首轮挂死为 runner 环境偶发，重跑即绿，lock-face §⑥ 存照）。前滚 standing 0.1.101 面（O4 锚/Form A 零写盘/durable OFF 零写盘/team=default 零命中/TEAMS-TASKS-ZERO-DIFF/TypeError 0）由 canon 全量含测承接，全绿。

**下一步**：signal e2e gate（t106，含 R3-B 五场景 pty 探针 + §4 判据格 e2e 侧）→ 硬门条款双在案后段 L。

## §9 f4 终收口——0.1.102 五段闭环终态（2026-11-13）

**gate 链四轮定谳**：gate-102（t106）RED = 切片 3 收缩环同步 setState 自激崩溃（Maximum update depth）→ t107 RED = surrender 形全盲（cap 0 零渲染，「不渲染≠进滚动区」判据形修正）→ t108 RED = compress capRows 无下限钳 race 空帧（2 跑 1 绿 1 红）→ **t109 GATE-PASS**（G5 ×3 稳定性格三绿、canon 5935/0、standing 抽查全绿；报告 `r-20261113-regate-109.md`）。修形三轮 `9e293efe`（崩溃有界化）→ `be84fb10`（MESSAGE_TAIL_CAP_ROWS=24 行级尾保帽 + 可见性底线 fallback 形）→ `9f88c44b`（compress capRows 下限钳 1 + 触底 surrender 边界），每轮 f4 判据面冻结先于 Main 落码。

**段 L**（硬门双在案：GATE-PASS 路径 + f4 采认信号）：release `8a1440ba`（纯 bump，产品码零差）/ tag v0.1.102 / npm publish ✅（shasum 3a398fad…）/ build 紧贴 publish（tree 8a1440ba，cli.js f291e4e5…）/ SRI 留档 `docs/sri/v0.1.102.md` @2eefa5d7。

**生产 lane ⑦ PASS**（报告 `r-20261113-prodlane-102.md`）：SRI 四值全 MATCH（cli.js 四点字节恒等 = 纯 bump 实证）+ PONG-102 GREEN + O4 名义形锚 GREEN + RequestShutdown 成员链 GREEN（均首试零残留，glm-5 逐腿标注）。

**用户三问题目标达成对表**：

| # | 用户问题 | 判定 | 交付面 |
|---|---|---|---|
| 1 | macOS 灰字几乎不可见（主题对比度） | ✅ 达成 | 切片 1：watcher 真实现（OSC 11 实测）+ AUTO_THEME 缺省开 + 三源优先序（显式 > OSC 11 > COLORFGBG > OS 外观 > dark）+ mac 无 COLORFGBG 判 light——浅色终端不再恒落 dark |
| 2 | 主循环错误后长久停止无回应（应自恢复） | ✅ 达成 | 切片 2：A crash 可见化+强制复位可重入（恰一次）+ B 回合内 watchdog 120s 可见中止可重入 + C defer 挂起常驻提示行——三种循环死法全部有用户可见面 |
| 3 | 输入框不钉底、整屏上滚丢失 | ✅ 达成 | 切片 3：inline 视口压缩器（钉底 + 行级尾保帽可见性底线「任何 plan 形态恒渲染最近回合内容」+ 降级规则），gate 稳定性格 ×3 结构性成立 |

**登记债（随波终结面盘点）**：切片 2-A 升格 × Ink 渲染错误边界盲区（gate-102 §3 副观察，登记池候选小波）；per-tool timeoutMs 声明面（既有登记）；R3-C 全屏翻转缺省（独立评估挂用户终裁）。

**下波**：0.1.103 S3a 归位（lock-face 冻结解，六项终裁 f4 起裁）→ 0.1.104 S3b → 0.1.105 ENV 专项（矩阵 v1 底稿在案）。
