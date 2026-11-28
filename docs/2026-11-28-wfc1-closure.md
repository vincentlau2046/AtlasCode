# W-FC-1 收口文书——cursorLedger 行为修 + onActiveEvict 接线（0.1.131 全链终态）

> 工单 `docs/2026-11-28-wfc1-ledger-evict-ticket.md` @c8d4b156（双门齐：判词侧
> 审视 PASS §8 @c8a42b59 + 审计点核 PASS）；排程
> `docs/2026-11-28-debt-pool-schedule.md` §1 W-FC-1。收口日 2026-11-28。

## §1 全链终态（节点 + 判定源）

| 节点 | 判定源 |
|---|---|
| 双门齐 | 判词侧 §8 @c8a42b59 + 审计点核回执（必改/建议逐项闭环核真） |
| 落码 | a4552457（修形 1/2 + 判别单测重写；Main 自证 83/0 + tsc 0 + eslint 0w；f4 三硬约束活码抽核直证） |
| gate | **GATE-PASS** `user-e2e/reports/r-20261128-wfc1-gate.md`（对象 a4552457 bump~1 口径；RED 独立复现 c8d4b156 archive：T1 静默 overshoot + T4 okRouter:false；GREEN 判别件 7/7 + T4 四断言全 true + web-session 141/142 唯一红 stale-face 定谳非回归 + 零 wire 机判双树恒等） |
| 0.1.131 段 L | bump 40f891cf + tag v0.1.131 双远端；双面直发 round-trip 双 MATCH（主 `ef1a63ba…` / 镜像 `fcffa498…`）；SRI `docs/sri/v0.1.131.md` @582a0251；判词侧轻抽核 PASS（execution 本轮零偏离格） |
| AtlasWeb pin bump | 9e2b0aa（pin 五站点 + gateTruthTable repo 面重锚双锚 62bbc6cf 不动 + host 125/0 + pw 8/8） |
| 锚 #4 实勘（f4） | **PASS** 四点直证：独立重建双 org 逐字 = 申报（ee2218dc 282,790B / 4ac534b5 282,793B）+ staging manifest 自证（0.1.131/9bbb766a）+ 载体三值 = SRI 逐字（cli 62bbc6cf 恒等三连）+ worktree 判后清场复原 |
| T6 载体对账 + carrier 复判 | **GATE-PASS** `user-e2e/reports/r-20261128-t6-carrier-0131.md`：全树 diff 恰 2 文件（manifest 双行 + server/atlasweb.js +1,417B raw = W-FC-1 九段修形码零超集零缺项；client/其余逐字节恒等；tgz +280B 压缩形）；三值双位置直算逐字；**carrier 行为腿 artifact 级四断言全 true**（冻结发布制品 dist 直跑 T4 场景——测的=发的字节上闭环）；镜像面仅 name 行；D1 判后复查 5 件全同 |

## §2 采记（判定单登记项处置）

- **㊀ gateTruthTable repo 面定性**：重锚在 `packages/web-host/src/gateTruthTable.ts`（repo 面，pin bump 25 行），载体 server bundle 零 gateTruthTable 行——Δ 主体 = W-FC-1 九段 + manifest，实况比预告窄；0.1.130 判定单「EXPECTED 重锚入 server bundle」口径就此勘正（勘正不溯及既往判定）。
- **㊁ AtlasCode 0.1.131 包内 `dist/atlasweb-carrier.json` 陈旧一代**（内载 0.1.130/5710d056/0fd96bfa；0.1.129 包内同名自洽本版值）→ prepublishOnly 链未再生 stale；零运行时消费（cli/runtime 零引用，0.1.126 fileCount 注记先例同形）。**处置：挂账池 ⑦ 新增**——构建面再生核，归 W-FC-2 波前 §0 检查项（Main 0.1.132 段 L build 链再生 + 段 L 后包内值自洽核，f4 波前登记）。
- **stale-face 判别件更新（判定单登记①）**：§2-8 A3-缺 专判随修形 2 新面失效（非回归三证据定谳）——更新形 = 同位置期待 `resetRequired('active cursor evicted (ledger pressure)')` + 恢复链不变，A3-缺 叙事转「防 churn」面（判词侧裁定①采认）；test-side 零打包面，**Main 单信号 micro 件**（不占版号不入载体链），随本收口执行。
- **t4 探针启动竞态修**（判定单登记③，lane 侧件不入仓）知悉。
- **governance :21 措辞分歧**（判词侧登记）：f4 docs 微修已直落 59ccbb54（gate 对象面分形勘语——TUI/CLI 域 accept.ts 全形 ∥ web 域源码级 + cli 恒等破升级补跑条件），零版号。

## §3 挂账池销项与滚动

- **④ ledger 行为修 + ⑤ onActiveEvict 悬空接线：销**（本波全链终态；排程单 §5 状态行翻转随本 commit）。
- 挂账池滚动：⑦ 新增（㊁ 构建面再生核，归 W-FC-2 波前）；原 ①②③⑥ 维持（W-FC-2/3/4 排程不变）。
- 带状账：L4 已执行 0.1.130/131，带内余量 **0.1.132–134 三版**恰覆盖 W-FC-2/4 载体需求。

## §4 后链

W-FC-1 收口即起 **W-FC-2**（fail-closed 家族并池：① follow 200 流内错形 UI 区分度 + ② `--workspace` 静默接受加固，0.1.132 候）——波前方案环节（§0 活码重核 @ 届时 master + §5 审视记录）→ 工单双门 → 双信号，既定版本自动推进。W-FC-3（零版号）可并行插入。
