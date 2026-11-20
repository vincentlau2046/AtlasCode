# 执行出口实施波 lock-face 呈批书（Main → f4）

> **f4 批复（2026-11-21）：批准，附条件见文末 §6 批复节**（审计 = Atlas-reveiw 终裁「可批复，附条件」，条件全数并入）。0.1.126候 与 AtlasWeb A 候选发布 bump 不撞号——两列车独立（@atlasharness/atlascode 0.1.126 vs @atlaswork/atlasweb 0.1.4候），已分别定谳。

> Main 2026-11-21。请求面 = B0 合同（AtlasWeb
> docs/superpowers/specs/2026-11-20-first-wave-execution-contract.md @de2a9e8）
> 锁定登记挂账①（set-once 守卫实码 commit 锚）+ B 段附表 §0 锚表三项定名
> （Main 定名权，附表原文）。本呈批书为 docs-only 预注册：批复前零落码；
> B1 开工前提（附表审计闭环 + A5 候选验收）不受本波影响、不抢排。

## §0 代码事实锚（侦查结论，file:line 可复核 @master 0.1.125）

- **现注入语义 = 静默覆盖**：src/kernel/state/injection.ts:20-24
  `setKernelBootstrapState` 无条件赋值 `_statePort = port`（同形
  :35-37 noop seam）；读门 fail-fast（:25-33 未注入抛错）；测试缝
  `resetKernelBootstrapStateForTests`（:53-56）清双槽。
- **setSessionEnv 是另一模块**：src/engine/session/env.ts:82-85 为
  **Partial spread 合并**（非替换），复位缝 = `resetSessionEnv`（:95）。
  合同「二次注入 = 硬错」对它同样适用（合并两次 = 注入两次）。
- **产品装配点（双车道）**：headless = src/atlascode/compose.ts:234-235
  （setKernelBootstrapState/NoopSeam）+ :316（setSessionEnv）；TUI =
  src/tui/factory.ts:261-262。probe 车道以缺省 NoopSeam 运行、不注入
  （injection.ts 头注③；真状态消费探针显式注入 stub——arming 形不得破此车道）。
- **协议单源先例**：src/kernel/protocol/webSessionV0.ts（S0-U U-1，
  f4 批复 @f1f1099d）——import 面 = zod/v4 唯一、strictObject、
  Code-neutral 词汇审计格（tests/unit/web-session-v0-contract.test.ts）、
  双版本域（schemaVersion=0 / protocolVersion='v0'）。
- **pack 出口面**：@atlasharness/atlascode 现有两 subpath
  （./web-contract / ./web-session-runtime）；web-session-runtime =
  src/atlascode/web/entry.ts 纯 re-export 面（零副作用、零 TSX 泄漏），
  S0-R2 形 A 先例 = 同 subpath 扩具名导出。AtlasWeb host 载体 pin 与
  bundle 实体均为 web-session-runtime（AtlasWeb
  packages/web-host/test/npmPackage.test.ts carrierRuntimePath 实证）。
- **结构化 IO 现状**：src/engine/messaging/controlMessageCompat.ts 等既有
  requestId 去重形不满足合同 §3 三元组幂等（合同已明示不得作替身）。

## §1 定名提案（§0 锚表三项，Main 定名）

| 项 | 定名 | 依据 |
|---|---|---|
| 执行出口导出名 | `createExecutionOutlet`（+ `type ExecutionOutlet` / `ExecutionOutletOptions`；信封/事件型自 webExecutionV0：`ExecutionEnvelope` / `ExecutionEvent` / `EXECUTION_PROTOCOL_VERSION`） | 合同 §2 六命令一一对应；命名对齐 `createReadonlySessionRuntime` / `createDefaultReadonlySessionRuntime` 族形 |
| 执行出口包路径 | `@atlasharness/atlascode/web-session-runtime`（同 subpath 扩具名导出） | 单载体：AtlasWeb pin 与 bundle 实体均此 subpath；另立 subpath = 第二 dist 出口 + 第二 carrier 面，无收益；S0-R2 形 A 先例 |
| 首个承载版本 | 0.1.126候（现 0.1.125；最终以排波段 L 为准） | 版本列车顺延 |

回填责任：f4 据本呈批书批复回填 B 段附表 §0 锚表（附表原文约定）；
挂账① commit 锚随 §2 S1 落码产出后由 Main 报锚。

## §2 切片预注册（五段链，每切片 TDD RED→GREEN）

### S1 —— set-once 守卫（B0 硬化，挂账①）

- **守卫原语单文件**（合同预注册形「收敛于 injection.ts 单文件」）：
  src/kernel/state/injection.ts 增模块级 arming 面
  `armKernelInjectionGuard()`（产品组合根专用）+ 守卫态；两个产品 setter
  （setKernelBootstrapState / setKernelBootstrapNoopSeam）与 env.ts 的
  setSessionEnv **消费同一原语**（env.ts 一行接缝，守卫逻辑仍单文件）。
- **ariming 点 = 双车道组合根**：compose.ts headless 装配点与
  tui/factory.ts 各自调 `armKernelInjectionGuard()`（装配期恰一次）；
  armed 后对已注入槽的第二次 set = **throw（硬错，非覆盖）**；
  未 armed（测试/probe 车道）语义不变（现静默覆盖保留给测试重注）。
- **测试缝保留不动**：`resetKernelBootstrapStateForTests` /
  `resetSessionEnv` 原形保留（复位并解除该槽 armed 记账，teardown 出口）。
- **判别单测**（tests/unit/injection-setonce.test.ts）：
  (a) armed 后二次注入 setKernelBootstrapState 抛错且原 port 不被顶替；
  (b) armed 后 setSessionEnv 第二次调用抛错（Partial 合并形同适用）；
  (c) 未 armed 重注合法（测试车道回归）；(d) reset 缝复位后可重注入；
  (e) probe 车道（不 armed、不注入真状态）读门 fail-fast 语义不变。
- **调用点审计**（波内必交件）：全仓 setKernelBootstrapState /
  setSessionEnv / setKernelBootstrapNoopSeam 调用点穷尽清单
  （生产 / 测试 / 探针分列），入验收件；源级扫描测试锁形
  （双车道 arming 点在场 = wab4 源扫描同范）。

### S2 —— 协议 + 出口（合同 §2/§3）

- 新 src/kernel/protocol/webExecutionV0.ts：import 面 = zod/v4 唯一、
  strictObject、Code-neutral 词汇审计格沿用 webSessionV0 同法（新单测
  或并入既有格）；Envelope/Event/Error + 六命令 payload schema +
  EXECUTION_PROTOCOL_VERSION='v0'（schemaVersion 分域同 webSessionV0 形）。
- 新 src/atlascode/web/executionOutlet.ts：`createExecutionOutlet(options)`
  —— 六命令 → kernel 命令面薄适配；事件信封（含 cursor/bind）原样上抛，
  不重写排序、不改结算（B 段附表接口原文）；§3 三元组幂等
  `(workspaceId, sessionId, submitId)` 在 kernel 侧执法。
- entry.ts 扩具名导出（§1 定名）；加载图审计回归（零 TUI/private TSX）。

### S3 —— 状态机（合同 §4/§5/§8）

turn/approval/queue 生命周期与上限执法归 kernel（上游执法，AtlasWeb 零
重复执法）：有界 FIFO 16、待批 300s→expired、2 MiB 拒绝、follow 缓冲
10 000 溢出→错误边界+游标重同步、并发 1。文件落点随切片 TDD 定
（kernel 执行域新区），判据逐条对合同 E1–E5。

### S4 —— follow.resume + gate + 段 L

follow.resume cursor 语义沿只读面（§6：按代采信、增量恰一次、过期→基线
替换）；kernel boundary 扫描扩执行出口 import 面（单接触点纪律机器判，
B 段附表 §1 GREEN 腿同法对表）；四件套 + e2e gate + 段 L release
（0.1.126候）+ SRI 留档 + 单信号 Atlasweb-F4。

## §3 不变量

- resetKernelBootstrapStateForTests / resetSessionEnv 显式测试缝原形保留
  （合同预注册）；真状态读门 fail-fast 语义不变。
- 产品模式静默覆盖语义不可达 = 合同 §7 硬约束；非产品模式行为零变更
  （probe/e2e/单测车道回归腿锁形）。
- 出口面零副作用、零 TSX、d.ts 泄漏面审计沿用 S0-R2 格。
- AtlasWeb 侧零改动（本波纯 AtlasCode）；B1 前提链不变。

## §4 验收件（B0 锁定登记）

1. 挂账① = S1 commit 锚（落码后 Main 报 f4，按验收件常规对表）。
2. 验收件② = 单例面穷尽清单（kernel 状态面其余模块级单例穷尽审计，
   injection.ts/setSessionEnv 外逐模块列置），S4 前交。

## §5 版本与链

0.1.126候；五段链 = 呈批（本文件）→ f4 批复 → S1–S4 落码 → gate → 段 L。
批复形式与既有 lock-face 同（批复 commit 锚回本文件状态行）。

## §6 f4 批复节（2026-11-21，批准 + 条件集）

依据：Atlas-reveiw 审计终裁「§0 事实锚全部核真；呈批书可批复，附条件」。§1 三项定名（createExecutionOutlet / web-session-runtime 同 subpath 扩具名导出 / 0.1.126候）**批准**；同 subpath 判定为对合同 §1 的正确解释而非实质偏离（定名权合同 §0 已授 Main；「独立」实质 = 独立受支持具名导出面 + 独立能力/授权生命周期）。**条件（未满足不进对应切片）：**

1. **（S2）符号级扫描腿**：S4 kernel boundary 扫描按**具名符号**判（createExecutionOutlet/ExecutionOutlet/webExecutionV0 型），不得按 module specifier 判——同 subpath 后 import 串与只读面同形，单接触点纪律唯符号级机器可判（同 subpath 选择的直接代价，须写明）。
2. **（S2）出口构造零引擎引导腿（E1 增格）**：createExecutionOutlet 懒触达——构造不 boot kernel；probe=off 下构造 + 六命令任一 = 拒且内核零痕迹。E1 的 kernel 侧能力开关落点（默认 off、probe 查询、off 全拒）由 S2 出口面明示承载。
3. **（S1）调用点穷尽清单须确证无非组合根的运行时 setSessionEnv 调用者**：armed 后 Partial 合并即硬错，若存在合法运行时更新者须在清单显形并先裁，不可到 S3 才撞。
4. **（S1）arming 单向不可逆**：armed 态下 `resetKernelBootstrapStateForTests` / `resetSessionEnv` 调用 = **硬错**（呈批书原「reset 复位并解除 armed 记账」形不采——注入→reset 解除→再注入 = 静默顶替复活，恰是绕行向量）；未 armed 测试车道 reset 原形不变；判别单测增腿 (f) armed 态 reset 抛错且槽不被清。
5. **（合同对表）** AtlasWeb 侧 B0 合同 §1/§7 由 f4 加实施修订注记（同 subpath 裁定 + setSessionEnv 接缝形），随批复 commit 同步；B 附表 §0 锚表三项由 f4 回填。
6. **零漂移回归**：entry.ts 扩具名导出后只读消费面行为零变更回归腿 + 执行具名导出零副作用/零 TSX/d.ts 审计沿 S0-R2 格（呈批书 §3 既有，重申为条件）。

其余呈批内容（arming 双车道、测试/probe 车道不 armed 语义零变更、S2 协议沿 webSessionV0 格、S3 上限执法归 kernel、S4 follow.resume、验收件两件、五段链、0.1.126候）按呈批书执行。B1 开工前提链不变；本波不抢排。
