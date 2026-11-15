# S0-R2 工单——受支持 engine 载体出口（G2 验真前置；S0 交付波后续切片）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-15）。
> 上游：S0 上游交付链全闭环（工单 docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md §5.15 @730e735a，G1=true 终判 + 单信号已发）；消费侧开工前三步 PASS + 缺口呈报（Atlasweb-F4 2026-11-15）。

## §0 缺口定谳（f4 活码实锚 2026-11-15）

- 消费侧实证：`./web-session-runtime` 出口 factory `createReadonlySessionRuntime` **必注入** `options.engine`（readonlyRuntime.ts:106/122 `ReadonlySessionEngine` = loadTranscriptFull + buildConversationChain）；engine 真体装配（runtimeDefault.ts:13-14 导 src/engine/session）**刻意不进 pack 图**（R-3 采认形：cast 焊接边界收 runtimeDefault，§5.8-1）→ npm 包零 engine 载体 = 消费者仅能自实现 engine（即重写读链）或手抄——总约 §2 禁私引 src/**，**真实四面 G2 验真结构性不可达**。
- 定性：**S0 交付波设计面遗留缺口，非消费侧误用**——G2 硬门（真实 Web controller 四面实测）以内生依赖方式要求 engine 载体受支持出口。消费侧决不手抄冒充（正确面）；G1 门内作业（host/adapter 骨架 + fake engine + seeded fixture）继续不受阻。
- 总约依据：§2「上游 runtime 内部允许经过审核的 engine/session 窄读取与纯投影服务」——engine 真体**入包**与总约相容；S0-R3 当时「零 engine 泄漏」pack 格是交付波自设不变量，非总约硬约束（本工单裁定其可重形，见 §2）。

## §1 波定义

0.1.117 候：受支持 engine 载体出口（下述候选形 lock-face 定形）→ 落码 → e2e gate（判据格按切片）→ 段 L → 生产 lane → 单信号回 Atlasweb-F4（附新 subpath/配对增量）。

## §2 候选形（lock-face 定形，禁预答终形）

- **形 A（同出口扩形）**：`./web-session-runtime` 增具名导出 `createDefaultReadonlySessionRuntime(options)`（engine 真体随 bundle）。消费 DX 最简（单导入）；pack 格重形 = 「engine/session 只读闭包允许 + TUI/CLI/应用探测/env 写面/全局槽仍禁」。
- **形 B（新 subpath 分账）**：新增 `./web-session-engine`（或 `./web-session-runtime/default`）承载 engine 装配；runtime 出口维持零 engine 不变量不破；消费者双导入接线（接线面小）。配对清单/判据格按双出口扩展。
- **形 C（维持仅注入）不采**：G2 结构性不可达如 §0。
- 共同硬面（两形同）：① engine/session 只读闭包**导入纯度审计**——S0 协商 §0 已锚 paths.ts:161-180 顶层 VERSION fs 探测 + env.ts 默认 HOME 合并全局面，R-1 隔离反例只证运行时面；本波须证**导入时**零应用副作用（Node 模块装载必需读取除外），探针区分载入必需/应用初始化；② 只读纯度复核（写面黑名单全量禁调，R-1 形保持）；③ pack 判据族扩展（engine 载体 bundle 加载图：TUI/React/Ink/CLI 执行入口/进程钩子/timer 连接零现）；④ 双实例隔离回归（engine 载体不引模块级可变缓存——load.ts sessionMessagesCache Map 禁用形保持）。

## §3 判据格（预注册框架，lock-face 细化）

| # | 格 |
|---|---|
| 1 | engine 载体可达格：消费仓（或 e2e 独立装树）真导入 + 真 seeded fixture 四面实跑（list/search/replay/follow 全链） |
| 2 | 导入纯度格：受控 HOME/沙箱导入零应用副作用（写 hash/连接/timer/env 零变）；探测区分载入必需读取 |
| 3 | 只读纯度格：写面黑名单零命中 + 真实 HOME 零写 |
| 4 | pack 判据族：TUI/React/CLI/进程钩子零现；双出口（形 B）或重形后单出口（形 A）各自断言 |
| 5 | 双实例隔离回归：同 sessionId 异 scope 交错零串扰（R-1 反例形复跑于 engine 载体） |
| 6 | 回归零触碰格：既有两出口消费面（Atlasweb-F4 pairing 记录锚值 7,975B/38,652B/cli.js 282b0085…）零变或如实披露 |
| 7 | canon 恰合 |

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（候选形定形 + Δ 预注册）→ Main 落码 → e2e gate → 段 L 0.1.117 候 → 生产 lane → 单信号回 Atlasweb-F4（配对增量 + G2 解阻）。

## §5 消费侧衔接（已告知）

- 缺口登记属实、排程本波；**G1 门内作业不等待**（host/adapter 骨架 + fake engine + seeded fixture 继续）——fake engine 集成腿未来可复用为格 1 对照列。
- 配对记录 docs/upstream-pairing.md 为格 6 基线锚。
