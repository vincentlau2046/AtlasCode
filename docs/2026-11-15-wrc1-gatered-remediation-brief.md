# W-RC1（0.1.112）GATE-RED 修形呈批书（呈 f4，Main lane 2026-11-15）

> 判定单：`user-e2e/reports/r-20261115-gate-112.md`（GATE-RED，格4 双面 RED）。
> 本呈批 = 预注册纪律（先呈批后落码）：GATE-RED 修形不改已批 lock-face 主体
> （形 α / 面 A 换源 / 面 B off / 容差双上界均维持），只对格4 双面呈修形。

## 0. 采证基座（Main 侧 wire 核验 + e2e tap 互证）

### 0.1 已定谳（双侧一致）

- **engine 计数器结构**：`turnOutputTokens` 为 `queryAgentLoop` 局部 `let`
  （loop.ts 入口单源），**中途不可能重置**；重置点仅 query 入口。
- **engine 内两支压缩都是同 query 续命**：
  - pre-turn autoCompact（loop.ts:796-849）：`buildPostCompactMessages` 换
    messages 后 while 循环继续，turns 递增，`compacted` 事件 `turn: turns`
    （:866，turns++ 后取值）。
  - reactive 413（loop.ts:908-947）：`continue` 重试本回合（不占新轮次），
    `compacted` 事件 `turn: turns`（:928）。
  - 两支都不产生新 queryAgentLoop。

### 0.2 tap 序列的隐藏自洽（Main 侧新发现，RED-1 改判候选）

```
req002 round_end turn=1 roundOut=788 cum=788   ← query A
engine compacted turn=1                        ← 只能是新 query 首回合的压缩
req003 round_end turn=1 roundOut=38  cum=38    ← query B r1
engine compacted turn=2
req005 round_end turn=2 roundOut=128 cum=166   ← 38+128 自洽 = 同 query B
engine compacted turn=3
req007 round_end turn=3 roundOut=26  cum=192   ← 166+26 自洽
engine compacted turn=4
req009 round_end turn=4 roundOut=70  cum=262   ← 192+70 自洽
```

req003/005/007/009 的 cum 连续自洽且 turn 1→2→3→4 递增 = **同一个主查询**
的 4 个 round。主查询内「compacted turn=2/3/4」（轮轮压缩）**零重置** ——
f4 终裁「压缩续命不重置」在主查询内**实际兑现**（正证）。

`compacted turn=1` 的 turn=1 取值（两支压缩都发 `turn: turns`，均在
turns++ 之后）= 主查询**首回合的 pre-turn autoCompact**（window=30k 场景
连 turn-1 也压缩）。初判的「query A→B 边界」假说经 g3e 补采否定——
788/654「主查询」本体 = turn-1 摘要 fork（终判见 §1.2 三重证据链）。

### 0.3 RED-2 污染面（比判定单更宽）

`queryEngineLoopStream` 调用方全集（grep 定谳）：

| 调用方 | 车道 | 是否应转写 |
|---|---|---|
| `src/tui/screens/REPL.tsx:2666` | 主查询（前台 spinner 数据源） | **是** |
| `src/tui/utils/forkedAgent.ts:568` | fork（compact 摘要 + subagent sidechain） | 否 |
| `src/tui/tasks/LocalMainSessionTask.ts:425` | 后台 main-session 任务 | 否（Task 面非前台 spinner） |
| `src/tui/(execAgentHook.ts)` | hook 车道 | 否 |
| `src/engine/tools/agent/runAgent.ts:156` | subagent（直调 queryAgentLoop，不经 loopEvents） | 否（天然不转写） |

摘要链直证：`streamCompactSummary`（contextBodies/compact.ts:1079）→
`runForkedAgent`（forkedAgent.ts:488）→ `queryEngineLoopStream` → 同一
loopEvents emit 回调 `setTurnOutputTokens` → bootstrapState 单例覆写。
**全部 fork/hook 消费者同污染**，不止摘要。

## 1. 修形呈批项

### 1.1 RED-2（真缺陷，修形项 A）：转写面主车道 opt-in 守卫

**形**：`queryEngineLoopStream` options 加性可选字段
`transcribeTurnTokens?: boolean`（缺省 **false = fail-closed**）。
loopEvents.ts emit 回调 round_end 分支的 `setTurnOutputTokens` 调用改为
门控（`if (opts.transcribeTurnTokens)`）。唯一置真点 = REPL.tsx:2666 主链。
其余 4 调用方零改动（缺省不转写）。

- 引擎零改动（round_end.turnOutputTokens 字段照发，消费面收敛到主车道）。
- 面 A 两锚读出面（getTurnOutputTokens）不变——fork 期间计数器保持主查询
  最后累计值（spinner 不再被 800 覆写，主累计连续）。
- 判别格 ④（wrc1-turn-token-chain.test.ts）随形更新：补「缺省不转写 +
  置真转写」双腿；源级守卫补「仅 REPL 置真」断言。
- **lock-face 关系**：切片 1 已批形（loopEvents 无条件转写）在本项处修订，
  其余批项零触碰。

### 1.2 RED-1 定谳：整条撤销（g3e 边界补采 + Main 侧源图终判）

e2e g3e 补采（loop_start/loop_end 全账本）+ Main 侧调用方源图终判：
**g3d/g3e 压缩腿全程只有 ONE 个主查询 + 其 4 个 turn-1…4 pre-turn 压缩
摘要 fork；不存在第二个主查询，不存在任何 query 内重置。**

g3e 账本逐行解码（Main 侧终判）：

```
loop_start msgs=6                        ← 主查询（REPL.tsx:2666 主链）入口
loop_start msgs=8                        ← turn-1 pre-compact 摘要 fork 入口
round_end turn=1 roundOut=654 cum=654    ← fork#1 r1（maxTurns=1 纯文本）
loop_end                                 ← fork#1 收束
compacted turn=1                         ← 主查询 turn-1 pre-compact 完成
round_end turn=1 roundOut=38  cum=38     ← 主查询 r1（自身计数器从 0 起 = 正确）
loop_start msgs=9 / 750 / loop_end       ← turn-2 fork#2
compacted turn=2 / r2 128 cum=166        ← 主查询累计自洽
loop_start msgs=10 / 800 / loop_end      ← turn-3 fork#3
compacted turn=3 / r3 52  cum=218
loop_start msgs=10 / 758 / loop_end      ← turn-4 fork#4
compacted turn=4 / r4 43  cum=261
loop_end                                 ← 主查询收束
```

fork 身份证据链（三重）：
1. **时序**：msgs=8 loop 恰落在主 loop_start 与 `compacted turn=1` 之间 =
   turn-1 pre-compact 的 compactConversation→streamCompactSummary 窗口。
2. **messageCount 算术**：fork input = `[...forkContextMessages,
   ...promptMessages]`（forkedAgent.ts:523）+ userContext 前置消息
   （forkedAgent.ts:59）。主输入 6 → turn-1 fork = 6+1+1 = **8** ✓；
   turn-2/3/4 fork = 9/10/10 ✓（随 post-compact 上下文逐 turn 增长）。
   g3d 的 788（旧 tap 误标「主查询 r1」）同为 turn-1 fork。
3. **形状**：runForkedAgent maxTurns:1 + createCompactCanUseTool 全 deny
   （compact.ts:1064）→ 单轮纯文本 finish_reason=stop 零 tool_calls ✓。

**结论**：
- f4 终裁「压缩续命不重置」在活链**全程兑现**（主查询内 4 次 pre-turn
  压缩，cum 38→166→218→261 零重置）——格4 RED-1 撤销。
- g3d「主查询 cum=788 → 续命 cum=38 清零」的现象本体 = **fork 计数器与
  主查询计数器交叉写同一 bootstrapState 单例** = RED-2 的普遍形（不止
  「摘要覆写」一例：turn-1 fork 在主 r1 之前写 654/788，被误读为主查询
  累计、其后再误读为「清零」）。
- 落码面只剩 §1.1 转写守卫一项；e2e 判据补「query 边界/身份 =
  loop_start/loop_end 事件定界」条款（g3e 基建已在）。

### 1.4 复gate 判据

- 修形后同形压缩腿（window=30k）+ g1 无压缩回归腿（e2e 已承诺，不必全量）。
- 格4 判据面（RED-1 撤销版）：主查询累计连续性（fork round_end 前后
  bootstrapState 读数不变 = 摘要不覆写）+ query 身份按 loop_start/loop_end
  定界（g3e 基建已在）；主查询内 pre-turn 压缩零重置（f4 终裁正证延续）。
- 格1/2/3 回归零变（修形不触碰 engine 聚合与面 A 换源）。

## 2. 落码面预估

| 项 | 文件 | 性质 |
|---|---|---|
| §1.1 | `src/tui/loopEvents.ts`（门控）+ `src/tui/screens/REPL.tsx:2666`（置真） | 加性可选字段，fail-closed |
| §1.1 | `tests/unit/wrc1-turn-token-chain.test.ts`（④ 改双腿：缺省不转写 + 置真转写）+ `wrc1-face-a-resource.test.ts`（源级守卫补「仅 REPL 置真」断言） | 判别格随形 |
| §1.2 | 零落码（RED-1 撤销改判 + e2e 判据条款） | — |
