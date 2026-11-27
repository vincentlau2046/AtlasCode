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

- AtlasCode 四件套全绿 + 本切片判别单测 1–5（形按双门批复）。
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

1. 双门对候选 A 形（A1/A2/A3 同落 + 判别单测 1–5）批复或修订；
2. §2-5 ledger 潜伏缺陷处置裁（随件 vs 立项）；
3. 批复后 Main 按 AtlasCode worktree 纪律（worktrees/ 下）落码 → 四件套 →
   gate → 段 L（0.1.130，L4 亲署候件）。

## §6 修订记录

- **修订 r1（2026-11-27，Atlas-reveiw 审计回执折入）**：必改 3（A1 接线 fork
  约束显文禁改 DEFAULT 本体 / T4 fixture 钉 (8,16] 带防假绿 + T2 双 fixture /
  §4-1 onActiveEvict 悬空承诺定性补正 + A3 免触发限定默认配置）+ 建议 3
  （T6 replay 非泄漏双向判别新增 / 内存登记 per runtime ≈288 MiB + 可配抬高面
  并记 / T3 边界钉 16 MiB 与 16 MiB+1 精确值）+ §2-5 处置改形（随件仅
  characterization，行为修立项挂账，双门终裁）。本文件正文已按 r1 为准。
