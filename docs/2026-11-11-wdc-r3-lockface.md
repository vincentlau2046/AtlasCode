# W-D-C 段 R3 lock-face 文书（agentNameRegistry 死态裁除）@ R1 后 a3edd4e3

> row F 预注册纪律：本文书 = 段 R3 落码前的判据面冻结，先于落码报 f4 批复。
> 勘察对象：`agentNameRegistry` 全仓引用面，R1 后 a3edd4e3 实测。
> 段 R2 评估否决实码归档见 §0（工单 §6.3 要求，随本文书一并留档）。

## §0 段 R2 窄门面回收评估否决——实码归档（闭环）

工单 §3 R2 预注册支「不放行 = 段收缩为评估否决，数据留档即闭环」。实码取证
（2026-11-11，worktree wdc-0.1.95 探针后已清、工作树净）：

```
$ npx eslint src/tui/  # 探针：tui→src/engine/messaging 深路径直 import
src/tui/...: error  boundaries/entry-point: No rule allows the entry point
'messaging/index.ts' in dependencies of type 'engine'   # exit 1
```

判定：tui→engine/messaging 窄门面（TeamSendMessage 单源回收方向）被 lint
boundaries 判据面**结构性不放行**（engine 域依赖表无 messaging entry-point
授权）。按预注册支：R2 收缩为评估否决，零落码；否决实码（上）+ 裁定留档。
f4 预判「纯评估面否决 = f4 数据留档自决闭环」适用，本 § 即数据留档。

## §1 引用面分账（工单 §94 表，R1 后复核零漂移）

| 分账 | 站点 | 形态 |
|---|---|---|
| **活读 4** | ① `src/tui/components/CoordinatorAgentStatus.tsx:37,66`（selector + 反查 inv Map→name prop）② `src/tui/components/PromptInput/useSwarmBanner.ts:113`（named_agent 反查）③ `src/tui/hooks/useTypeahead.tsx:612`（@名补全迭代）④ `src/tui/tools/SendMessageTool/SendMessageTool.ts:112`（resolveAgentId 兜底链首查） | 运行时读 |
| **init 2** | `src/tui/state/AppStateStore.ts:484` / `src/tui/main.tsx:2382` | `new Map()` 初始化 |
| **本体 1** | `src/tui/state/AppStateStore.ts:164`（类型字段 + :162 注释） | 状态字段声明 |
| **注释 1**（engine sendMessageTool 5 处全注释级） | `src/engine/tools/team/sendMessageTool.ts:48,55,88,347,356` | 残留守注释 |
| 测试面（不动） | `tests/unit/wdb-c2-sendmessage-single-source.test.ts:78` 注释级 | tests 桶 |

## §2 恒空复核（工单防「条件分支例外」要求）

**写面实证：全仓零写**。grep `agentNameRegistry.set|.delete|.clear|下标赋值`
于 src/ = 0 命中（a3edd4e3 实测）。字段注释「populated by Agent tool when
name is provided」= 上游残留语义（AtlasCode Agent tool 注册链未接，engine
sendMessageTool 头注自证「接线点随 TUI 波」登记在案）→ **registry 恒为空
Map**，非「多数时候空」。

**活读 4 空态即现行为（零行为变更成立，逐个）**：

1. **SendMessageTool:112** `appState.agentNameRegistry.get(name) ?? toAgentId(name) ?? undefined`——首查恒 undefined → `toAgentId(name) ?? undefined` 恒等。裁形：删首查，保留兜底链。
2. **useTypeahead:612-620** 迭代体恒零贡献（空 Map 零轮）。裁形：整块删除；`members` 其余来源（teamContext.teammates 循环，L600-611）不动——typeahead 队友名补全本就只来自 teamContext（registry 补全从未生效过，工单已登记）。
3. **useSwarmBanner:113-119** `name` 恒 undefined → 恒回落 `task.description`。裁形：删遍历，直接 `text: task.description`。
4. **CoordinatorAgentStatus:37,66-68,73** `inv` 恒空 → `nameByAgentId.get(task.id)` 恒 undefined。裁形：删 selector + useMemo，`name={undefined}` 直传（AgentLine name prop 可选，undefined 恒等）。

**条件分支例外排查：通过**。4 读面均无「仅 registry 非空才可达」的分支；
空态即现行为，裁除零行为变更。

## §3 AppStateStore 状态形判别（工单 §94 判别格要求）

- **序列化/持久化/快照面：无**。grep `persist|dehydrate|localStorage|writeFileSync` 于 `src/tui/state/` 仅命中注释（「NOT persisted」自述）；AppState = 进程内 useSyncExternalStore 活态，session resume 不回放 AppState → 字段裁除**无 dangling schema 面**。
- 结构克隆/DeepImmutable 面：Map 字段随对象字面量裁除，无独立投影（grep `agentNameRegistry` 于 src/tui/state/ 仅 :164/:484 两点，§1 分账一致）。
- **AgentId import 孤儿面**：AppStateStore.ts:27 `import type { AgentId }`——删字段后 :330/:333 leadAgentId/selfAgentId 仍用 AgentId（同文件），import 不孤儿，不动。

## §4 落码清单（预注册）

| 文件 | 动作 |
|---|---|
| `src/tui/state/AppStateStore.ts` | 删 :162-164 类型字段 + 注释；删 :484 init |
| `src/tui/main.tsx` | 删 :2382 init 行 |
| `src/tui/tools/SendMessageTool/SendMessageTool.ts` | :112 删 registry 首查，保留 `toAgentId(name) ?? undefined` |
| `src/tui/hooks/useTypeahead.tsx` | 删 :612-620 registry 迭代块 |
| `src/tui/components/PromptInput/useSwarmBanner.ts` | 删 :110-119 遍历，直落 `task.description` |
| `src/tui/components/CoordinatorAgentStatus.tsx` | 删 :37 selector + :64-68 useMemo；name prop 直传 undefined（编译态最小删改） |
| `src/engine/tools/team/sendMessageTool.ts` | 5 处注释更新为 R3 销项登记（消除悬空符号引用，判别格零命中前提） |

## §5 判别格（预注册）

1. **符号零命中**：`grep -r "agentNameRegistry" src/` = 0 命中（字面级，含注释；工单「全仓 specifier 解析零命中」的字段形态落地——registry 是 AppState 字段非模块 specifier，字段符号字面零命中为准）。
2. **wdb-c3 回归**：0.1.94 C-2/C-3 判别格（SendMessage 单源 + backends 单源）不回红。
3. **SendMessage resolveAgentId 兜底链回归**：toAgentId 兜底行为判别（现有 C-2 判别测试覆盖面不缩）。

## §6 处置

f4 批复 → 依 §4 落码 → 判别格 RED→GREEN → 四件套 → 段 G gate（e2e lane）→ 段 L release 0.1.95。
