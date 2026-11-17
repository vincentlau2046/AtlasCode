# S0-R4 登记档——searchSessions 出口扩形（消费侧缺口登记转正；候选波）

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

> f4 登记档（2026-11-16）。来源：Atlasweb-F4 G2 消费侧进展单信号（格 F/D/H GREEN @b1368eb/@659011f）附带缺口登记。工单成稿于波启动时（含 Atlas-reveiw 审计 + lock-face），本档只登记缺口实核与候选形。

## §1 缺口实核（f4 活码 2026-11-16）

| 面 | 状态 |
|---|---|
| 契约面 | `SearchSessionsRequestSchema` 在 src/kernel/protocol/webSessionV0.ts:68（schema 注册 :105）——**契约已有，实现未达** |
| runtime 出口 | `./web-session-runtime` ReadonlySessionRuntime 三面止于 list/replay/follow（readonlyRuntime.ts:192-200 接口 / :513+ 实现），**零 searchSessions** |
| engine 域 | src/engine/session/search.ts 真体在案（renderableSearchText/computeSearchText/toolUseSearchText，202L 逐字随迁形） |

定性：**S0 协定 §2 四面之第四面（searchSessions——已持久化有效会话投影内搜索，可定位/取消/限额分页）在 runtime 面缺席**，与 S0-R2 形 A 同族（交付面设计遗漏，非消费侧误用）。消费侧正确面：不手抄投影搜索语义、不落 title 过滤假面冒充。

## §2 候选形（波启动时 lock-face 定形，禁预答终形）

- readonlyRuntime 扩 `searchSessions` 第四面：engine/session/search 域真体入只读闭包（§0 实核其纯函数形合只读章程）；
- adapter/HTTP 载体：SearchSessionsRequest 契约已定，WebSessionError 映射面（限额分页/定位/取消语义）随波定形；
- pack 格/公开类型面对表照 S0-R2 §7 先例（公开面 zero-add 基线 + 新增逐型批准）；
- 消费侧衔接：落地后 Atlasweb-F4 按配对纪律升级锚 + 补格 D search 腿。

## §3 队列（2026-11-16 f4 排序登记）

1. **§11 两 defense-in-depth 候**（F1 expectIno/O_NOFOLLOW、F2 位置化分块读）——触 load.ts，优先级低/低-中；
2. **本件 S0-R4 searchSessions 出口扩形**——G2 四面完整性的最后缺口，消费侧已备腿等落地；
- **合并候选注记**：两件均触 engine/session 域 + web 出口面，可考虑单波单 lock-face 合并呈批（一次 gate/段 L/生产 lane 成本）；合并与否则波启动时按当时队列密度定。
- 0.1.119 候（0.1.118 prodlane PASS 后）；波启动按预注册纪律出全工单 → 审计 → 双信号。

## §4 消费侧进展采记（同日单信号）

格 F 双实例生命周期隔离腿 GREEN（@b1368eb，18/0：scope 域零串域/scopeDenied/close 隔离/epoch/close 幂等/零全局 env·chdir）；格 D+H follow 面 GREEN（@659011f，19/0：SSE 桥 baseline/replacement/resetRequired/error/closed 恒唯一 terminal；文件追加→replacement 收敛实测；断开→订阅槽释放）。消费侧裁定采认：missing session = 流内 error{notFound}→closed 对（上游契约形），404 预流映射仅请求/响应面（预流检查需额外 scope 扫描 + TOCTOU 窗）——契约面注记在案，S0-R4 波启动时对表。
