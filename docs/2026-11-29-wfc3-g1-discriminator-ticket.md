# W-FC-3 工单——g1 判别件口径修正落件（scrollUnion 权威口径，零版号 test-side）

> 出处：排程单 `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-3 = 挂账池 ⑥
> （F6-PAGE 绿复判单 `user-e2e/reports/r-20261128-f6page-green-rejudge.md`
> 登记面①）。执行归 atlas-user-e2e（判别件 = lane 自有仪器）；零版号、零
> 载体链、零锚。工单出稿 f4；双门 = Atlasweb-F4 审视 + Atlas-reveiw 审计。

## §0 活码重核（2026-11-29 @ AtlasWeb `3391e6b` / AtlasCode `1f633dff`）

| 面点 | 实勘 |
|---|---|
| 登记本义 | 绿复判单登记①：「g1 `toHaveCount(40)` 12/40 RED = 虚拟滚动渲染窗 artifact **第三例登记**（RED-face 判别专用，GREEN 计测以 g3 union 为准）」——虚拟化窗 ~23 行/窗下 `toHaveCount(40)` GREEN 面结构性不可达 |
| 判别件现状 | g1-g5 腿码 + lib.mjs v3 = **lane ephemeral**（e2e lane job tmp `f6/green/legs/`，绿单 §5-1 索引）；两仓全量扫描 `scrollUnion`/`toHaveCount(40)` **零命中**（repo 无落码直证）——口径修正现仅存判定单文字，腿码复发即复触（第三例即复发模式实证） |
| 权威口径 | scrollUnion v3 = 步长自适应 `max(400, scrollHeight/50)` + 护栏 200 轮（绿单 §1-1）；GREEN 计测权威面 = g3 oversize scrollUnion 40/40 + errFaces=0；g1 判别形 = error-face（errCount=0/status=live）+ RED-face（0≠40） |
| 复用风险面 | e2e gate 判据件常以 overlay/腿码形复用（W-FC-1 t4 探针先例：lane 侧件不入仓仅登记）——本件前两波已三例复发，落件 = 口径制度化最小销项 |
| 活码现状 | AtlasWeb HEAD 3391e6b clean（e2e/ 自 610ecc9 零变动）；AtlasCode src/packages 零触面；判别件不依赖本波后任何新码（0.1.4 载体已含 W-FC-2 修形，g1 探针构造面与其无涉——投影帽构造属 g3 域） |

## §1 格与范围

- **格 1（腿码修正）**：g1 腿 GREEN 计测面改 **scrollUnion 权威口径**（v3
  步长自适应形）——`toHaveCount(40)` 不得再作 GREEN 计测断言（移除或降为
  RED-face 判别位）；RED-face 判别值保留（0≠40 / error-face errCount=0/
  status=live）。
- **格 2（口径落件）**：修正版 g1 腿 + lib.mjs v3 依赖 + **判别件口径
  README**（RED-face 判别 ∥ GREEN 计测权威面二分纪律 + 三例登记链引用）
  落 durable copy 进 AtlasCode `user-e2e/`。
- **非目标（防扩格）**：g2-g5 腿落件（无 artifact 登记面）；AtlasWeb 仓任何
  变更（含 e2e/ spec——不入 canon 计数面）；产品码零触；探针实跑复测
  （真引擎环境成本高，登记非阻可选，验收以口径核真为准）。

## §2 判据格

1. **落件位** = AtlasCode `user-e2e/`（lane 资产家，repro-*.ts/k5-*.ts 先例），
   建议目录 `user-e2e/atlasweb-g-legs/`（g1 修正版 + lib.mjs + README；
   目录名 lane 可调，回执登记）。
2. **口径核真**：README 明示 v3 权威口径式 + 二分纪律；g1 修正版断言面
   scrollUnion 权威口径在位、`toHaveCount(40)` 不在 GREEN 计测位。
3. **域机判**：AtlasWeb 仓 diff = 零；AtlasCode diff 限 `user-e2e/`
   （`src packages` 零触——commit path-limited）。
4. **零版号定性**：触面非 `src/packages` → 不入打包面、零锚、零段 L、
   L4 带不消耗（余量 0.1.132-134 三版维持）。

## §3 落件定形（执行归 lane）

- **候选 A（采）**：lane 从其 job tmp 现存腿码修正 g1 → durable copy 落
  `user-e2e/` → path-limited commit → 回执（lane 持原物，转录零失真）。
- **候选 B（弃）**：f4 依判定单文字重写——腿码原物不在 f4，重写 = 二手
  转录风险；弃。
- **候选 C（弃）**：落 AtlasWeb `e2e/` spec——入 canon pw 计数面扰动基线
  （判别件 ≠ CI spec 性质）；弃。
- **应急注记**：若 lane job tmp 腿码已清，回执登记改道——以两判定单
  （§1-1 v3 口径式 + §3 g1 判定输出形）为源合议重写，双门补核后落件。

## §4 信号面

工单双门齐 → **单信号 atlas-user-e2e**（落件 §3 候选 A）→ lane 回执 →
f4 收口（排程单 §5 W-FC-3 翻转 + 本销项登记）。零版号、零载体链、零锚、
零 AtlasWeb 信号。

## §5 审视记录（f4 逐点，2026-11-29）

- **自决 1（落件位）**：`user-e2e/`（候选 C 弃理 = canon 计数面扰动）。
- **自决 2（执行主体）**：lane（判别件 = lane 自有仪器；「落码归 Main」
  纪律辖产品码与仓内测试件，不辖 lane 判别仪器；W-FC-1 t4 探针同族先例）。
- **自决 3（范围）**：仅 g1 + lib.mjs + README（⑥ 登记本义；g2-g5 无
  artifact 面，落件需求若 lane 落件时提出，登记不扩格）。
- **自决 4（零版号）**：§2-4 机判定性；本波零载体链零锚。
- **自决 5（验收形）**：落件回执 + §2-2 口径核真为验收；探针实跑非必须
  （登记非阻可选——实跑须真引擎 + 巨 fixture 环境，成本/收益不称）。
- **自决 6（双门形）**：本工单仍走双门（审计+审视泛化纪律），但 gate 形
  不适用（无 RED/GREEN 判据件轮——落件型波，验收 = 口径核真）。
- **报裁项：无**（六项全自决闭环）。

## §6 验收件

lane 落件回执（含目录名 + commit 号）+ `user-e2e/atlasweb-g-legs/` 三件
（g1 修正版/lib.mjs v3/README）+ 排程单 §5 W-FC-3 状态行翻转（候本波收口
随件 commit）+ 域机判两钉（AtlasWeb diff 零 / AtlasCode diff 限 user-e2e/）。
