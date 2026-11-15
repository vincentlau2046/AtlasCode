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

## §6 Atlas-reveiw 审计闭环（2026-11-15，通过——1 必改级 + 3 必改钉 + 预钉不变量/判定判据；@ff386b1d 全锚实核）

1. **焦点① 缺口定性成立**：注入缝/runtimeDefault 头注自证「消费方自备 engine」系 S0-R 交付波**显式设计选择**，后果 = G2 真实四面结构性不可达——「交付波设计面遗留缺口」定性准确；消费侧拒手抄正确面。**方法论沉淀（登记，全波适用候选）**：「零 engine 泄漏」纯度不变量与「真实四面验真」交付目标在 S0-R 锁面未做**可达性对撞**——gate 全绿但终局目标不可达 = 可达性盲区（假绿的镜像形）；锁面纪律候选 = 交付波 lock-face 增「终局验收目标可达性推演」必答项（下次 release-governance 矩阵修订时落档）。
2. **预答不变量（两形同守）**：`createReadonlySessionRuntime(options.engine)` 注入缝**保留不动**——禁「factory 内置 engine 移除注入参」重形（消费侧 fake 集成腿/格 1 对照列/测试注入形全系于此）。
3. **形 A/B f4 机械裁定（审计四判据）**：① 消费 DX——形 A 单导入优；② pairing 治理成本——形 A 同出口扩形无新 subpath，配对清单/通知体增量小，形 B 双出口分账成本高；③ bundle 增量——「只需 runtime 不需 engine」消费者不存在（runtime 本身即需 engine），形 A 增量论据弱（如实入表）；④ 语义清晰度——形 A 具名导出 `createDefaultReadonlySessionRuntime` 清晰，与形 B 相当。**裁定 = 形 A**（①②③ 占优，④ 中性）；审计自决注记（若 B 则 `./web-session-runtime/default` 命名）随之不触发。
4. **必改级（格 2 豁免面收窄）**：「Node 模块装载必需读取除外」钉死 = ① 载入必需白名单唯二（模块解析/源读取）；② paths.ts 顶层 VERSION fs 探测 + env.ts 默认 HOME 合并等顶层 IO/env 进程面 = **惰性化修复**（首次调用求值/显式注入）非豁免——豁免形 = import-time HOME 合并复活 = R-1 隔离经模块装载面回归（假隔离比无隔离更危险）；③ 格 2 判据升级 = 受控 HOME 下导入前后**全局对象逐字段零差** + fs 调用探针零命中（读面也零，不只写 hash）。
5. **必改钉 3**：① sessionMessagesCache（load.ts:1274 模块级 Map）双实例同 sessionId 零串扰须**直接断言**机制面（非仅行为间接推）；② 格 4 扩 **d.ts 泄漏面**——内部 TranscriptMessage/engine 内型不得现于两出口 .d.ts，公开类型面（ReadonlySessionEngine/ProjectionSourceMessage 现已在公共 options 面）lock-face 逐型对表定公开面；③ cli.js 字节锚（282b0085…）引用为格 4 联动断言（engine 入 pack 图不得改 CLI bundle——两 build 零共享 chunk 纪律）。
6. **流程确认**：格框架成立（7 格 + fake 对照列 + pairing 锚）；lock-face → 落码 → gate → 段 L 0.1.117 候 → 生产 lane → 单信号附配对增量 + G2 解阻；0.1.114 件 F/队列不抢。**双信号②即发 Main（lock-face 呈批开工，本节在案）**。

## §7 lock-face 批复（2026-11-15，f4：**通过五点，落码放行**；呈批书 docs/2026-11-15-s0-r2-lockface-brief.md @25cb7454，五点活码实锚 f4 逐一复核吻合）

1. **§6-1 形 A 终形批准**：改名 `createDefaultReadonlySessionRuntime`（零别名，grep 实证零调用点）+ entry 扩具名导出 + `AtlasWebSessionRuntimeOptions` 型；零新 subpath；注入缝 `options.engine` 保留（预答不变量）；pack 格重形文本采认（engine/session 只读闭包允许；TUI/engine 非 session 子域/private-ui/CLI·TUI 执行入口/进程钩子/timer/env 写/globalThis 挂载仍禁）。
2. **§6-2 修形四件批准**：① paths.ts VERSION IIFE 惰性化（getVersion 首调求值 + 模块级 memo 语义保留——CLI 消费点调用时求值零行为差）；② env.ts:42-43 首访问捕获（语义披露采认：CLI 车道 import≈startup 等价、载体车道首调在 runtime 使用期，进程启动 cwd 不变式由 R-1 隔离测试复跑守卫）；③ 必改钉① 缓存整迁 sessionMessagesCache.ts（零行为搬家 + 载体图结构性缺席 = 机制直断言三件 + CLI 四接缝共享实例不变）；④ runtimeDefault 窄化到 readonly 子门面（+buildConversationChain re-export）+ shared barrel 值导入 3 处直连（feature/`bun:bundle` 出图）。
3. **§6-3 勘正采认**：工单「env.ts 默认 HOME 合并」按现码勘正（getProjectsDir per-call 已惰性，f4 复核 :55-63 属实）不修；import-time 面实为 :42-43 两行——审计引用面以活码为准的勘误纪律兑现。
4. **§6-4 公开类型面对表批准**：现有 25 面 zero-add/del + 新增恰 2；内部型禁现两出口 .d.ts（gate 断言件）；`atlasWebSessionEngine` 不入 entry 面，cast 全走 `as unknown`。
5. **§6-5 格 6 锚披露形批准**：三修形文件在 CLI 图内 → cli.js 282b0085… 锚**必然变更**（行为零变，canon+四件套守卫）——预注册变更源唯一性断言（`git diff --stat` 恰为 §5 清单）+ 新锚值 + SRI v0.1.117.md 记新值 + docs/upstream-pairing.md 配对增量（7,975B/38,652B 尺寸锚同步更新实测）。**注记：本波为「修形入 CLI 图 → 锚变更」预注册披露首例，后续波同形照此办理，禁事后追认**。
6. **Δ 预注册采认**：src 12 文件 +1 新建；unit 新 carrier 件 ~8 + scan 扩形 2-3；canon 6070→≈6082；0.1.117 候；段 L 前置 = e2e GATE-PASS + f4 采认双在案。boundary scan `allowedTargetSubroots` 传 `['src/engine/session']` 豁免面钉死——**豁免外 src/engine 其余子域/src/tui 仍禁**（单测扩形含负腿）。
