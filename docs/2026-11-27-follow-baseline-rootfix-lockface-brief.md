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
| A1 | `limits.ts` 新增 `DEFAULT_MAX_FOLLOW_PROJECTION_BYTES = 16 * MIB`（hard 复用 `HARD_MAX_PROJECTION_BYTES = 16 MiB` 不新增 hard 上限）；`FollowLimits.maxProjectionBytes` 改由该默认解析，runtime options 可配面不变 | follow 面 4→16 MiB；replay 全量面 4 MiB 逐项不变（F6-PAGE 加性兼容先例） |
| A2 | `DEFAULT_MAX_PENDING_BYTES` 8→16 MiB（hard 32 MiB 不动） | 否则 baseline 16 MiB > pending 8 MiB 在 `follow.ts:254` 二次终流 |
| A3 | `DEFAULT_LEDGER_PAYLOAD_BYTES` 16→32 MiB（hard 64 MiB 不动） | 否则 16 MiB 投影每次 revision 触发 `evictForInsert` 全淘含 pinned（见 §5-1 潜伏缺陷） |

- 零 wire 契约变化、零 AtlasWeb transport/UI 代码改动（仅 pin bump）。
- 内存上界登记：subscriptions 16 × pending 16 MiB = 256 MiB 理论峰值（原 128 MiB）；
  host 可配回落，写入锁面注记。
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
2. **GREEN**：同 fixture ≤ 16 MiB → baseline + 增量正常交付（cursor / revision 链完整）。
3. **诚实界**：fixture 投影 > 16 MiB（> hard）→ 仍 `resourceLimit`，断言不伪完整。
4. **A2/A3 耦合判别**：仅 A1 单落（pending 仍 8 MiB）→ 复现终流（防回归拆落）。
5. **ledger 潜伏缺陷判别单测**（随件核销或单独立项，双门裁）：单 payload >
   maxPayloadBytes 时 `issue` 现行为 = 全淘含 pinned + 静默 overshoot
   （`cursorLedger.ts:126` `evictForInsert`）——候选修形 = `issue` 前置拒绝
   oversized single payload（明确 resourceLimit，禁静默 overshoot）。

## §3 验收面

- AtlasCode 四件套全绿 + 本切片判别单测 1–5（形按双门批复）。
- 发布链：carrier 候 **0.1.130** 段 L 形发布链（**L4 用户亲署候件——0.1.129
  预授权不外溢新版本号，f4 届时向用户呈请**）→ AtlasWeb pin bump + upstream.ts →
  重建 → SRI 锚 #3 重出 → e2e GREEN 复判（#277 六格 + viewport 根修波合并判）→
  #277 收口。

## §4 审视记录（呈双门）

1. **ledger 静默 overshoot 潜伏缺陷**（§2-5）：`evictForInsert` 对 oversized
   single payload 无前置拒绝，全淘含 pinned 并静默超帽插账。本切片 A3 使其不被
   触发（32 MiB > 16 MiB 单投影），但缺陷本体建议登记挂账池或随件判别单测锁现行为。
2. **三常量耦合**为隐式契约（`follow.ts:254` min 门 + ledger 计量），无单一
   不变量测试锁定 → 本切片 §2-4 补上。
3. **min(projection, pending) 门语义**使 pendingBytes 兼任「单事件大小帽」——
   语义混载（队列聚合帽 vs 单事件帽），候选 B 分页化时建议拆分为独立单事件帽参数。
4. 升级条件：若双门/用户裁定走候选 B，即触发「follow 架构语义级重构先呈用户
   敲定」条款，本呈批书撤回重拟。

## §5 呈请事项

1. 双门对候选 A 形（A1/A2/A3 同落 + 判别单测 1–5）批复或修订；
2. §2-5 ledger 潜伏缺陷处置裁（随件 vs 立项）；
3. 批复后 Main 按 AtlasCode worktree 纪律（worktrees/ 下）落码 → 四件套 →
   gate → 段 L（0.1.130，L4 亲署候件）。
