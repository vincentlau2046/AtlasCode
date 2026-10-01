# E2E 晨间速览（r-20261001-0405，@atlasharness/atlascode v0.1.2 @ f6b9803）

> 全量跑测 2026-10-01 04:05 → 07:43 CST 完成（6 个 2h 段，checkpoint 续跑）。
> **96 case：PASS 8 / FAIL 7 / TIMEOUT 1 / STUCK 80。**
> 用户主诉「只有首条消息有响应、后续无响应、核心 loop 不稳定」得到完整解释，
> 由四个叠加缺陷构成（P0-A / P1-A / P0-B / P1-C，见 `diagnosis-deep.md`）。

## 先读文件

| 文件 | 内容 |
|---|---|
| `README.md`（本文件） | 速览 + 修复优先级 |
| `diagnosis-deep.md` | **根因级定位**（已实证复现 + 代码锚点 + 分层校准）← 下轮开发重点输入 |
| `report.md` | 用户侧完整测试报告（逐 case 表格） |
| `diagnosis.md` | 自动粗分类定位（L2(88) 为粗归，**以 diagnosis-deep.md 分层校准为准**） |
| `summary.json` | 机器可读汇总 |
| `../artifacts/r-20261001-0405/` | 全部证据（checkpoint / pty 转录 / stream-json / 计时） |

## 分 tier 结果

| tier | 结果 | 判读 |
|---|---|---|
| gate | 1 PASS | 网关 200，settings 角色池正常 |
| core | 2 PASS / 2 FAIL | core-1 基本多轮通（4/4 marker）；core-2 = **P0-B resume 空池假阴性**；core-3 = P1-C 工具 0 调用；core-4 流式中排队正常 |
| slash（83） | 2 PASS / 1 TIMEOUT / 80 STUCK | STUCK 全部同签名：45s 探针窗内输入回显始终未出现（**P1-A 渲染冻结/输入门控**）；仅 /exit、/rewind PASS；/stickers TIMEOUT（连续动画）；tasklist、logout 2 条探针立即无回显（疑 session 早死，待定性） |
| short | 2 PASS / 2 FAIL | marker/multiturn 双驱动 PASS；filewrite/tool-read FAIL = **P1-C**（模型 0 工具调用、声称成功、磁盘无产物） |
| medium | 2 FAIL | fixbug/feature 双驱动 **tools=0 次**，fixture 测试不通过（磁盘 ground truth） |
| long | 1 FAIL | 5 轮全文本回合，工具 0/25，无 commit |
| soak | 1 PASS | 10/10 轮 marker 无漂移，时延 3.2–5.6s/轮（loop 稳定面 OK） |

## 修复优先级（下轮）

1. **P0-A（L1，确定性）**：慢节奏键入 slash 命令时 Enter 被双门吞掉
   （`useTypeahead.handleEnter` 无选中静默 no-op + `PromptInput` L1005 早退；
   自动选中 `selectedSuggestion=0` 在实测路径未生效，疑被 L443/463/553/580/762
   的 `-1` 重置分支覆盖）。修复：定位重置点 + Enter 兜底「提交当前输入文本」
   + 补单测。确定性复现：逐字符 1.2s 间隔打 `/context` → Enter（`slow.log`）。
2. **P1-A（L1，间歇，用户面"死屏"主因）**：渲染管线冻结数十秒~百秒、输入排队、
   冻结结束批量补渲染。嫌疑排序：turn-busy 旗标未复位（`queueProcessor.ts` /
   messageQueueManager，注释自陈 "queued user prompt stalls permanently"）>
   ink 渲染循环掉帧 > useInputBuffer 门控。sweep 80/83 STUCK 即此签名。
3. **P0-B（L3）**：headless `--resume` 续轮命中 `No models configured for role
   'premium' (empty pool)` 假阴性且 session_id 变化（未附着）；对照全新 `-p`
   premium 正常 ⇒ restore 车道池装载/healthCheck 漏装。影响所有跨进程续接。
4. **P1-C（0 tool_use，6/6 fixture 复现，根因待定位）**：任务面零 tool_use 事件、
   引擎报 success、磁盘证伪。⚠️ **不预设模型能力——Qwen38-27B 具备工具调用能力**。
   待定位：tools 注入链（bundle.tools/getBaseToolEntities）/ IFF 网关透传 / 引擎解析回传。
5. **P2**：/ant-trace "Unknown skill"（命令清单与 skill 注册表失同步）；
   tasklist/logout 2 条 session 早死待定性（查 artifacts 的 slash-pty 转录）。

**澄清（防误判）**：IFF `Qwen38-27B-TXT 200 0/0 1ms` 行 = 健康探针正常形态
（F4），不是 chat 通道故障。

## 重跑方式（指定测试，非开发必测项）

```bash
bun run user-e2e/run.ts --tier all          # 全量（约 3.5h，6×2h 段）
bun run user-e2e/run.ts --resume <runId>    # checkpoint 续跑
bun run user-e2e/regen-report.ts <runId>    # 仅从 checkpoint 重建报告（不重跑）
```

隔离：全部 I/O 在 `user-e2e/` 内（沙箱 HOME `user-e2e/home/<runId>`，真实
`~/.atlas` 零写入，`/heapdump` 落沙箱已验证）。产物不自动 commit（保持 untracked）。

## 本次 harness 已知注记

- 无 marker 用例（short-filewrite / short-tool-read）的 pty 驱动旧版误等字面量
  "undefined"（本次 2 条记录的 pty 细节含此噪声）；**verdict 不受影响**
  （断言面 = 磁盘 ground truth + headless toolUses），run.ts 已修复（等 settle），
  下次重跑生效。
- sweep 探针窗经历 12s→60s→45s 三段修正（渲染滞后 12–100s+，短窗误判 STUCK），
  45s 为最终值，probeMs 已逐条记入 evidence。
