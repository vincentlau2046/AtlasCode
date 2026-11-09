# W-D-B 工具契约统一波工单（0.1.93 闭环后既定下波）

> 状态：`draft → 待 Atlas-reveiw 审计 → 双信号`。f4 工单（2026-11-09）。
> 上游：0.1.93 五段闭环终态（release 85a763b6 / 生产 lane PASS）；0.1.93b 工单 §13 出门登记面。
> 排序依据：用户 A 裁定「RED-F 插入波优先，W-D-B 顺延」——RED-F 已闭环，本波为既定次序下波；纲要 §10 序 4+ 继续顺延。

---

## §0 波前审视（活码盘点 @ master 019f7b15，f4 自决）

### 0.1 登记池活态盘点（0.1.93 发布态实测）

| 项 | 活态 | 性质 |
|---|---|---|
| runInProcessTeammate 双副本 | **活**：swarm 73,909B（compose 接线实证活副本）+ tui/utils/swarm 53,372B（零 import 实证孤儿） | 结构债 |
| SendMessageTool 双副本 | **活**：engine 43,093B（round-7 修形单触 engine 副本 e2e wire 生效实证）+ TUI 27,850B 独立实现（含异构 handleShutdownApproval：teamFile 磁盘查 + gracefulShutdown 兜底） | 结构债+行为分叉 |
| teammate.ts 双副本 | **活**：engine/messaging + tui/utils（teammateContext 已 round-8 单源化归 shared，teammate.ts 本体未收敛） | 结构债 |
| makeCtx setAppState 缺陷 | **活**：print.ts:1122-1128 `updater({toolPermissionContext}).toolPermissionContext` ——SDK lane 工具任何 setAppState 全态更新面 tasks 静默丢弃 | 缺陷面（fail-silent 族） |
| TUI teammate-message XML 标注缺席 | e2e lineage：tui-r5 8 体 → tui-r6/r7 起 0 体；**回归嫌疑**（时间窗与 round 6-8 修形链重合；0.1.93b 未触该路径不排除上游波引入） | 疑似回归（root-cause 先行） |
| T8 2 成员变体轮经济 parity | 案 B 面（max-turns+drain 兜底） | 观察池 |
| .lock 残留 | round-8 + 0.1.93b 两现 | 观察池 |
| requestShutdown 工具化 | 原登记 W-D-B 项 | 契约面（见 §1 范围裁定） |

### 0.2 f4 审视自决（范围裁定）

1. **TUI XML 缺席 root-cause 列波内首段**（段 X）：回归嫌疑面禁静默收编（0.1.93b §13 裁定）；e2e 供 round 4-8 TUI capture lineage 作判别输入。
2. **双副本收敛三对列波内主体**（段 C）：round-8 单源化纪律全套适用（先 diff 后删——代码体 md5 全等 = 纯漂移直删二留一；语义差并集+登记禁静默取一；bundle 结构断言钉实例数）。
3. **makeCtx setAppState 修复列波内**（段 M）：修复向 = 与 RF-T1 同款读面纪律（窄视图职责单一化——setAppState 仅承 TPC 域写入，越域写经 port；禁全量扩面），落点归 Main lock-face。
4. **requestShutdown 工具化裁出本波**：涉及新工具契约面（成员侧主动请求退出语义 + lead 侧消费形态），属新能力设计非债务收敛——登记面保留，候选下一插入波或并入纲要 §10 后续序，面呈用户定夺（本波不排）。
5. **变体轮经济 / .lock**：维持观察池不入波。

### 0.3 判读纪律（继承 0.1.93b 方法论）

func 单副本绿 ≠ e2e 双副本真环境绿；探针 marker 禁入 prompt 字面；点火面/消费面/读面三分账；stamp 落随行字段非 WeakMap 对象身份；e2e 分支判读须与自身持久面观测对表。

---

## §1 波定义

- **波名**：W-D-B 工具契约统一波（W-D 固定小组形态续）。
- **版本**：0.1.94（版本=收口契约；gate 判据面随波定，见 §3 段 G）。
- **范围（scoped）**：段 X（TUI XML root-cause+修形）+ 段 C（双副本收敛三对）+ 段 M（makeCtx setAppState 缺陷）。零新能力面。
- **非目标**：requestShutdown 工具化（呈用户另裁）、变体轮经济/.lock（观察池）、纲要 §10 序 4+、收敛原语扩展。

## §2 Global Constraints（硬约束）

1. 双副本收敛纪律（round-8 先例全套）：先 diff 后删；语义差并集+登记；bundle 实例数断言钉住；TUI 活面误删防（删前 import 实核——boundaries 实核先例）。
2. TUI 车道行为面零回归：段 X 修形前后 TUI 探针判别格对表；XML 标注若定谳为「应存在面」修形后 TUI lane 判别格必配。
3. canon 护栏（15min wall + 降级阶梯）；canon Δ 恰合口径；SRI/npm 面按 release 链标准（--registry npmjs.org）。
4. 判读三纪律（§0.3）逐格执行；row F 预注册纪律（偏离先报 f4）。
5. 角色矩阵照旧；Atlas-reveiw 波前审计（本工单必送）。

## §3 工作段（预注册）

### 段 X：TUI teammate-message XML 缺席 root-cause + 修形

- 判别输入：e2e lineage（r5 8 体→r6/r7 0 体时间窗）+ Main 源码锁面（formatAsTeammateMessage 消费链在 TUI 车道的接线点）。
- 判别格：X-① 时间窗定位（round 4-8 逐轮 capture 对表）→ 嫌疑修形提交锁定；X-② 机制定谳（该路径被哪个修形改道/裁除）；X-③ 修形锁面报 f4。
- 若定谳为「本就该缺席」（设计面非回归）：面呈用户裁定后关格，登记销项。

### 段 C：双副本收敛三对

- C-1 teammate.ts（engine/messaging + tui/utils）：diff 定谳 → 单源化落点（倾向 shared 或 engine，依赖方向实核先例）。
- C-2 SendMessageTool（engine + TUI 927L）：**语义差预期最大**（异构 handleShutdownApproval）——先行为面并集定谳（TUI 副本各支路在 engine 副本的等价面/缺席面逐条列），禁直删；收敛后 TUI/print 双 lane 判别格对表。
- C-3 runInProcessTeammate（swarm 活 + tui/utils 孤儿）：零 import 实证已在——孤儿副本直删 + 实测 bundle Δ； canon Δ 恰合。
- 判别格：bundle 结构断言（各模块实例数=1）+ 双 lane wire 直证（0.1.93b R-①手法）+ canon Δ 恰合。

### 段 M：makeCtx setAppState 缺陷修复

- 修复向（f4 预注册）：窄视图职责单一化——setAppState 仅承 TPC 域；越域写需求面经 SessionContextPort（RF-T1 同款读面纪律）。落点与影响面（SDK lane 工具清单逐个核 setAppState 消费形）归 Main lock-face 报批。

### 段 G：gate（判据面随段定谳后 f4 补注册）

- 基线：canon 全绿 + 双 lane 判别格（TUI/print）+ bundle 结构断言 + 段 X 修形前后对表。
- 前滚评估：本波含行为变更面（段 X/M），release gate 判据面在段定谳后由 f4 预注册补全（禁临 gate 拼凑）。

### 段 L：release 0.1.94 + 生产 lane（标准链）

## §4 Review Focus（Atlas-reveiw 审计建议焦点）

1. 段 C-2 收敛序：SendMessageTool 语义差并集定谳是否需先于 root-cause 段 X（TUI 副本 handleShutdownApproval 异构面可能即 XML 缺席关联面）。
2. 段 M 修复向的 SDK lane 影响面核（哪些工具真消费 setAppState 越域写）。
3. requestShutdown 裁出本波是否恰当（或应并入）。
4. 版本 0.1.94 口径与 gate 判据面后置补注册的程序合规性（禁临 gate 拼凑条款是否足够）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段定谳/lock-face（逐段报批）→ 段 G gate → 段 L。row F 预注册纪律全程。

## §6 Atlas-reveiw 审计闭环（2026-11-09，有修改通过）+ f4 修订

审计锚点全实锚（四文件体量逐字节吻合/孤儿零引用/teammate.ts 双副本 10545/9254 体量不等 → C-1 预期语义差并集径/makeCtx 双重 fail-silent 实锤——updater 收合成态且回读只取 TPC 字段，越域写两次丢弃）。f4 逐条吸收：

1. **【必改①】段 G 补 0.1.93 前滚判据面复跑（实质缺漏采纳）**：前滚条款原文覆盖「0.1.93/下版 release gate」，段 C 动 T8/O4 同域文件 = 活回归面。段 G 判据面补：**①T8 全链 + ⑤ O4 名义形锚 + 段 Q 四格（Q1-Q4）+ 0.1.93b round 1-8 判别格点名复跑**。
2. **【必改②】硬冻结条款**：**段 X-①（时间窗定位）闭环前三对副本全部冻结禁删改**——TUI 副本异构行为文本 = 段 X 判别证据面，先并集=先改证据；C-3 孤儿直删同受约束（孤儿副本 = TUI 车道历史行为面唯一直接代码证据）。
3. **【吸收】段 X-① 嫌疑清单点名化**：嫌疑面不止 SendMessageTool——formatAsTeammateMessage 消费在 runner（engine 副本 shutdown_request 支，round-8 Q2 已证结构化投递形）；时间窗与 round-6 RED-C member-side 闭合修形重合 → X-① 嫌疑提交清单**点名 round-6 RED-C 修形提交**，非泛化 round 6-8。
4. **【吸收】段 M lock-face 三点必答**：影响枚举预勘采纳（TodoWrite/Task 族 = SDK lane 直接可达用户可感 = 主体；team 族门 OFF 不可达 = 登记级；plan 族核）；**真题 = 双 store 归一**（TPC 读面 tpcRef.current vs port 写面 EngineState——越域写改 port 后读面仍 tpcRef 即写读分裂换形）→ lock-face 必附 per-domain 读写单源归一表；判据三点：RED=SDK TodoWrite 写后读不回→GREEN=port 落点可观测 / TPC 域权限门零回归格 / port 缺席写失败 fail-visible 禁新静默换旧静默。
5. **【吸收】判据面补注册时点硬约束**：各段 lock-face 报批复文书内冻结（f4 批复即判据面冻结），先于该段任何落码；gate 开跑前全量冻结；段 X 双分支判据面在 X-③ 批复文书分别预注册。
6. **【吸收】requestShutdown 裁出恰当 + TeamDelete 指引面不回退**：0.1.93 RED-D 修后指引面在 0.1.94 段 C 动 SendMessageTool/team 域时判别格顺带覆盖（非目标≠可回归）。

审计明示无需二审。工单 §1/§3 相应条款以本节为准。→ f4 发双信号。

## §7 f4 改判：段 X 前提溶解（e2e 勘误采纳，2026-11-09）

**勘误采纳**：XML 真形 regex（`<\teammate-message[^>]*>`）逐体扫全部 TUI capture（含 tui-r5）= 全零——「r5 8 体在场」系探针脚本文本回声假阳（grep 子串命中非标注形；0.1.93 主波 gate 报告 line 79 TUI 读数同源，勘误 4 同族新勘误）。**§13②「round 6-8 修形链回归嫌疑」不成立——TUI 车道标注面从未建立**。

**改判裁定**：
1. **段 X 收缩为 X'（判读格）**：X-① 闭环 = 勘误成立（假阳）；X-②/X-③ 撤销——无回归可修。「TUI 车道应否显示 teammate-message 标注」改归 **段 C-2 并集定谳的设计面子项**（TUI/print 收敛形差异本体）：Main 在 C-2 lock-face 中给双 lane 形态对照表（engine 副本标注形 vs TUI 纯文本形）+ 建议 disposition，若涉 UX 行为变更面呈用户。
2. **硬冻结令解除**（冻结前提 = 证据保全，前提随勘误溶解）：三对副本解冻，段 C 收敛按工单预注册纪律执行（先 diff 后删等——C-2 行为面并集定谳本就覆盖 TUI 副本清单）。
3. **round-6 RED-C 嫌疑点名销项**：嫌疑不成立，登记销项（X-① lineage 文档归档）。
4. **探针纪律升级（全波硬约束追加 §2.6）**：子串 grep 断言一律升级形锚 regex（文本回声假阳防线；0.1.93b 勘误族第二例——marker 自回声 + 子串回声两形）。

## §8 f4 批复：段 C-1 lock-face（2026-11-09）

diff 定谳采纳（身份段 11 函数逐字零 delta 仅 import 面 / 尾 3 AppState 函数算法逐字同纯类型面差异 = 单源谓词封装语义等价 / TUI 尾 3 零活消费者 / setDynamicTeamContext 零活跃调用点——单源化消除双副本模块态分裂隐患）。**方案 A 批准：TUI 副本整文件直删，15+1 消费点改道 engine 单源**；备选 B 否决采纳（尾 3 依赖 task 域类型不能进 shared，收敛不彻底）。

**附带条件（一条）**：改道 import 面须走 **engine 门面/barrel**（boundaries entry-point 纪律：外域禁 leaf 直引——round-8 先例「import 站点走 barrel 别名」；tui→engine 先例 contextHostWiring 等均 `from 'src/engine'` 门面形）。若 boundaries 校验对 deep path 放行亦以门面形为准，落码前 boundaries checker 实核 exit=0。

判据面冻结（随本批复）：① 结构断言（身份段实现体实例数=1 修前红/修后绿 + `src/tui/utils/teammate.ts` src 引用面=0，import 面计数非文本 grep——§2.6 纪律）；② 行为恒等格（身份函数行为锚单测修前后同绿 + ATLAS_PLAN_MODE_REQUIRED 两态）；③ 四件套全绿 + canon Δ 恰合。

## §9 f4 裁处：C-1 收尾采认 + C-3 改判 + C-2 disposition（2026-11-09）

### ① C-1 收尾采认

32 消费点改道（首轮「15+1」漏计 = .tsx 后缀 + 短相对路径两批）、boundaries checker 当场抓 10 漏网点（有效性实证）、判别格 RED→GREEN（红验中现形并修正判别格自身两处路径 bug = 红验有效性实证）、四件套 canon 5742/0 Δ+5 恰合——全部采认。**bundle Δ=+43,917B 采信为门面形条件的结构性成本**（barrel 扩大可达性面；18MB 基数上可忽略，正确性 > 体量），窄门面回收（engine/messaging/index 若 boundaries 放行）登记后续波评估面非本波。

### ② C-3 改判：活双副本收敛（孤儿判假阴采纳）

`InProcessBackend.ts:13` 短相对路径 import 实证 = TUI runner 副本**活**（TUI 车道 in-process backend spawn 入口）。工单 §0.1「零 import 孤儿」与审计「孤儿实证」双双假阴——**同族第三例**（XML 子串回声假阳 / C-1「15+1」漏计 / C-3 路径子串假阴）。**方法论硬约束升格 §2.7：importer/consumer 枚举必须经 module specifier 解析（ts 模式串或边界 checker），禁路径子串 grep**；工单 §0/审计锚点面以本实证为准修订。C-3 改归「活双副本收敛」与 C-2 同序列（先 diff 定谳再收敛，engine swarm 副本为修形活态基座）；Main 补 diff 定谳报批。注意面：两副本各在不同 lane 活（e2e round-7 实证成员执行 engine 副本 + 本实证 TUI backend 走 TUI 副本）——收敛判别格必须双 lane wire 直证。

### ③ C-2 disposition 裁定

- **收敛基座 = engine 副本**：采纳（活态修形落点 + fail-closed 纪律 + setTeamFileLoader 接线闭合）。
- **分叉 1（handleShutdownApproval）**：并集方案采纳——in-process 支以 engine 正形为基（SessionContextPort + live 谓词 + status 判）；tmux 成员车道保留 TUI 进程级 gracefulShutdown 兜底支但**补 status 判**（消陈旧任务 abort 面）；两态诚实文案维持。
- **分叉 2（team 解析）**：engine 形胜（fail-closed），采纳——定性 fail-silent 修形非行为回归。
- **分叉 3（plain 投递通道）**：名路由支并集进单源 tool 保 TUI 车道现行为（零 UX 变更）采纳；**engine lane 触发面先实证后裁**——Main 须先实核 headless 是否注册 agentNameRegistry：若不注册 = engine lane 行为零变更零裁定；若注册 = 涉 UX 面，两选项（统一纯文本 vs 保持分叉登记）面呈用户裁定，禁静默择一。
- **TaskOutput agentId 契约缝**：本波附带修（C-2 同域契约缝，spawn 补注册对齐 resume 链先例），判别格随 C-2 冻结。
- 判据面待分叉 3 实证结果随下批批复冻结（bundle 实例数=1 + 双 lane wire 直证 + canon + §2.6 regex 形锚 + §2.7 specifier 解析）。

## §10 f4 裁处：分叉 3 + C-3 反向面原则 + 第四对 + 判据面冻结（2026-11-09）

### ① 分叉 3 处置：**选项 2 收窄并集批准**

实证采认（registry 全仓零 .set() 写入 = 恒空死态；名路由实触发腿 = toAgentId a-形 pattern + evicted-resume；TUI spawn 不写 appState.tasks）。裁 evicted-transcript-resume 兜底支（= spawn 不注册的补丁面，C-2 附带修 spawn 补注册后前提消失），保留 running→queuePendingMessage / stopped→resume 两支（tasks 在场才触发）→ headless 窄视图无 tasks = 门恒不触发 = engine lane 零变更**无需面呈用户**；TUI lane spawn 补注册后 running/stopped 支从恒 evicted 兜底改善为正形。附带登记：agentNameRegistry 恒空死态（UI 遍历组件恒见空）入观察池非本波。

### ② C-3 反向面 disposition 原则：**采纳 Main 三分原则，主系统提示词项改判「机制/策略分离」**

- UX 观测面（progress tracker 逐消息镜像 / currentWorkAbortController task 态存取 / onPermissionWaitMs 记账 / per-iteration permissionMode）：**保留适配进单源**（单源 runner 须承载这些钩子面）。
- 旧语义缺陷伴随面（P1 mailbox 无 deadline /「is now exiting」谎面 / 字面 status 比较）：**随 E 正形裁除**。
- **主系统提示词基底差异改判：机制/策略分离**——runner 机制收敛 E 形（buildTeammateSystemPrompt 参数化构造）；TUI lane 成员提示词基底 = 调用侧策略，由 TUI 调用点显式传参保持现行为（零成员行为变更）。**若调用侧无法等价传参，该子项面呈用户裁定禁静默择一**（报批文书须含两侧成员 prompt 实文对照）。
- TUI lane round-3/6/7 修形语义升级（fail-closed/ack 两态/窄口嗅探）= **既定修形传播非新行为面**（用户已裁波次），gate 报告作 behavior-upgrade face 登记不另呈。

### ③ 第四对 InProcessBackend：**不入本波，C-3 最小改道**

C-3 范围 = runner 单源化 + TUI InProcessBackend **import 面最小换道**（指向 E runner，保持 TUI backend 现行为）。InProcessBackend 对完整收敛（src/swarm/backends + src/tui/utils/swarm/backends）登记 W-D-B 池后续（scope 纪律：防收敛链无界蔓延）。

### ④ C-2/C-3 判据面冻结（随本批复）

bundle/模块实例数=1（import 面计数）+ **双 lane wire 直证**（T lane 判别格以修形后语义为准：round-3 fail-closed / round-6 ack 两态 / round-7 窄口嗅探 + A6 有界终止 TUI 探针格 + TaskOutput spawn 补注册格）+ 反向面保留项行为锚 + canon + 四件套 + §2.6 regex 形锚 + §2.7 specifier 解析。C-2、C-3 依序落码。

## §11 f4 批复：C-2 port 注入承载形（2026-11-09，非偏离报备）

nameRouterPort（六原语 TUI 组合根注入；判定与文案逻辑本体留单源 call）+ selfTerminatePort（gracefulShutdown 动作经 port，逻辑含 status 判补留单源）+ TUI 薄 wrapper（spread + renderToolResultMessage 留 TUI 渲染 + prompt 槽）+ TaskOutput 缝修（TUI AgentTool async spawn 补 registerAsyncAgent 对齐 resume 链先例）——**批准**。依 §10①②：headless 不注入 = 支整体缺席 = engine lane 零变更（较「门恒不触发」更净）；逻辑实现体实例数=1 不受影响。沿 RF-T1/setTeamFileLoader 注入先例合规。

## §12 f4 采认：C-2 收尾（2026-11-09，@820fc282）

判别格 8/8 GREEN（红验 = HEAD 临时树模块加载红，临时树清）；canon 5750/0/461 Δ+8 恰合；四件套全绿；commit 8 文件 +670/−919（engine 并集 + 三层 barrel + TUI 927L→~230L 薄 wrapper + prompt.ts 直删 + AgentTool spawn 补注册）。三处自决实现形**采认**：① spawn 补注册取 registerAsyncAgent + runAsyncAgentLifecycle 全形（裸注册钉死 running——lifecycle 托管终态+finalize+通知 = §11④ 语义实质化，正解）；② port 原语补 context 形参（TUI store 无模块单例，承载形实质不变）；③ 泛名 5 型族经 team 子门面直出 engine/index（root 门面 namespaced 政策不破）。bundle Δ≈+28KB vs 0.1.93 基数（C-2 删 927L 后回落）——结构性成本口径延续 §9① 登记。

## §13 f4 批复：段 C-3 lock-face 五点（2026-11-09，@83141163）

diff 定谳采纳（语义差非漂移：loop 形不同构 T=for-await/E=Promise 形；单源基座 = E；T 不可纯直删）；换道影响面两点新实证采纳（TUI 组合根不跑 compose → 注入窗须 TUI 侧补接线；换道 = T lane 获 0.1.93 修形全族）。**主系统提示词：等价传参可达确认采纳——buildTeammateSystemPrompt 增可选 mainSystemPrompt，TUI InProcessBackend.spawn 显式计算 getSystemPrompt 传入，compose lane 缺省恒等（无须面呈用户，§10② 条款闭合）**。五点裁处：

1. **progress tracker = 案 1（engine runAgent 增可选 onMessage 参）**——§10②「UX 观测面保留适配进单源」直接适用：轮末映射 = TUI UX 降级，违保留原则。可选参缺省 undefined = 既有调用方零变更。
2. **per-iteration permissionMode = 案 1（TPC mode 覆盖钩子保真）**——同为 UX 观测面（成员轮间 permission mode 变更传播）；案 2 顺延 = TUI 行为回归窗口，违保留原则。若落码揭示钩子非小 diff，可回落案 2 但须先报 f4（row F）。
3. **换道 import 形 = 复用既有 seam 窗**：tui/factory 组合根补显式装配（setStartInProcessTeammate + setTeammateToolRegistryDeps，PRT-2 同款；E runner 窗未设 fail-soft 缩水面随接线消除）——InProcessBackend 换道经既有 requireStartInProcessTeammate 端口，**禁新建第二承载**；单 spawn 入口不变量维持。
4. **exiting 谎面 = C-3 内一行顺带改**：ShutdownMessage.tsx:124 与 C-2 两态诚实文案直接矛盾，同域登记缺陷销项非蔓延；判别格 = 文案与单源诚实文案对表。
5. **mainSystemPrompt = 单串**：拼装序（main→ADDENDUM→custom→append ≡ T 形逐字）固化于 buildTeammateSystemPrompt 单点；parts 数组 YAGNI 不取。

判据面冻结（E 节五项全准）：结构断言（实现体实例数=1 且在 src/swarm + T 副本路径存在性=false）/ round-3/6/7 修形形锚 + 换道 import 形锚 / A6 有界终止 TUI 探针格（termination 缺省 fail-closed max-turns 200 经换道 TUI lane 可达）/ buildTeammateSystemPrompt 两态 + gate 钩子行为单测 / canon Δ 恰合 + 四件套。批复后依序落码，D 节 bundle Δ 实测登记随收尾报。

## §14 f4 批复：C-3 收尾采认 + 段 M lock-face（2026-11-09，@29de9e74/b3a380aa）

### ① C-3 收尾采认

五点批复落码全形采认（A-I 十四目）；f4 亲验判别格 wdb-c3-runner-single-source.test.ts = **13 pass / 0 fail**（worktree 实跑）。附带改判采纳（twin 判别格两处同步：Q1-2 T twin import 断言 → existsSync=false 单源断言；Q4b 仅标题订正——机械随单源化，行为断言不变）。bundle Δ 实测 −53,372B 源裁除登记，终值以段 L release SRI 四值口径为准。

**minor UX 偏差两点采认登记观察池（非静默，合规）**：① progress tracker 跨 prompt 累积非逐 prompt 重置（调用点无法感知单源 runner prompt 迭代边界的结构性成本；task.messages 逐消息实时镜像不受影响）；② E 轮末 allMessages 全量覆盖与 onMessage 逐消息镜像并存（最终态一致 E② 锚保底）。不新增波面。

### ② 段 M lock-face 批复

缺陷实锚（双重 fail-silent）/ SDK lane 消费面枚举表（TodoWrite 主体 + plan 族 TPC 域内零影响 + task 族已单源 + team 族门 OFF 登记级）/ per-domain 读写单源归一表（TPC 域零变更 + todos 域 port 双向 + tasks 域 engine services）——全采纳。

**裁点：TodoWrite 通道形 = 双通道批准（port 注入优先 / setAppState 回落）**，理由：缺陷面仅 makeCtx 窄 updater（SDK lane）；TUI 全量 store 的 setAppState 面本就正确，单通道强行扩入 TUI = 零收益回归面，违最小 scope。**附带两条件（硬）**：

1. **fail-visible 落点前移 makeCtx 构建期**：port 组装失败 = 构建期显式 throw（错误含落点指引）；**TodoWrite 写入期禁静默回落到窄 updater**——否则旧 fail-silent 换形复辟（回落支合法性前提 = 上下文非 makeCtx 窄形，即 TUI lane）。
2. **判别格补一格**：makeCtx 产出 ctx 结构断言恒含 port（SDK lane 回落支不可达证明）——「回落存在但 SDK lane 永不可达」须判别格钉死，禁口头保证。

判据面冻结（§6④ 三点 + 本批复）：RED=SDK lane TodoWrite 写后读不回 → GREEN=port 落点可观测（oldTodos 回读正确）/ TPC 域权限门零回归格（plan 族 setAppState + checkPermission gate tpcRef 活读修前后恒等）/ port 组装失败构建期 throw fail-visible / makeCtx ctx 恒含 port 结构断言 / 四件套 + canon Δ 恰合 + §2.6 regex 形锚 + §2.7 specifier 解析。批复后落码段 M，随后段 G gate（含 §6① 0.1.93 前滚判据面复跑：①T8 全链 + ⑤ O4 名义形锚 + Q1-Q4 + round 1-8 判别格）。

## §15 f4 批复：段 M 收尾采认 + 段 G gate 判据面冻结（2026-11-09，@8f3a32d2）

### ① 段 M 收尾采认

f4 亲验判别格 wdb-m-makectx-port.test.ts = **7 pass / 0 fail**（worktree 实跑）。§14 两硬条件落实核验：构建期 fail-visible 守卫（错误含落点指引 + 禁令引用）✓；SDK lane 回落支不可达 = `SdkToolUseContext.todosPort` required 字段形锚（tsc 红门槛，构造点实测 2 处补齐）+ port-first 分支形锚 ✓。三点必答判别格（RED 5 红→GREEN 7/7 / TPC+TUI 回落支恒等全程绿 / fail-visible regex 形锚）采认。⑤ 深路径改门面 re-export 自决**采认**（cli→engine STR-1 entry-point 纪律遵守，零行为差异，恰属「正确形免批复」类）。四件套 + canon 5770/0 Δ+7 恰合采认。

### ② 段 G gate 判据面冻结（预注册，禁临跑拼凑）

- **A 前滚复跑（§6① 审计必改①，硬）**：①T8 全链（含 r8b TEAM-DELETE-OK 腿）+ ⑤ O4 名义形锚五要素 + 段 Q Q1-Q4 + **0.1.93b round 1-8 判别格点名复跑**（回归格口径同 r-20261109-gate-093b：11 腿零回退、四腿优于基线）。
- **B 本波判别格四套全绿**：wdb-c1（teammate.ts 结构断言）/ wdb-c2（SendMessageTool 8 格）/ wdb-c3（runner 单源 13 格）/ wdb-m（makeCtx port 7 格）——gate 报告逐套引用。
- **C e2e 双 lane wire 直证**：成员执行走 engine 副本（round-7 手法）+ **TUI backend 换道后 spawn 可达腿**（in-process spawn 经 requireStartInProcessTeammate 端口 + factory 组合根装配实证）+ A6 有界终止 TUI 探针格（termination fail-closed）。
- **D 结构断言**：T 副本三路径 existsSync=false + 模块实例数=1（已在 unit 套，gate 报告引用）。
- **E canon**：FORCE_COLOR=3 CI=true bun test --isolate tests/ 全绿，Δ 恰合口径（基线 5770）。
- 探针纪律 §2.6 regex 形锚 / §2.7 specifier 解析全程；row F 预注册；gate 由 e2e 执行（角色矩阵），Main 判据面照此预注册后发信号。
- **F gate 后段 L**：release 0.1.94 标准链（SRI 四值 + npm --registry npmjs.org + 生产 lane 含 O4 复验）。
