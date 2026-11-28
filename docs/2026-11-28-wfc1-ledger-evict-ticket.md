# W-FC-1 工单——cursorLedger 行为修（issue 前置拒绝）+ onActiveEvict 悬空接线（0.1.131 候）

> 出处：F6-PAGE UI 消费工单 §9 挂账池 ④⑤ + follow baseline 呈批书
> `docs/2026-11-27-follow-baseline-rootfix-lockface-brief.md` §8 挂账登记
> （修形预注册面）；排程 `docs/2026-11-28-debt-pool-schedule.md` §1。落码归
> Main；本工单定格定形。

## §0 活码重核（2026-11-28 @ master `1c590aef`）

| 面点 | 实勘 |
|---|---|
| issue 前置拒绝缺失 | `src/atlascode/web/cursorLedger.ts:60-71` issue→`evictForInsert`(:61)→while(:136) 淘尽后 break(:139)——**单 payload 本身 > maxPayloadBytes 时静默入账**（silent overshoot：entries 清空仍插入）；此后每次 issue 触发全量淘扫（含 pinned victim 逐一回调面） |
| onActiveEvict 悬空 | `cursorLedger.ts:57` 构造第 4 参可选 `onActiveEvict?: (token, binding) => void`；`readonlyRuntime.ts:504-508` 构造仅传 3 参（**零传参直证**）；契约承诺在类注释 `cursorLedger.ts:9`（「pinned 并回调 onActiveEvict（显式 resetRequired，禁静默失效）」） |
| follow issue() 调用点 | `follow.ts:376`（issueBaseline）+ `:515`（emitReplacement），两处均先验 `bytes ≤ limits.maxProjectionBytes` 再 issue（:372-375 / :511-514）；pin 于 :388/:527；setTerminal :247 unpin 全部 issuedTokens |
| 默认配置可达性 | `limits.ts`：DEFAULT_LEDGER_PAYLOAD_BYTES=32MiB（HARD 64MiB :105）≥ DEFAULT_MAX_FOLLOW_PROJECTION_BYTES=16MiB（:60）→ 默认配置 oversized **不可达**；显式配置面可配置出（ledgerPayloadBytes 显式调小）→ 独立不变量（totalPayloadBytes ≤ cap）现行码可违约，fail-closed 家族 |
| 拒绝形先例 | `WebSessionError`（`errors.ts:23`）+ `assertLedgerConfig`（`cursorLedger.ts:149-154`）throw 形在档；follow 终态映射 `setTerminal(errorEvent('resourceLimit', …))` 全档在用（follow.ts :256/:322/:373/:511 等） |
| resetRequired 发射面 | `follow.ts:293-298` queueData resetRequired 形在产（非终态，:29 注记）；恢复链 `follow.ts:679` resume cursor rejected → issueBaseline |
| 既有测试 | `tests/unit/web-session-cursor-ledger.test.ts`（直 ledger）+ `tests/func/web-session-runtime-pack.test.ts`（runtime pack） |
| 冻结面 | B0 冻结附表不含 cursorLedger 行为本体（本波为真新波）；零新 wire 形为本波红线（§1 非目标） |

## §1 格与范围

- **格 1（issue 前置拒绝）**：单 payload 超账本字节上界 → 显性拒绝（resourceLimit），
  禁静默 overshoot；守恒不变量（成功 issue 后 totalPayloadBytes() ≤ maxPayloadBytes）成立。
- **格 2（onActiveEvict 接线）**：构造传参兑现（readonlyRuntime :504 第 4 参）；
  pinned victim 淘汰 → 属主 subscription 收 resetRequired 显性事件（非终态），
  禁静默失效（类注释契约兑现）。
- **非目标（防扩格）**：容量（entries 数）语义不变（:136 双界 while 保持）；
  LRU 淘序不变；verify 三因语义不变；零新 event kind/code/export（wire 形
  零新增）；client 侧（AtlasWeb web-code）零触碰（resetRequired 消费已在产）；
  limits 默认值不动（本波零常量变更——0.1.130 根修三常量之外）。

## §2 判据格（预注册，RED 先行）

1. **T1 oversized 显性拒绝**：直 ledger 层——`issue(binding, payloadBytes > maxPayloadBytes)` → throw `WebSessionError('resourceLimit')`；runtime 层——显式配置（ledgerPayloadBytes < 投影字节）→ follow 基线 issue 失败 → `setTerminal(errorEvent('resourceLimit', …))` 终态（不半投影、不静默截断）。RED 基线：现行码同构造 → 静默入账成功（entries 零 + total > cap）。
2. **T2 守恒不变量**：任一成功 issue 返回后 `totalPayloadBytes() ≤ maxPayloadBytes` 且 `entries.size ≤ capacity`（属性化断言，含连续 issue 淘汰序列）。
3. **T3 pinned 淘汰回调（unit 直 ledger）**：压力构造 → pinned victim 淘汰 → `onActiveEvict(token, binding)` 恰一调用、形参逐字 = victim；未 pin victim 淘汰**零回调**；多 pinned 连淘 → 回调数 = 连淘数。
4. **T4 接线 runtime observable**：显式小容量配置（capacity=2）双 subscription 压力构造 → 属主流收到 `resetRequired` 事件（reason 显性含「active cursor evicted」）非终态；属主以被淘 token resume → 既有 `unknown → issueBaseline` 恢复链生效（resetRequired + 新 baseline）。零新 wire 形（机判：carrier 导出面 diff 零新增 kind/code）。
5. **T5 零回归**：既有 ledger 单测 + runtime pack 全绿；bun tests/ 纯面 0 fail；0.1.130 判别面（34/34 形）不退。
6. **T6 载体账**：runtimeSha256/executionSha256 变（预期）、cli.js 恒等（预期 0.1.129 起三连恒等）、exports 零新增、tarball entries 数恒等；Δ 账预注册进 CHANGELOG（execution 链教训在案——readonlyRuntime/limits 依赖链入 126-module 超集，预测按 0.1.130 段 L 实测法不凭直觉）。

## §3 修形定形（落码归 Main，候选对表）

- **修形 1（格 1）——候选 A（采）：ledger 层 throw**。`issue()` 入口（`evictForInsert` 之前）`payloadBytes > maxPayloadBytes → throw WebSessionError('resourceLimit', 'ledger payload exceeds cap (… bytes)')`；`follow.ts:376/:515` 两调用点 catch（WebSessionError code=resourceLimit）→ `setTerminal(errorEvent('resourceLimit', e.message))` 终态。**候选 B（弃）：result union**——改 issue 返回契约涉全部调用方 + 两调用点仍需逐点判形，且与 assertLedgerConfig throw 先例异形；弃。
- **修形 2（格 2）——候选 A（采）：构造 router + token→sink 注册**。readonlyRuntime :504 传第 4 参 router；router 查 token→sink 注册表分发；follow.ts issue 时以 token 在手注册 sink、setTerminal/close 注销。**sink 形 = queue-only**：仅 queueData(resetRequired, reason『active cursor evicted (ledger pressure)』)，**禁同步 re-baseline**——onActiveEvict 触发于 `evictForInsert` 内、即 issue() 调用栈中，自属主自我淘汰（本 subscription 新 issue 淘掉自己旧 pinned cursor）场景同步 issueBaseline = 重入递归险；恢复走既有 unknown→issueBaseline 链（follow.ts:679）+ 客户端 resetRequired 显性处理（#277 波在产）。**候选 B（弃）：构造闭包直连 worker**——ledger 运行时共享、属主关系仅 follow.ts 知，直连需 worker 先于 ledger 存在，构造序不合；弃。
- **边界复核**：修形 2 的 sink 注册/注销全在 follow.ts worker 生命周期内（issue/terminal/close），runtime 层零新状态机面；resetRequired 事件形与 follow.ts:293-298 既有形逐字同构（kind/generation/reason 三键），零新 wire 形达成。

## §4 信号面

本工单（审视判词 PASS @ 折入版 + 审计 PASS）→ 双信号（Main 落码 §3 两修形 /
e2e 判据 §2 六格）。载体候 0.1.131：gate（`--release-gate`）PASS → 段 L 发布
链（L4 带状授权带内）→ SRI 留档。**先判后版**：e2e 判据单未出不得起段 L。

## §5 审视记录（f4 逐点，2026-11-28）

- **自决 1（拒绝形 throw）**：先例 assertLedgerConfig（cursorLedger.ts:149-154
  同文件同形）+ 零新 wire 形红线；候选 B 契约成本高无收益。
- **自决 2（sink queue-only）**：重入递归险直证（issue 栈内回调）；既有恢复链
  + 客户端 resetRequired 显性面在产，queue-only 足以兑现「禁静默失效」契约；
  「新 baseline 或 closed 处置」契约原文为「或」形，queue-only 合同面。
- **自决 3（oversized 可达性定性）**：默认配置不可达（32MiB ≥ 16MiB follow 界）
  但显式配置面可配置出 + 独立不变量现行可违约 → 非 unit-only 装饰件，入
  fail-closed 家族；T1 runtime 腿用显式配置构造，非默认。
- **自决 4（T4 构造形）**：capacity=2 显式小配置构造压力面（默认 128/32MiB
  压力构造成本不成比例）；双 subscription 证跨属主路由面。
- **自决 5（载体映射）**：0.1.131 候段 L，带内（L4 余量四版）；runtime/execution
  变 + cli 恒等预期入 Δ 账。
- **自决 6（与 W-FC-2 并池边界）**：① follow 200 流内错形 UI 区分度不动 follow
  终态语义（本波 setTerminal 形不变），仅 UI/适配器区分度面 → 不折入本波，
  维持 W-FC-2 并池。
- **报裁项：无**（六项全自决闭环；审视/审计异见回票折入 §5 增补）。

## §6 验收件

RED→GREEN 判定单（e2e，T1-T6）+ 审计 PASS + T4 零新 wire 形机判腿 + 载体
Δ 账对账单（T6）+ 挂账池 ④⑤ 销项注记（排程单 §5 状态行翻转候本波收口）。
