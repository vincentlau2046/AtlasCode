# Web Team Console 需求独立分析稿（用户 2026-11-11 点名：team 功能 web 端口整体管理）

> f4 分析稿（零码）。上游事实基座 = 0.1.94/0.1.95 双副本收敛 + 0.1.96 A1 契约（在途）。
> 状态：分析呈用户敲定（版本/排位/P0 范围），敲定后起正式波工单（波前审视+审计全套）。

## 1. 需求拆解（「web 端整体管理 team」= 什么）

| 能力面 | 现状（活码盘点 @ master） | web 端形态 |
|---|---|---|
| team 生命周期 | TeamCreate/TeamDelete 工具 + ~/.atlas/teams/{team}/ 目录（inboxes/*.json + lockfile） | 创建/删除/列表 team |
| 成员生命周期 | spawn（in-process/tmux 双 backend，registry 选择）/ shutdown_request→approve/deny 全链 / **A1 RequestShutdown（0.1.96 在途）** | 成员列表+状态、发 shutdown、批/驳退出请求 |
| 信箱 | mailbox.ts 单源 1398L·13 结构化 schema（0.1.94 收敛后单源）+ tui/utils/teammateMailbox.ts 平行实现（登记债） | 收件箱/发件箱视图、发消息 |
| 任务/状态 | engine task services + taskState（abort/isIdle/shutdownRequested）+ A1 pending_requests 面 | 任务看板、成员状态实时推送 |
| 观测 | TUI 组件（CoordinatorAgentStatus/AgentProgressLine/teams/）为 UX 参照；无 headless 观测面 | 只读 dashboard 为 P0 起点 |

**关键判断：0.1.94/95 的单源化收敛正是本需求的前置红利**——teamServices 接口（engine/tools/team/teamServices.ts 212L interface + port 注入）、mailbox 单源 schema、runner 单源，web 端可以直接复用同一套 engine 域服务做操作面，无须旁路解析文件或重建状态机。

## 2. 架构候选

- **候选 A（推荐）：嵌入式 web 服务**——CLI 进程内起 HTTP+WS 服务（localhost bind + token），in-process 直调 engine 域服务（TeamServices/mailbox/task services 同源）；WS 推送复用 runner/task 状态事件。优点：零状态复制、操作面=工具面同源（权限门/批准权语义天然继承）、单命令启动。缺点：宿主进程生命周期绑定（CLI 退出 = 控制台下线）——符合「管理运行中团队」定位。
- **候选 B：独立伴生进程**——读同一 ~/.atlas/teams 文件 + 经 IPC 连引擎。解耦宿主生命周期，但状态访问二路（文件 vs 内存态分裂 = 判读分叉风险，0.1.95 teammateModeSnapshot 分叉先例），操作面须重建权限链。**否决为主形态，仅 P2 多 team 跨进程观测再评**。

## 3. 开源采纳地图（禁重复开发；⚠ 本会话网络受限未逐仓核验，立项波首步 = 活体调研核验后定版）

| 层 | 采纳候选 | 说明 |
|---|---|---|
| 服务框架 | Fastify（+ @fastify/static/websocket）或 Express+ws | 嵌入式 HTTP/WS 成熟件，不造服务层 |
| 前端框架 | React + Vite + shadcn/ui（或 Ant Design） | 控制台 UI 标准栈，组件库白拿 |
| 实时通道 | 原生 WS 或 socket.io | 状态推送； socket.io 自带重连/降级 |
| 终端嵌入（可选） | xterm.js | 若 P1 需在 web 看成员输出流 |
| 协议参考 | AG-UI（agent↔UI 事件协议）/ MCP | 事件形设计参考，不直接依赖 |
| 观测参考 | Langfuse / Arize Phoenix（自托管 trace 面板） | 仅当 P2 要 trace 深观测再评估引入 |
| 领域 UI | **无现成同构项目**（mailbox/team schema 为我们私有域） | 领域层自研不可避免；基础设施全部采纳开源——重复开发面压到最小 |

## 4. 增量路径（三段，禁 big-bang）

- **P0 只读控制台**：teams/成员/任务/信箱只读视图 + WS 实时推送 + A1 pending_requests 呈现（0.1.96 契约直连）。零操作零权限面，价值先落地。
- **P1 操作面**：SendMessage / shutdown approve/deny / TeamDelete 经 **engine 工具面同源**复用（批准权/权限门语义继承，禁旁路写 mailbox）；A1 契约成为首批操作。
- **P2 多 team + 深观测**：跨 team 总览、trace 面（届时评估 Langfuse 系引入）。

## 5. 安全面（硬约束预注册）

1. bind 127.0.0.1 + 启动 token（stdout 打印一次性 URL）——**禁远程暴露**（non-goal）；远程面须用户另裁。
2. P1 操作面权限门继承：web 操作走与 TUI/headless 同一 TPC 域门 + lead 批准语义（fail-closed），web 通道不得成为绕过权限的旁路。
3. 零写真实 ~/.atlas 之外的路径；探针 designated-only seeded HOME 照旧。

## 6. 版本与排位建议（呈用户敲定）

- **版本**：建议 **0.2.0 系列首版**——新能力域起点（与 0.1.x 债务/对齐线分离，符合「单独立版本」意图）；若用户倾向保守可 0.1.97 插入波。f4 推荐 0.2.0。
- **排位**：A1（0.1.96）在途收口后起波（工单/审计/双信号全套）；与纲要 §10 序 4+ 并行不冲突——本需求归主线③能力波新增项，排位（先于/后于 S1a 硬化波）随用户 D 项裁定一并定。
- **协同面**：A1 的 pending_requests + approve/deny 契约 = 本需求 P1 操作面的第一批内容（顺序天然咬合：先有契约再有管理面）。
