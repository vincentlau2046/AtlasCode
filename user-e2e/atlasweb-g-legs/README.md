# atlasweb-g-legs — F6-PAGE 绿轮判别件口径 README（W-FC-3 落件）

> 出处：工单 `docs/2026-11-29-wfc3-g1-discriminator-ticket.md` @4438e18f（AtlasCode 仓）
> §3 候选 A；挂账池 ⑥ 销项。零版号 test-side（触面非 src/packages，不入打包面、
> 零锚、零载体链），且不入 AtlasWeb e2e/ canon pw 计数面（候选 C 弃理）。
> 本目录 = lane 判别仪器 durable 口径登记件：g1 修正版 + lib.mjs v3（原物转录）+ 本 README。

## 口径二分纪律（本波制度化唯一主题）

| 面 | 权威形 | 禁用形 |
|---|---|---|
| **GREEN 计测** | `scrollUnion`（union-of-scroll，lib.mjs）——行进全史 union 集计测；oversize 权威断言 = `o01..o40` 集恒等 + noDup（g3 权威形同源） | 单点 live DOM count / `toHaveCount(N)` 作 GREEN 断言——虚拟滚动渲染窗（~23 行/窗）下结构性不可达，GREEN 轮伪 RED |
| **RED-face 判别** | error-face（`[data-conn-error]` 在场 ∨ `data-conn-status` ≠ `live`）∧ 行进面变形；`toHaveCount(40)` 降为 RED-face 标注块（g1 判据 C 后标注块，判别专用不 gate） | live count 单独作判别信号——**count ≠ 40，不钉具体观测值**（第三例观测 12/40 仅为例证，观测值随窗态漂移）；GREEN 轮 count≠40 而 error-face 缺席 = 纯渲染窗 artifact，非判别信号 |

## scrollUnion v3 权威口径式（字面）

- 步长自适应：`Math.max(400, Math.ceil(el.scrollHeight / 50))`（lib.mjs scrollUnion :20）
- 护栏：`for (let guard = 0; guard < 200; guard++)` 200 轮全程覆盖（lib.mjs :24）
- 出处：绿单 §1-1 v3 修正式（v1/v2 固定步长 × 固定护栏只扫头部切片 = 步长伪影）。

## 三例登记链（文件+节号防悬空；跨仓引用须带仓限定）

1. **第一/二例（步长伪影 + 单点 count 伪影复证）**：AtlasCode 仓
   `user-e2e/reports/r-20261127-f6page-ui-green.md` §1「腿码修正登记」项 1-3
   （数字列表项 1-3，非子节头）。
2. **第三例（g1 `toHaveCount` 伪 RED）**：AtlasCode 仓
   `user-e2e/reports/r-20261128-f6page-green-rejudge.md` §6「判定」登记面①
   （「g1 toHaveCount RED-face artifact 第三例（判别件用 scrollUnion 权威口径）」）。
3. **挂账入口**：**AtlasWeb 仓** `docs/2026-11-27-f6page-ui-consumption-ticket.md`
   §8 ⑥（挂账池行「⑥ g1 `toHaveCount` RED-face artifact 第三例（判别件用
   scrollUnion 权威口径）」；AtlasCode docs/ 有同名工单并存——引用必须带仓限定）。

## 落件 provenance 与复跑形

- 原物：lane job tmp `$CLAUDE_JOB_DIR/tmp/f6/green/legs/`（2026-11-27 绿轮腿码，
  判词侧实勘 8 件在盘；g2-g5/probe 件无 artifact 登记面不落件——工单 §1 防扩格）。
- 本目录三件：`g1-oversize-walk.mjs`（W-FC-3 修正版：判据 C 改 scrollUnion 权威
  计测 + RED-face 标注块）/ `lib.mjs`（v3 原物逐字节转录）/ `README.md`（本件）。
- 复跑依赖未随件：`spawnServer/pw/finish` ← `../../red/legs/harness.mjs`（lane
  ephemeral 环境件，job tmp `f6/red/legs/`）；复跑须 lane 环境按原布局
  （`f6/{red,green}/legs/`）挂载 job tmp，`F6_APP` 环境变量选新锚安装面。
  g1 内 `G` 常量 = job tmp 路径形，同因——本目录为口径登记件，非就地可跑件。
