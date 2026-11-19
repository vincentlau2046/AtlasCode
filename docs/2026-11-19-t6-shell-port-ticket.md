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
