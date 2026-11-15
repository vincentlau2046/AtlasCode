# W-AB4b lock-face 呈批书——帧提交节律门控（0.1.113 候）

> Main lane 2026-11-14。f4 裁定 §6 @7d9cbea3（形 I 窄 + 抓手 2(b) 组合，形 II
> 不立项）兑现呈批。工单 @f94f9b23 + 审计 §5。三面分列收益/风险/判据。

## 0. 节律 wire 定谳（呈批书事实基座）

- 渲染节流：`ink.tsx:215` `scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS=16, {leading, trailing})`——**数据变更帧已 leading-edge ≤16ms 即提交**（「数据即提交」结构上已在，无须新机制）。
- 63-64ms 恒节律源头：`SpinnerAnimationRow.tsx:104` `useAnimationFrame(50)` → setState(time) → 全树 React 重渲染 → 16ms 节流收敛 → **≈50ms 动画时钟 + ~14ms 渲染管线 = 63-64ms 观测节律**（15.6fps，与变更无关）。定谳报告 0-patch 空帧 26-47% 即此 tick 驱动。
- 0-patch 帧 pty IO 本就为零（writeDiffToTerminal terminal.ts:176 早退）——抓手 1 窄形收益 = 指标/下游面，非 IO。

## 1. 面 1：形 I（窄）——committed 分列 + 空帧门控

**修形**：① FrameEvent 扩型加性 `committed: boolean` 字段（空帧 = false）；② 空帧判据 = preamble 后 `optimized.length === 0`（构造层定义含 cursor preamble/park push 面——ink.tsx:673-733 wire 直证）；③ cursor preamble/park 空流分支 elision（判据成立时 :724 parked restore 分支一并 elide）；④ 门控落点 = ink.tsx onRender commit 分支层（:738 writeDiffToTerminal 调用点同层），writeDiffToTerminal 本体零触碰。

**收益**：格 1 committed 口径达成（0-patch 26-47% → ~0）；指标面干净（二期双列对表基座）；空流分支微 CPU 省。

**风险**：低。单写路径不变；状态推进禁跳四锚锁定（backFrame/frontFrame swap :596-597 / prevFrameContaminated :744 / displayCursor / scrollDrainPending drain timer :752）；resize prepend（needsEraseBeforePaint :162 区，ERASE_SCREEN 入 BSU 原子块）有 patch 不入门控（审计⑤）。stalled 静态红 spinner / defer 挂起态 0-patch 帧合法被杀 = 预期行为（审计格 1 补注，gate 判别清单列入防误判）。

**判据**：格 1 committed 口径；格 4 双通道零变（committed 扩型加性——仪表化 recordRenderFrame 与 bench interactiveHelpers onFrame 消费字段语义不改）；格 3 终值恒等。

## 2. 面 2：抓手 2(b)——动画降频/数据即提交（主收益面）

**修形**：动画时钟降频——useAnimationFrame(50) → 降频值 N（候选 100ms/120ms，spinner 15.6fps → 8-10fps）；数据即提交维持既有 16ms leading-edge 结构（零新机制）。注：useAnimationFrame 的 time 为 SpinnerAnimationRow 动画与 thinking shimmer 共享源（:209 注释），降频同源影响两观感面。

**收益**：committed 帧数线性直减（动画帧 15.6→8-10fps ≈ -40%）；真变更帧不再被 63ms 恒节律空转帧淹没（延迟/观感改善主判据载体）；pty 噪声减（spinner 行 64ms erase+rewrite → 降频后同步拉长）。

**风险**：动画观感降质（spinner/counter/shimmer 流畅度）——降频值 N = UX 裁定面；shimmer 共享源连带（呈批如实列）。无第二写入路径（审计吸收 3 结构安全判定成立）。

**判据**：格 2 committed ≤cc 1.5×（冻结口径）；格 6 延迟分布双列（stream 时戳→pty patch 写出，容差预注册随 lock-face 批复冻结）；动画观感 = e2e pty 目验腿。

## 3. 面 3：2(a) 对照列（并陈不主推，禁预答已裁定）

理论收益：spinner 行局部行更新可再减 pty erase+rewrite 字节。风险（审计吸收 3 清单全项适用）：第二写入路径 = 与全帧 commit 互斥串行化 + BSU/ESU 嵌套审计 + sync marker 序列破坏面 + bypass 帧标类。**本波不落码**；若用户后续裁定启用须独立 lock-face 形。

## 4. 落码形与顺序（批复后段 I）

切片 1 = 面 1（形 I 窄，ink.tsx + frame.ts 扩型 + 判别格）；切片 2 = 面 2（降频值 N 经 f4 UX 裁定后落 constants + useAnimationFrame 消费面）；格 6 延迟实证随切片 2。两切片独立可验、独立可 revert；格 5 canon 恰合逐切片。
