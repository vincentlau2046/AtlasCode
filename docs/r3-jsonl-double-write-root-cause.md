# R3（P2）jsonl 双写 — 根因定位（0.1.9 判定：defer，非本波修）

> user-e2e 第 2 轮 R3：「每个事件写两遍（bloat + resume/replay 双消费；dedup 未生效）」。
> 本波（0.1.9）完成 R1/R2/R4/R5，R3 判定 **defer**（根因已钉死，需专项波统一写面，
> 不在发布列车内做投机性持久化改造）。本文件记录根因 + 修复方向，供下一波直接接手。

## 根因（已确认）：两套发散的 transcript 写者

主 session transcript 有**两个独立写者**，各带**各自的去重 Set 缓存**，都 append 到
同一 session 文件：

| 写者 | 入口 | Project 实例 | 去重 Set |
|---|---|---|---|
| ① engine 活链 loop | `agentLoopDeps.transcript.record` → `recordTranscript`（**`src/engine`** 门面）→ `engine/session/record.ts:183` | `projectInstance()`（`engine/session/project.ts:923` 单例） | `engine/session/load.ts` `_sessionMessagesCache`（模块级 Map） |
| ② REPL useLogMessages | `useLogMessages` → `recordTranscript`（**`src/tui/utils/sessionStorage.ts:1413`** tui 本地体） | `getProject()`（`sessionStorage.ts:433` `new Project()` 第二实例） | `sessionStorage.ts:3806` `getSessionMessages = memoize(...)`（tui 本地缓存） |

- ① 在 `queryOneRound` 轮末 `void transcript.record([...messages, assistant, results])`
  写 assistant + tool_result。
- ② 在 REPL 每条 message 追加时 `recordTranscript` 写同一批 assistant message。
- 两者 `insertMessageChain` 各自走**各自 Project 实例** + **各自 messageSet**：
  ① 的 `messageSet.add(uuid)` 只更新 engine 缓存；② 的 tui 缓存从未见过该 uuid →
  判「new」→ 再次 append → **同一事件写两遍**。

**成因**：C-7「TUI 壳原样搬旧仓」带入了 tui 本地 `sessionStorage.ts`（含独立 `Project`
实例 + 独立 `getSessionMessages` memoize），与新 `src/engine/session` 域并存，二者从未收敛。

## 修复方向（专项波，非本波）

1. **收敛单写者**：让 tui `getProject()` 委托 engine `projectInstance()`（若 `Project`
   类同源），且 `insertMessageChain` 层去重 Set 单一（engine `_sessionMessagesCache`）。
   ② 的 tui 预过滤可留，最终 append 在 `insertMessageChain` 内对共享 Set 判 `isNewUuid`，
   双写即在写层消解。
2. **或删一写者**：主 session 由 useLogMessages 独占持久化，engine loop 的
   `transcript.record` 在 TUI 面裁为 no-op（注意 compaction / sidechain 写面不连带裁掉）。
3. **判别单测**：同一 assistant message 经两写者先后 `recordTranscript` → 断言 jsonl
   单行（mutation-red：修前双写、修后单写）。

**风险**：持久化关键路径（resume / sidechain / compaction / 远程），投机改造易炸，
故 0.1.9 不修、只记录。0.1.9 的 round-3「session 单行」信号在 R3 未修前**不达标**，
已如实记入发布说明。
