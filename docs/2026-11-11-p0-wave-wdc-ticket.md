# W-D-C 收尾波工单（0.1.94 闭环后技术债收尾）

> 状态：`draft → 待 Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-11）。
> 上游：0.1.94 W-D-B 五段闭环终态（release 6376326a / 生产 lane PASS / §18 收口 a807daae）。
> 排序依据：**用户 2026-11-11 裁定 B 波同意**（三件并作一收尾波，照 f4 建议序）；C 观察池裁定维持；A1/A2 待用户裁；D（纲要 §10 序 4+）本波呈用户时列具体条目。

---

## §0 波前审视（活码盘点 @ master a807daae，f4 实核 2026-11-11）

### 0.1 三项活态实核

| 项 | 实核结果 | 性质 |
|---|---|---|
| InProcessBackend 第四对（backends 目录全对） | **活双副本**：src/swarm/backends 12 文件 vs src/tui/utils/swarm/backends 9 文件；同名 8 文件 md5 全 DIFF（零纯漂移可直删）——ITermBackend 13916/12804 · InProcessBackend 12110/15924（C-3 换道后 TUI 侧为端口调用形）· PaneBackendExecutor 11854/10894 · TmuxBackend 22505/21424 · detection 5473/4495 · it2Setup 8698/6921 · registry 16466/14777 · types 9986/426（**体量悬殊** = TUI types 极薄，引擎侧为真形）；engine 侧独有 inProcessRunnerPort/teammateToolRegistryDeps/wireBackends/port 4 文件，TUI 侧独有 teammateModeSnapshot 1 文件 | 结构债（C-3 只做了 runner 单源 + InProcessBackend 最小换道，本波对全目录收敛） |
| 窄门面 bundle 回收 | **评估面活**：engine/messaging/index.ts 216L 子门面在位；C-1 的 32 消费点现行 import 走 `src/engine` 根门面（Δ+43,917B 结构性成本，§9① 登记）。C-2 先例「泛名 5 型族经 team 子门面直出 engine/index」= 子门面直出已有在案先例 | 结构成本回收评估 |
| agentNameRegistry 恒空死态 | **死态复确认**：全仓 7 文件引用（tui/main.tsx · AppStateStore.ts · useSwarmBanner.ts · CoordinatorAgentStatus.tsx · useTypeahead.tsx · TUI SendMessageTool · engine sendMessageTool）；`.set(` 写点唯一命中 = CoordinatorAgentStatus.tsx:66 系**局部 inv 映射**写非 registry 本体 → registry 本体零写入恒空，读面（typeahead 补全/banner/状态）恒空转 | 死态（读面恒空转） |

### 0.2 f4 审视自决（范围裁定）

1. **段 R1（backends 全目录收敛）**：round-8 diff-first 纪律全套（md5 全等直删；语义差并集+登记禁静默取一；types 体量悬殊预示 engine 侧为基座）。engine 侧独有 4 文件 = 注入窗/port 面（0.1.94 新建），TUI 独有 teammateModeSnapshot = 并集定谳对象。收敛基座预判 = src/swarm/backends（依赖方向 + 活态修形落点），归 Main lock-face 定谳。
2. **段 R2（窄门面回收评估）**：候选改道 = C-1 32 消费点根门面 → `src/engine/messaging` 子门面；**boundaries checker 实核为前提**（tui→engine 子路径 entry-point 放行与否先证，放行才动）；Δ 实测登记；**「否决不改道」亦为有效结论**（数据留档，不硬凑回收）。
3. **段 R3（agentNameRegistry disposition）**：**本波默认裁 = 裁除**（registry 本体 + 7 读面消费点清理，零行为变更——读面本就恒空）；**补注册链 = 新能力面（typeahead 队友名补全从未生效过）不入本波**，若 lock-face 论证补注册价值，面呈用户另裁。裁除前 Main 须逐读面枚举复核对表（防「恒空」判定存在条件分支例外）。
4. requestShutdown 工具化 / TUI 标注面（A1/A2）：仍待用户裁，不入本波。
5. C 观察池：用户裁定维持，不排。

### 0.3 判读纪律（继承全套）

func 单副本绿 ≠ e2e 双副本真环境绿；§2.6 子串 grep 断言一律形锚 regex；§2.7 importer/consumer 枚举必经 module specifier 解析禁路径子串；点火面/消费面/读面三分账；e2e 分支判读与自身持久面观测对表；row F 预注册（偏离先报 f4）。

---

## §1 波定义

- **波名**：W-D-C 收尾波（W-D 固定小组形态续，0.1.94 登记池技术债收尾）。
- **版本**：0.1.95（版本=收口契约；gate 判据面随段定谳后 f4 补注册，见 §3 段 G）。
- **范围（scoped）**：段 R1（backends 双目录全收敛）+ 段 R2（窄门面回收评估）+ 段 R3（agentNameRegistry 死态 disposition）。零新能力面。
- **非目标**：requestShutdown 工具化 / TUI 标注面（A1/A2 待用户裁）、agentNameRegistry 补注册链（新能力面）、C 观察池（用户裁定维持）、纲要 §10 序 4+（另呈）。

## §2 Global Constraints（硬约束）

1. 双副本收敛纪律（round-8 先例全套）：先 diff 后删；语义差并集+登记；bundle 实例数断言钉住；删前 import 实核（§2.7 specifier 解析）。
2. TUI 车道行为面零回归：tmux/iterm/pane 各 backend 支路判别格对表（本波触面广，回归面大——判别格须覆盖各 backend 类型，非仅 in-process）。
3. canon 护栏（15min wall + 降级阶梯）；canon Δ 恰合口径；SRI/npm 面按 release 链标准（--registry npmjs.org）。
4. row F 预注册纪律；角色矩阵照旧；Atlas-reveiw 波前审计（本工单必送）。
5. 判据面补注册时点硬约束（§6④ 延续）：各段 lock-face 批复文书内冻结，先于落码；gate 开跑前全量冻结。

## §3 工作段（预注册）

### 段 R1：backends 双目录全收敛

- diff 定谳：8 同名文件逐个（md5/语义差双档）+ 两侧独有文件（engine 4 / TUI 1）并集定谳；收敛基座预判 src/swarm/backends，Main lock-face 报批。
- 预期语义差面：TUI types 极薄（426B vs 9986B）= TUI 副本历史裁剪形；TmuxBackend/ITermBackend/registry 各有 1-2KB 差 = 语义差候补，逐条列支路。
- 判别格：bundle 结构断言（backends 各模块实现体实例数=1 + TUI 副本路径存在性=false）+ **多 backend 类型 wire 直证**（tmux/iterm/pane/in-process 各支路 TUI lane 可达性 + 判别格；in-process 支 = 0.1.94 C-3 判别格回归覆盖）+ canon Δ 恰合。

### 段 R2：窄门面 bundle 回收评估

- 前提实核：boundaries checker 对 `src/engine/messaging` 子路径 entry-point 放行与否（exit 实码留档）；不放行 = 段收缩为「评估否决」数据留档即闭环。
- 放行则：C-1 32 消费点 import 面改道子门面 + bundle Δ 实测（预期回收方向为负）+ canon 恰合 + 四件套。
- 判别格：import 面计数（specifier 解析）+ bundle Δ 登记 + tsc/eslint/build。

### 段 R3：agentNameRegistry 死态 disposition

- Main lock-face 必附：7 读面消费点逐个枚举（读什么/何时空转/裁除后影响面）；「恒空」判定复核（条件分支例外排查留档）。
- 处置默认 = 裁除（本体 + 读面清理，零行为变更）；判别格 = registry 符号全仓 specifier 解析零命中 + 四件套 + canon Δ 恰合。
- 补注册链若被论证有价值 → 面呈用户另裁，不入本波（禁静默择一）。

### 段 G：gate（判据面随段定谳后 f4 补注册）

- 基线：canon 全绿 + 多 backend 类型判别格 + bundle 结构断言 + 四件套。
- **前滚复跑（硬，§6① 先例延续）**：①T8 全链 + ⑤ O4 名义形锚（0.1.93 系列既定 standing）+ 0.1.94 wdb 四套判别格（wdb-c1/c2/c3/m）+ round 1-8 判别格点名复跑。
- 探针模型基面 = glm-5 或用户 settings 现配（row-F 纪律：逐腿标注 + RED 腿同模型 A/B 判别）。

### 段 L：release 0.1.95 + 生产 lane（标准链；SRI 四值 + f4 对表）

## §4 Review Focus（Atlas-reveiw 审计建议焦点）

1. 段 R1 范围是否过大（8 文件全 DIFF、多 backend 类型回归面）——是否需拆 R1a/R1b 分批 lock-face。
2. 段 R2 boundaries 前提若不放行，「评估否决」闭环是否需要 e2e/用户任何确认（f4 预判：纯评估面否决 = f4 数据留档自决闭环即可）。
3. 段 R3 裁除面是否可能触 UI 行为（typeahead/banner 读空数组裁除后渲染面是否有隐式依赖空 registry 的分支）。
4. 版本 0.1.95 口径与前滚判据面（0.1.94 四套 + O4 standing）合规性。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 lock-face（逐段报批）→ 段 G gate → 段 L。row F 预注册纪律全程。

## §6 Atlas-reveiw 审计闭环（2026-11-11，有修改通过）+ f4 修订

审计锚点全实锚（backends 12vs9 逐字节/agentNameRegistry 无别名写点·无 delete·clear/messaging 216L）。**必改 1 + 吸收 3，均判据面修订不动波定义，吸收后直接双信号**：

1. **【必改】段 R1 判别格可达性分层预注册（防不可达腿假绿）**：backends 选择系环境门控（detection.ts 模块级缓存 / TMUX env / registry placeholder 形）。分层取证形：**in-process = 活面 wire 直证**（0.1.94 C-3 判别格回归）；**tmux = 探针环境可置 TMUX env 则直证，否则 detection/registry 选择逻辑单测判别格**；**iterm2/it2Setup = Linux 平台结构性不可达 → 单测/结构判别格替代，禁以「环境不可达」冒充直证绿**。各层取证形随 R1 lock-face 定。
2. **【吸收】R1 拆分裁定 = 不拆**（判别格按 backend 类型非按文件，8 行 diff 表一次报批内含分批效果）；**per-file 方向禁惯性预判**：基座预判 src/swarm/backends 仅默认倾向，lock-face 逐文件 diff 表中 per-file 方向允许与基座预判相反（InProcessBackend TUI 侧为 C-3 后端口调用新形，明示防惯性取 engine 侧）。
3. **【吸收】R2 否决闭环硬条件**：否决结论须 boundaries checker **exit 实码留档入工单执行段**（非口头否决）；放行但 Δ 不可回收/负收益同径自决；无论何支 R2 结论（实码+Δ 数值 或 否决实码）入收口报告——防评估段静默蒸发。
4. **【吸收】R3 分账 + 状态形判别**：引用面按 **活读 4**（CoordinatorAgentStatus/useSwarmBanner/useTypeahead/TUI SendMessageTool 兜底链——均「空态即现行为」零行为变更成立）**+ init 2**（AppStateStore.ts:484/main.tsx:2382）**+ 注释 1**（engine sendMessageTool 5 处全注释级）分账禁混计；registry 本体 = AppStateStore 状态字段（:164/:484），判别格加 **AppStateStore 状态形判别**（序列化/持久化/快照含该字段须同清，防 dangling schema）；TUI SendMessageTool 读面 fate 按收敛后当时活码为准。

审计明示无需二审。工单 §3 相应条款以本节为准。→ f4 发双信号（Main=段 R1 lock-face 起步，e2e=判据预告）。

## §7 f4 批复：段 R1 lock-face（2026-11-11，@worktree 8c48a374）

### ① 工单勘误采纳 + 方法论注记

teammateModeSnapshot 第 9 对采纳（engine 副本在 backends **目录外** → 工单 §0.1 目录域清单漏计）——**同族第四例**（枚举面又一形：目录域清单 ≠ 全对枚举，§2.7 specifier 解析纪律本可捕获；登记入方法论：副本枚举必须 specifier 全仓解析，目录域清单仅作起点）。engine-only 4 文件定性「接缝装配件非副本」采纳（收敛后保留基座）。

### ② R1-D1 InProcessBackend = TUI 消费形为准（反基座预判）——批准

inProcessSpawnHooksPort 承载形批准（RF-T1/todosPort 同族先例；四钩子闭包体 TUI 域所有 engine 不可 import = port 为唯一合法形）；fail-soft null 缺省 = 「未接线」语义 engine lane 恒等 ✓；接线点 tui/factory 与 setStartInProcessTeammate 同批（PRT-2）✓；types.ts 窄视图按消费形扩面 ✓。**附带条件一条（硬）**：hooks factory **调用期异常 fail-visible 禁吞**——缺省 null 恒等仅适用「未接线」，已接线后 factory 抛错须向上传播，禁降级为零钩子静默继续。

### ③ R1-D2 detection 裁面维持——批准

第三指标不回填：Linux 结构性不可达 iTerm2，为不可达平台引 terminal 识别面进 engine/shared 域违最小面；前 2 指标覆盖主识别路径；macOS TERM_PROGRAM 缺省边缘 = 理论面无活证据，登记足矣。f4 不裁回填（回填另切片条款备而不用）。

### ④ R1-D3 it2Setup 持久化 port——批准

it2SetupPersistencePort 批准（todosPort 同族；null 缺省 = engine 进程内标志恒等；tui/factory 接 globalConfig 适配恢复跨进程持久行为）。**附带条件**：适配器读写异常面维持 TUI 现行为（globalConfig 抛错向上传播），禁新增吞错。备选（维持进程内标志 = TUI 行为回归）不取。

### ⑤ R1-D4 teammateModeSnapshot engine 单源 + capture(configMode?)——批准

状态分叉实证采纳（TUI 活面走 tui 模块态 / engine lane 恒走 init-bug 兜底支 + capture 裁面丢 config 读取）——「状态面分叉 = 判读分叉」登记面再添实证。单源 + 可选参（main.tsx 显式传参；不传 = 'auto' 恒等）批准，消分叉 + 恢复 config 行为双赢。**观察注记（不阻断）**：headless 无 capture 调用 → 读点仍走兜底支（现行为恒等维持）；其 logError 噪声面若需治理另登记不入本波。

### ⑥ 判别格 §3 分层表——批准（审计必改①落形合规）

四层取证形 + 防假绿条款全准；补充确认：tmux 降级单测须头注登记降级原因（已含）；R1-D4 capture 传参形锚（main.tsx 调用点带实参）入 TUI lane 装配面直证。判据面随本批复冻结：§3 全表 + 四件套 + canon Δ 恰合 + 收敛后结构三证（实例数=1 / tui backends 目录 existsSync=false / specifier 解析零命中）。

批复后依序落码：R1 修形 → 判别格 RED→GREEN → 四件套 → 报段 R2。

## §8 f4 批复：段 R1 收尾采认 + R2 否决归档确认 + 段 R3 lock-face 批复（2026-11-11，@a3edd4e3/1718e12c）

### ① R1 收尾采认

f4 亲验判别格 wdc-r1-backends-single-source.test.ts = **21/21 GREEN**（worktree 实跑）+ `src/tui/utils/swarm/backends/` 目录已删实核（existsSync=false）。35 文件 +807/−2929；四件套采认。三处自决/随行修形采认：① 判别格测试侧修形 2 处（H③ regex whitespace 容忍 / E③ export class 容忍——红验期 0 命中同因，测试形修非实现侧，先例同族）；② tui/factory 装配增量（teammateLayoutManager/teamHelpers requireBackendModule 面接线 wireBackends）——属 lock-face「接线点=tui/factory 组合根」预注册域内同族装配语句，采纳；③ R1-D1 fail-visible 落实（spawn 支无 try/catch）核验采认。

### ② R2 评估否决归档——确认闭环

boundaries/entry-point exit 1 实码已入 R3 文书 §0（§6.3 硬条件满足：实码非口头否决）；「tui→engine/messaging 窄门面结构性不放行」= 评估否决成立，零落码，§6.3「R2 结论入收口报告」条款已在案（本节即登记）。C-1 Δ+43.9KB 维持登记债。

### ③ 段 R3 lock-face——批准

分账复核（活读 4 + init 2 + 本体 1 + 注释 1 + tests 1）/ 恒空写面实证（零 set/delete/clear/下标赋值；「populated by Agent tool」= 上游残留语义）/ 活读 4 空态即现行为逐个复核（无条件分支例外）/ AppStateStore 无持久化/序列化/快照面（dangling schema 排除 + AgentId import 不孤儿）——全采纳。落码清单 §4 七文件批准。判别格三点批准，一点注记：符号零命中断言用字段字面级（registry 系 AppState 字段非模块 specifier，落地形正确）；**字面 grep 零命中方向 fail-safe**（回声假阳只会误报红不会假绿，§2.6 假绿防线天然满足，无须升级形锚——登记注记备后波引）。裁除零行为变更定性维持（工单 §3 R3 预判成立）。

批复后依序落码：R3 修形 → 判别格 RED→GREEN → 四件套 → 段 G gate（判据面已冻结：§3 段 G + R1 §3 分层表）→ 段 L release 0.1.95。
