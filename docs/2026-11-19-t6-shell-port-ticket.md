# T6-A 正式工单——AtlasWeb shell 基座移植 + Code 只读 bundle（family plan Task 6）

> 状态：`draft → Atlas-reveiw 审计 → Atlasweb-F4 双信号开工`。f4 转正工单（2026-11-19）。
> 方案稿：`AtlasWeb:docs/2026-11-19-t6-shell-port-ticket-draft.md`（Atlasweb-F4 起草 @AtlasWeb 02ca7dc，用户 2026-11-19 授权其出波前方案+§5 审视）。本工单转正其全部内容为正式判据面；转正核验记录见 §A。

## §0 波定义（承方案稿，全文并入）

- **上位依据**：family plan Task 6（`docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md:266`）；S0 agreement §3 里程碑 3（read-only foundation 含壳）。
- **移植源**：本地 tag `dsh-v0.2.2-rc.2`（= ddac96760b）；**禁用 HEAD**（09d38feb8a 已前进）。
- **In（里程碑 3 壳切片）**：dsh shell 基座移植（boot graph / modules / connection / store / slots / renderer / layout / primitives / theme）+ Atlas 适配（brand 槽 / mode 默认 Code / connection 适配 web-host 传输）+ web-code 只读 bundle（list / search / replay / follow-live 四面只读消费）+ apps/atlasweb 构建入口。
- **Out（红线，里程碑 4 域）**：prompt/queue/cancel（F2）、审批/权限交互（F3）、会话写操作、任何 `@atlasharness/atlascode` 内部 API 直连；ui-chat composer / ui-approval / ui-permission-presets 等交互子包不移植。

## §1 任务分解（6 切片 TDD：RED 腿先行 → 移植 → 绿 → commit）

| 切片 | 内容 | 移植形 | 体量@tag |
|---|---|---|---|
| S1 | `vendor/`（cordis 等 7 件全量 verbatim + 上游 commit pin，补齐 F3 NOTICES 缺口）+ `web-store` + `web-modules` | verbatim / verbatim+头注 | ~100 文件 |
| S2 | `web-theme` + `web-slots` + `web-renderer` | verbatim+头注，品牌字面值 → web-brand 槽位 | ~71 文件 |
| S3 | `web-primitives` **选择性移植** | 以 S5/S6 只读视图实际 import 闭包为准，开工时冻结原子清单入档 | 估 30–60 / 全量 203 |
| S4 | `web-connection` | **重适配**（非 verbatim）：dsh host 传输 → /auth/redeem + HTTP 四面 + follow SSE（fetch 流）；断线重连对齐 followPump fail-closed | 35 文件基型 |
| S5 | `web-shell` boot kernel + `web-layout` | verbatim+头注，模块表改 Atlas 包注册 | ~38 文件 |
| S6 | `web-brand` + `web-mode`（Code 默认）+ `web-code` 只读 bundle + `apps/atlasweb` vite 构建 + 全部门格 | 新写（Atlas 域） | 新码 |

每片收口：bun test 全仓绿 → commit → 下片。波内载体 pin 不动（0.1.124）。

## §2 判据格

| # | 格 |
|---|---|
| 1 | 每片 bun test 绿（新腿 + 全仓回归）；只读红线负腿随片入位（grep 级：bundle 无 composer/approval/写面词汇） |
| 2 | 边界自守：UI 包 import `@atlasharness/*` 一律 fail-closed（仅 web-host 豁免）；上游 `atlasweb-kernel-boundary-scan.ts` 交叉参照（AtlasCode 仓执行） |
| 3 | 端到端：构建产物 serve → /auth/redeem → 四面全通 fetch 级烟测（浏览器级 e2e 登记债不进本波） |
| 4 | 不动面：web-host 43/0 保持；G1/G2 admitted 保持；格 I 背书不需重发（载体/产物锚零变更；若波内被迫 bump 依赖 → 触发完整重验并升级呈批） |
| 5 | 收口：e2e lane 复跑回执 → 版本记平台候选 `0.1.0` → **tag 不自发**，发布链候用户 + G2 终格 |

## §3 风险登记

R1 ui-primitives 选择闭包牵出面失控（slice 3 开工冻结清单，超估回审）；R2 cordis/bun 兼容性（S1 首腿 RED 实证，不行则 node:test 双轨升级呈批）；R3 dsh TS^6 语法/bun 版本差（包级 tsconfig 逐片实测）；R4 SSE 取消/背压语义（对齐 followPump fail-closed，S4 判据腿直证）。

## §4 审计焦点预钉（f4）

1. **S3 选择闭包冻结时点**：方案稿定「开工时冻结」——审计确认冻结件（原子清单）是否须在 S3 开工 commit 内入档并作为超估回审基准（f4 预判：须入档，回审以冻结清单为准）。
2. **S4 重适配的契约腿完备性**：四面（list/search/replay/follow）+ /auth/redeem + SSE 取消/背压——适配判据是否须逐面独立断言（f4 预判：须，禁聚合单腿）。
3. **格 4 不动面的 bump 触发形**：「被迫 bump 依赖」的判定归属（f4 预判：任一 package.json 依赖行变更即触发，非仅 major）。
4. **F3 vendor 补齐的 pin 面**：上游 commit pin 记录形（f4 预判：vendor/ 内随件头注 + 汇总清单双面）。

## §5 审视记录（Atlasweb-F4 §5 全文并入：8 项自决闭环，无硬报裁）

自决 1 移植源=tag（F1）；2 vendor 81 件 verbatim+pin 补 NOTICES；3 ui-primitives 选择性移植（F6 裁定）；4 React ^18.2.0/zod 对齐 tag 版本不追新；5 connection 重适配形（四面契约腿为判据）；6 UI 边界自守本地负腿自足+上游交叉；7 验证深度=bun test+fetch 级烟测（playwright 登记债）；8 平台候选 0.1.0 不自发 tag。软报裁唯一候选 = R2 触发双轨制时升级呈批。

## §A f4 转正核验（2026-11-19，PASS）

1. **上位锚验真**：family plan Task 6 @`docs/superpowers/plans/2026-11-13-atlas-family-platform-plan.md:266` 实读吻合（dsh-v0.2.2-rc.2 基线 / read-only 四面先行 / brand+mode 槽 / 分开发布+family manifest）；S0 agreement §3 里程碑 3 域吻合（F2/F3 明列里程碑 4 不可用里程碑 3 核销）。
2. **F1 独立直证**：`dsh-v0.2.2-rc.2` = ddac96760b 本地在位，HEAD 09d38feb8a 已前进——「从 tag 移植禁 HEAD」成立。
3. **F8 销项验真**：roadmap Current phase 勘误 f54377e7（本 session 已落 master）。
4. **授权链验真**：用户 2026-11-19 授权 Atlasweb-F4 出波前方案+§5 审视（其工单稿记录在案）；本转正仅采认判据面，**非开工授权**——开工 = Atlas-reveiw 审计通过后 Atlasweb-F4 双信号。
5. **转正效力**：方案稿 §0/范围/切片/判据/风险/§5 全文并入为正式判据面；落位 = AtlasCode `docs/2026-11-19-t6-shell-port-ticket.md`（本件）；工单编号 T6-A。

## §B v2 采认增补（2026-11-19 同日，AtlasWeb @04093e0；审计基准升格为 v2 + 可执行计划）

Atlasweb-F4 第二遍审视刷新方案稿 v2 并落可执行计划 `AtlasWeb:docs/superpowers/plans/2026-11-19-t6a-shell-port-plan.md`（10 任务 RED-GREEN 形）。f4 逐项核验：

1. **F9 依赖闭包双面——f4 独立直证成立**：耦合边口径 = src import 语句级。抽验 ui-theme→ui-settings 恰 5 条 src import（4× `import type {}` + 1× `ConfigForm`，`AppearanceRow/FontFamilyRow/FontSettingsGroup/FontSizeRow/index.ts`）与 v2 ×5 吻合；文件级宽口径命中（12）= README/tests/package.json 非源码边。ui-chat/ui-approval **零实 import 牵入**（4 命中 = 测试 CSS 路径 + `boot-client.ts` boot 模块表注册字符串——后者即 S5 适配形模块表重写对象，非传递依赖）。干净集/耦合集三分成立。
2. **移植形三分法（自决 9/10）采认**：干净集（vendor/store/ui-slots/ui-renderer + modules 微边）verbatim；耦合集（connection/ui-theme/ui-layout/web boot）适配改写（dsh 为参照）；新写（brand/mode/code/app）。dsh 产品服务子包（ui-settings/shortcuts/locale/ui-dockkit/ui-session）禁入 + R5 逐片负腿 import=0——替代边 = Atlas seam。
3. **自决 11 vendor 双面 pin 采认**：f4 对 dsh tag `vendor/README.md` 实读——上游 commit 表逐字吻合（cordis 0b96d9fd…/cosmokit 02e691c5…/schemastery cf0b7e54…/group·timer 01b39624…/hmr ed8a7755…），verbatim 随迁审计焦点④闭环。
4. **自决 12 zod 冲突排除采认**：同 4.x 线相容，不新增第二 zod。
5. **可执行计划采认**：Global Constraints 钉死载体 pin 0.1.124 + bump 判定形（审计焦点③）+ 只读/边界/禁入三红线 + tag 恒定 + MIT 头注/适配头注纪律；Review Focus 5 输入类（SSE resetRequired 收敛 / 空仓态 / 畸形事件 fail-closed / 切换竞态 abort / 虚拟化有界）各落判据腿；审计焦点①冻结清单时点 = Task 5 Step 1；审计焦点② = Task 6 四面 + 重连 + 竞态逐腿独立断言。**审计焦点①-④全数闭合。**
6. **审计基准更替**：本工单 §0-§5（v1 基）保留为演进记录；**Atlas-reveiw 审计以 v2 方案稿 + 可执行计划为判据基准**，v1→v2 增量以上述 1-5 为采认面。

## §C Atlas-reveiw 审计 verdict 采记 + 必改修形定形（2026-11-19，**有修改通过**；两必改均判据面文字级，修形入档回执示下即双信号开工，无需二轮技术审计）

1. **独立核验面采记**（审计活码实测）：F1/F6 全数对账（ui-theme 实测 39，表载 40 ±1 勘误注记）/ F9 边抽验逐字合（theme→settings 恰 5、layout→session 恰 1 纯类型、web→dockkit 恰 3=platform.ts 字符串+seed.ts 实引×2）/ vendor 上游表 9 行恰合（loader/include 同 cordis commit，§B 引文系摘录）/ 上位锚 + 格 5「候选 0.1.0 不自发 tag」恰合 / zod 双仓 pin 实测吻合 / f4 预钉焦点①-④闭合 + Review Focus 5 腿落点（1/4→Task 6，2/3/5→Task 8）+ 红线负腿三层在位——全 GREEN。
2. **必改①（采认定形）：格 4 bump 触发面分域**——原「任一依赖行变更即触发」与本波自身引入 toolchain（Task 3 react / Task 9 vite）自相矛盾（开工即自触发→规则被静默 ignore）。定形：(a) 载体 `@atlasharness/atlascode` 依赖行**任何**变更 → 完整重验 + 升级呈批；(b) web-host 运行时依赖行变更 → 同 (a)；(c) 波内 UI 链/toolchain 新增依赖 → **白名单预注册**：react ^18.2.0 / react-dom ^18.2.0 / vite ^6.4.3 / @vitejs/plugin-react ^4.7.0 / @tanstack/react-virtual / zod 4.6.x——白名单内不触发，白名单外按 (a)。焦点③原意（拦载体静默 bump）保住且不自锁。
3. **必改②（采认定形）：Task 5 冻结清单时序悖论修形**——原基准「Task 7/8 视图源 import 闭包」在 Task 5 时点不存在（S6 视图为新写）。定形：(a) Task 5 Step 1 扫描基准改写 = **dsh@tag `client/web` + `client/ui-layout` 对 ui-primitives 实引闭包 + S6 计划视图设计稿**；(b) Task 8 增**停腿**：实现引入冻结清单外原子 → 停片走 R1 回审，禁静默增补。
4. **注记四条（随 fixup 顺手，不阻）**：① F6 ui-theme 40→39 勘误；② 自决 12 勘误 = AtlasWeb 全仓现零 zod（含 lockfile），本波随移植引入 4.6.x（结论不变）；③ dist grep 负腿**词表预注册化**——Task 9 Step 1 逐词列明红线标识符形（prompt/queue/cancel/composer/approval）+ 豁免理由入表（replay 投影合法含 prompt 字样的排除面）；④ 边界扫描器路径勘误 = AtlasCode `scripts/atlasweb-kernel-boundary-scan.ts`。
5. **放行**：本节在案 = 修形入档完成 → 回执 Atlasweb-F4（其 plan fixup 落上述 2/3/4 定形）→ **双信号开工**。

## §D 白名单增补呈批采认（2026-11-19，Task 2 停片呈批；候 Atlas-reveiw 补环确认后放行）

1. **呈批事由**：Task 2 开工盘点出白名单缺口——dsh store 引擎实建在 zustand + immer 之上，F4/F9 npm 运行时闭包按**包级 manifest** 采信 → 根 hoist 面 deps 不可见 → 漏计。
2. **f4 独立直证 PASS**：dsh tag `packages/client/store/src/index.ts:10-13` 恰 4 条 import（`zustand/vanilla` createStore+StoreApi / `zustand/middleware` subscribeWithSelector / `zustand/shallow` shallow / `immer` freeze+produce）；pnpm-lock resolved `zustand@4.5.7` / `immer@10.2.0`；store 包级 manifest deps=None（peer 仅 cordis）——盲区定因成立。
3. **采认增补**：判据 (c) 白名单 +2 条 = `zustand ~4.5.7` + `immer ^10.1.1`（dsh@tag 实测 pin，lock resolved 10.2.0 在 ^10.1.1 域内；对齐自决 4「对齐 tag 版本不追新」）。
4. **影响面核可**：仅 `packages/web-store/package.json` 两条依赖行；web-host 运行时零触碰 → (b) 不触发；modules 源码级盘点纯 node: 内建 + cordis peer 零 npm 依赖。
5. **链路裁定**：白名单 = 审计必改①定形的判据面 → **须 Atlas-reveiw 单信号补环确认**（非重审；§C 文字级修形回执示下先例同形），确认后 Atlasweb-F4 两腿（Task 2 store+modules）继续。
6. **方法论注记（入册）**：依赖盘点禁按包级 manifest 采信——workspace hoist 面使包级 deps 失真；**npm 运行时闭包唯一权威 = 源码 import 实扫**（F9 对跨包引用面已用源码级，本条补齐 npm 依赖面同口径）。
7. **补环闭环（同日）**：Atlas-reveiw **确认增补无异议**——独立直证四点与我 §D-2 吻合（4 import / manifest 零 deps / range 恰覆盖 / 影响面成立）；程序面裁定 = 此呈批正是 §C-2 分域机制设计行为（白名单外缺口→呈批→三方确认），非破例。**§D 闭环，Atlasweb-F4 Task 2 两腿放行继续**。

## §E Task 5 冻结清单回审采记（2026-11-20，Atlas-reveiw 直呈直裁路径知会；f4 落档）

1. **verdict（Atlas-reveiw 已直回 Atlasweb-F4）**：**B 案（去数学/去高亮）采认** + **16 白名单外 dep 行按 zustand/immer 先例升格采认** + (a) 面**零原子定性认可**（ui-layout 实为零引用，清单表述勘误级）+ **4 文件适配形采认**；审计面全绿（21 dep 行 devDeps 实读逐条吻合、主题 2 原子/边 +2 实证）。**Task 5 步 2-4 放行。**
2. **绑定条件 3 条（随波执行入档）**：① 登记债 +2 入档；② FenceBlocks 数学 fence→code fence 判据腿；③ **保真减损向用户显性**（B 案去数学/去高亮为移植保真减损，须向用户显性报告——本节即 f4 显性载体之一，波收口报告复述）。
3. **路径注记**：本回审走 Atlasweb-F4 直呈 Atlas-reveiw 直裁（跳过 f4 转呈）——程序结果合法（审计职权内判据面裁定），f4 采记落档保持工单链完整；后续同类直裁请审计侧知会 f4 落档（本条即为先例）。

## §F Task 7 抽验采记（2026-11-20，Atlas-reveiw 直呈直裁知会；f4 落档）

1. **verdict：有条件采认**——技术面全采认（源面修正 / 平台表 9 词 / R5 双树 / BrandFace+session-face 契约冻结 / 安全处置对线不改形）。
2. **必补回环 1 处**：GREEN 声明状态不可复现——未提交 plan 勾选记录致格 J G2 clean-candidate 行如实判 fail（机器评估 fail-closed 正确工作）。补环 = commit fixup → **干净树复跑 320/0 fail 回执**。
3. **方法论入册**：GREEN 报送前最后一跑必须落在 **commit 后干净树**——先跑后写记录的顺序倒置 = 本次缺口（GREEN 声明与可复现状态须同一树状态）。
4. f4 侧注记：该条与本工单 §E 同链路（直呈直裁 + f4 落档）；补环回执由 Atlasweb-F4 直呈审计侧，波收口信号照常过 f4。

