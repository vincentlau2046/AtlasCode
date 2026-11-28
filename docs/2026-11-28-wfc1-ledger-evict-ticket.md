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
| follow issue() 调用点 | `follow.ts:376`（issueBaseline）+ `:515`（emitReplacement），两处均先验 `bytes ≤ limits.maxProjectionBytes` 再 issue（:372-375 / :511-514）；pin 于 :390/:529（审计勘正，原 :388/:527 ±2 漂移）；setTerminal :247 unpin 全部 issuedTokens |
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

1. **T1 oversized 显性拒绝 + 零副作用锁**：直 ledger 层——`issue(binding, payloadBytes > maxPayloadBytes)` → throw `WebSessionError('resourceLimit')`；**拒绝零副作用断言（审计必改 2，锁 throw-before-evict 放置）**：rejected issue 后 `entries.size`/`totalPayloadBytes()` 判前判后恒等 + onActiveEvict 回调零触发——若实现把 throw 置于 `evictForInsert` 之后，本断言 RED（淘汰已发生）；runtime 层——显式配置构造（判词侧精化注记 1：**双 knob 对表显文化**——投影须先过 follow.ts:372-375 预检门，故构造须满足**投影 ∈ (ledgerPayloadBytes, maxProjectionBytes) 带内**，如显式 ledgerPayloadBytes 低值 + 投影 < follow 帽；单 knob 表述有构造歧义面禁用）→ follow 基线 issue 失败 → `setTerminal(errorEvent('resourceLimit', …))` 终态（不半投影、不静默截断）。RED 基线：现行码同构造 → 静默入账成功（entries 零 + total > cap）。
2. **T2 守恒不变量**：任一成功 issue 返回后 `totalPayloadBytes() ≤ maxPayloadBytes` 且 `entries.size ≤ capacity`（属性化断言，含连续 issue 淘汰序列；显式前置 capacity≥1/max≥0——审计建议 3：runtime 面 validateBoundedInt 已保证，直构造面免踩）。
3. **T3 pinned 淘汰回调（unit 直 ledger）**：压力构造 → pinned victim 淘汰 → `onActiveEvict(token, binding)` 恰一调用、形参逐字 = victim；未 pin victim 淘汰**零回调**；多 pinned 连淘 → 回调数 = 连淘数。
4. **T4 接线 runtime observable（跨属主判别钉序，审计必改 1）**：显式小容量配置（capacity=2）双 subscription 压力构造，**序列钉死 A1→B1→B2**（B 的 revision issue 淘他属主 A1 pinned victim——自淘汰路径不证路由面，禁由其满足判据）→ **A 流**收到 `resetRequired` 事件（reason 显性含「active cursor evicted」）非终态；A 以被淘 A1 token resume → 既有 `unknown → issueBaseline` 恢复链生效（resetRequired + 新 baseline）。自淘汰面（A2 淘 A1）如需覆盖另立腿非本格判据。零新 wire 形（机判：carrier 导出面 diff 零新增 kind/code）。
5. **T5 零回归**：既有 ledger 单测 + runtime pack 全绿；bun tests/ 纯面 0 fail；0.1.130 判别面（34/34 形）不退。
6. **T6 载体账**：runtimeSha256/executionSha256 变（预期）、cli.js 恒等（预期 0.1.129 起三连恒等）、exports 零新增、tarball entries 数恒等；Δ 账预注册进 CHANGELOG（execution 链教训在案——readonlyRuntime/limits 依赖链入 126-module 超集，预测按 0.1.130 段 L 实测法不凭直觉）。

## §3 修形定形（落码归 Main，候选对表）

- **修形 1（格 1）——候选 A（采）：ledger 层 throw**。`issue()` 入口（`evictForInsert` 之前——T1 零副作用断言锁此放置）`payloadBytes > maxPayloadBytes → throw WebSessionError('resourceLimit', 'ledger payload exceeds cap (… bytes)')`；`follow.ts:376/:515` 两调用点 catch **须窄形钉（审计 + 判词侧精化注记 2）**：`instanceof WebSessionError ∧ code === 'resourceLimit'` → `setTerminal(errorEvent('resourceLimit', e.message))` 终态；他类错误/他 code 禁映射 resourceLimit 终态（防吞真缺陷），rethrow 上抛；与既有 follow.ts:332 `e.code` 分态 catch 不混用、不吞并。**候选 B（弃）：result union**——改 issue 返回契约涉全部调用方 + 两调用点仍需逐点判形，且与 assertLedgerConfig throw 先例异形；弃。
- **修形 2（格 2）——候选 A（采）：构造 router + token→sink 注册**。readonlyRuntime :504 传第 4 参 router；router 查 token→sink 注册表分发；follow.ts issue 时以 token 在手注册 sink、setTerminal/close 注销。**注册表生命周期钉死（审计建议 1）**：分发后即删项（token 一次性消费，防 token→sink 随 revisions 无界增长）+ setTerminal/close 兜底注销。**sink 零 throw 合同（审计建议 2）**：sink 仅 queueData（纯 push 现状写成契约行），router 分发路径不得抛出。**sink 形 = queue-only**：仅 queueData(resetRequired, reason『active cursor evicted (ledger pressure)』)，**禁同步 re-baseline**——onActiveEvict 触发于 `evictForInsert` 内、即 issue() 调用栈中（:61→:136-143 代码级直证），自属主自我淘汰（本 subscription 新 issue 淘掉自己旧 pinned cursor）场景同步 issueBaseline = 重入递归险；恢复走既有 unknown→issueBaseline 链（follow.ts:679）+ 客户端 resetRequired 显性处理（#277 波在产）。**候选 B（弃）：构造闭包直连 worker**——ledger 运行时共享、属主关系仅 follow.ts 知，直连需 worker 先于 ledger 存在，构造序不合；弃。
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
**gate 观察腿（审计注记，非阻可选）**：修形 2 使 default 配置 capacity 压力
场景 resetRequired 发生率上升（形不新、发生面新，需 128 累积 cursor 级压力），
消费在产故非阻断；gate 时 e2e 加一条观察腿（default 配置下 resetRequired
发生率面记录）更稳。

## §7 审计采记（Atlas-reveiw 回执 @ca97c5c4，2026-11-28）

- **总判：W-FC-1 方向 PASS + 必改 2 + 建议 3 + 机械残余 1；排程单 PASS（无缺口）**。
- **折入记录（本版）**：必改 1 → T4 钉序 A1→B1→B2 跨属主判别（自淘汰不证路由面）；
  必改 2 → T1 零副作用断言（锁 throw-before-evict）；建议 1 → §3 注册表生命周期
  （分发后即删 + 兜底注销）；建议 2 → §3 sink 零 throw 合同行；建议 3 → T2 前置
  capacity≥1/max≥0；机械残余 1 → §0 pin 行号 :390/:529 勘正（grep 直证）；审计
  注记 → §6 gate 观察腿非阻登记。§0 其余 9 面 exact MATCH 采认（含 catch 须窄
  硬约束落 §3 修形 1）。
- **闸状态**：折入后候点核（Atlas-reveiw）；判词侧（Atlasweb-F4）审视另线，
  双门齐后才双信号。


## §8 判词侧审视（Atlasweb-F4，2026-11-28 @ master ca97c5c4；f4 撞号修整 §7→§8 + 折入采记 @本 commit）

**终判：审视 PASS——格 1/格 2 范围与防扩格红线采认；判据格 T1-T6 预注册面
全数采认（附精化注记 2 条非阻）；修形 1/2 候选取舍采认（弃 B 理由双方核
真成立）；自决 1-6 全部成立；排程单带状账一致性核真。无报裁项，无异见。**

### 活码独立实勘（判词侧直证，@ ca97c5c4）

| 锚 | 实勘 | 结果 |
|---|---|---|
| 1 静默 overshoot 本体 | cursorLedger.ts issue(:60-71) 先 `evictForInsert(payloadBytes)` 后插入；while 双界条件（capacity ∨ total+incoming > max）；淘尽后 `if (!victim) break`(:139) → **单 payload > max 时循环不可满足仍照插**——entries 清空 + total > cap 静默态成立 | 成立 |
| 2 悬空接线 | :57 可选第 4 参 `onActiveEvict?`；readonlyRuntime.ts:504-508 `new CursorLedger(L.ledgerCapacity, L.cursorTtlMs, L.ledgerPayloadBytes)` 三参零传参；类注释契约「全 pinned 淘最旧 pinned 并回调 onActiveEvict（显式 resetRequired，禁静默失效）」= **仅承诺显式 resetRequired，无 re-baseline 承诺**（verify 拒面「resetRequired+新 baseline 或 closed」为「或」形） | 成立 |
| 3 follow 调用点 | :376（issueBaseline）/ :515（emitReplacement）issue 实址逐字；两处均先过 :372-375 / :511-514 投影预检门；pin :390/:528；setTerminal :247 `unpin` 全部 issuedTokens；resetRequired 事件形 :293-298 三键（kind/generation/reason）；恢复链 :679 `issueBaseline('resume cursor rejected …')` | 成立 |
| 4 默认不可达 | limits.ts :49 replay 4 MiB / :60 follow 16 MiB / :104-105 ledger 32/64 MiB——默认 32 ≥ follow 16 → oversized 默认面不可达；显式 ledgerPayloadBytes 低值可配置出 | 成立 |
| 5 拒绝形先例 | errors.ts:23 WebSessionError（code+retryable 位）；cursorLedger.ts assertLedgerConfig throw 形（invalidRequest）同文件先例 | 成立 |

### 裁定

1. **判据格 T1-T6 采认**。T1 双层形（unit throw + runtime 显式配置 → setTerminal）
   与 RED 基线（现行码静默入账）判别力成立；T2 守恒不变量属性化形；T3 回调
   三断言（恰一/形参逐字/unpinned 零回调）与活码 pinned-only 回调分支一致；
   T4 observable 双 subscription + 零新 wire 机判腿齐；T6 Δ 账按 0.1.130 段 L
   实测法不凭直觉——排程单 §4 预注记同法吻合。
2. **修形 1 采认（候选 A throw）**。关键设计点核真：throw 落点 = `issue()` 入口
   **evictForInsert 之前** → 拒绝零副作用（entries/payloadBytes 未触）——T2/T3
   RED-GREEN 对比面依赖此前提，工单已显文，维持。候选 B（result union）弃理
   由成立（契约成本 + assertLedgerConfig 同形先例）。
3. **修形 2 采认（候选 A router + token→sink，queue-only）**。重入递归险独立
   核真：onActiveEvict 触发于 evictForInsert 内 = issue() 调用栈中，同步
   re-baseline → 同 ledger 重入 issue + while 活迭代中 entries 突变——险面
   真实非理论；queueData(:251) 入队 + notify 泵送非递归。**死 sink 面直证为
   零**：全 worker 终止路径（lease expiry :200 / consumer stopped :843 /
   closed by caller :857 / 终态 error）均汇 setTerminal → :247 unpin all →
   pinned token 无死属主 → sink 注册/注销随 issue/unpin 生命周期闭合（§3
   边界复核补强直证）。候选 B（闭包直连）构造序理由成立。
4. **自决 1-6 全部成立**（自决 2 契约「或」形读法经类注释原文核真；自决 6
   与 W-FC-2 边界正确——本波新 resourceLimit 终态与既有流内错形同族，
   ①UI 区分度面不动 follow 终态语义，并池维持无误）。
5. **排程单带状账一致性核真**：0.1.130 已执行、带内余量 0.1.131-134 四版 ↔
   W-FC-1/2/4 载体需求恰好覆盖；0.1.134 后新鲜亲署条款与 §9 收口记录一致；
   载体串行 + W-FC-3 零版号并行面成立。

### 精化注记（非阻，落码时折入）

1. **T1 runtime 腿构造双条件显文化**：baseline 须先过 :372-375 投影预检门 →
   显式配置构造须满足 **投影 ∈ (ledgerPayloadBytes, maxProjectionBytes) 带内**
   （如显式 ledgerPayloadBytes 低值 + 投影 < follow 帽）——单 knob 表述有构造
   歧义面，判据腿写作时双 knob 对表显文化（RED 基线同构造不变）。
2. **修形 1 catch 窄形钉**：:376/:515 两调用点 catch 须窄
   （`instanceof WebSessionError ∧ code === 'resourceLimit'`），他类错误禁映射
   resourceLimit 终态（防吞真缺陷）；与既有 :332 `e.code` 分态 catch 不混用、
   不吞并。

> 审视链：排程单+工单全文读毕 → 五锚活码实勘（git 锚定 ca97c5c4）→ T1-T6
> 判据面核 → 修形两候选弃取独立核真（重入险 + 死 sink 面直证）→ 自决 1-6
> 核 → 排程带状账核 → 本节。双门状态：判词侧 PASS（本节）；候 Atlas-reveiw
> 审计——双 PASS 后双信号（Main 落码 §3 / e2e 判据 §2）。
>
> **f4 折入采记（@本 commit）**：精化注记 1 → T1 双 knob 对表显文化（带内构造
> 形落格）；精化注记 2 → §3 修形 1 catch 窄形钉（instanceof ∧ code 逐字 +
> :332 不混用行）。行引对齐注记：pin 实址以 f4 grep 直证 = **:390/:529**（本节
> 原文 :528 为 ±1 微差，非阻，随本注记对齐不改节文）——§0 勘正行同值。死 sink
> 面直证（全终止路径汇 setTerminal :247 unpin all → pinned 无死属主）采认为
> §3 边界复核补强，落码期随 §3 修形 2 一并兑现。
