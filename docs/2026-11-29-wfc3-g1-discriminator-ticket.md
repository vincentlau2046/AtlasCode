# W-FC-3 工单——g1 判别件口径修正落件（scrollUnion 权威口径，零版号 test-side）

> 出处：排程单 `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-3 = 挂账池 ⑥
> （F6-PAGE 绿复判单 `user-e2e/reports/r-20261128-f6page-green-rejudge.md`
> 登记面①）。执行归 atlas-user-e2e（判别件 = lane 自有仪器）；零版号、零
> 载体链、零锚。工单出稿 f4；双门 = Atlasweb-F4 审视 + Atlas-reveiw 审计。

## §0 活码重核（2026-11-29 @ AtlasWeb `3391e6b` / AtlasCode `1f633dff`）

| 面点 | 实勘 |
|---|---|
| 登记本义 | 绿复判单登记①：「g1 `toHaveCount(40)` 12/40 RED = 虚拟滚动渲染窗 artifact **第三例登记**（RED-face 判别专用，GREEN 计测以 g3 union 为准）」——虚拟化窗 ~23 行/窗下 `toHaveCount(40)` GREEN 面结构性不可达 |
| 判别件现状 | g1-g5 腿码 + lib.mjs v3 = **lane ephemeral**（e2e lane job tmp `f6/green/legs/`，绿单 §5-1 索引；审计实勘 lane 原物在位 → 候选 A 可执行）；两仓 tracked **代码面**零代码命中（docs/ 工单文字 + 未跟踪判定单之文字提及除外——审计建议 3 收窄形）——口径修正现仅存判定单文字，腿码复发即复触（第三例即复发模式实证） |
| 权威口径 | scrollUnion v3 = 步长自适应 `max(400, scrollHeight/50)` + 护栏 200 轮（绿单 §1-1）；GREEN 计测权威面 = g3 oversize scrollUnion 40/40 + errFaces=0；g1 判别形 = error-face（errCount=0/status=live）+ RED-face（0≠40） |
| 复用风险面 | e2e gate 判据件常以 overlay/腿码形复用（W-FC-1 t4 探针先例：lane 侧件不入仓仅登记）——本件前两波已三例复发，落件 = 口径制度化最小销项 |
| 活码现状 | AtlasWeb HEAD 3391e6b clean（e2e/ 自 610ecc9 零变动）；AtlasCode src/packages 零触面；判别件不依赖本波后任何新码（0.1.4 载体已含 W-FC-2 修形，g1 探针构造面与其无涉——投影帽构造属 g3 域） |

## §1 格与范围

- **格 1（腿码修正）**：g1 腿 GREEN 计测面改 **scrollUnion 权威口径**（v3
  步长自适应形）——`toHaveCount(40)` 不得再作 GREEN 计测断言（移除或降为
  RED-face 判别位；README 定义处显式化「count ≠ 40，不钉具体观测值——
  第三例观测 12/40」，审计注记 ①）；RED-face 判别值保留（0≠40 /
  error-face errCount=0/status=live）。
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
2. **口径核真（审计建议 1 机械形）**：README 明示 v3 权威口径式
   （`max(400, scrollHeight/50)` + 护栏 200 轮）字面 + 二分纪律 + 三例链
   逐单点名引用（ui-green §1-1/§1-2/§1-3 + rejudge 登记① + F6-PAGE 工单
   §8-⑥，文件+节号防悬空）；g1 修正版 `toHaveCount(40)` 命中仅限
   RED-face 标注块、scrollUnion 权威计测断言在位。
3. **域机判（审计必改 2 钉命令形）**：AtlasWeb 零触 = `git -C
   /home/vince/projects/AtlasWeb rev-parse HEAD` ≡
   `3391e6bd944e397ad00dec4ab4d6fe99cad7c776` ∧ `status --porcelain` 空
   （HEAD 钉值等式，免区间歧义）；AtlasCode 限 user-e2e = 以折入版为波起
   基线 B：`git log B..<落件 commit> -- src packages` 空 ∧ `status
   --porcelain -- src packages` 空 ∧ `git diff --name-only B..<落件
   commit> | grep -v '^user-e2e/'` 空。
4. **零版号定性**：触面非 `src/packages` → 不入打包面、零锚、零段 L、
   L4 带不消耗（余量 0.1.132-134 三版维持）。

## §3 落件定形（执行归 lane）

- **候选 A（采，审计必改 1 执行链修形）**：lane 从其 job tmp 现存腿码修正
  g1 → 工作树落 durable copy `user-e2e/atlasweb-g-legs/` → 回执（附三件
  sha256，转录零失真 hash 可证——审计建议 2）→ **单信号 Main 代
  path-limited commit/push（含双远端）** → f4 收口（commit/push 层归 Main
  ——「master 操作归 Main」边界 + db0e1a3d「lane ownership，Main 代为
  path-limited 落盘」先例）。
- **候选 B（弃）**：f4 依判定单文字重写——腿码原物不在 f4，重写 = 二手
  转录风险；弃。
- **候选 C（弃）**：落 AtlasWeb `e2e/` spec——入 canon pw 计数面扰动基线
  （判别件 ≠ CI spec 性质）；弃。
- **应急注记**：若 lane job tmp 腿码已清，回执登记改道——以两判定单
  （§1-1 v3 口径式 + §3 g1 判定输出形）为源合议重写，双门补核后落件。

## §4 信号面

工单双门齐 → **单信号 atlas-user-e2e**（落件 §3 候选 A 落盘）→ lane 回执
（三件 sha256）→ **单信号 Main**（代 path-limited commit/push 双远端）→
Main 回执 → f4 收口（排程单 §5 W-FC-3 翻转 + 本销项登记）。零版号、零
载体链、零锚、零 AtlasWeb 信号。

## §5 审视记录（f4 逐点，2026-11-29）

- **自决 1（落件位）**：`user-e2e/`（候选 C 弃理 = canon 计数面扰动）。
- **自决 2（执行主体，审计必改 1 修形）**：内容作者/ownership 层 = lane
  （判别件 = lane 自有仪器；「落码归 Main」纪律辖产品码与仓内测试件，
  不辖 lane 判别仪器内容；W-FC-1 t4 探针同族先例）——**commit/push 层归
  Main**（「master 操作归 Main」边界 + db0e1a3d 先例，见 §3 候选 A 修形
  执行链）。
- **自决 3（范围）**：仅 g1 + lib.mjs + README（⑥ 登记本义；g2-g5 无
  artifact 面，落件需求若 lane 落件时提出，登记不扩格）。
- **自决 4（零版号）**：§2-4 机判定性；本波零载体链零锚。
- **自决 5（验收形）**：落件回执 + §2-2 口径核真为验收；探针实跑非必须
  （登记非阻可选——实跑须真引擎 + 巨 fixture 环境，成本/收益不称）。
- **自决 6（双门形）**：本工单仍走双门（审计+审视泛化纪律），但 gate 形
  不适用（无 RED/GREEN 判据件轮——落件型波，验收 = 口径核真）。
- **报裁项：无**（六项全自决闭环）。

## §6 验收件

lane 落件回执（目录名 + **三件 sha256**——审计建议 2）+ Main 代 commit/push
回执 + `user-e2e/atlasweb-g-legs/` 三件（g1 修正版/lib.mjs v3/README）+
排程单 §5 W-FC-3 状态行翻转（候本波收口随件 commit）+ 域机判两钉（§2-3
命令形）。

## §7 审计采记（Atlas-reveiw 回票 @d125c9aa，2026-11-29 折入）

- **总判**：方向 PASS + 必改 2 + 建议 3 + 注记 3；活码复证六点独立直证全过
  （登记本义逐字 / 引证精确 / **lane 原物在位实勘**〔jobs/09264df0/tmp/f6/
  green/legs 现存 → 候选 A 可执行，应急注记暂不触发〕/ e2e 零变动直证 /
  0.1.4 载体含 W-FC-2 修形属实 / 零版号定性成立〔package.json
  files=["dist"]〕）；三例链可考源齐；候选取舍成立；自决 1/3/4/5/6 成立。
- **必改 1（已折 §3/§4/自决 2）**：commit 执行面归属——原稿把 path-limited
  commit 派给 lane，与「版本/发布/master 操作一律归 Main」边界及
  db0e1a3d 先例不符；修形 = lane 落盘 + 回执（sha256）→ Main 代
  path-limited commit/push 双远端 → f4 收口。
- **必改 2（已折 §2-3）**：域机判升可执行钉命令形（AtlasWeb HEAD 钉值
  等式 + AtlasCode log/porcelain/name-only 三钉，基线 = 折入版）。
- **建议 1（已折 §2-2/§6）**：口径核真机械形——`toHaveCount(40)` 命中仅限
  RED-face 标注块、scrollUnion 权威计测断言在位；README 含 v3 式字面 +
  二分纪律 + 三例链逐单点名引用（ui-green §1-1/§1-2/§1-3 + rejudge 登记①
  + F6-PAGE 工单 §8-⑥，文件+节号防悬空）。
- **建议 2（已折 §3/§6）**：落件回执附三件 sha256（转录零失真 hash 可证）。
- **建议 3（已折 §0）**：「零命中」措辞收窄 = tracked 代码面零代码命中
  （docs 文字提及除外）。
- **注记 ①（已折 §1 格 1）**：README 定义处显式化「count ≠ 40，不钉具体
  观测值（第三例观测 12/40）」。② 排程单 §1 域述「AtlasWeb e2e 判别件」
  = 语义面、落件实址 = AtlasCode user-e2e/——随收口 §5 翻转口径统一，
  非阻。③ 工单 push 时点注记：审计勘「origin=1f633dff 未推」系 push 在途
  （bfrzg962o 随后 exit 0 落地），d125c9aa 现双远端在案。
- 处置留痕毕 → 审计点核候；判词侧另线在途，双门齐才单信号（按必改 1
  修形后执行链）。
