# W-FC-4 收口文书——⑦ carrier json 构建面再生核修形（0.1.132 段 L 全链终态）

> 工单 `docs/2026-11-29-wfc4-carrier-regen-ticket.md` @28ab3f32（折入版 +
> 审计点核 PASS @01589353 + 判词 §8 PASS @28ab3f32 = 双门齐）；排程
> `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-4 = 挂账 ⑦。收口日
> 2026-11-29。

## §1 全链终态（节点 + 判定源）

| 节点 | 判定源 |
|---|---|
| 双门齐 | 审计点核 PASS @01589353（必改 2 + 建议 2 + 注记 3 全折零悬项）+ 判词侧 §8 审视 PASS @28ab3f32（十锚独立实勘：制品分裂冻结件拆验 / npm pack RED 独立复现 / AtlasCode tsc exit 0 直证 / 658f55cd 接线出处 / fail-closed 预言 §8-2-6-i） |
| 双信号 | fb89ce40（排程 §5 双门齐翻转随件；Main 落码格 2 / e2e gate §2 四格） |
| 落码 | Main **7e27e188**（恰 package.json 一件 +2/−1：prepublishOnly 加逗号 + prepack 新行 `"prepack": "bun run build:atlasweb-carrier"`；f4 触面独立核验 PASS；src/packages 零触零 bump emitter 零改）+ 格 1 对表随件（Main publish 显文 `docs/sri/v0.1.131.md:49` + f4 pack 命令形 + 制品级直证三方合流） |
| gate | **GATE-PASS** `user-e2e/reports/r-20261129-wfc4-gate.md` + 判词侧 §6 采认 @041fe3be（对象树钉 28ab3f32；五腿：A 陈旧形制品级 FALSE / B pack 病理复现 FALSE / C 缺失形 FALSE / D GREEN prepack 自造 json TRUE + D' dry-run 干净形 exit 0 + D'' 跨重建内部自洽 TRUE / E 无 dist fail-closed exit 1 直证 = §8-2-6-i 预言 lane 直证） |
| 段 L 0.1.132 | bump **e638029e**（恰 version 行）+ tag v0.1.132=e638029e 双远端 + pack 谓词 TRUE（tgz 68497cfe…，json {0.1.132/9bbb766a/b14e2ea5} 自洽）+ 双 org 直发（@atlasharness 68497cfe / @atlaswork 17cbdff9，member-wise 镜像全树 diff 恰 name 一行）+ round-trip 双 MATCH（registry 直下 = staging 逐字节）+ SRI 留档 **e51a7fca**（`docs/sri/v0.1.132.md`，bundles 三值恒等四连 cli 62bbc6cf） |
| 锚实勘（f4） | **全绿**：tag 双远端恒等 / registry 双 org sha256 独立直下逐字 / name-only 一行 / 谓词 TRUE registry 面 / **确定性重建最强形**（e638029e archive + 硬链 node_modules + build 链 → bundles 三值逐字节恒等 + json 缺席缺失形复现 → npm pack → prepack emit 在场直证 + 重建 tgz = registry **全件字节恒等** 68497cfe）/ Δ 五面全兑现（unpackedSize **+49B 实测**） |
| T6 载体对账 | **GATE-PASS** `user-e2e/reports/r-20261129-wfc4-t6-carrier-015.md`（格 3 registry 自洽腿首跑 TRUE + 对照基线 0.1.131 同谓词 FALSE = 判别力直证；格 4 五面全兑现同值合流；零他变全树直证 diff -rq 恰两件；镜像 name-only :2） |

## §2 采记

- **㊀ 对象树钉预案命中首例**：gate 开工时盘面 json 已被落码链 emitter 再生（自洽现值）→ 陈旧形基线蒸发 → 三腿钉面改道（制品级/病理复现/缺失形）——非失守面，钉形设计价值直证（防蒸发注记自证）。
- **㊁ 格 1 三方合流**：0.1.131 段 L 发布链 = f4 执行（仓根 `npm pack` → `npm publish <tgz> --access public` + 临时 .npmrc）登记在案 + Main publish 显文 + 制品级直证——机制陈述不溯及，勘定闭环。
- **㊂ 覆盖链显文实效**：段 L 实发 = tgz 直发零钩子 → 覆盖链 = 所有 tgz 由 `npm pack` 产出（工具钉 npm/scripts on）；prepack 在 pack 与 publish 源形双跑 = 幂等非阻；残余路径由 registry 自洽腿路径无关兜底。
- **㊃ 自洽腿常态化首跑**：格 3 入 e2e 载体对账标准腿自此跑起（registry 面 TRUE + 基线 FALSE 对照 = 谓词判别力直证）；复发面结构化收口。
- **㊄ Δ 账过估披露（纪律 4 同形）**：工单估 unpackedSize ~+58B 量级 → 实测 **+49B**——方向非松弛（同量级内），随本节采记。
- **㊅ 环境事件两件（均 fail-closed 处置零基线损）**：Main 自验 pack 曾覆盖仓根冻结件名 → registry 重下恢复（f4 第一手复算 sha = ef1a63ba 锚值逐字合）；f4 锚实勘临时提取目录因 shell cwd 重置误落仓根 → 即刻清除（porcelain 复核 0）。
- **㊆ 重建 tgz 全件字节恒等**：确定性重建 pack 产物与 registry tgz sha256 全件恒等（68497cfe）——锚 #3「逐字节恒等」先例同族最强形；bun pack tar 确定性直证。

## §3 挂账池销项与带状账

- **⑦ carrier json 构建面再生核：销**（prepack 接线 + pack 路径 fail-closed 化 + registry 自洽腿常态化全链终态）。
- 挂账池：**①-⑦ 全销**；⑧（适配器终态自动重连候选）维持不排程。
- 带状账：L4 带余量 **0.1.133–134 两版**（0.1.132 已耗；0.1.134 之后需新鲜亲署，带不外溢）。

## §4 后链

W-FC-4 收口即起 **W-FC-5**（③ AtlasWeb tsc 清零 2080 件——波前备料在排程单 §1/§5：类型分布 TS7026×778/TS5097×396/TS2307×235/…，判据形 = 版本钉 `bunx -p typescript@5.9.3 tsc --noEmit -p tsconfig.json`，候 AtlasWeb 0.1.5 若触 bundle 面/type-only 预期零字节变则零版号收口；与 W-FC-4 无载体互斥已并行可入）。既定版本自动推进；波前 §0 活码重核 + §5 审视照旧。
