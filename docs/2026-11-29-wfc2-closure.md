# W-FC-2 收口文书——fail-closed 家族并池（--workspace 校验 + follow 流内错形分面，AtlasWeb 0.1.4 全链终态）

> 工单 `AtlasWeb/docs/2026-11-28-wfc2-failclosed-ticket.md` @4b5d65e（终版 =
> 折入版 + 审计 §7 + 判词侧 §8）；排程
> `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-2（域勘正版：两件均
> AtlasWeb 全域，零 AtlasCode 版号，L4 带不消耗）。收口日 2026-11-29。

## §1 全链终态（节点 + 判定源）

| 节点 | 判定源 |
|---|---|
| 双门齐 | 审计门关（Atlas-reveiw 点核 PASS @e4afb2d/4c06b6ed，零悬项）+ 判词侧 §8 审视 PASS @AtlasWeb 4b5d65e（八锚独立实勘合流 + 六自决裁定成立） |
| 双信号 | f4 → Main（落码 §3 两修形）+ f4 → e2e（八格判据预登记，§8-3 精化注记随件） |
| 落码 | AtlasWeb a714dfd（修形 1 launchCli 启动期校验 + 修形 2 source 分面；Main 自证 bun 573/1/0 + RED 实证；f4 三硬约束活码抽核 PASS + 格 7 机判独立复跑空） |
| gate | **GATE-PASS** `user-e2e/reports/r-20261129-wfc2-gate.md`（对象 a714dfd bump~1 口径，判后零漂移；RED 恰 6 预注册腿独立复现 + GREEN 八格 T1-T7 全绿 T8 留口 + runtime 探针双站真产同码异义直证 + 配对全量 Δ 恰 6 腿翻绿 canon 573/1/0 + 格 7 三钉全 PASS；判词侧 §8 采认 @AtlasCode 6b999109） |
| f4 采认 | 判定单 124 行全核 PASS → 段 L 硬门两件齐 → 授权 0.1.4 段 L |
| 0.1.4 段 L | bump a6d29df（root+apps 双 manifest）+ tag v0.1.4 → build 紧贴 publish（tree commit = a6d29df 零漂移）→ 双 org 直发（stage-2 瞬时拦截 1 次重试过，0.1.75 先例形）→ packument 对表 + round-trip 双 MATCH → SRI `AtlasWeb/docs/sri/v0.1.4.md` @c9f6489 |
| pin micro | 3391e6b（npmPackage.test.ts 钉值 0.1.3×8 → 0.1.4，实勘比登记 ×3 多；test-side 单 commit 不入格，#419 同形先例） |
| 锚 #5 实勘（f4） | **PASS** 四点：确定性重建双 org 逐字 = SRI 四值（a6d29df worktree 双跑）+ dist 锚双文件逐字（index-BUprpXUJ.js/CAp2kd5Y.css）+ 载体 manifest 双 org = atlascode 0.1.131 + runtimeSha 9bbb766a…（AtlasCode 三值延续不动直证）+ 镜像 name-only 全 diff 恰形 + registry round-trip 双 MATCH；worktree 判后清场 |
| 格 8 载体对账 | **GATE-PASS（销口）** `user-e2e/reports/r-20261129-wfc2-carrier-014.md`：D1 冻结 5 件 + 三基线定性 + 来源链直证（build 面本体非 lane 再构建）；同版隔离件 Δ = 仅 package.json 版本行（bundles 逐字节恒等零内容漂移）+ 修形段三态签串对照零超集零缺项（reg013 负对照全 0）+ AtlasCode 三值 0.1.131/9bbb766a 双 org 逐字 + 双 org diff 仅 name 行 + **pw execution 8/8 artifact 级**（frozen 0.1.4 tgz 装载 exit 0，判后 porcelain = 0） |

## §2 采记（判定单登记项处置 + 过程采记）

- **㊀ 步 4 缺环（执行缺环，非条款缺口）**：Main 锁面批注误只达 f4 未直发 e2e → e2e 按不预跑纪律静默 2.5h；f4 催办（纪律 3 显式信号）+ Main 补环直发消解。矩阵 :21 步 4 本就规定 Main → e2e 直发，条款无缺口——**执行 slips 登记 + Main 补环提醒已发**；催办代发形（f4 补发随件内容）作缺环消解先例留档。
- **㊁ pin 钉值 bump~0 遗留**（判词侧登记①）：a6d29df bump 未随翻 npmPackage.test.ts 钉值 → Main micro 3391e6b 销（×8 全翻，staging 8/8 绿）。
- **㊂ 时序注记**（判词侧登记②）：bump（00:53）早于判词侧 gate 采认落档——先判后版字面满足（lane GATE-PASS 单信号在先），判词侧采认补齐无翻案；bump message 引「f4 采认」实指工单 §8 审视 PASS，归属措辞注记随本节采记，不溯及。
- **㊃ 过估披露（纪律 4 采认）**：f4 格 8 单信号预告「Δ 主体 = 修形 1+2 vs 0.1.3 基线」与实况不符——同版隔离件 Δ = 纯版本行（更窄，bundles 逐字节恒等），registry 0.1.3 = B12 形（无 server bundle 无 carrier manifest，W-FC-1 server 面彼时只经 AtlasCode carrier 发布）；修形段直证改道三态签串对照（W-FC-1 T6 注记①先例同形）。方向非松弛（实况严于预告），过估披露成立不算 fail；**教训：跨版对账预告须先核基线在盘形态**。
- **㊄ 基线多形性登记**：「0.1.3 基线」在盘三形（registry 实发 ∥ build 同版隔离件 ∥ archived 变体×3）——后续载体对账引用基线须指名形（判定单 §6-2）。
- **㊅ "not a directory" ×2 分账**（判定单 §6-3）：修形位（launchCli）+ 既有 runtime storage-root 位——签串对照时按位分账，非重复非冲突。
- **㊆ 投影帽阈值观察**（gate 判定单 §6-4，备查）：dist 内联有效默认 ≈16MiB 与 limits.ts 字面 DEFAULT 4MiB 差 = engine 内联值面——AtlasCode 域非本波判定面，备查登记不排程。
- **㊇ 格 J archive 环境形**（gate 判定单 §6-2）：tamper-evident 验证器读 .git，archive 树恒 2 fail 双树同形非波影响——格 J 腿以真检出为准（5/5），判读注记在案。

## §3 挂账池销项与滚动

- **① follow 200 流内错形 UI 区分度 + ② --workspace 目录缺席静默接受：销**（本波全链终态）。
- 挂账池滚动：③（tsc 清零，W-FC-4 候 0.1.132，⑦ 构建面再生核随其波前）+ ⑥（g1 判别件口径，W-FC-3 零版号）维持排程；⑧（适配器重连候选）维持不排程。
- 带状账：L4 带余量 **0.1.132–134 三版**维持（W-FC-2 AtlasWeb 域不消耗）。

## §4 后链

W-FC-2 收口即起 **W-FC-3**（g1 `toHaveCount` RED-face 第三例判别件口径——判别专用断言改 scrollUnion 权威口径落件，零版号 test-side）：波前方案环节（§0 活码重核 + §5 审视记录）→ 工单双门 → 单信号（test-side 无载体链）→ 收口，既定版本自动推进。W-FC-4 候后链。
