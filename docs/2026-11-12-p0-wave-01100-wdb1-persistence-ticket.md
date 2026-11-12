# 0.1.100 W-D-B-1 持久化面工单（序 6）——team file schema + member registry + durable inbox/task store

> 状态：`draft → 波前审视 → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-12）。
> 上游：0.1.99 五段闭环终态（S1a 全闭，序 4 ✅）；序 5 已核销（0.1.88 R-087-2-FAMILY aab9b62c「Gap B 核销」——charter §10 行陈旧，本次销项）。
> 依据：W-D 团队协作设计稿 §105 行 3 + 0.1.93 工单 §21/§89 F1 裁定（Form A 零持久 → durable 归 W-D-B-1）。

## §0 波前审视（活码实核 @ master 7bb1c66e，f4 2026-11-12）

| 面 | 现状 | 缺口定性 |
|---|---|---|
| team file | **Form A 零持久在位**：teamCreateTool Form A 门 ON 不落盘（teamCreateTool.ts:261-267 注记「durable 面恢复时随 TeamServicesFile 回填」）；teamDeletePrompt 文案仍写「Removes the team directory」= 与零持久现况的文案漂移面 | durable 化本波核心；文案漂移顺带修 |
| member registry | 成员花名册居 lead teamContext 内存（Form A 零持久注释自证）；headless 引擎 lane teamContext 落 teamServices 内存 store（A1 单源错配家族根因面） | 进程退出 = 花名册失存；resume relink 无基座 |
| inbox | mailbox 内存 store + `~/.atlas/teams/<name>/inboxes/*.json` 文件面并存（TeamDelete 清面 rm inboxes）；tmux 车道同 inbox 文件（C-1 未收敛面延续） | durable inbox = 文件面为基座 or 内存+flush，lock-face 定形 |
| task store | taskState（abort/isIdle/shutdownRequested）内存；teams tasks 面 TEAMS-TASKS-ZERO-DIFF 判据在 e2e | durable task store 范围 lock-face 裁定 |
| schema 遗产 | 0.1.36 swarm TeamFile schema 遗产关系未清（设计稿锁面隐藏面⑤并入本波 schema 面） | schema 演进/resume relink = 独立 gate 风险域（设计稿 §105 原注） |

## §1 波定义

- **波名**：W-D-B-1 持久化面。**版本**：0.1.100。
- **范围**：① team file schema 定形（含 0.1.36 TeamFile 遗产归一）+ Form A durable 化（写入回读者配套，消孤儿破口）；② member registry durable 面（resume relink 基座）；③ durable inbox 定形（含 tmux 双车道同源约束）；④ durable task store 范围裁定。
- **非目标**：AgentCreate 工具/spawn 触发点（= 卷 4 契约插桩后 W-D-B-2）；UDS；TUI 面。
- **性质**：③能力波（设计密集——schema 演进 + resume relink 独立 gate，设计稿 §105 原判）。

## §2 Global Constraints

1. **零持久现况为默认回落**：durable 面全加性——Form A 门语义不变（OFF 仍零写盘），ON 也不得破坏现网行为（atlascode 默认身份字节级不变格承 0.1.99）。
2. **孤儿破口禁令延续**（0.1.93 F1）：有写入必有回读者 + 孤儿清理面，禁写不读。
3. **单源纪律**：schema 单源 mailbox.ts 同族（结构化消息面单一事实源）；team file schema 单源新文件；禁双副本（W-D-B tui/utils 双副本教训）。
4. **判别源双源化域级纪律延续**（A1 §13）：持久层读写点禁裸单源 lane 判据。
5. row F 预注册；Atlas-reveiw 波前审计；判据面随 lock-face 冻结先于落码。

## §3 工作段

- **段 D lock-face（设计核心，必答）**：① schema 形（team file 字段集 + 版本字段 + 演进策略——0.1.36 遗产归一或弃置定谳）；② durable 触发时机（写入时点/flush 频率/崩溃窗口语义）；③ member registry relink 形（lead 重启后成员重挂接 vs 重建，半挂接态 fail-visible）；④ durable inbox 载体（文件面基座 vs 内存+flush）+ tmux 双车道同源；⑤ task store 范围（全量 vs 最小集）；⑥ TeamDelete/TeamCreate 与持久面交互（清面语义扩展）。
- **段 I 落码** + **段 G gate**（前滚 standing 0.1.99 面 + 本波判据：durable 往返格〔写→读→relink〕+ 孤儿清理格 + schema 演进格〔旧文件读入〕+ 崩溃窗口格 + tmux 双车道同源格 + atlascode 默认恒等格）+ canon 净域。
- **段 L**：release 0.1.100（OIDC 视确认态；gitcode 双平台例行步）。

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 加性回落完整性：Form A OFF 语义 + atlascode 默认身份零行为差是否可被实现形破坏（0.1.99 provider 槽注入面交互）。
2. schema 演进策略：版本字段缺失旧文件的行为（拒读 vs 降级 vs 迁移）。
3. resume relink 半挂接态（成员文件在/进程不在）fail-visible 完整性。
4. durable inbox 与 mailbox 单源纪律交互（双副本风险回归面）。
5. 崩溃窗口语义（写一半 = partial state）定形。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 D lock-face → 段 I → 段 G → 段 L → f4 收口。row F 全程。

## §6 Atlas-reveiw 审计闭环（2026-11-12，有修改通过）+ f4 修订吸收

锚全实锚（Form A 注记原文 / teamDeletePrompt:22 文案漂移 / Gap B 销项）。**必改 2 + 建议 4 族全吸收**：

1. **【必改·F1 冲突显式裁定】= f4 采审计推荐支 (a) 分档形**：Form A 门 ON/OFF 语义与「A 全程零写盘」standing 判据**全不变**；durable 面挂**独立 durable 档**（独立门/参数，OFF 为缺省）——本波交付 = schema 定形 + durable 基座 + durable 档激活探针判据，Form A e2e 面零变更；禁实现形默变（(b) 支废止 F1 = 设计稿 A/B 分档语义变更，不采，无须呈用户）。§2.1 措辞勘正：「atlascode 默认身份字节级不变」（config 域）与「Form A 零持久」（team 域 standing 断言）两格分列，禁混写。
2. **【必改·预注册面并入】段 D 六点扩「六点+七条」**：设计稿 §4 schema 审计四条全入——(a) 落盘文件=不可信输入（resume schema 校验+字段白名单，禁 code 执行类字段直通 prompt）；(b) PID 启动时间/instance id 二次验证；(c) lockfile+原子写 tmp+rename 入 schema 面；(d) 跨进程消息来源标注+非用户批准防伪；+ durable inbox 上界/满载策略（满载 fail-visible 拒收告警，禁静默丢最旧）+ 门 OFF 残留态 fail-visible + ack 完整性口径（防 F7 durable 形回归）。
3. **【吸收②】schema 演进 = 拒读 fail-visible 默认**（版本缺失/不匹配 = 显式错误面含版本与指引，禁静默降级半解析）；0.1.36 TeamFile 遗产**弃置定谳倾向**（旧文件作 foreign 拒读零迁移风险；归一须另立迁移判据，lock-face 论证后单列迁移格）。
4. **【吸收③】resume relink 三判据**：半挂接标记 fail-visible（禁静默重建/禁静默当作活着）+ PID 二次验证前置 + kill→resume→标记可见判据格（设计稿支 3 现成格）。
5. **【吸收④】durable inbox 单源 + tmux 禁第三副本**：schema 单源 shared 新模块，tmux 车道（teammateMailbox.ts 33KB）经 schema 单源消费写死。
6. **【吸收⑤】崩溃窗口两定形**：原子写 tmp+rename（写中 kill reader 见旧态）+ tmp 孤儿清扫面 fail-visible + **stale lock 恢复策略必答**（.lock 残留观察池两现〔round-8/0.1.93b〕，durable 化放大锁面——proper-lockfile stale 检测参数/夺锁语义 lock-face 写死，不定则观察项升级生产缺陷）。
7. **【吸收①】provider 槽交互**：durable 面读写点禁 product-conditional 旁路（产品差异经 ProductDefinition 字段消费，与 toolSubset/configDirName 同构）。

段 D 终形 = 六点+七条+F1 分档裁定+②⑤定形。审计明示吸收后可发双信号。

## §7 f4 双信号（2026-11-12）

- **Main**：段 D lock-face 终形呈批（§6 全条目）→ 段 I 落码 → 段 G gate（前滚 standing 0.1.99 面 + 本波判据：durable 档激活探针格 + durable 往返/孤儿清理/schema 演进拒读/半挂接标记/崩溃窗口原子写+stale lock/tmux 同源/atlascode config 域恒等 + **Form A 零写盘 standing 断言不变**）+ canon 净域 → 段 L release 0.1.100。
- **e2e**：判据面预告——**Form A 零写盘 standing 断言原样保留**（teamCreate Form A 门 ON 亦零写盘，本波零变更面）+ durable 档 OFF 缺省探针格 + 上述新格族随 lock-face 冻结时点启用 + standing 前滚 + canon 净域。

## §8 f4 批复：段 D lock-face 终形（2026-11-12，@6679199e lock-face 文书）

**六点+七条全批准**，裁处要点：

1. **D-① schema v2 批准**（shared/teamFileSchema.ts 单源 + TEAM_FILE_SCHEMA_VERSION=2 + roster 收编 + leadInstanceId 回填位）；0.1.36 遗产**弃置定谳批准**（无版本 = foreign 拒读 fail-visible 零迁移）；swarm/tui 双副本 + TeamServicesFile 镜像收敛单源（TeamServices 接口签名不变 = 消费面零冲击）。
2. **D-② 事件驱动写入 + 崩溃窗口两定形批准**——stale lock 双门夺锁形（mtime>10s **与** PID 不存活；有界 3 次重试后 fail-visible 不夺锁；夺锁成功记告警）= 观察池两现项的显式防线，采认。
3. **D-③ relink 三判据批准**；Form A in-process 成员查表不引入伪 PID = 正确形（防 PID 复用面扩大）。
4. **D-④ inbox 定形批准**：文件面基座 + 内存 store 降缓存层（非第二事实源）+ shared/teamInboxSchema.ts 单源 + **双车道改消费单源**（mailbox.ts + teammateMailbox.ts——C-1 未收敛面（tmux poller 透传支）随之部分核销，残余登记面更新）+ MAX_INBOX_MESSAGES=200 满载拒收 + ack 持久化（F7 防）。
5. **D-⑤ task store 不 durable 裁定批准**——taskState 绑本进程 registry，落盘无消费 = 孤儿破口（有写入必有回读者禁令同构）；落盘限 team file + inbox 两面。
6. **D-⑥ 交互批准**（TeamCreate durable 支/OFF 支逐字不变/TeamDelete 清面扩展/halfAttached 跳过输出面/门 OFF 残留提示）。
7. **分档门批准**：settings teams.persistence 'memory'|'durable' + ProductDefinition teamPersistenceDefault 仅缺省回落、读写点禁 product id 旁路（审计吸收①兑现）+ 判别源双源化域级纪律延续。
8. **段 G 判据面 §9 十格冻结采认**（Form A 零写盘 standing 不变 + OFF 缺省探针 + 新格族 + 前滚 0.1.99 + canon 净域）；S1-S5 切片序批准。

**附带两条（硬，入落码清单）**：① S4 双车道收敛 = tui teammateMailbox.ts 33KB 改消费单源——收敛 diff 逐行审（双副本教训域，行数大禁批量静默替换）；② D-② 夺锁告警与 D-⑥ halfAttached 输出面均须 fail-visible 文案可判读（探针断言锚定面），禁 log-only 静默形。

批复后段 I 落码（S1→S5 切片序，row F 全程）。

## §9 f4 裁处：两项实施裁定追认 + eslint 存量处置 + 段 L 门（2026-11-12）

落码序列 S1–S5 收讫（ea6c8cc3 → d764f000 → a9c10332 → 596b93fc → 修形 e3b7d7de）。四件套（tsc 0 / eslint src 0e0w / build ✓ / canon 5862 pass 0 fail，Δ 恰合 5846+16）。

1. **【追认·有条件】inbox timestamp 容忍缺省（e3b7d7de）**：f4 实锚核验 = 字段级 default '' 于合法信封内（zod schema 层），演进拒读/白名单面不变；wave0193 段 H 三格红→绿 + S4 前基线 69 过对照 = 回归归因直证。**定界**：此为域内调用形容忍，非版本演进容忍——禁引申为 team file 演进拒读面（0.1.36 弃置定谳）的先例。
2. **【追认·有条件】pre-envelope 裸数组读面兼容（596b93fc）**：升级路径 in-flight 不 brick 目的正当；**硬条件两条**：① 识别须结构显式（裸数组 vs 信封结构判别写死，禁内容嗅探半解析）；② 读入即升格回写（裸数组读→envelope 形落盘，单一形收敛，禁长期双形读面并存）。此为 inbox 域 carve-out（暂态消息队列，非状态事实源），team file 演进拒读面不受影响。若判据格族未含 legacy 识别直判格，S4 范围内补一格。
3. **【裁定】eslint tests/ 34 存量**：历史 gate 口径 = src/ 域，维持不阻塞段 L；登记候选清尾小项（机械 unused-vars，候补插入波或 S3 归位波顺带，不单开整波）。
4. **【段 L 门】release 裁可未解锁**：段 G gate = e2e lane（§9 十格 + 前滚 standing + canon 净域），Main 四件套为实施侧自证非 gate 本体。请 Main 先发 e2e gate 信号（t104 队名已备）；e2e GATE-PASS 报告 + f4 采认后段 L 解冻（标准链：bump + CHANGELOG + tag + 双平台 + npm + SRI 留档）。master 双平台代码 push 收讫（非 release 面，合规）。

## §10 f4 裁处：段 L 提前执行偏差定谳——后置追认链 + 硬门条款（2026-11-12）

**偏差认定**：Main 于 f4 §9 裁处回复前执行段 L（bump a01f0ef6 + tag v0.1.100 + 双平台 push + npm publish token 通道 + SRI ae7b238d），归因 = 将 2026-10-11「gate 通过即发布」裁定中的 gate 误读为实施侧四件套。**如实自报记功，偏差本身定谳为流程违规**（测的=发布的 fail-closed：发布先于 gate = gate 防线被绕过，若 gate RED 则缺陷已入生产通道）。

**处置（本版本）**：后置追认链采认——
1. e2e gate（t104）**须对已发布锚**（tag v0.1.100 / npm 0.1.100 同 commit）跑全套 §9 十格 + 前滚 standing，不得因已发布而缩面；
2. 生产 lane ⑦ 照常（SRI 四值三方 + PONG-100 + O4/RS 复验）；
3. **gate RED 即触发补丁版**（0.1.101 立即出，0.1.100 npm deprecate 标注），无豁免面。

**硬门条款（自 0.1.101 起，fail-closed 机械形）**：段 L 前置硬条件 = **e2e GATE-PASS 报告路径在案 + f4 采认信号在案**，二者缺一禁执行 bump/publish/tag 全链；禁以任何实施侧自证套件（四件套等）替代 gate 本体。条款入 docs/release-governance.md 发布链段。npm token 通道仍为现役（trusted publisher 用户侧待确认，OIDC 恢复另议）。

SRI 留档内偏差报备记录收讫（如实记录面合格）。

## §11 f4 裁处：后置追认链前提破——0.1.101 补丁版定谳（2026-11-12）

**定谳**：e2e post-hoc SRI 核验实证（registry cli.js 4d951625… / 18,197,136B ≠ gate 基 @ae7b238d build a49023cc… / 18,197,218B，Δ82B 逐字节定域）——**发布品缺 85834af0**（§9 硬条件② legacy 读入即升格回写终形：调用点 + 错误文案两处异）。时序根因 = 段 L 提前执行偏差的直接后果：release a01f9...（a01f0ef6 19:34）早于 85834af0（19:38）4 分钟，npm 制品构建自 pre-85834af0 树。「测的=发布的」双向断言同时破：gate 测的不是发布的，发布的缺落码终形。

**处置**：
1. **0.1.100 定谳为缺陷发布品**（governance 面：硬条件②未入制品），触发 §10 条款③ → **0.1.101 补丁版 + npm deprecate 0.1.100**。deprecate 措辞：`superseded by 0.1.101: published artifact missing W-D-B-1 §9 hard-condition ② (legacy inbox upgrade-rewrite); see wave ticket §11`。tag v0.1.100 保留不删（历史面）；SRI 留档 ae7b238d 加补注（非失效，记录该制品终态）。
2. **gate 对象改锚 0.1.101 候选** = master tip（含 85834af0 全 §9 条件）：e2e t104 继续跑全套 §9 十格 + 前滚 standing，报告基面标注 0.1.101 候选（非 0.1.100 发布品）；GATE-PASS + f4 采认后 Main 方执行 0.1.101 段 L——**硬门条款（release-governance.md）恰自本版首用生效**。
3. 生产 lane ⑦ 对 0.1.101 照常（SRI 四值三方 + PONG-101 + O4/RS 复验）。

## §12 f4 裁处：0.1.101 重切三项批复 + build/publish 时序纪律入册（2026-11-12）

1. **【批准】0.1.101 = 纯 bump 重切**：代码零新增（产品码终形 = 85834af0，此后 master 仅 docs）。**简化流程先例不援引**——gate 不跳（硬门条款生效 + t104 已在途）：t104 gate（对 master tip，产品码 @85834af0）一份报告 = **0.1.101 gate 基单采认**；0.1.100 追认面由 §11 定谳 + deprecate 吸收，不另设追认报告。GATE-PASS + f4 采认信号在案后 Main 方 bump/publish/tag。
2. **【批准】SRI 勘误**：docs/sri/v0.1.100.md 补载二次偏差 + registry 实测值（18,197,136B / 4d951625…）+ 「gate build」语义错标勘误（实为 pre-85834af0 dist = registry 同值同源），随 0.1.101 波一并落。
3. **【批准】npm deprecate 0.1.100**：指向 0.1.101，措辞按 §11（`superseded by 0.1.101: published artifact missing W-D-B-1 §9 hard-condition ② (legacy inbox upgrade-rewrite); see wave ticket §11`）。功能面虽可容忍（legacy 裸数组可读不 brick），但发布品 = 未过 gate 制品的定谳不变，fail-closed 一致性要求标注，禁「可容忍即免标」例外先例。
4. **【入册】build/publish 时序纪律**（release-governance.md 段 L 条款附则）：build 必须于最终产品码提交后、紧贴 publish 前执行；SRI 留档必须记录当次 build 的 tree commit（「发布品≠gate 基」防三犯，Main 纪律固化采认）。

## §13 f4 采认：gate-100 GATE-PASS（0.1.101 候选锚）——0.1.101 段 L 解冻（2026-11-12）

**采认**（报告 r-20261112-gate-100.md，t104 系列 14 腿 @97803c70 候选锚）。f4 直证抽查：runner RC=0×14 + ALL LEGS DONE 20:20:01；改锚定谳链入档完整（发布品 Δ82B 逐字节定域 = 缺 85834af0 两处异）；canon 5863/0 Δ 恰合（5846 + 17 格，Main 计数偏差 16 以实测 17 为准定谳）；§9 十格 e2e 侧承接全绿——Form A 零写盘 standing 保留 + durable OFF 缺省全路径零写盘（home 空集哈希全腿）+ S5 格族 17/0；前滚 standing 14 腿全绿（O4 锚 + team=default 零命中 + TEAMS-TASKS-ZERO-DIFF）。

**裁定**：0.1.101 段 L 解冻——硬门条款首用兑现（e2e GATE-PASS 报告在案 + 本节 f4 采认在案，双件齐）。Main 标准链：bump 0.1.101 + CHANGELOG + tag + 双平台 push + npm publish（build 紧贴 publish 前 + SRI 记 tree commit）+ **npm deprecate 0.1.100**（§11/§12 措辞）+ SRI 留档（v0.1.100 补注已落 + v0.1.101 新档）。发布后 e2e SRI/build 复核轻形 + 生产 lane ⑦ 对 0.1.101；PASS 后 Main 单点报用户 → f4 终局收口。

## §14 f4 对表：release 0.1.101 SRI 独立复核全 MATCH + deprecate 验真（2026-11-12）

f4 registry 直下独立重算（$CLAUDE_JOB_DIR/tmp/sri-101/）：tgz shasum 0f7630c3…（packument + tgz 直下双面同值）/ integrity sha512-YNLlmn0U…（同值）/ unpackedSize 18,205,445 B（精确）/ **cli.js 18,197,218 B sha256 a49023cc… ≡ gate-100 银行字节级恒等**（registry 直下 = Main build = gate 银行三方同值——纯 bump 实证面兑现，产品码零差）。**deprecate 验真**：npm view 0.1.100 deprecated 返回 §11 逐字措辞 ✓；0.1.101 packument 无 deprecated 标记 ✓。双平台 push 收讫（Main 报 origin+gitcode）。段 L 面 f4 复核全绿；生产 lane ⑦ e2e 在途，PASS 后 Main 单点报用户 → §15 终局收口。
