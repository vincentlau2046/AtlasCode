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
