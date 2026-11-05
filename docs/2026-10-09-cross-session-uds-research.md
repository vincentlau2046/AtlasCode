# 跨 session（同机）通信调研记录 — 2026-10-09

**需求裁定**（用户 2026-10-09）：要同机跨 session 通信（A session 发消息给 B session，B 下一回合看到并可继续工作）；**`/remote`（bridge 跨机面）明确不要**；参照官方 Claude Code 实现；**非紧急需求，本轮只调研记录，不落码**。

**状态**：调研闭环，判据就绪，不预占资源（用户常设裁定，同 0.1.44/46 先例）。激活 = 用户点名；落码归 Main 车道（[[e2e-lane-role-boundary]] / 角色边界裁定），测试侧判据 = 本文 §6。

---

## 1. 官方 UDS_INBOX 机制（sourcemap 引用面重建）

参考源 = `claude-code-sourcemap/restored-src`（CC v2.1.88）。**注意：`utils/udsMessaging.ts` 本体未还原**（sourcemap 提取不全，`restored-src/src/utils/` 下无此文件；minified `package/cli.js` 中 `sendToUsdSocket` 等符号 0 命中），以下架构由 9 个引用点重建，**wire 细节 = 本设计自定义，语义对齐官方可证部分**。

### 1.1 组件与数据流

```
每 session 启动（setup.ts，feature('UDS_INBOX') 门）       发送侧（SendMessageTool）                接收侧
─────────────────────────────────────────────           ─────────────────────────                ──────────────────────────────
startUdsMessaging(                                          validateInput:                          UDS server（net Unix socket，
  socketPath ?? getDefaultUdsSocketPath()                     uds:/bridge: 地址 4 块校验              官方本体未还原）
  〔默认 = tmpdir 约定路径〕                                  checkPermissions: uds=allow /            → 消息 wrap 成
→ 导出 $CLAUDE_CODE_MESSAGING_SOCKET                          bridge=safetyCheck ask                    <cross-session-message
  （注释明写：在 SessionStart 等 hook                            "cross-machine prompt injection          from=\"<sender>\" …>
  spawn/快照 env 之前导出）                                      must stay bypass-immune"                          → 作为 user 消息入队
→ 写 PID 注册表（concurrentSessions）                            → sendToUdsSocket(path, text)          （"drain at the next tool round"
    ~/.claude/sessions/{pid}.json                                   （uds 支 success 恒报 true；        = 排队不插队，无 busy 状态）
    字段: pid/sessionId/cwd/kind/entrypoint/                        bridge 支 result.ok ?? false）
    messagingSocketPath/…                                                    回信 = 把来信 from 属性拷进 to
    stale 文件 = pid 存活探测（process.kill(pid,0)），              发现 = ListPeers 工具
    死 pid 清扫（WSL 豁免：防误删 Windows 原生会话）                  （读 PID 注册表；bridge 面去重
                                                                  本地优先；listAllLiveSessions）
```

headless（`cli/print.ts`）收侧 = `setOnEnqueue(() => { if (!inputClosed) void run() })` —— 消息到达即踢起 query loop（deferred 注册到 `run` 定义之后）。TUI 收侧渲染 = `UserTextMessage` 检测 `<cross-session-message` 子串 → `UserCrossSessionMessage` 组件。

### 1.2 官方可证的语义要点

1. **无 busy 状态**：消息排队、接收方下一工具回合消费（prompt 原文 "messages enqueue and drain at the receiver's next tool round"）；
2. **回信协议**：`from` 属性 = 发送方 socket 地址，回信直接拷作 `to`；
3. **结构化消息禁跨 session**（只有纯文本可 uds/bridge 发送，`structured messages cannot be sent cross-session`）；
4. **权限面**：bridge 跨机 = safetyCheck 显式同意（bypass-immune）；**uds 本地 = allow**（本地 socket 不走 ask）；
5. **发现 = PID 注册表**：注册表同时服务 `claude ps`（countConcurrentSessions 计数 + stale 清扫）与 peer 发现，一份文件两个消费者；
6. **门控**：官方 = `feature('UDS_INBOX')` 编译期门（ant-only 内部特性，非公开 API）。

---

## 2. 本仓现状盘点（全局特性列表，判据 = 用户「状态=全局特性列表」裁定）

| # | 特性 | 满足/缺口 | 根因 | 处置 | 推导链（证据） |
|---|---|---|---|---|---|
| F1 | UDS 门控（CLI 面） | 满足 | — | 不动 | `src/remote/udsInboxEnabled.ts`：`ATLAS_EXPERIMENTAL_UDS_INBOX` env opt-in 默认 OFF（isEnvTruthy，⑮ 同型） |
| F2 | UDS 门控（TUI 面） | 满足·双门不一致 | 两套门不同 env | 激活时统一（§4 裁定） | `src/tui/setup.ts:88` `feature('UDS_INBOX')` = 读 `FEATURE_UDS_INBOX`（`src/shared/feature.ts`，**不在 ON_BY_DEFAULT** → 默认 OFF）；与 F1 的 `ATLAS_EXPERIMENTAL_UDS_INBOX` 双轨，两门皆默认关但 env 不同名 |
| F3 | PID 注册表 | 条件满足 | 注册表在写，但 UDS 字段恒空 | 激活时补 env 导出 | `swarm/concurrentSessions.ts`（旧仓 204L 逐字迁移）写 `~/.atlas/sessions/{pid}.json` 含 `messagingSocketPath: process.env.ATLAS_MESSAGING_SOCKET`；调用点 = `src/tui/main.tsx:1994` `void registerSession()`（仅 TUI 面，headless 未接）；**全仓 0 处 set/export `ATLAS_MESSAGING_SOCKET`**（grep 仅 tui/setup.ts:86 注释）→ 字段恒 undefined |
| F4 | 地址解析 | 满足 | — | 不动 | `swarm/peerAddress.ts` 21L 逐字（`uds:`/`bridge:`/裸 `/` 路径 3 支），经 remote 门面 re-export |
| F5 | SendMessage UDS 支（engine） | 满足·消费 stub | 支全在，底层 no-op | 激活时补 F6/F7 | `engine/tools/team/sendMessageTool.ts` 5 站点全活：to 描述 getter（门 face env-live）/ checkPermissions bridge ask 支 / validate 4 块（地址空检查 + bridge 结构化拒 + 连接检查 + uds string 早放行）/ call bridge+uds 2 支（call 调 `sendToUdsSocket`）；prompt 模板明写 "uds:/path/to.sock … use ListPeers"（`sendMessagePrompt.ts:22-28`） |
| F6 | UDS 服务器 | **缺口** | 逐字 stub no-op | 落码（§5 A1） | `src/remote/udsMessaging.ts`：`startUdsMessaging(_socketPath)` 空函数（头注明写"旧仓自身 any stub 逐字，真实现新旧仓均 0-hit，登记不恢复"= 登记过但非本次需求）；`src/tui/utils/udsMessaging.ts` 2L any stub 双导出（`startUdsMessaging`/`getDefaultUdsSocketPath` = `(() => ({}))`） |
| F7 | UDS 客户端 | **缺口** | 逐字 stub no-op | 落码（§5 A2） | `src/remote/udsClient.ts`：`sendToUdsSocket(socketPath, message)` no-op resolve（"H6：绝不把 stub 签名当真行为"头注）→ **现状：门开着时 uds: 发送恒报 success 但消息 0 到达 = 静默丢消息** |
| F8 | ListPeers 工具 | **缺口** | 目录缺失 | 落码（§5 A3） | `engine/tools/toolRegistry.ts:76-77` ⑩ 登记"UDS_INBOX（ListPeers [C]，目录缺失；C 桶 ③ shell·swarm 波完结 = UDS inbox 本体零落盘"；官方 `tools/ListPeersTool/` 亦未还原（tools.ts 仅引用面），契约由 `concurrentSessions.ts` 注释（"so ListPeers can surface it"）+ prompt 引用重建 |
| F9 | 收侧 enqueue（消息进会话队列） | **缺口** | 本仓 0 实现 | 落码（§5 A4） | 官方 `setOnEnqueue`/`onEnqueue` 全仓 grep 0 命中；headless `src/cli/print.ts:55` 头注 UDS inbox = 裁面清单项（本仓 headless 不接）；`getDefaultUdsSocketPath` stub 返回 `{}`（对象非 string，TUI setup L91 若激活会传脏值 = 潜在坑） |
| F10 | TUI 跨 session 渲染组件 | **缺口** | null stub | 落码（§5 A5） | `src/tui/components/messages/UserCrossSessionMessage.tsx` = `export const UserCrossSessionMessage: any = null`；但**分发分支已在位**：`UserTextMessage.tsx:190` `feature("UDS_INBOX") && param.text.includes("<cross-session-message")` → 渲染 `<UserCrossSessionMessage>`（null 时 = 渲染空） |
| F11 | `--messaging-socket-path` 逃生门 | 满足 | — | 不动 | `cli/parse.ts:793` 选项注册 + `cli/setup.ts:136-145` 消费（门 ON + 非 bare 或显式指定 → `startUdsMessaging(显式路径 ?? tmpdir()/atlas-messaging/{sessionId}.sock)`，socket 路径约定已写好） |
| F12 | bridge/Remote Control 跨机面 | 满足（stub 面） | — | **不动**（用户裁定不要） | `postInterClaudeMessage` 走 remote 门面（stub）；本次范围 = uds 本地支 only，bridge 支原样保留 |

**汇总**：接线面 6 项满足（F1-F5/F11 中支全在），真实现缺口 5 项（F6 服务器 / F7 客户端 / F8 ListPeers / F9 enqueue / F10 渲染组件）+ 2 个一致性项（F2 双门 / F3 env 未导出）。**缺口全部集中在"socket 本体 + 收侧注入"，发送侧与发现基建已就绪。**

---

## 3. 三个方案与裁定

| 方案 | 内容 | 取舍 |
|---|---|---|
| **A 最小真实现闭环（推荐）** | 只补 F6/F7/F8/F9/F10 + 双门统一 + env 导出；全部复用 ✅ 面；bridge 支不动 | 行为 = 官方 UDS_INBOX 本地子集；`uds:` 地址契约、`--messaging-socket-path`、注册表 `messagingSocketPath` 字段全部兑现为真行为；~6 文件落码 |
| B 文件 mailbox 复用 | 不造 socket，跨 session 走共享目录 inbox 文件 + 轮询，复用 team mailbox 基建 | 零 socket 生命周期管理（stale/EACCES 边全没有），但**背叛已有接线**（`uds:` 地址语义 / 逃生门 / 注册表字段全要重映射）+ 轮询延迟 + 并发写锁；仅在"不想要真 UDS"时值得 |
| C 全对齐（含 bridge 跨机） | 跨机面也做 | **用户已裁定不要（"/remote 功能不需要"），排除** |

**裁定**：A。理由 = 接线已全在，stub 是逐字登记的落盘面（非遗漏），补 5 件即闭环；B 等于把已裁定的 `uds:` 语义推翻重来，成本更高且背叛 F4/F5/F11 既有契约。

---

## 4. 待定裁定（激活时用户拍板）

| # | 问题 | 选项 | 倾向 |
|---|---|---|---|
| D1 | **门控策略** | (a) 保官方保真：`ATLAS_EXPERIMENTAL_UDS_INBOX` 默认 OFF，显式 env 开；(b) 翻默认开：`UDS_INBOX` 进 `feature.ts` ON_BY_DEFAULT 集合（先例 `TRANSCRIPT_CLASSIFIER`/`COORDINATOR_MODE` 均翻转过），env 只做 kill-switch | **倾向 (b)**——多 lane 协同是主用途非实验，默认关 = 每个 session 都要记得设 env；(a) 更保守零意外面 |
| D2 | **双门统一方向** | (i) 统一到 `ATLAS_EXPERIMENTAL_UDS_INBOX`（CLI 面现态，remote 域门面）；(ii) 统一到 `FEATURE_UDS_INBOX`（TUI 面 `feature()` 现态） | 随 D1：选 (b) 则 TUI 面 `feature('UDS_INBOX')` 自然进 ON_BY_DEFAULT，CLI 面 `isUdsInboxEnabled` 改读同一源（remote 门面单一事实源）；选 (a) 则 TUI 面门改读 `ATLAS_EXPERIMENTAL_UDS_INBOX` |
| D3 | **headless 收侧** | (i) 不接（本仓 print.ts 裁面登记在案，`setOnEnqueue` 踢 loop 留登记）；(ii) 接 `setOnEnqueue` 等价面 | 倾向 (i) 先不接：headless 跨 session 通信需求未提出，YAGNI；登记为前向接缝 |
| D4 | **wire 格式** | 官方本体未还原 = 无逐字参照 | 自定义：newline-delimited JSON `{from: string, text: string}`（from = 发送方 socket 路径，回信协议 §1.2-2 需要）；单帧上限沿用 `SendMessageTool.maxResultSizeChars` 100k 量级 |
| D5 | **版本归属** | 独立小版本（如 0.1.47 候选）或并入后续某波 | 非紧急，随下一波规划裁定 |

---

## 5. 方案 A 落码要点（激活时实施蓝本）

1. **A1 UDS 服务器**（`src/remote/udsMessaging.ts` 真化，替 no-op）：Node `net.createServer` Unix socket；bind 失败（EADDRINUSE/stale 文件）先 unlink 重试一次；`{isExplicit}` 参数语义 = 显式路径不做 tmpdir 目录预创建；**bind 后导出 `ATLAS_MESSAGING_SOCKET` env**（F3 注册表字段兑现；时序 = 在 hook spawn 前，官方注释明写该约束）；stale 清扫复用 `isProcessRunning` 探测；cleanupRegistry 钩子删 socket 文件（与 `registerSession` cleanup 同族）。
2. **A2 UDS 客户端**（`src/remote/udsClient.ts` 真化）：`net.connect` 单帧发送，connect 失败（ENOENT = 对端不存在）→ 返回可操作错误面（"peer session not found — use ListPeers to discover live sessions"，先例 = RipgrepMissingError 可操作报错风格，[[grep-rootfix-0144]]）；**注意 F7 根因面**：stub no-op 恒 success 是静默丢消息，真化后必须区分 success/failure 真值（call 支现态 `uds: success 恒 true` 行需随真化修订为真返回）。
3. **A3 ListPeers 工具**（`src/engine/tools/` 新目录 + 注册表 49 口径登记位 + 门控槽）：读 `~/.atlas/sessions/*.json` + pid 存活探测 + `messagingSocketPath` 非空过滤 → 输出 `[{name, socketPath, cwd, status}]`；read-only 工具（isReadOnly true）；**契约面**（官方未还原，本设计）：无 peer 时返回空列表不报错（对端未开门控属正常态）。
4. **A4 收侧 enqueue**：TUI 面 = UDS server on('message') → 构造 `<cross-session-message from="…">` user 消息 → 入会话消息队列（排队不插队，§1.2-1；注入点 = REPL 消息流，落点需实施时定：`useInboxPoller` 先例 = 1s 轮询盘，UDS 侧 = 事件直推更佳）；headless = D3 裁定；**`getDefaultUdsSocketPath` 真化**（替 `{}` stub，返回 `tmpdir()/atlas-messaging/{sessionId}.sock` 单一事实源，与 `cli/setup.ts` 约定路径同式）。
5. **A5 渲染组件**（`UserCrossSessionMessage.tsx` 真化）：解析 `<cross-session-message from>` 属性 → 显示 "From {peer}: {text}" 样式块（官方组件未还原，样式自定，先例 = 既有 User*Message 组件族风格）。
6. **双门统一 + env 导出**（§4 D1/D2）。
7. **测试面**：单测 = A1 bind/stale-EACCES/A2 connect 成功+对端不存在/A3 注册表读取+stale 清扫/A4 enqueue 不插队语义；e2e 判据（gate 用）= 双 PTY 真 session 互发（`uds:` 地址 + 下一回合 `<cross-session-message` 在场 + 回信 from 协议 + ListPeers 互见 + 门 OFF 零行为面〔gate-off 面不变量〕+ 四件套 + 全量回归探针）。

---

## 6. gate 判据（激活时 e2e 侧执行，判据就绪不预占）

① 四件套（tsc0 / eslint0 / build / 全量单测）② 双 session 互发真面（§5-7 全列）③ 门 OFF = 0 UDS 行为面（socket 不创建、ListPeers 不注册、`uds:` 走 teammate 路由回落）④ 回归探针（/help 标签集恒等双向 diff ∅ + 全量）。

## 7. 角色边界

落码 = Main 车道（[[e2e-lane-role-boundary]]）；e2e = gate + 判据；本调研 lane = 分析侧交付物（本文）。单信号激活时按 [[release-governance]] 3 支柱走（in-scope = F6-F10 + 双门 + env，deferred = D3 headless 收侧 + F12 bridge）。

---

*调研完成 2026-10-09；参考源：claude-code-sourcemap（CC v2.1.88，udsMessaging/ListPeersTool 本体未还原已登记）· 本仓 master @ 365a088（v0.1.45）*
