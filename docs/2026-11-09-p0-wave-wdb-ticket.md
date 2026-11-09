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
