# 0.1.113 候 W-AB4b 工单——渲染二期：帧提交节律门控（UX-4 二期；件 A 分期裁定范围）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-14）。
> 上游：W-AB4 首车定谳（§9 @a2728d6f，报告 r-20261114-wab4-instrumentation.md）——**候选② 帧数主因**：0-patch 空帧 26-47% + 帧间隔恒 63-64ms（≈15.6fps 动画节拍与变更无关）；写入面已 cell 级增量（bytes 中位 18B）。件 A 分期裁定（用户 2026-11-14）范围内二期落码；0.1.112 W-RC1 在先，件 F 顺延 0.1.114 候。

## §0 波前审视（f4 2026-11-14）

### 0.1 定谳面到修形面映射

- **抓手 1（空帧门控）**：0-patch 帧跳提交——diff 为空时跳过 commit 路径（writeDiffToTerminal 已空 diff 早退，但 render+diffEach+FrameEvent 全链仍走）。收益 = 26-47% 帧数直减 + 扫描 CPU 节省。**关键判别**：空帧定义 = 优化后 patch 流空（含 clear/cursor 类均无）——spinner 动画 tick 自身变字符为真变更帧，不在门控面（防把动画改死）。
- **抓手 2（动画帧分流，lock-face 定形）**：spinner 行 64ms erase+rewrite = pty「全行重绘」观感主体。候选形：(a) spinner 局部行更新旁路（不经全帧 commit）；(b) 动画 tick 与数据 commit 分频（动画降频/数据变更即提交）。**禁预答**——与 ink.tsx onRender/FrameEvent 消费面（仪表化/bench 双通道）交互 lock-face 定。
- **抓手 3（①并集细化）**：CPU 面收益非帧数面，**二期不排**（登记池）；③④定谳不支持。

### 0.2 验收口径（格 4 冻结继承）

「≤cc 1.5×」= 渲染口径 onRender commit 帧数比，同语料（17 腿语料 runner）双列对表——首车冻结口径不变。

## §1 波定义

0.1.113：lock-face（抓手 2 定形 + 空帧定义钉死 + FrameEvent 消费面交互判定）→ 落码 → gate（格 1-5 + 17 腿复跑）→ 段 L。零行为面注记：门控改变**帧提交时序**（行为可见面 = 流畅度提升），非零行为波——段 G gate 全格照常。

## §2 判据格（预注册）

| # | 格 |
|---|---|
| 1 | 空帧门控格：17 腿复跑 0-patch 帧占比从 26-47% 降至 ~0（真变更帧零误杀——spinner 动画帧/timer 驱动帧直证在案） |
| 2 | 帧数对表格：同语料 commit 帧数 ≤ cc 1.5×（格 4 冻结口径） |
| 3 | 终值恒等格：17 腿复跑终值与 W-AB1 基线一致（门控不改渲染内容） |
| 4 | 回归零触碰格：stalled/timer/TTFT/FrameEvent 消费面（仪表化+bench 双通道）行为零变；selection/focus/searchHighlight 交互面回归 |
| 5 | canon 恰合 |
| 6 | 时序中性面：门控后真变更帧提交延迟不升（首帧延迟分布对表首车） |

## §3 Review Focus

1. 空帧定义的可证伪形（防把低 patch 帧误杀——1-patch 帧仍提交）。
2. spinner 动画 tick 分流的语义面（动画帧是真变更——分流≠门控，两机制边界 lock-face 钉）。
3. FrameEvent 双通道消费面（仪表化指标连续性——首车口径二期可复测）。
4. cursor 模型/diff 状态面（跳过 commit 后 stale diff 状态风险——log-update diff 基线连续性）。
5. 「行为可见面」波定性（流畅度提升 = 用户可感——判据格 6 延迟面须实证非宣称）。

## §4 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → lock-face（抓手 2 定形）→ Main 落码 → e2e 17 腿复跑 + gate → 段 L 0.1.113 → 生产 lane。

## §5 Atlas-reveiw 审计闭环（2026-11-14，通过 + 1 口径钉死 + 4 吸收，@9e3411c6 + 首车定谳全锚实核）

1. **口径钉死 1（committed vs rendered 分列）**：门控后 rendered ≠ committed——FrameEvent 若对全渲染遍发射则 rendered 空帧占比不变；格 1/2 对表口径 = **committed 帧数**；FrameEvent 语义分列（扩型 committed 标志或双事件），首车复测可比性 = 双列标注（首车 rendered=committed 恒等、二期分列禁混源——W-AB5 v2 语料纪律同族）；旧消费者（bench/仪表化）兼容面核入格 4。
2. **吸收 2（空帧判据+落点+语义）**：① 空帧判据 = **patch 流构造后长度 0**（cursor/clear 类 patch 在构造层并入计数——禁 diffEach cell 口径漏 cursor 移动帧）；② 门控落点 = writeDiffToTerminal 入口同层（与既有空 diff 早退同层，BSU/ESU 配对不破）；③ **「跳 commit = 写零字节」**：prevScreen 换帧/damage reset/cursor 模型推进照常，仅省 IO 与下游 commit 分支——禁「跳状态推进」形（stale diff/cursor 风险源）；④ all-or-nothing 帧级门控禁按 patch 类型部分跳；⑤ resize ERASE_SCREEN prepend 帧有 patch 不入门控（ink.tsx:162 实锚）。
3. **吸收 3（分流风险不对称清单入 lock-face）**：门控 = 帧级 IO elision 无新写入路径；分流 = **第二写入路径**——(a) spinner 局部行旁路 = 与全帧 commit 互斥串行化 + BSU/ESU 嵌套审计（局部写插入 sync marker 序列 = 终端同步破坏面）+ bypass 帧仍发 FrameEvent（标 bypass 类）；(b) 动画降频/数据即提交 = 无第二写入路径（结构安全）且**唯一能改善延迟的形**。禁预答维持，裁定书载风险不对称。
4. **吸收 4（归因纪律）**：门控收益 = 帧数/CPU/pty 噪声减，**延迟中性**（真变更帧仍等下一 tick）；延迟改善只能来自 2(b)——呈报/CHANGELOG 语按抓手归因防过度宣称；格 6 实证形 = 变更到达（stream 时戳）→ patch 写出 pty 延迟分布双列 + 容差预注册。
5. **格 1 补注**：stalled 静态红 spinner/defer 挂起态 0-patch 帧合法被杀（无写入面）= 预期行为非误杀，lock-face 判别清单列入防 gate 误判。

**审计结论：通过——吸收后发双信号（排队 0.1.110 段 L / 0.1.112 W-RC1 后）。**

## §6 lock-face 裁定①——「skip commit」语义边界与门控真实落点（2026-11-14，f4；Main 勘锚 terminal.ts:176-179 既有早退触发）

1. **张力采认**：writeDiffToTerminal 零字节早退已在（0-patch 帧 pty IO 本就为零）——审计「省 IO」面已被既有早退覆盖；门控真实增量 = 指标/下游面（committed 分类 + cursor preamble/park 分支 + 下游 commit 侧），CPU 扫描链构造须先走省不掉。
2. **裁定：本波 = 形 I（窄）+ 抓手 2(b)，形 II 不立项**：
   - **形 I**：FrameEvent committed 口径分列（扩型 committed 标志，两通道消费者仪表化+bench 兼容面小）+ 空帧判据 preamble 后评估（cursor preamble 可把空流变非空——构造层定义含 preamble patches，Main 勘锚①兑现）+ cursor preamble/park 空流分支 elision（增量 CPU 面）。格 1「0-patch 占比→~0」= **committed 口径成立**。
   - **形 II（damage 预测门跳 render+diffEach CPU 链）= 新机制超审计钉死形，不立项**——定谳已判 diffMs 0.07-0.25ms 绝对值小，收益不值新机制风险；登记池。
   - **主收益面 = 抓手 2(b) 动画降频/数据即提交**：真变更帧变更到达即提交（不等 63ms tick）= 唯一延迟/观感改善形，结构安全无第二写入路径——lock-face 主推定形。
3. **状态推进禁跳清单采认**（Main 勘锚②：backFrame/frontFrame swap/prevFrameContaminated/displayCursor/scrollDrainPending drain timer）；resize prepend 不入门控（③与审计⑤一致）；格 4 committed 分列两通道兼容面核（④）。
4. 呈裁书按形 I / 形 II / 2(b) 三面分列收益与风险，2(b) 定形后并入格 6 延迟实证主判据。

## §7 段 D lock-face 批复（2026-11-15，f4：**通过，两切片入段 I**；呈批书 docs/2026-11-14-wab4b-lockface-brief.md）

1. **面 1（形 I 窄）批准**：FrameEvent 加性 committed 字段 + 空帧判据 = preamble 后 optimized.length===0（含 cursor preamble/park push 面）+ 空流分支 elision + 门控落点 = ink.tsx onRender commit 分支层（writeDiffToTerminal 本体零触碰）；节律 wire 定谳采认（useAnimationFrame(50)→setState→全树重渲→16ms throttle 收敛 63-64ms；**数据即提交结构上已在**——leading-edge ≤16ms，面 2 真实抓手 = 降频非延迟）。
2. **面 2 批准，N=100ms（用户 2026-11-14/15 交互裁定）**：spinner 动画时钟 50ms→100ms（15.6→10fps）；收益 = committed 帧数 ≈-40% + spinner 行 erase+rewrite 观感噪声减半（闪烁痛点主体直减）；代价 = 顺滑度轻微下降（用户知悉裁）。time 共享源连带面（shimmer/stalled）lock-face 细节随切片 2 定形。
3. **面 3（2(a) 局部旁路）确认不落码**（对照列并陈；启用须独立 lock-face 形）。
4. 落码形批准：两切片独立可验可 revert（切片 1 = frame.ts 扩型+ink.tsx+判别格；切片 2 = N 落 constants+useAnimationFrame 消费面），格 5 canon 逐切片恰合。归因纪律条款（门控延迟中性/改善归 2(b)/CHANGELOG 按抓手归因——注：数据即提交已在，延迟叙事以「维持 ≤16ms leading-edge」为准防虚增）确认。
5. 判据面：格 1 committed 0-patch→~0 / 格 2 committed ≤cc 1.5× / 格 3 终值恒等 / 格 4 双通道零变（加性）/ 格 5 逐切片恰合 / 格 6 延迟双列（维持非回归守）。段 I 排队遵令（0.1.112 W-RC1 在先）。

## §8 段 G GATE-PASS 采认（2026-11-15，判定单 r-20261115-gate-113.md；注 A/B f4 采认）

1. **总判采认：GATE-PASS 六面全绿 + 格5 恰合**——候选锚 0293cb06（采集 dist 与 937ab3eb 重建字节恒等 cmp 实证，Δ=纯加性 S0-U-1 两新文件+docs 零产品码面）；10 相腿 RC=0×10；格5 e2e 独立复核 canon **5962/0/485** 与 Main 逐字一致（Δ=+13+1 恰合 U-1 预注册）。判定单勘误（初稿预写 canon 数字先于实测，自纠）如实入档——预写形作废以实测为准，验真纪律维持。
2. **注 A 采认（格1 判定面勘误，0.1.109 格6 先例同族）**：工单字面「0-patch 26-47%→~0」在 raw record 层实测 17-24% 非零——定谳成立：形 I 窄落码形（§6 批复）下 raw ~0 **结构性不可达**（recordRenderFrame 全帧采样无 emptyStream 门 + 0-patch pty IO 本就为零 terminal.ts:176 早退）；格1 判定面按 lock-face 呈批书原文 **committed 口径**判 = 0-patch commit 指标污染 0%（构造性）+ 全量 committed=false∧bytes=0 零误杀直证 → GREEN。raw 残余 = drain 帧（流式期 gapMed 25-31ms）全量如实标注 committed=false 非隐瞒。wab4→wab4b raw 收益面如实记账：总帧 1.61×↓、0-patch 绝对数 2.39×↓。
3. **注 B 采认（格2 口径注记）**：cc-09 裸值 545 对 cc 侧结构失明（cc 主重绘不走 [2K/[1A 控制序，B 组恒 50-62 与时长无关），跨列对表 = 首车冻结已禁形——合法判定形两读均过：**committed 同列 0.49× / pty-09 同口径 1.11×，均 ≤1.5× GREEN**。analyzer 09 口径勘误（首版漏 [1A 主分量，回溯 ux-extract.py:80 + wab1 B1 复算 606 恰合后修正）入资产。
4. 误杀判别可证伪形采认（committed=false ⇔ optimized.length==0 ⇔ bytes=0，结构上带视觉变更帧必 committed）；格6 N=100 直证采认（动画主导腿 gapMed 106-113ms ≈ 100ms 时钟+13ms 管线预期形；流式腿 leading-edge ≤16ms 结构在）；FrameEvent 14 键零变双通道兼容采认。
5. **段 L 硬门双在案成立（GATE-PASS 判定单 + 本节 f4 采认）——Main 走段 L release 0.1.113**；段 L 收口后同窗启动 S0-P prep + U-2（S0 工单 §5.4 退避门兑现）。
