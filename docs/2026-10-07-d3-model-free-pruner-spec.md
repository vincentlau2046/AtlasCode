# 2026-10-07 D3 无模型剪枝层 spec（P2 恢复层 ②，Q2 裁定 = 0.1.37 spec 先行）

> **状态**：**spec-only（本波 0.1.37 切片③ 只落本文档，不实施）**。实施 = 0.1.37+（Q2 裁定）。
> **权威**：用户 2026-10-07 上午 P2 §7 六问 Q2 裁定 + P2 评估报告 `docs/2026-10-07-p2-compaction-evaluation.md`（§3-B deepseek pruner 参照 / §4 推导 2-3 / §5 D3 行）。
> **定位**：断路器跳闸（摘要 LLM 连续 3 败永久短路，见 P2 §2 C1/C2）后的**最后防线**——唯一**不依赖 LLM** 的 413 恢复层（P2 §4 推导 2：反应式压缩 C3 委托 LLM 摘要，摘要坏时反应式也坏；pruner 确定性字符预算，模型免费）。

---

## §1 为什么需要无模型层（问题边界）

- 断路器跳闸的**定义** = 摘要 LLM 连续失败（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES=3`，`autoCompact.ts:57`）。
- D1 反应式压缩（已落 0.1.37 切片③）委托 `compactConversation`（LLM 摘要）→ **摘要坏时反应式也坏**（`tryReactiveCompact` 返回 null → 回显原始 413，已登记回落）。
- 断路器场景下，输入本身超窗（B 类 400「Prompt is too long」，P2 §4 推导 1）且摘要 LLM 不可用 → **D1 恢复失败**。
- **唯一剩余恢复通道 = 不依赖 LLM 的确定性缩减**（pruner：超预算工具结果截断）= 本 spec 对象。

## §2 参照源（deepseek-harness `compaction-tool-result-pruner`，全部本地可回源）

| 组件 | 语义 | 本 spec 采纳 |
|---|---|---|
| `DEFAULTS` | `{thresholdChars:8192, headChars:4096, tailChars:1024}` | 超 8192 字符的工具结果 → 保头 4096 + 尾 1024 + `PRUNE_MARKER`（`…[pruned N chars]…` 族占位） |
| 操作面 | **发送面（surface）**：`freezeMessage` 快照，**不改存储**（jsonl/transcript 原文保留） | 同——剪枝只改「本次发给 LLM 的消息面」，持久存储不动（replay 可回溯） |
| **tool-pairing 平衡不变量** | 选压缩范围时**不断开 tool_use/tool_result 对**（`toolPairingBalancedBefore/After`）= replay-safety 核心 | **硬性不变量**（§4 不变量表）——剪枝后任意前缀的 tool_use 必有配对 tool_result 可达 |
| `PrunedEntry` 审计 | `{originalSeq, replacementSeq, callId, charsBefore, charsAfter}` | 每条剪枝留审计记录（可追溯哪个 callId 被剪、剪前/后字符数） |
| shadow-price 事件 | `compaction/summary` 记录 `shadowedTokenCount`，替换与计量事件相邻可配对 | 复用核心 compaction 事件协议；剪枝事件与 token 计量事件相邻（可审计缓存代价） |
| 触发语义 | 确定性、无 LLM、非热路径 | **最后防线、低频触发**（只在 D1 LLM 恢复失败后），**非每回合热路径**（§5 KV-cache 代价披露的前提） |

## §3 触发链（与 D1/D2 的层序）

```
provider 413/PTL（B 类输入超窗）
  → [D1 反应式压缩] tryReactiveCompact（LLM 摘要）
      成功 → buildPostCompactMessages 重建 + 本回合重试（已落 0.1.37 切片③）
      失败/摘要 LLM 坏（断路器跳闸态）
        → [D3 无模型剪枝]（本 spec，0.1.37+ 实施）
            超预算工具结果确定性截断（tool-pairing 平衡）
            → 重发（输入面缩小）→ 恢复
  → 剪枝后仍超窗 → 回显原始 413（无恢复，用户出口 = D2 跳闸态文案：手动 /compact·换小模型·新会话）
```

**层序原则**：D3 只在 D1（LLM 恢复）失败后触发 = 低频；不改成每回合预剪（§5）。

## §4 tool-pairing 平衡不变量表（replay-safety 核心）

剪枝选择保留/截断范围时，必须满足（**replay 等价性 = 剪枝前后 API 请求面 tool 配对一致**）：

| 不变量 | 含义 | 违反后果 | 验证面 |
|---|---|---|---|
| I1 | 任意 `tool_use`（assistant）的配对 `tool_result`（user）**要么都在发送面、要么都不在**——剪枝**不得**截断成「有 use 无 result」或「有 result 无 use」 | replay 时 LLM 见到孤立 tool_result/tool_use → 400 配对错误（API 强校验） | replay 等价测试：剪枝后序列过 API 配对校验器 |
| I2 | 剪枝以 **API-round 组**（`groupMessagesByApiRound`，P2 §2 C4）为最小单位——整轮剪或不剪，不剪半轮 | 半轮截断破坏 tool 对 | 单测：剪枝边界必落在 round 组界 |
| I3 | 截断的是**工具结果正文**（content 超长串），**不删消息骨架**（tool_use 块 + 配对 tool_result 块结构保留，仅正文换 PRUNE_MARKER） | 删骨架 = 破坏 I1 | 单测：剪枝后 tool_use/tool_result 块数守恒 |
| I4 | `PrunedEntry` 的 `callId` 必须对应存活的 tool_use id（剪后仍可回指） | 审计断链 | 单测：PrunedEntry.callId ⊆ 剪后存活 callId 集 |

## §5 KV-cache 代价披露（诚实，裁定需知情——P2 §4 推导 3）

- 剪枝/压缩**改写旧消息** → **前缀缓存失效**（改写点在缓存前缀内 = 整段 prefix cache 作废，下次全量重算）。
- pruner 操作**发送面**（不改存储）+ **最后防线低频触发**（只在 LLM 层失效后）→ 缓存代价**可接受**（低频事件，非每回合付缓存重建成本）。
- **范围锁「最后防线、非热路径」**：若改造成**每回合预剪**（热路径）→ 每回合都改写旧消息 → 前缀缓存**每回合失效** → 缓存成本不可接受 → **spec 明确排除热路径化**（实施 0.1.37+ 时若有人提议热路径化，须重开本裁定）。

## §6 DEFAULTS 值（deepseek 参照，实施起点，非终值）

```
thresholdChars = 8192   // 超此字符数的工具结果才剪
headChars      = 4096   // 保头部 4096 字符
tailChars      = 1024   // 保尾部 1024 字符
// 中间 = PRUNE_MARKER 占位（…[pruned N chars]…）
```
> 实施 0.1.37+ 时按本仓模型/工具实测调参（deepseek 值 = 起点，非本仓最优）；调参须过 §4 不变量表 + §7 replay 等价测试。

## §7 验收判据（实施 0.1.37+ 时，对齐 P2 §6 D3 行）

1. **replay 等价测试**：剪枝前后 API 请求面等价性（tool-pairing 校验器，§4 I1–I4 全覆盖）。
2. **无 LLM 场景 413 恢复**：mock 摘要 LLM 全败（断路器跳闸）+ 输入超窗 → pruner 触发 → 回合存活（区别于 D1 的 LLM 恢复路径）。
3. **413 恢复成功率 telemetry**（D3 毕业判据前置，Q5 登记）：本仓无 `atlas_*` 遥测面 → **登记最小事件**（剪枝触发/成功/回显 413 三类计数事件），对齐 vault 毕业判据「reactive compact 的 413 恢复成功率 ≥ 阈值（telemetry 确认）」。
4. **一个 release cycle 稳定期**（vault 毕业判据）。

## §8 与 D1/D2 的关系（收口 = 断路器场景完整核销）

- **D1+D2（已落 0.1.37 切片③）**：覆盖「摘要 LLM 健康但 413 竞态 / media 错误」场景（反应式压缩 + 用户面跳闸态 + 模型侧告知）。
- **D3（本 spec，0.1.37+ 实施）**：覆盖「摘要 LLM 坏（断路器跳闸）」场景（唯一无 LLM 恢复层，P2 §4 推导 2）。
- **断路器场景完整核销 = D1+D2+D3 全落地**（P2 §6 末行）。D3 是本 spec 的收口件；本波只落 spec（Q2），实施随 0.1.37+ 排期。
