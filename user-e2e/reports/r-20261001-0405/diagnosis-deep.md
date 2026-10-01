# AtlasCode E2E 深度定位补充（r-20261001-0405）

> 本文件是自动生成的 `diagnosis.md` 的补充：自动报告给出分层归类与证据链，
> 本文件给出**已实证的根因级定位**（含确定性复现与代码锚点）。
> 初版 2026-10-01 05:10 CST；全量跑测 07:43 CST 完成后，按最终 96 条 checkpoint
> 回填 sweep 数据、新增 P1-C（任务面 0 tool_use）并校准分层（见文末各节）。
> ⚠️ 2026-10-01 定性更正：P1-C 初版误判为"弱模型能力缺陷"，已更正为"根因待定位"（见 P1-C 节）。

## 一句话结论

用户报障「首条消息有响应、后续无响应、核心 loop 不稳定」由**四个叠加缺陷**解释：
① 慢节奏键入 slash 命令时 Enter 被 suggestions 下拉守卫吞掉（确定性，P0）；
② 渲染管线会整体冻结数十秒至上百秒，期间输入排队、屏幕无任何输出（间歇，P1，
表现即"界面无响应"；sweep 80/83 命令 STUCK 即此签名）；
③ headless `--resume` 续轮车道命中空池假阴性
（`No models configured for role 'premium' (empty pool)`，P0/L3）；
④ 任务面 0 tool_use：stream-json 零 tool_use 事件、引擎回报 success、磁盘证伪任务未发生
（6/6 fixture case 复现，P1-C；**根因待定位——不预设模型能力，Qwen38-27B 具备工具调用能力**）。
IFF 网关健康探针 200/0-0/1ms 属正常（F4），不是 chat 通道故障。

---

## P0-A 慢输入 Enter 被吞（suggestions guard）— 确定性复现

**用户可见症状**：以人类节奏（≥0.5s/字符）键入 `/context`（或任何 slash 命令），
按 Enter 后**无任何反应**——命令不执行、不报错、不渲染；输入框滞留
`/context…` 文本，命令菜单浮层保持打开；需先按 Esc 才能恢复。
快速粘贴/批量输入（harness 单次 write）则可能穿透（竞态：suggestions 状态尚未
建立时 Enter 直接提交），表现为**时好时坏**。

**确定性复现**（已跑通，证据 `user-e2e/workspaces/r-20261001-0405/slash/slow.log`）：
```
REPL 就绪 → 逐字符慢打 / c o n t e x t（间隔 1.2s）→ Enter
→ 等待 14s+：无 "Context Usage" 面板、无任何新渲染
→ Esc → 探针键入 → 回显出现（输入面存活，命令菜单被 Esc 关闭）
RESULT panel=False
```
对照：同一 TUI 以单次 write 发 `/context\n`（批量），命令执行成功
（artifacts session-8：`Context Usage` 面板渲染）。

**代码锚点与机制**（双门静默吞 Enter）：
- 门 1（`src/tui/hooks/useTypeahead.tsx` `handleEnter`，"Handle enter key press"）：
  `if (selectedSuggestion < 0 || suggestions.length === 0) return` —— 无选中/无建议时
  Enter 静默 no-op；有选中才走 `applyCommandSuggestion`（补全 + 以
  `isSubmittingSlashCommand=true` 提交，见 commandSuggestions.ts:536）。
- 门 2（`src/tui/components/PromptInput/PromptInput.tsx` L1005-1008）：
  `onSubmit(input, isSubmittingSlashCommand=false)`，Enter 主路径（L1563）不传 flag →
  下拉可见时早退（注释 "user needs to clear suggestions first"）。
- 矛盾点：useTypeahead 在生成命令建议列表时**有自动选中首项**
  （L777 `selectedSuggestion: commandItems.length > 0 ? 0 : -1`），按此 Enter 应能
  确认首项提交；但慢输入实测 Enter 无动作 ⇒ 自动选中在实测路径未生效
  （疑似被后续更新分支重置为 -1，L443/463/553/580/762 多处 `selectedSuggestion: -1`，
  或 Enter 时刻内部 suggestions 与渲染态不同步）。需下轮用 debug 日志定位具体重置点。

**逃生路径**（当前可用但反直觉）：↑/↓ 手动选中后 Enter；或 Tab（typeahead 补全
路径传 flag=true）；或 Esc 关下拉再 Enter。

**影响**：所有 slash 命令的常规人类输入路径（打字后直接 Enter 的自然操作）。
用户表现为"命令没反应"，且输入框残留文本会污染后续输入（与 P1-A 的输入队列
行为叠加后更难恢复）。

**修复方向**（下轮）：① 定位自动选中被重置的具体分支，保证命令下拉恒有选中项；
② Enter 兜底行为改为「提交当前输入文本」（slash 命令走 handlePromptSubmit 文本面），
禁止静默 no-op；③ 补单测：「输入 `/context` + 下拉可见 + Enter ⇒ 命令执行」。

---

## P1-A 渲染管线冻结 / 输入排队延迟（L1，间歇，用户面"死屏"）

**用户可见症状**：TUI 进程存活、CPU≈0，但屏幕数十秒至上百秒无任何输出
（连 footer 12s 提示轮转都停），期间键入的字符不进入输入框（被排队），
冻结结束后**批量补渲染**（滞留输入 + 多轮 footer 提示一次性刷出）。
用户感知 = 界面卡死、输入无响应，与"后续消息没响应"主诉一致。

**实证数据**（本 run）：
| 场景 | 证据 | 延迟 |
|---|---|---|
| sweep session-8（/context 执行成功） | 探针回显写入时刻晚于探针 12s 窗（footer 12s tick 间批量冲刷，`slash-pty-8.log` 探针行位于 /help 与 /clear 轮转之间） | ~13s+ |
| 复现 v2（/context 未提交，命令菜单滞留） | master 零输出 75s，进程 ep_poll 空闲（`stall2.log.events.json`） | 75s+ |
| 续跑 add-dir session | `probeMs=60001`（60s 窗内无回显）；回显在 ~110s 处与多轮 footer 批量同刷（`slash-pty-1.log` 尾部：probe/r1q/r2 三行连续 + 6 轮 footer 提示） | ~100s |
| core-3（LLM 工具回合） | 300s 内 footer 持续轮转但 marker 仅 1/2（输入回显、无 assistant 渲染、磁盘无产物） | 300s 超时 |

**嫌疑代码区**（按嫌疑度排序）：
1. **turn-busy 旗标未复位**：local-jsx 命令（如 /add-dir）执行后，输入队列门控
   （`src/tui/utils/queueProcessor.ts` / `messageQueueManager`，注释已自陈
   "queued user prompt stalls permanently" 风险）进入 busy 态未清 → 输入排队、
   回显抑制，直到某超时/定时事件复位（观测到的 ~100s 批量冲刷即复位时刻）。
2. **ink 渲染循环掉帧**：footer 12s tick（`useDynamicTips` ROTATION_MS=12000）
   是唯一驱动屏幕写入的状态源 ⇒ 输入 state 更新未被逐键 flush，被合并到下一次
   定时渲染；若 React 渲染被某长任务/异常吞掉，则整段冻结。
3. `useInputBuffer` / `PromptInput` 输入门控（streaming/queued 判定误判 local 命令后为 busy）。

**诊断建议**（下轮修复时验证）：在 `queueProcessor.processQueueIfReady` 与
turn 状态机加 debug 日志（busy 进入/离开时刻），复现时对齐屏幕冻结窗口；
并对 local-jsx 命令 onDone 路径审计 busy 旗标复位。

---

## P0-B headless `--resume` 续轮空池假阴性（L3）

**证据**（core-2，checkpoint）：同 session 两轮 headless，r1 成功（223ms），
r2 返回 `No models configured for role 'premium' (empty pool)` 且 **session_id
变化**（未附着原会话），进程 exit 0。
**对照实验**：全新 `-p`（不 resume）指定 premium 角色可正常出回合 ⇒ 角色池本身
非空，故障在 **resume/restore 车道的池装载**（与 `cli.ts` G-α 记录的
空池假阴性同形：healthCheck/端点装载在恢复路径漏装，池被误判为空）。
**影响**：所有跨进程续接会话（`--resume`、TUI /resume）的后续 LLM 回合。
**修复方向**：restore 路径复用首轮的角色池装载/healthCheck 结果；
空池错误在恢复车道须回退全池重装而非直接报 empty。

---

## P1-B core-3 工具回合"挂起"（原判 L2/L3/L4 未决 → 现归入 P1-C）

原判断：301s 超时无 assistant 输出、磁盘无 `out/hello.txt`，footer 正常轮转
（UI 活、LLM 车道死），疑与 P0-B 同车道族（空池/挂起）。

**回填修正（全量跑完后）**：fixture 任务族（short-filewrite / short-tool-read /
medium-fixbug / medium-feature / long-multistep / core-3）呈现**完全一致的签名**——
stream-json 零 tool_use 事件 + result=success + 磁盘无产物（P1-C，6/6 复现）。
core-3 的"301s 无输出"最可能就是同一现象：模型以纯文本回合作答（未调工具），
marker 2 与磁盘产物永不到来，harness 等到超时。本案**无独立 L2/L3 证据**。
处置（定位阶段）：查 tools 注入链（headless bundle.tools / getBaseToolEntities）
+ 抓 IFF 原始 chat 请求/响应确认 tools 字段是否注入、模型是否返回 tool_calls
（不预设模型能力——Qwen38-27B 具备工具调用能力）。

---

## 次要项

- `/ant-trace`：报 `Unknown skill: ant-trace`（不在 live 53 命令注册表；TUI 存活，
  优雅降级）。命令定义引用的 skill 缺席 ⇒ 命令清单与 skill 注册表失同步（P2）。
- `/heapdump`：手动 dump 正常落 HOME（本 harness 沙箱 HOME 内，隔离验证通过）。
- IFF `Qwen38-27B-TXT 200 0/0 — — 1ms` 行：健康探针/`/v1/models` 正常形态（F4），
  不得读作 chat 失败；仅失败时刻重叠的 chat 回合 0-token 计 L4。

## 复现配方（下轮验证用）

```bash
# P0-A 确定性复现（慢输入 Enter 吞）
#   用 user-e2e/lib/pty-driver.py 起 TUI（沙箱 HOME），REPL 就绪后
#   逐字符 1.2s 间隔键入 /context → Enter → 14s 内无 Context Usage 面板
# P1-A 渲染冻结（批量输入首命令后观察 footer 是否 12s 轮转 / 探针回显延迟）
# P0-B resume 空池
bun run src/atlascode/cli.ts -p --output-format stream-json --verbose \
  --resume <session_id> '回复且仅回复标记词：X'   # 预期命中 empty pool
```

## P1-C 任务面 0 tool_use（现象记录，根因待定位）— 全量跑测新发现

> ⚠️ **定性更正（2026-10-01）**：本节初版误判为"弱模型工具调用遵循率 0%、
> 模型能力面缺陷"。用户指正：**Qwen38-27B-TXT 不是弱模型，具备工具调用能力**。
> 故 0 tool_use 的根因不在模型能力，而在**引擎→模型的工具定义注入链或工具执行回路**
> （tools 是否正确装入请求、tool_use 块是否被解析/执行/回传）。下列为客观现象记录，
> 不预设根因，待定位阶段查证。

**症状**：所有需要工具执行的 fixture 任务，stream-json 中 tool_use 事件为 0，
引擎回报 `result=success is_error=false`，磁盘 ground truth 证明任务未发生。

**复现**（6/6 fixture case，checkpoint 证据）：
| case | 结果 | 关键证据 |
|---|---|---|
| short-filewrite | FAIL | headless `result=success tools=[] disk=false`（4.2s）；pty 无 marker、磁盘无文件 |
| short-tool-read | FAIL | 同上（5.3s，tools=[]，disk=false） |
| medium-fixbug | FAIL | 双驱动 tools=0 次，fixture `node test/run.js` 不通过（磁盘 ground truth） |
| medium-feature | FAIL | 同上（headless 49.7s，tools=0 次，test=false） |
| long-multistep | FAIL | 5 轮 LLM 全部文本回合，工具 0/25 预算，无 commit（7.3s 即"完成"） |
| core-3 | FAIL | 工具回合 marker 1/2、磁盘无产物（原判 P1-B 挂起，现归入本族，见上节） |

**待定位的候选路径**（不预设结论，仅列排查方向）：
1. **tools 注入链**：`buildOpenAIParams` → `toolsPayload = buildOpenAITools(args.tools)` →
   若 `args.tools` 为空/装载失败，模型收不到工具定义自然不发 tool_use（查 headless
   `print.ts:656` bundle.tools 是否非空、`getBaseToolEntities()` 是否返回 34 件）。
2. **tool_use 解析/回传**：若模型发了 tool_use 但引擎未解析进 stream-json、
   或 tool_use 被吞（`pipeline/toolExecution` 4 接缝）。
3. **IFF 网关透传**：网关是否透传了 tools 字段 / tool_calls 响应（抓原始请求响应定性）。

**用户影响**：任务型使用（修 bug / 写代码 / 跑测试）全部静默落空，
比直接报错更危险（success + 文本声称完成）。与①②叠加后用户感知 = "任务永远做不完"。

**处置建议**（下一轮定位阶段，非本轮测试方案优化职责）：
1. 抓 IFF 原始 chat 请求/响应，确认 tools 字段是否注入、模型是否返回 tool_calls；
2. 若请求无 tools → 查 `getBaseToolEntities()` + bundle.tools 装载链；
3. 若请求有 tools 但响应无 tool_calls → 查模型侧/网关透传；
4. 若响应有 tool_calls 但 stream-json 无 tool_use → 查引擎解析/回传；
5. 用例面维持磁盘 ground truth 断言（已覆盖），修复后回归本族用例。

## Sweep 回填（r-20261001-0405 全量 96 条，07:43 CST 跑完）

- [x] **83 条 slash 记录 verdict 分布：STUCK 80 / PASS 2（/exit、/rewind）/ TIMEOUT 1（/stickers）/ FAIL 0**
- [x] **STUCK probeMs 分布（渲染冻结时长谱）**：
  | probeMs | 数量 | 判读 |
  |---|---|---|
  | 45001–45003 | 72 | 45s 探针窗内输入回显始终未出现（P1-A 渲染冻结 / 输入门控签名） |
  | 60001–60002 | 6 | 早期 segment 用 60s 窗（add-dir/agents/branch/clear/color/config），同签名 |
  | 1–3 | 2 | **tasklist、logout**——探针立即无回显，非渲染滞后签名，疑 session 提前死亡（下轮用 `artifacts/r-20261001-0405/slash-pty-*.log(.stderr)` 定性） |
- [x] **命令面 FAIL（expect 缺失）清单：无**（0 条 inputAlive=true 但输出缺失——
  80 条 STUCK 全部 inputAlive=false，失败面集中在"输入回显/渲染管线"，
  而非"命令执行了但面板没画"）
- [x] **danger 面（独立 session）**：/exit PASS（进程干净退出，5s）；
  /rewind PASS（独立 session 未崩，7s）；/force-snip 缺席（feature 门控未启用，
  按方案记 PASS-缺席，未产生记录）
- [x] **short/medium/long/soak**：
  | case | 结果 | 关键证据 |
  |---|---|---|
  | short-marker | PASS | pty+headless 双驱动 marker 2/2（6s） |
  | short-multiturn | PASS | 两轮 marker2 顺序发送（9s） |
  | short-filewrite / short-tool-read | FAIL | P1-C（见上表） |
  | medium-fixbug / medium-feature | FAIL | P1-C（见上表） |
  | long-multistep | FAIL | P1-C（见上表） |
  | soak | PASS | 10/10 轮 marker 无漂移，时延曲线 3.2–5.6s/轮（无 loop 漂移） |
- [x] 其余：/stickers TIMEOUT（3m34s，连续动画使 settle 打到上限，busy 非崩溃）；
  /ant-trace "Unknown skill"（P2，见次要项）；IFF 0/0 1ms 行 = F4 正常形态。

**sweep 判读要点**：80/83 STUCK 的签名与 P1-A（渲染冻结/输入排队）一致，且
control 面（core-1/4、short-marker/multiturn、soak）证明**有节奏的多轮 chat 正常**——
失败集中在 slash 命令发送 + 探针协议路径，指向 TUI 输入/渲染管线（L1），
非 engine loop。自动 `diagnosis.md` 按粗规则把 88 条归 L2（engine loop），
**以本文件的分层校准为准**：
- 80 条 sweep STUCK → **L1**（P0-A Enter 吞 + P1-A 渲染冻结）；
- core-2 → **L3**（resume 车道空池假阴性，P0-B）；
- core-3 / short-disk ×2 / medium ×2 / long → **P1-C（0 tool_use，根因待定位）**——
  候选：tools 注入链（L2/L3）/ 网关透传（L4）/ 引擎解析回传（L2），不预设模型能力；
