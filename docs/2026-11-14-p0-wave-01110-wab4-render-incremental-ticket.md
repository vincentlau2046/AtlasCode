# 0.1.110 W-AB4 工单——件 A 渲染增量化分期首车（UX-4 重绘 6.5×，仪表化 + 根因定谳）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-14）。
> 上游：W-AB2 §6 用户裁定件 A = **批准，分期开工**（@92b82924）——分期 = ①重绘仪表化 → ②静态区 diff-patch → ③流式区 diff-patch；回归 fixture 用 W-AB1 17 腿语料；验收 = 重绘帧比 ≤ cc 1.5×。
> 证据面：UX-4 H·直证级（atlas 3125 帧全行重绘 vs cc 482 增量，17 腿语料一致；闪烁/滚动稳定性候选根因）。

## §0 波前审视（f4 2026-11-14，活码重核）

### 0.1 关键结构发现（修正工单前提）

Ink fork **已具备 cell 级增量基建**——「无 diff 需自建」的原方案 A 前提不成立，首车改形为**根因定谳 + 仪表化**：

- `src/tui/ink/screen.ts:1126`——`diff()`/`diffEach()` cell 级比对 + **damage region 追踪**（:1169-1178 仅扫 damage 并集矩形；:803 SpacerTail damage 扩展）。
- `src/tui/ink/terminal.ts:190`——`writeDiffToTerminal()` patch 类型化写出（stdout/clear/cursorMove/…）+ BSU/ESU 同步输出标记（tmux skip 面在档）。
- `src/tui/ink/output.ts:278-332`——blit/write 后 damage 标记面。
- 静态区：`src/tui/utils/staticRender.tsx`（内容入 scrollback 后理论上不再参与 diff）。

⇒ 6.5× 差距根因候选面（root-cause 腿逐一定谳，禁预答）：

1. **① damage 过宽面**：流式/spinner 每帧 damage 矩形并集覆盖大区域 → 行级改写量趋近全屏（diff 本身正确，喂给它的是脏矩形太大）。
2. **② 渲染节流面**：atlas 逐 token/chunk 重渲（3125 帧 vs cc 482 = 频次差 ~6.5×，**帧数比恰等于重绘比**——节流缺失可能是主根因，diff-patch 或非必需）。
3. **③ 静态区重入面**：staticRender 边界失效 → 已入 scrollback 内容被重写。
4. **④ diff 旁路面（审计补强增补）**：部分帧走全量重绘路径不经 writeDiffToTerminal（resize/focus/log-update 型旁路）——旁路帧率 < 帧率即可直证；可证伪形同构，纳入定谳集。

**结构性补证（审计，机制面登记）**：damage 模型 = 单 Rectangle `unionRect(next, prev)`——非脏矩形集合。任意两个空间不相邻的小变更（spinner 行 + 流式尾行 = T01/T06 型流量常态拓扑）并集即成跨全高单矩形 → diff 扫描面与行改写量结构性趋近全屏 = 候选①机制级先验；与候选②频次面正交，6.5× 大概率 = 频次 × 矩形宽**复合**。由仪表化数据裁决，禁预答纪律不破；二期工单须预案「①+②复合主因」形态。

判别探针 = 分期① 仪表化：帧计数 + damage 面积 + 行改写字节量三指标逐帧落盘，消费 W-AB1 17 腿语料复跑对表 cc。

### 0.2 分期（用户裁定形，随定谳收窄）

- **首车（本波 0.1.110）= 分期① 仪表化 + 根因定谳**：零行为改动（纯计数落盘），产出处方式定谳报告 + 回归基线数字面。
- **二期（0.1.111 候）**：按定谳落修形——②/③ 候选对应节流/静态区修复（若为主根因）；① 候选对应 damage 收窄；若 diff 层确需 diff-patch 再立项。**二期工单另立，本波不预排内容**。

## §1 波定义

0.1.110 零行为波：仪表化落码（tui 渲染层计数钩子 + 落盘通道）→ e2e 消费 17 腿语料复跑采集 → 帧比/damage 面积/节流频次三面定谳报告 → 呈用户 + 二期工单输入。**预期零产品行为变更 → 段 L 照常（行为中性波先例）**。

## §2 Global Constraints

1. 仪表化代码默认关闭（env 门控），生产路径零开销断言（关闭时零 diff）；row F 全程。
2. 零写真实 ~/.atlas/~/.claude；探针 designated-only seeded；npm --registry npmjs.org。
3. Atlas-reveiw 审计先于双信号；段 L 硬门。

## §3 判据格（预注册）

| # | 格 |
|---|---|
| 1 | **仪表化恰合格**：env 门 = 模块级布尔缓存（禁 per-frame process.env 读）；关闭路径**零分配零 IO** 结构断言（禁 Date.now/字符串构造在关闭支）；钩子粒度 = 帧级单点（diff/写完成后汇总，禁 cell 级钩子）；env 名 literal-inventory envPrefixLiteral 预注册（loopWatchdog 先例同构）；落盘通道 user-e2e 可控目录（禁真实 HOME）；码域落点 tui/ink 单点最小化 |
| 2 | **行为+性能中性格**：canon 前滚恰合 + 17 腿复跑终值与 W-AB1 基线一致（输出中性）+ **关闭时 17 腿帧间隔分布与基线在噪声带内**（时序中性腿，审计焦点④钉四点） |
| 3 | **根因定谳格（贡献度分解形）**：四候选面（①damage 单矩形过宽 ②渲染节流缺失 ③静态区重入 ④diff 旁路面）非互斥——报告须给出各候选对 6.5× 的**归因份额复合分解**（单选式定谳禁）；候选③直证 = 静态区坐标带 damage 非零帧计数；候选④直证 = 旁路帧率 vs 帧率对比 |
| 4 | **对表格（双口径双列）**：帧定义单源 = 渲染层 commit 事件（pty 侧计数与 commit 计数必然不等——空 diff 早退帧 pty 不可见 + flush 合并）；对表格双列（渲染口径 + pty 观测口径），比值结论仅同口径内比较；「≤cc 1.5×」验收分子分母口径本波冻结（二期禁换口径防基线漂移） |
| 5 | **回归 fixture 格**：17 腿语料 runner 幂等（二期验收基线可复跑） |

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. 「零行为波」定性是否成立（仪表化钩子侵入渲染热路径的性能面——关闭时零开销的证明形）。
2. 三候选面判据可证伪性（防预答 diff-patch 必要性）。
3. 仪表化落点域归属（tui/ink 渲染层 vs 测试侧 harness 采集——本波 f4 倾向产品内 env 门控钩子，harness 只消费落盘）。
4. 帧指标口径与 W-AB1 e2e 计数法对齐（防两套口径数字打架）。
5. 二期预排禁令的边界（本波报告可提二期形态建议但判据面冻结于彼时工单）。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 仪表化落码 → e2e 17 腿复跑采集 + cc 对表 → f4 定谳报告 → 呈用户 + 二期工单起稿（0.1.111 与件 C/D 切片统筹，波序可调）。

## §6 Atlas-reveiw 审计闭环（2026-11-14，通过 + 1 结构性补证 + 5 吸收，@32fadee9 全锚实核）

1. **结构性补证（机制面登记，不预答）**：damage = 单 Rectangle unionRect 模型——两不相邻小变更并集即跨全高 → 候选①机制级先验；6.5× 大概率 = 频次 × 矩形宽复合；二期须预案「①+②复合主因」形态（已并入 §0.1）。
2. **吸收 1（零行为波证明形四点）**：env 模块级缓存/关闭支零分配零 IO/帧级钩子粒度/格 2 增时序中性腿（帧间隔分布噪声带）——已并入格 1/2。
3. **吸收 2（可证伪补强）**：增补第四候选④ diff 旁路面（resize/focus/log-update 型全量重绘旁路，旁路帧率直证）+ 定谳格改贡献度分解形（归因份额复合分解，单选禁）——已并入 §0.1/格 3。
4. **吸收 3（落点域三条件）**：env 名 literal-inventory 预注册/落盘 user-e2e 可控目录/码域 tui/ink 单点——已并入格 1；产品内 env 门控定性成立（用户实机/生产 lane 可开收益正当）。
5. **吸收 4（双口径双列钉死）**：pty 侧计数 ≠ 渲染层 commit 计数（空 diff 早退 + flush 合并）；帧定义单源 = commit 事件、双列呈现、比值同口径内比较、「≤1.5×」口径本波冻结——已并入格 4。
6. **吸收 5（二期预排边界）**：本波定谳 = 二期工单**输入非裁决**（二期 §0 须活码重核 + 新候选纳入）；「≤1.5×」测量口径冻结继承、二期禁换口径——入二期工单约束面。
7. **流程注记**：本波 src/ 非零 diff（仪表化码）≠ 零码波，零行为定性 distinct 成立；段 L 照常硬门（loopWatchdog default-face 先例同构）。

**审计结论：通过——吸收后发双信号。**

## §7 段 D lock-face 批复（2026-11-14，f4：**通过，按呈批形落码**）

1. **L1-L6 全采认**：env 名 `ATLAS_RENDER_INSTRUMENTATION_LOG`（值=JSONL 路径，空=off）模块顶层一次性读（SYNC_OUTPUT_SUPPORTED 同构）+ literal-inventory 预注册；关闭支先门后构造锁形（unit 源断言）；帧级单点 = ink.tsx onRender 尾 FrameEvent 发射点旁（帧定义单源 = 渲染口径，格 4 冻结基）；四候选指标面全覆盖（dmg.full→①/bytes+seq-tMs 帧间隔→②/staticRowsTouched→③/fullReset→④，复合分解原料齐）；ATLAS_FRAME_TIMING_LOG bench 通道零触碰独立 env；真零码收口形之外的格 2/4/5 消费面归属清晰。
2. **两点注记（不阻落码）**：① **dmg 镜像漂移防面**——dmg 区域为 diffEach :1169-1183 汇总逻辑的镜像复制，须头注绑注「语义源 = diffEach region」并加 unit 断言（或最小化：镜像函数直接 import 复用 diffEach 同源逻辑），防两处口径漂移致定谳失真；② **bytes 估算口径**——头注声明仅作相对比较面（同语料内比值），禁绝对量级外宣称。
3. **unmount seq:-1 终帧不入分母**确认；appendFileSync sync 防帧丢（bench 先例同款）确认。
4. 落码清单（renderInstrumentation.ts 新建 + ink.tsx 采样点 + tests 两文件）与流程（段 I → 四件套+canon → e2e 17 腿复跑 → 定谳报告 → 呈用户+二期输入）确认。

## §8 段 I 终态采认（2026-11-14，Main 知会；落码 3b8ee7a0 双 remote 对齐）

6 文件（renderInstrumentation.ts 新建 + ink.tsx 三处接线 + screen.ts **diffRegion 单源提取** + literal-inventory 预注册 + 判别格两文件）。批复形兑现确认：格 1 四点全落；**注记 1 超额兑现**（diffEach region 块逐字提取为导出 diffRegion，两处共用同源——漂移结构性不可能；drift 守卫 func 腿含候选①机制直证：两不相邻 damage 并集=跨全高单矩形）；注记 2 兑现（bytes 仅 stdout 载荷 + 头注相对口径声明）；零行为（canon 5923/0/481，Δ=+10 测 +2 文件恰合）；bench 通道零触碰在场。e2e 17 腿复跑采集已启动，候定谳报告 → 段 G gate → 段 L release 0.1.110。

## §9 e2e 采集定谳采认 + 格 2 口径裁定（2026-11-14，报告 r-20261114-wab4-instrumentation.md）

1. **采集 GREEN 采认**：10 运行 RC=0、11,660 帧全 schema JSONL（bench 零混采）；输出中性锚点全合基线。
2. **贡献度分解复合定谳采认（禁单选兑现）**：**候选② 帧数主因**——0-patch 空帧 26-47% + 帧间隔中位 63-64ms 恒节律（≈15.6fps 动画节拍与变更无关）vs cc 事件驱动增量 = 6.5× 主体；**候选① 真实在现但代价 = 扫描 CPU 非写入放大**（dmgFull 1.000 + dmg.h==screenH 95-99%，然 bytes 中位 18B/帧 = 写入已 cell 级增量；diffMs 0.07-0.25ms 绝对值小）——pty「全行重绘」观感 = spinner 行 64ms erase+rewrite + 变更行重写；候选③ 非独立缺陷源（damage 伸入 scrollback 但未变 cell 未重写）；候选④ 0.2% 可忽略。
3. **格 2 时序面口径裁定（f4）：采认开销-预算占比替代形，不补 OFF 腿**——理由：关闭态无 JSONL 落盘则无逐帧时间戳，直接对表**结构上不可得**；中性操作化三件已齐 = (a) 关闭支零 IO 结构断言（unit 直证）+ (b) 开启开销 frameMs 中位 0.38-0.94ms ≪ 63ms 帧间隔（<2% 帧预算）+ (c) 输出中性锚点全合基线。审计「噪声带」措辞以三件替代形兑现入档。
4. **二期输入排序采认（输入非裁决）**：②变更门控（空帧跳提交/动画帧分流）＞①并集细化（CPU 面）＞③④不支持立项；「≤cc 1.5×」帧数面抓手 = ②。
5. **二期定性注记（f4）**：原件 A 裁定「diff-patch」前提已由定谳修正——**增量基建已在（bytes 18B 直证），二期抓手 = 帧提交节律门控**，属件 A 分期裁定范围内二期落码（0.1.113 候，让位条款已核：W-RC1 0.1.112 在先，件 F 顺延 0.1.114 候）。
6. 事故 2 起入档；资产 user-e2e/wab4/ 可复跑。候 gate/段 L 排程。

## §9b 段 G 轻形 GATE-PASS 采认（2026-11-14，判定单 r-20261114-gate-110.md）

格 1-5 全 GREEN + 零行为面 6 文件核对相符；**格 4 补验裁定**：跨列结构性禁换算（pty 口径与渲染 commit 口径各列内比值唯一有效），二期冻结口径 = pty 口径 + W-AB4b committed 列并存（W-AB4b 工单 committed 口径钉死兼容）。判定单纪律采认（0.1.100 先例入册：分析报告 ≠ gate 本体）。**段 L 硬门双在案成立（GATE-PASS 判定单 + f4 §8/§9 采认）——Main 走段 L release 0.1.110。**
