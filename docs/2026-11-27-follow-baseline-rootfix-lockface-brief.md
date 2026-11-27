# 呈批书 — follow baseline 根修切片（#277 格 1 半销形收口前件）

> 起因：#277 GREEN 轮 f4 裁定（2e0822c / cdbb30f）——四 viewport 红 UI 消费波侧已由
> viewport 根修销（9b28206 → main `610ecc9`），格 1 新暴露未销面 = **AtlasCode 引擎侧
> follow baseline 投影限（resourceLimit 流内错形）**，pre-existing 产品缺陷新暴露。
> f4 第二令轨 B：本切片呈批书送双门（Atlasweb-F4 审视 + Atlas-reveiw 审计）。
> 呈批日 2026-11-27。**批复前零落码**（锁面预注册纪律）。

## §0 活码重核（2026-11-27，master @ f4 令时点，逐行直证）

| 站点 | 证据 |
|---|---|
| 单事件双帽门 | `src/atlascode/web/follow.ts:254` `if (bytes > limits.pendingBytes \|\| bytes > limits.maxProjectionBytes)` → **单事件有效帽 = min(projection, pending) = min(4 MiB, 8 MiB) = 4 MiB** |
| baseline 终形 | `follow.ts:371-375` issueBaseline 投影超帽 → `setTerminal(errorEvent('resourceLimit', 'projection exceeds limit …'))`，SSE 200 流内错形 |
| 增量终形 | `follow.ts:510`（emitReplacement，S0-R5 抽出三站点同形支）同错形 |
| 帽源 | `src/atlascode/web/limits.ts:49-50` `DEFAULT_MAX_PROJECTION_BYTES = 4 MiB` / `HARD 16 MiB`；`:71-72` `DEFAULT_MAX_PENDING_BYTES = 8 MiB` / `HARD 32 MiB`；`:94-95` `DEFAULT_LEDGER_PAYLOAD_BYTES = 16 MiB` / `HARD 64 MiB` |
| 可配面 | `readonlyRuntime.ts:415-420`（maxProjectionBytes）/ `:445`（pendingBytes）/ `:492-495`（ledgerPayloadBytes）均 host 可配 `validateBoundedInt`，不越 hard |
| ledger 计量 | `cursorLedger.ts:60` `issue(binding, payloadBytes)` → `evictForInsert(payloadBytes)` 计入 `maxPayloadBytes`（默认 16 MiB） |

缺陷语义：长会话（全投影序列化 > 4 MiB）在 follow 面必触发——baseline 与每次增量
同形终流。UI 侧 viewport 根修后长会话滚位可达（m180 级），该缺陷从「不可达所以
不可见」转为「可见且必红」。

## §1 候选对表

### 候选 A（推荐）：follow 面帽族同调（最小根修形，零 wire 契约变化）

预注册形（三件**必须同落**，拆开落必复现同缺陷——单事件 min 门语义）：

| 件 | 预注册形 | 变化 |
|---|---|---|
| A1 | `limits.ts` 新增 `DEFAULT_MAX_FOLLOW_PROJECTION_BYTES = 16 * MIB`（hard 复用 `HARD_MAX_PROJECTION_BYTES = 16 MiB` 不新增 hard 上限）；**接线约束（审计必改）**：fork 点 = `readonlyRuntime.ts:921-922` follow limits 构造处（直接消费 `L.maxPendingBytes/L.maxProjectionBytes`），**禁改 `DEFAULT_MAX_PROJECTION_BYTES` 本体**——否则 replay 全量面 `:625` 一并泄漏 16 MiB；runtime options 可配面不变 | follow 面 4→16 MiB；replay 全量面 4 MiB 逐项不变（F6-PAGE 加性兼容先例，判别件见 §2-6） |
| A2 | `DEFAULT_MAX_PENDING_BYTES` 8→16 MiB（hard 32 MiB 不动） | 否则 baseline 16 MiB > pending 8 MiB 在 `follow.ts:254` 二次终流 |
| A3 | `DEFAULT_LEDGER_PAYLOAD_BYTES` 16→32 MiB（hard 64 MiB 不动） | 否则 16 MiB 投影每次 revision 触发 `evictForInsert` 全淘含 pinned（见 §5-1 潜伏缺陷） |

- 零 wire 契约变化、零 AtlasWeb transport/UI 代码改动（仅 pin bump）。
- 内存上界登记（审计建议①补正）：**per runtime** = subscriptions 项 16 × pending
  16 MiB = 256 MiB（原 128 MiB）+ ledgerPayload 32 MiB（共享实例）+ 读面瞬态
  ≈ **288 MiB 级**；跨 runtime 无全局界；且 host **可配回落亦可配抬高**
  （subscriptions hard 64 → 配置面理论界 1 GiB 级），两面并记入锁面注记。
- hard 16 MiB 仍为最终界：超 16 MiB 会话仍 resourceLimit（诚实不伪，零隐式截断）。

### 候选 B：baseline 分页化（架构语义级 → 触发升级条件，呈用户敲定）

baseline 拆 meta + page 事件流（复用 F6-PAGE replay 分页契约）。涉 wire 契约 +
AtlasWeb transport + UI 消费面三域改动。**本呈批书不推荐为本切片执行**；登记为
超 16 MiB 会话真需求出现时的后继方向。

### 候选 C：零码过渡缓解（非根修，仅登记）

AtlasWeb host 侧 start `options.limits` 传 `{maxProjectionBytes: 16 MiB, …}`。
不采纳为根修：默认不变、其他 host 不受益、硬帽仍在，且属配置面规避。仅在 A 落
地前出现临时需要时可作过渡。

## §2 判别单测预注册（TDD RED 先行）

1. **RED**：长会话 fixture（投影序列化 5–6 MiB，> 旧 4 MiB 帽）follow 单测，
   现形 = baseline 支 `resourceLimit` terminal 事件。
2. **GREEN（双 fixture，审计必改 1 连带）**：fixture A ≤ 8 MiB（旧带内）与
   fixture B ∈ (8 MiB, 16 MiB]（旧带外、A2 才解锁的带）各一件 → baseline +
   增量正常交付（cursor / revision 链完整）——fixture B 锁 A2 必要性正向面。
3. **诚实界（边界精确钉，审计建议②）**：fixture 投影 = 16 MiB 恰过（`>` 谓词
   放行）与 **16 MiB + 1**（精确拒）两值 → 前者交付、后者仍 `resourceLimit`，
   断言不伪完整。
4. **A2/A3 耦合判别（审计必改 1 修正）**：仅 A1 单落（pending 仍 8 MiB）→
   **fixture 须 ∈ (8 MiB, 16 MiB]（钉 ~9–10 MiB，禁沿用 §2-1 的 5–6 MiB——
   该带 A1 单落时 bytes < pending 8 不触发，判别假绿）** → 复现终流；断言
   resourceLimit terminal 且 baseline 前无半投影交付（防回归拆落）。
5. **ledger 潜伏缺陷 characterization 单测（审计 §2-5 处置改形）**：随件仅
   **characterization 锁现行为**（零行为变更，直测导出的 CursorLedger：单
   payload > maxPayloadBytes 时 overshoot 后 `totalPayloadBytes()` > cap /
   全淘含 pinned）；**行为修（issue 前置拒绝 oversized single payload）
   单独立项挂账**——修形涉通用 ledger 语义 + 错误映射面（issue 抛出后 follow
   侧终态形须预注册防 500）+ `onActiveEvict` 接线三问，不混入根修切片；A3
   落默认面后该分支默认不可达。双门若裁随件行为修，须同时裁 callback 接线。
6. **replay 非泄漏双向判别（审计必改 2）**：默认配置（不传 `options.limits`）
   下 5–6 MiB 会话 → replay 全量面（`readonlyRuntime.ts:625`）**仍
   resourceLimit**（4 MiB 帽未泄漏）；同 fixture follow 面正常交付（16 MiB
   帽生效）——双向锁 A1 接线 fork 约束，防「误改 DEFAULT 本体」回归
   （既有 `tests/func/web-session-runtime-follow.test.ts:446` 为配置面形，
   锁不住默认解析面）。

## §3 验收面

- AtlasCode 四件套全绿 + 本切片判别单测 1–6（含 §2-6 replay 非泄漏判别；形按双门批复）。
- 发布链：carrier 候 **0.1.130** 段 L 形发布链（**L4 用户亲署候件——0.1.129
  预授权不外溢新版本号，f4 届时向用户呈请**）→ AtlasWeb pin bump + upstream.ts →
  重建 → SRI 锚 #3 重出 → e2e GREEN 复判（#277 六格 + viewport 根修波合并判）→
  #277 收口。

## §4 审视记录（呈双门）

1. **ledger 静默 overshoot 潜伏缺陷（审计必改 3 定性补正）**：`evictForInsert`
   对 oversized single payload 无前置拒绝，全淘含 pinned 并静默超帽插账。补正
   两点：① **`onActiveEvict` 全仓零接线**（`readonlyRuntime.ts:503-507` 三参
   构造不传；grep src/ 除定义外零命中）——类注释「pinned 淘最旧并回调
   onActiveEvict（显式 resetRequired，禁静默失效）」在活码为**悬空承诺**：
   live 面 pinned 逐出为无回调静默，后果 = 旧 cursor resume → verify 'unknown'
   → resetRequired fail-closed（受控失败非静默成功，但设计意图未执行）；
   ② 「A3 使其不被触发」**仅对默认配置成立**——配置面（host 设
   ledgerPayloadBytes < follow maxProjectionBytes）仍可达 overshoot/全淘。
   处置按 §2-5 改形：随件 characterization 锁现行为，行为修立项挂账。
2. **三常量耦合**为隐式契约（`follow.ts:254` min 门 + ledger 计量），无单一
   不变量测试锁定 → 本切片 §2-4 补上。
3. **min(projection, pending) 门语义**使 pendingBytes 兼任「单事件大小帽」——
   语义混载（队列聚合帽 vs 单事件帽），候选 B 分页化时建议拆分为独立单事件帽参数。
4. 升级条件：若双门/用户裁定走候选 B，即触发「follow 架构语义级重构先呈用户
   敲定」条款，本呈批书撤回重拟。

## §5 呈请事项

1. 双门对候选 A 形（A1/A2/A3 同落 + 判别单测 1–6（含 §2-6））批复或修订；
2. §2-5 ledger 潜伏缺陷处置裁（随件 vs 立项）；
3. 批复后 Main 按 AtlasCode worktree 纪律（worktrees/ 下）落码 → 四件套 →
   gate → 段 L（0.1.130，L4 亲署候件）。

## §6 判词侧审视与批复（Atlasweb-F4，2026-11-27）

**终判：批复 PASS——候选 A 形采纳（A1/A2/A3 同落，零 wire 契约变化核实）；§2
判别单测 1/2/3/5 采认 + 必改 1（§2-4 耦合判别腿修正形，落码前折入本档）；
§5-2 裁定 = ledger 潜伏缺陷随件核销（判别单测 + 前置拒绝修形同落）。非阻注记
4 条。Main 即开落码（必改 1 折入后）。**

### 六站活码独立实勘（@ f71672ba，git 锚定）

| 站 | 实勘 | 结果 |
|---|---|---|
| 1 min 门 | follow.ts:254 `bytes > limits.pendingBytes \|\| bytes > limits.maxProjectionBytes` 逐字 → 单事件有效帽 = min(4,8) = 4 MiB | 成立 |
| 2 baseline 终形 | :371-375 issueBaseline 投影超帽 setTerminal resourceLimit | 成立 |
| 3 增量终形 | :510-514 emitReplacement 同错形；:514-528 每 revision `issue`+`pin` | 成立 |
| 4 帽源三常量 | limits.ts :49-50 4/16 MiB、:71-72 8/32 MiB、:94-95 16/64 MiB；:63 `DEFAULT_MAX_SUBSCRIPTIONS=16`（内存账基数直证） | 成立 |
| 5 可配面 | readonlyRuntime.ts :415-420/:445-446/:492-495 `validateBoundedInt` DEFAULT↔HARD | 成立 |
| 6 ledger 计量 | cursorLedger.ts :60-61 issue→evictForInsert；:125-146 淘汰环——单 payload > max 淘空（pinned 走 onActiveEvict **显式回调**）→ 空账 break → **超帽插账本体静默**（无前置拒绝） | 成立 |

**耦合机理双直证**：baseline 事件经 :392 `queueData` 过 :254 双门（投影帽
:372 + 单事件门 :254）——A2 耦合实级；A3 churn 实级（每 revision issue+pin，
前驱 cursor 保持 pinned → ledger 压力逐 revision 累积）。

### 候选 A 裁定（呈请①）：采纳

1. 三件同落机械必要性 = min 门语义锁定（A1 单落 → :254 pending 8 MiB 二次
   终流；A3 缺 → 双 cursor 共存压力触发 pinned 淘汰 churn）——§2-4 判别腿恰锁此；
2. 零 wire 契约变化核实：三件均 limits 常量域，事件形状/字段/协议零触；
3. 内存账核实：DEFAULT 层 16×16 MiB = 256 MiB（原 128 MiB）；**A1/A2/A3 全
   DEFAULT 层，hard 层零变 → hard 层理论峰值账（64×32 MiB）不变**（登记面补强）；
4. A1 default=hard（16=16）零上配余量 = 显性取舍采认：(a) 观测最大 6 MiB 之
   2.7×；(b) 超 16 MiB = 候选 B 登记后继（升级条件条款在案）；(c) 零新增 hard
   上限 = 帽面纪律。候选 B/C 登记维持。

### 必改 1（§2-4 耦合判别腿——落码前折入，不阻 §1 落码开工）

**判据腿空转风险（假绿）**：5–6 MiB fixture 在 A1-单落世界（pending 仍
8 MiB）不触发 :254（5–6 < 8）→「复现终流」不可达。修形：

- fixture 升 (8,16) MiB（如 ~10 MiB）；**或**注入形（runtime options
  `maxProjectionBytes=16 MiB` + `maxPendingBytes=4 MiB` 模拟 A1-单落世界，
  5–6 MiB fixture 即触发 :254）；
- **增补第三腿 = 常量关系断言**（零 fixture 机械锁「三件同落」）：
  `DEFAULT_MAX_PENDING_BYTES ≥ DEFAULT_MAX_FOLLOW_PROJECTION_BYTES` ∧
  `DEFAULT_LEDGER_PAYLOAD_BYTES ≥ DEFAULT_MAX_FOLLOW_PROJECTION_BYTES`
  unit assert——防未来单常量改动复活缺陷；
- A2/A3 拆两判别：A2 = pending 拆落 → :254 终流复现；A3 = ledger 拆落 →
  双 revision pinned churn（onActiveEvict 回调断言）。

### §5-2 裁定（ledger 潜伏缺陷）：随件核销形

判别单测（RED 锁现行为 = 淘空含 pinned + 静默 overshoot）+ 候选修形（issue
前置拒绝 oversized single payload，显性 resourceLimit）**同件落**。理由：
① A3 后默认面不可达，但 host 可配面仍可达（ledgerPayloadBytes 可配低值）——
缺陷本体非死码；② fail-closed 门禁支柱③（禁静默超账）对齐；③ 独立波不成
比例。拒绝形细面（throw vs result + follow 两调用点 :377/:514 catch→
setTerminal 映射）随件落码注册，判据 = 零静默 overshoot + 显性 resourceLimit 面。

### 非阻注记 4

1. §4-1 精化：pinned 淘汰有 onActiveEvict 显式回调（头部注释「禁静默失效」
   自证）——静默面 = 超帽插账本体，非 pinned 失效；§2-5 断言按此对准。
2. §2-3 成本形建议：语义腿（注入低帽 + 小 fixture → terminal 非截断）+ 值腿
   （常量 assert 16/16）两腿拆分，免 ~17 MiB 巨 fixture；「诚实界」意图
   （零隐式截断）由语义腿承。
3. A1 显式配置优先序落码钉死：host 显式 `maxProjectionBytes` → 两面同用
   （follow 不越显式值）；缺省 → follow 16 / replay 4 分面解析。
4. 措辞精化：行 4「已由 viewport 根修销」——e2e 验收判定单
   （r-20261127-viewport-rootfix-accept.md，22/22 ×3 全绿）已到件，销面实证
   成立；本呈批判定不依赖该面（格 1 follow 面独立成立）。

### 验收链对表

§3 = f4 裁定逐项一致（0.1.130 L4 亲署候件不外溢 / pin bump / 锚 #3 / GREEN
复判 / #277 收口）。轨 A 收口件（22/22×3 + 对照 3/3 145cec04 同值 +
bun 561/1/0 + 格 5 机判）采认为 #282 侧实证。

> 审视链：呈批书全文读毕 → 六站活码实勘（git 锚定 f71672ba）→ 候选 A 三点
> 核真 → 必改 1 判据面实勘（queueData 路径 + fixture 界数学）→ §5-2 裁定 →
> 本节。双门：判词侧批复 PASS（本节）；候 Atlas-reveiw 审计。

## §6 修订记录

- **修订 r1（2026-11-27，Atlas-reveiw 审计回执折入）**：必改 3（A1 接线 fork
  约束显文禁改 DEFAULT 本体 / T4 fixture 钉 (8,16] 带防假绿 + T2 双 fixture /
  §4-1 onActiveEvict 悬空承诺定性补正 + A3 免触发限定默认配置）+ 建议 3
  （T6 replay 非泄漏双向判别新增 / 内存登记 per runtime ≈288 MiB + 可配抬高面
  并记 / T3 边界钉 16 MiB 与 16 MiB+1 精确值）+ §2-5 处置改形（随件仅
  characterization，行为修立项挂账，双门终裁）。本文件正文已按 r1 为准。

- **修订 r2（2026-11-27，Atlas-reveiw 点核回执残余 1 勘正）**：§3 / §5-1
  「判别单测 1–5」→「1–6（含 §2-6）」——防 gate 按旧口径跳锁非泄漏判别件。
  另附注登记：引言 9b28206→main 610ecc9 为 cherry 形重落（9b28206 非
  610ecc9 祖先，内容恒等以 `git diff 9b28206 610ecc9 -- e2e/` 空为直证），
  按 ancestry 判「已合」的旁证文会误报。审计门点核 PASS @ 本修订前形。

## §6-1 判词侧 r1/r2 对表收口（Atlasweb-F4，2026-11-27，@e5803a4e 态）

**批复维持 PASS @ r2 态；§6 必改 1 核心与审计必改 1 同点独立收敛（T4 (8,16]
带钉 = 本侧「判据腿空转」同一发现，r1 已折）——判词侧两条让位修正 + 两条残
余建议 + 一条实勘自纠，折入如下：**

1. **必改 1 撤号 = 审计必改 1 覆盖**。残余两条降格建议（非阻）：
   - **建议 1（常量关系断言）**：零 fixture unit assert
     （`DEFAULT_MAX_PENDING_BYTES ≥ DEFAULT_MAX_FOLLOW_PROJECTION_BYTES` ∧
     `DEFAULT_LEDGER_PAYLOAD_BYTES ≥ DEFAULT_MAX_FOLLOW_PROJECTION_BYTES`）
     ——T4 行为腿之外最廉价机械守（防未来单常量改动复活缺陷）。
   - **建议 2（A3 必要性专判）**：r1/r2 判别腿集 A2 面齐（T4 + §2-2 fixture B
     正向锁），A3 专判缺——建议 observable 形（A1+A2 无 A3 注入态 → 双
     revision 后前驱 cursor resume 'unknown' → resetRequired fail-closed 面
     断言），**禁 callback 断言形**（见 3 悬空定性）。
2. **§5-2 裁定修正：让位于审计 r1 形（随件仅 characterization，行为修立项
   挂账）**。让位理由（自承原裁两点欠权）：① issue 抛出后 follow 侧终态映射
   面未预注册（500 险面）——行为修验收面比原裁估计大；② 修形涉通用 ledger
   语义 + onActiveEvict 接线三问，混入根修切片扩域。本侧 fail-closed 支柱③
   诉求由挂账池登记承（非静默丢弃）。**批复对象改 = §2-5 characterization 形
   + 行为修挂账立项。**
3. **§6 六站表行 6 + 注记 1 撤回修正（审计必改 3 采认，本侧独立复核成立）**：
   本侧实勘见 cursorLedger.ts:143 调用点即记「显式回调」——**漏勘接线面**：
   `onActiveEvict?` 三参可选构造在 readonlyRuntime.ts:503-507 零传参，全仓
   grep（src/ 非 test）除定义 :57/调用点 :143/注释 :9 外零命中 → 活码 pinned
   逐出 = 无回调静默（下游 resume 'unknown' → resetRequired 受控失败）；
   cursorLedger.ts:9 类注释 = 悬空承诺。**教训入册：可选回调「定义在场 ≠
   接线在场」，实勘须双向（定义面 + 构造接线面）。**
4. **审计必改 2（§2-6 replay 非泄漏双向判别）+ A1 fork 约束
   （readonlyRuntime.ts:919-922 解析点）采认**——本侧独立复核接线点在位；
   「误改 DEFAULT 本体」回归险面（配置面测试 :446 锁不住默认解析）定性成立。
5. **内存账 288 MiB 级并记 + 配置面理论界两面并记采认**——比本侧 §6 行 3
   补强（ledgerPayload 32 MiB 共享实例 + 读面瞬态 + subscriptions 可抬高面）。

**双门态：审计门（方向 PASS + 必改 3 折 r1/r2 + r2 点核 PASS）+ 判词侧
（§6 批复 PASS + §6-1 对表收口）→ 双门齐，Main 开落码（判别单测 1–6 形 +
建议 1/2 采否自决）。** L4 纪律不变（0.1.130 用户亲署候件，届时呈请）。
