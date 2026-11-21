# B1 候选验收判词 — AtlasWeb 第一波执行出口（授权工作区、真实回合、回读）

> **f4 判（2026-11-21）：B1 候选验收通过（条件形）。** gate 双前置（GATE-PASS + f4 采认）达成；9 红环境修复回执经 f4 独立复跑核实；关节登记三项（§3）不阻 B1，随 B2/B3 与总验收跟踪。B1 验收通过即 B2 开工资格成立（B 附表 §3，f4 已增补开工活码重核对表，见 §4）。本文只作判词，未改产品代码、未跑真实回合。
>
> **审计闭环（2026-11-21）：Atlas-reveiw PASS，0 必改**（独立实跑 468/1/0/1664 expect/63 files 逐字一致 + 登记三裁 + 锚面独立复核）。登记增补 1 条（执法腿符号集补 capability-entry 两符号，随 B2 首落码折入）+ 注记 2 条（送审笔误 20/20→以判词 +21/21 为准；follow.resume 落点补行）。**B1 终态归档，B2 按附表 §3 推进。**详见 §6。

## §0 判词锚

| 件 | 锚 |
|---|---|
| 候选制品 | AtlasWeb `origin/main` @ **3aba08d**（HEAD=origin/main，f4 本地 rev-parse 双值相等核实；B1 码面 = 88de352，环境修复件 = 3aba08d 仅 bun.lock） |
| gate 判定单 | `user-e2e/reports/r-20261121-atlasweb-b1-gate.md`（GATE-PASS @88de352，e2e 独立 fetch 锚） |
| 上游执行出口 | AtlasCode `0.1.127`（registry 三值 MATCH 已在账 @docs/sri/v0.1.127.md） |
| B1 落码回执 | Main 2026-11-21 回执（6 文件 +756 行）+ 9 红修复回执（3aba08d） |

## §1 判据对表（全局特性列表）

| 特性 | 判定 | 实证（f4 独立核实标 ◆） | 条件/登记 | 推导链 |
|---|---|---|---|---|
| 载体 pin 单点 | ✅ 满足 | ◆ 双 package.json `@atlaswork/atlascode: 0.1.127`；◆ bun.lock 同 pin（3aba08d 后） | — | 用户组织面裁定 807d3bd → 0.1.127 发布 → pin 推进 cf4ec4d |
| 单接触点（upstream.ts 唯一） | ✅ 满足 | ◆ f4 复扫 specifier + `createExecutionOutlet` 双判，src 生产面除 upstream.ts 外 zero hit；◆ executionRoutes 类型面经 upstream re-export（真违规归正） | 登记 3（判别面 = src 生产面 + 剥注释；e2e CONFIRMED） | B 附表 §1 双判执法腿 + S4 修订二 |
| runTurn 真体形 | ✅ 满足 | ◆ upstream.ts：spawn `atlas -p <text> --resume <sessionId>`、cwd=授权 workspace、stdout→`emitDelta`、abort→kill→cancelled、exit0→completed/非0→failed、spawn seam 注入 | — | 用户裁定 e429130 → 合同 §0/§9 |
| F2 actorId 必填 fail-closed | ✅ 满足 | ◆ 构造侧非 function 即 throw + 构造即探活；launchCli `--actor-id` fail-closed 非空；验收腿 actorId = `() => 'conn-1'` 认证身份注入 | **actorId 真源腿**：placeholder/ambient 零入验收腿（Main 自证 + f4 读码核实） | F2 裁定 → §5「服务端唯一裁判」 |
| 能力默认 off（E1 形） | ✅ 满足 | ◆ httpHost：execution 未提供则零 routes 构造、POST 404；launchCli 开则 workspace≥1+actorId 必填、关则禁带 | — | 合同 §1/E1 |
| bind 预校验（E2 形） | ✅ 满足 | ◆ executionRoutes host 侧预校验：未授权 403 workspaceNotGranted 零触达 / 形态 400 invalidBind；kernel 零重复执法 | — | 合同 §2/E2 + 附表 §1 |
| 两 RED 升 GREEN | ✅ 满足 | e2e standalone 真 server 9/9 exit 0（gate §3）；web-host 89/89 ◆（gate 判定单 + f4 全仓复跑内含） | 登记 2（RED 腿首次失败为测试形缺陷，非实现缺失捕获——见 §3） | 附表 §2 RED 腿 |
| 全仓连续性 | ✅ 复绿 | ◆ f4 独立复跑：**468 pass / 1 skip / 0 fail，63 files，1664 expect，exit 0**（bun 1.4.4，29.18s）＝ Main 报称逐字一致；修复链：lock 重解 0.1.127（3aba08d 仅 bun.lock 11±）+ 依赖净重装 + 双拷贝消（◆ root react/react-dom 18.3.1 单副本，web-code 嵌套副本不存在） | — | 9 红零波归因（bun.lock 零 diff + web-code 字节未变 + re-link 时序）→ 修复 → f4 复跑 |
| 计数咬合 | ✅ 完备 | 442+1（波前）→ +5（c996814 workspaceAuth 切片）→ +21（88de352 B1 两测试文件）→ 469 total = 468 pass + 1 skip；480−12（e2e 66/54 口径差）= 468 | 引用 gate 判定单 §2 口径注记原文 | 逐提交归因无余差 |
| 套件不退 | ✅ 满足 | atlasweb e2e 66 pass/1 skip/0 fail（gate）；◆ 全仓复跑 0 fail | — | 「不退」判据 |

## §2 与上游的联系面

- 上游版本 `0.1.127` 双 org registry 三值 MATCH 在案（f4 直查：主面 shasum 6d37eb7d… / 镜像面 shasum 9db49e63… + integrity sha512-XqQzBa8R…）；B1 建立的依赖箭头（pin → lock → 消费 `createExecutionOutlet`/`createExecutionComposition`）经 gate + f4 复跑双层成立。
- 本案不涉发布动作（AtlasWeb 非 npm 发布面）；版本/发布面零动作。

## §3 登记与挂账（不阻 B1）

1. **type-only import 登记**：`packages/web-host/test/executionUpstream.test.ts:5` 为该 specifier 的 `import type`——执法腿判别面收窄为「src 生产面 + 剥注释」，判为纪律立法意图（生产路径单点收敛）内形态，非第二执行路径；e2e 独立复核 CONFIRMED。若 Atlas-reveiw 判需收紧，为一行改形（测试内类型本地化）。
2. **RED→GREEN 形注记**：两 RED 腿首次执行 3 红均为测试自身缺陷（makeEnv 复用 upstream 撞 §7 已挂载守卫；replaySince 未传 cursor 取 baseline），修测试形（bareUpstream 工厂 + cursor 传参）后 20/20——本判词不宣称「实现前 RED 捕获缺失」证据格，行为判据以 e2e standalone 真 server 9/9 为准（实测行为面成立）。
3. **判别面收窄登记**：见上 1；随本判词呈 Atlas-reveiw 复核。
4. **既有挂账不变**：Node 20 最低边界腿（A5 判词登记）；F6-PAGE（阻第一波产品总验收，不阻 B 段推进）；单例面穷尽清单（上游 AtlasCode 实施波验收件②，候交）。

## §4 B2 开工放行

B1 通过 → B2（排队、取消、审批）按 B 附表 §3 开工，f4 开工活码重核（@ AtlasCode master 现状）：

| 上游前置 | 实证 | 对表 |
|---|---|---|
| decide bind 必含 turnId 且 ≡ 归属 turn | `src/kernel/protocol/webExecutionV0.ts:85`（`ExecutionBindSchema.required({ turnId: true })`）在品 | 附表 §3「decide binding is turn-exact」腿可直接上判 |
| 待批超时 300s → expired | `src/kernel/execution/executionKernel.ts:27`（`EXECUTION_APPROVAL_TIMEOUT_MS = 300_000`）+ :291/:393 expired 路径 | 附表 §3 超时展示腿上游已执法 |
| queue.remove ≡ cancelled 终态 / 队列 16 | 0.1.126/0.1.127 kernel 在品（S3/S4 已验） | 附表 §3「queue cancel」腿 |
| 断线增量恰一次（cursor 权威） | `executionOutlet.ts` follow.resume 三态 replay 在品 | 附表 §3「reconnects」腿 |
| 审批证据生产者 = host `approvals.ts`（七字段，纯落档不自裁） | B 附表全局约束（审计必改钉死） | approvals.ts 落码按此形 |

开工纪律不变：B2 审批链路必须经 kernel（e429130 伴生②，禁复用 CLI control-request 面）；上限执法归上游、AtlasWeb 零重复执法。B2 呈批件须含 actorId 展示源腿（`approval.settled` 事件，不本地推断）。

## §5 审计移交

本判词 + gate 判定单 + 9 红修复回执送 Atlas-reveiw 审计（跨 session 沟通矩阵，每波必送）。审计意见回后：无必改 → B1 采认终态归档、B2 落码照附表推进；有必改 → 改形后复判。

## §6 Atlas-reveiw 审计闭环（2026-11-21）

**终判：PASS，0 必改 → B1 采认终态归档。**

- **锚面独立复核**：AtlasWeb HEAD=origin/main=3aba08d 双 rev-parse 相等；3aba08d 仅 bun.lock 11+/11−；88de352 = 6 文件 +756/−1 与回执逐字一致；上游 0.1.127 SRI 四值在档（cli.js b4dfd8a4… 与 gateTruthTable EXPECTED 前缀吻合）；基线血统 82945c7+3d0e26d 均为 88de352 祖先。
- **独立实跑（非采信性）**：468 pass / 1 skip / 0 fail / 1664 expect / 63 files / 29.10s——与 f4 复跑逐字一致；B1 两文件 21/21。
- **登记三裁**：① type-only import **无需收紧**（编译期类型引用非运行时接触面；执法面本不及测试目录；双证）；② RED→GREEN 证据格降格**可接受**（判词已诚实标注不冒称；行为判据经 e2e 真 server 9/9 + gate + 审计方复跑三层成立）；③ **登记增补（新，不阻 B1）**：自动执法腿符号集现为 {specifier, `createExecutionComposition`}，须补 `createExecutionOutlet`/`ExecutionOutlet` 两 capability-entry 符号——**WebExecution\* 数据类型不入禁集**（executionRoutes.ts:20-21 经 './upstream' type re-export 为合法通道实证）；现活面零命中故不设复判门，**随 B2 首落码折入**。
- **注记 2 条**：① 送审消息「20/20」为笔误，判词 +21 与实测 21/21 咬合，以判词为准；② `follow.resume` 三态 replay 落点自呈批书预注册的 `src/atlascode/web/` 移至 **`src/kernel/execution/executionOutlet.ts:105-127`**——内容核真，补落点行（本行即为补记）。
- **B2 预警（审计转达，f4 采认并入开工纪律）**：B1 测试形 3 红根因（makeEnv 工厂复用撞 §7 WeakSet 守卫 / replaySince 未传 cursor）在 B2 approvals/queue 测试会再遇——**沿 bareUpstream 工厂形，勿产品面让路**。
- **强口径点**：actorId 真源腿三面（launchCli.ts:88-92 fail-closed 双向 / upstream.ts:169 非 function 构造即硬错 / 验收腿全 `() => 'conn-1'`；ambient 字串仅注释声明不回落）；B2 上游四格重核复核成立。范围声明三项挂账（Node 20 / F6-PAGE / 单例面穷尽清单）确认不变。