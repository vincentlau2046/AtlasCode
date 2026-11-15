# atlasweb 架构钉死基线 v1

日期：2026-11-13
状态：钉死（用户裁定启动评估通过后生效；逐项可被用户否决重开）
依据：`docs/2026-11-13-deepseek-harness-web-eval.md`（五轮调研全链，本文引用不重复）
上游锚：`deepseek-ai/deepseek-harness` @ `dsh-v0.2.2-rc.2`（MIT；摘取源在本机 `~/projects/deepseek-harness`，fork 时按该 tag 建立只读基线拷贝，勿用 /tmp）

## 0. 修订记录（2026-11-15，S0 总约 §8 采认）

本节按 S0 总约 `docs/products/atlasweb/2026-11-15-s0-agreement.md` §8 修订清单落笔，行号固定针对 P0 `317f4845` 原文。历史条款原样保留作依据；**新生效规则如下**，与旧文冲突处以本节为准：

| 原位置（@317f4845） | 原条款 | 新生效规则 |
|---|---|---|
| :15（A4 仓库位） | monorepo 内起步 `apps/atlasweb/` | 独立 AtlasWeb 平行目录；G1（实施准入）通过后才建仓 |
| :18（A7 wire 契约） | coreSchemas 作为既有 wire 单源直接扩展 | coreSchemas 是复用匹配**原料**；上游新增受支持的 v0 出口，不是现成服务 |
| :27–35（F1–F7 首期必须） | F1–F7 为首期必须 | 保留「首个真可用产品」判据不删；独立只读技术里程碑与产品里程碑分表（见总约 §3 双表） |
| :43–45,52–65（§3–§5） | 「可立即启动」「只读零内核改动即足够」 | **撤回就绪推断**：先上游桥与阶段门；G1 通过后开发，G2（发布就绪）通过后交付。「立即可启动」「源树稳定零内核改动即可」不再当授权使用 |


## 1. 钉死的架构决策（A1–A10）

| # | 决策 | 钉死内容 |
|---|---|---|
| A1 | 采纳模式 | **模式 A**：摘取 dsh 前端框架，后端 controller 自建对接 Atlas 内核 |
| A2 | 五层定位 | 载体（TUI/Web/未来 Desktop）/产品（code/office/comic）/平台 shell/服务面（atlas host）/内核（src/kernel） |
| A3 | Cordis | **vendor 全家桶**（browser 侧必取；host 侧组表面亦 vendor loader/hmr 在其上组 atlas 版）——MIT、锁 commit、补丁程序照 dsh `vendor/README.md` |
| A4 | 仓库位 | **monorepo 内起步**：`apps/atlasweb/` + `packages/web/**` + `src/web-host/**`；拆包治理到位后整体搬移（目录词汇=未来拆包词汇） |
| A5 | 产品机制 | Atlas-X = bundle 组合切换：boot 期 `ATLAS_PRODUCT` 过滤 boot graph + 运行期批量 `setPluginEnabled` 走 HMR 重组；mode 为持久 profile 级事实 |
| A6 | 品牌 | shell 零品牌词汇；`atlas-brand` 包注册 `sidebar.brand.*`/`conversation.hero.frame` 等价 slots；不取 `ui-brand-official` |
| A7 | wire 契约 | 单源 = `src/kernel/entrypoints/sdk/coreSchemas.ts`（既有 Zod 单源）扩展；types 生成禁手写双份；**v0 起带 schemaVersion + generation 握手**（R2 处置） |
| A8 | 投影同源 | session 投影定义在 kernel 单源，TUI 与 web 消费同一投影（R5 处置，0.1.96 域级纪律） |
| A9 | 安全模型 | 首期 loopback 单用户：launch token→签名 cookie + Host/Origin fence，照抄 dsh 决策记录；远程/多用户延后单列不入首期判据 |
| A10 | 布局 | **主工作面 = slot（`layout.main`），chat 只是 code mode 默认注册者**——dsh 无此缝，摘取时结构性 customize，不可后补 |

## 2. 钉死的关键特性（首期范围 = atlascode mode 可真用）

| # | 特性 | 首期判定 |
|---|---|---|
| F1 | 会话只读面（列表/搜索/回放/follow 流） | 必须 |
| F2 | 会话实链（prompt/queue/cancel，web 发起真回合） | 必须 |
| F3 | 审批/权限闭环（web 可批可拒） | 必须 |
| F4 | Atlas-X mode 机制（code 首发骨架；office/comic bundle 预留位空挂） | 必须（机制），产品内容分批 |
| F5 | atlas-brand（名称+标识，暗色 token） | 必须 |
| F6 | 重连语义（物理/逻辑分离 + 基线整窗替换 + page 补洞） | 必须 |
| F7 | loopback 安全模型 | 必须 |
| F8 | 交付物卡（changed-files card，code mode） | 应有 |
| F9 | 设置面骨架（模型/权限 preset） | 应有 |
| F10 | 文件树/工作区只读浏览 | 可延 |
| — | 插件市场/dockkit/终端/远程访问 | **不入首期**（dockkit 于 office 达标时复评） |

## 3. 钉死的波序与依赖

> **修订（2026-11-15，§0）**：下表「可立即启动 / 可与 W-Web-1 并行」等状态判定不再当授权使用——先上游桥与阶段门，G1 后开发、G2 后交付（见 §0 修订记录）。

| 波 | 内容 | 前提 | 状态判定 |
|---|---|---|---|
| W-Web-1 | atlas host 骨架：产品 env boot + 静态服务 + token/cookie + **F1 只读面**（wire v0 含 schemaVersion） | 0.1.99 双 env 次序（已落地）+ session log 稳定（已稳） | **可立即启动** |
| W-Web-2 | shell 摘取九件 + atlas-brand + atlas-mode 骨架 + `layout.main` slot 改形（A6/A10） | 无内核依赖（纯浏览器侧） | **可与 W-Web-1 并行** |
| W-Web-3 | F2+F3 会话实链闭环 + F8 交付物卡 | wire v0 冻结 + S3b（0.1.106）收口后对接 | 排 S3b 后或协同 |
| W-Web-4+ | office/comic bundle 随各产品达标挂载；dockkit 复评 | 统一内核纲要 office dogfood | 随纲要 |

## 4. 并行开发适配性判定（全局特性列表口径）

| 维度 | 判定 | 根因 | 处置 |
|---|---|---|---|
| 内核前提 | **满足** | 0.1.103 tui→kernel 零改动归位（UI 无关定谳）；0.1.99 双 env 次序钉死；session log 追加型已稳 | 无 |
| W-Web-1 并行 | **满足** | 只读消费稳定 session log，零内核改动，零 TUI 冲突面 | worktree 独立 lane |
| W-Web-2 并行 | **满足** | 纯浏览器侧摘取，零内核依赖 | 独立 lane |
| W-Web-3 并行 | **条件满足** | wire v0 须与 S3b 后的 session/审批词汇对齐；0.1.94–106 波连打 session/team 面，词汇仍在动 | 排 S3b 收口后；wire 只冻结 v0 只读词汇 |
| 主线冲突面 | **满足** | atlasweb 不触 src/tui、不触发布链；fork 源已锁定 tag | kernel 改动走既有波序，web lane 不改 kernel |
| 人力/_lane 先例 | **条件满足** | 三 worktree 并行 gate 先例（0.1.93）；W-D 临时小组先例 | web lane = 独立 session，遵守跨 session 矩阵 + 工单送 Atlas-review 审计 |
| 风险面 R1–R5 | **满足** | R1 已解（vendor 定谳 A3）；R2=A7 版本化；R4=A9 分档；R5=A8 同源；R3=TUI 回归格 standing 进 gate 判据 | W-Web-3 起 web 进 gate |

## 5. 结论

> **修订（2026-11-15，§0）**：本节「立即并行」的就绪结论按 S0 总约证据**撤回**——不构成开工授权。现行授权面：S0 总约 §6 双门（G1 实施准入 / G2 发布就绪），G1 通过后开发、G2 通过后交付。

**适合现在启动并行开发，分级放行**：

- **立即并行**：W-Web-1（host 骨架+只读面）与 W-Web-2（shell 摘取+brand+mode 骨架）两条 lane，互不依赖、零内核风险、零主线冲突。
- **挂起待序**：W-Web-3 等两 lane 汇合 + S3b 收口（wire 实链词汇对齐），预计不损失日历时间——两 lane 汇合前的实链本就无处可接。
- **纪律**：web lane 走既有波前审视+双信号+Atlas-review 审计；fork 基线拷贝 @ `dsh-v0.2.2-rc.2` 建 stable 路径；MIT 归属入 THIRD_PARTY_NOTICES 随首个 release。

本文为钉死基线 v1；W-Web-1 工单以其为引用基线出详细方案+审视环节（§0 活码重核 + §5 逐点自决/报裁）。
