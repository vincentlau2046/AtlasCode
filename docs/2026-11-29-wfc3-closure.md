# W-FC-3 收口文书——g1 判别件口径修正落件（scrollUnion 权威口径，零版号 test-side）

> 工单 `docs/2026-11-29-wfc3-g1-discriminator-ticket.md` @4438e18f（折入版，
> + 判词侧 §8 @0b7ca471；收口随件残余 1 分层改写）；排程
> `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-3 = 挂账 ⑥。落件型波
> （gate 形不适用，验收 = 口径核真 + 域机判钉）。收口日 2026-11-29。

## §1 全链终态（节点 + 判定源）

| 节点 | 判定源 |
|---|---|
| 双门齐 | 审计点核 PASS @4438e18f（方向 PASS + 必改 2 + 建议 3 + 注记 3 全折，零悬项）+ 判词侧 §8 审视 PASS @0b7ca471（九锚独立实勘全过：登记①逐字 / 两仓代码面四扫描零命中 / lane 原物在盘 8 件 / lib.mjs v3 代码级直证 / AtlasWeb 钉 1 活值 PASS / src/packages 零触实跑 / 三例链三源全解 / db0e1a3d 先例实存） |
| 落件 | atlas-user-e2e 候选 A：job tmp `f6/green/legs/`（09264df0）原物转录 → 工作树 `user-e2e/atlasweb-g-legs/` 三件（g1-oversize-walk.mjs 修正版 / lib.mjs v3 / README 口径件）；**三件 sha256 回执**：g1 `6cfbd965169d…d299038` / lib.mjs `760b4fb5a744…dd9465` / README `15e9ba85d103…46572`；f4 抽核 PASS（sha256 逐字复算 + `toHaveCount(40)` 仅注释/纪律表位零可执行 GREEN 断言 + scrollUnion v3 权威计测在位）+ 判词侧落盘点核五腿 PASS（lib.mjs byte-identical 直证） |
| 代行 commit/push | Main path-limited **19538207**（恰 3 files changed / 168 insertions 全 create mode）双远端（origin + gitcode hooks PASSED） |
| 域机判四钉 | **全 PASS（f4 独立终判复跑）**：钉 1 `log 4438e18f..19538207 -- src packages` = 0 行；钉 2 `porcelain -- src packages` = 0；钉 3a 落件纯度 `diff --name-only 19538207~1..19538207` = 恰 `user-e2e/atlasweb-g-legs/` 三件无他物；钉 3b 区间白名单 = 恰 `docs/2026-11-29-wfc3-g1-discriminator-ticket.md` 一件 ⊆ 预期集，非 user-e2e 触面逐 commit 指名 = 恰 0b7ca471（判词侧 §8 docs 件）一件无他径 |

## §2 采记

- **㊀ 钉 3 形演化**：lane 注记（区间形含判词侧 docs 件）→ f4 裁定落件自身形 → 判词侧升 **双钉形**（3a 纯度 + 3b 区间白名单指名——指名形非豁免面，他径出现即 fail）→ f4 采认转 Main → 三方四钉合流。终形 = 双钉形。
- **㊁ 判词侧预告分歧披露（纪律 4 同形采记）**：§8-4-2「区间钉可干净执行」过估——触发面恰为其自家 0b7ca471 docs 件；方向非松弛（钉形更精），随本节采记不溯及。
- **㊂ 分层执行链先例固化**：判别件 = lane 自有仪器（内容/ownership 层）∥ commit/push = Main 代行（master 操作边界，db0e1a3d 同形）——工单引言/§3 节题残余 1 已随收口件改写（审计点核登记，正文先行正确）。
- **㊃ 排程单域述口径统一（审计注记②）**：§1 W-FC-3 行「AtlasWeb e2e 判别件」= 语义面（判别对象系 AtlasWeb e2e gate 资产）；落件实址 = AtlasCode `user-e2e/atlasweb-g-legs/`——随收口翻转一并勘正。
- **㊄ provenance 纪律入件**：README 载明原物出典（job tmp f6/green/legs/ 8 件实勘）+ harness 依赖未随件（复跑须 lane 原布局挂载）——落件 ≠ 可独立复跑声明，防悬空。
- **㊅ 实跑非必须维持**（自决 5）：验收 = 口径核真 + sha256 转录零失真（byte-identical 直证）；探针实跑登记非阻可选，不入验收链。

## §3 挂账池销项与滚动

- **⑥ g1 `toHaveCount` RED-face artifact 第三例：销**（判别件口径修正落件全链终态；三例链三源防悬空引用在 README 落件）。
- 挂账池滚动：③（tsc 清零 2072 件，W-FC-4 候 0.1.132 若触打包面；⑦ carrier json 再生核随其波前）+ ⑧（适配器重连候选）维持。
- 带状账：L4 带余量 **0.1.132-134 三版**维持（本波零版号零锚零载体链）。

## §4 后链

W-FC-3 收口即起 **W-FC-4**（③ tsc 清零 + ⑦ carrier json 再生核波前检查项）：波前方案环节（§0 活码重核 @ 届时 master——2072 件现值重计 + 打包触面定性 + carrier json 现值勘验）→ 工单双门 → 双信号（Main 落码 / e2e 判据）→ gate → 段 L 候 0.1.132（带内授权余量内，授权非跳门）→ 收口。既定版本自动推进。
