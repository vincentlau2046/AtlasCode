# DeepSeek Harness Web 方案调研 — atlasweb 参考评估

日期：2026-11-13
对象：`deepseek-ai/deepseek-harness` @ tag `dsh-v0.2.2-rc.2`（本地只读 worktree `/tmp/dsh-022rc2`；用户既有克隆 `~/projects/deepseek-harness` 未动）
许可证：MIT（`LICENSE`，Copyright (c) 2026 DeepSeek）

## 一、仓库定位

- 描述 "Everything is a Plugin."，全仓建立在其自研 Cordis 框架上（`docs/architecture.md:7-11`）：插件贡献服务/类型化事件/可逆副作用，模型适配器、工具注册表、session log、agent loop 本身都是插件。
- Web UI 只是若干 application profile 之一：`web` / `headless` / `sdk` / `sdk-minimal` / `acp`，由 profile → 有序 bundle 列表 → `cordis.patch.yml` 组合而成（`docs/architecture.md:15-27`）。
- 版本节奏快：用户克隆停在 0.1.0-rc.8，上游最新 tag 已是 0.2.2-rc.2（短期跨 0.1→0.2）。

## 二、Web 技术方案五要素

### 1. 分层：Host 权威状态 → 生成 RPC → React-free client model → UI adapter → Slots → React

依赖方向单向（`docs/subsystems/web-client.md:9-20`）：

| 层 | 归属 | 职责 |
|---|---|---|
| Host 应用 | `packages/api/*-controller` | 权威状态、持久化、变更排序、策略、流生产 |
| 传输/API 组装 | `client/connection` + `api/gateway` + `api/remotes` | 连接代际、生成式 `ctx.remote` 方法、逻辑流、事件转发、取消 |
| Client model | `api/session-controller/client` 等 | Host 状态的 React-free 镜像、流/单播竞态消解、对象身份、订阅 |
| UI adapter | `client/ui-session`、`ui-workspace` | 把模型 observable 转成 Slot 源与 hooks |
| 组合/渲染 | `ui-slots`、`ui-renderer`、`ui-layout` + 各 feature UI 包 | 声明扩展位、派生 props、绑 React、挂载 |

关键纪律：presentation 组件永远拿不到 `ctx`、transport 或别的 feature 包的实现；`ui-renderer` 是唯一用 `useSyncExternalStore` 绑 observable 的包（`web-client.md:20,64`）。

### 2. 客户端全面插件化（61 个 ui-* 包）

- `packages/client/` 下 61 个 `ui-*` 包，每个 UI 特性（会话/审批/工具树/计划/设置页/插件市场/文件树/终端/文档预览…）都是独立插件（`packages/client/README.md:27-93`）。
- 浏览器端两阶段 boot：Host 把组合好的 `WebBootGraph` 写进 `window.__DSH_BOOT__` 并预装模块 loader → 模块系统按 lazy CommonJS 表加载 bundle → Cordis Loader 激活全部插件 → 激活审计（required 插件失败则聚合报错点名每个失败项）→ 才交给 `ui-renderer` 挂 React（`packages/client/web/README.md:36-42,75`）。
- 框架无关 boot page：纯 DOM + 本地 CSS，插件失败"可见失败"而非白屏（同上 38-42）。
- 共享模块表 `PLATFORM_MODULES`（React/Cordis/Zod/TanStack Virtual 等）作为所有动态 bundle 的 implicit external 基线；第三方插件构建时这些导入保持 external（`client/web/README.md:44-49`）。

### 3. Slots 组合模型

- `ui-slots` 定义类型化扩展位与可复用组件工厂，跨包 UI 只走 Slots；跨包行为只走注入的 Cordis 服务；feature 包之间禁止 runtime import（`web-client.md:91-93`）。
- 加一个 Chat 视图 = 注册一个 `ConversationNodeDefinition` + keyed renderer（`docs/architecture.md:163`）；Chat 与 Trajectory 是同一事件族的两个平行 target，互不 import（`web-client.md:62`）。

### 4. 一个前端、多个宿主（对 atlasweb 最有价值的实证）

同一套 `apps/web` vite dist 被四类载体消费（`docs/architecture.md:41-53`、`packages/host/README.md:12`、`client/web/README.md:28-30`）：

| 载体 | 方式 |
|---|---|
| 浏览器 | `dsh web`，apps/cli 内起 HTTP 服务 + `frontend-static` SPA 兜底座（`127.0.0.1:3080`） |
| Electron 桌面 | Desktop Host 以 Node 模式起同一 CLI profile runner + 完整 Web 应用，窗口直接加载打包 web assets，等 boot injections 后在同一文档激活 client 插件；Node IPC 载 injections/就绪/致命错误/关停 |
| WebWorker 预览 | `apps/web` `build:preview` 出 vfs-image，共享 injection 解释器 |
| SSH 远程 | 只打印转发 URL，本地端口由 SSH 客户端转发；页面传输可被 `__DSH_TRANSPORT__` 覆盖（desktop 提供独立 streamBaseUrl，认证归载体） |

品牌也是插件：`ui-brand-official` 填通用 brand slots，`DSH_CLIENT_BUILD_PROFILE=official` 才换官方 sidebar 标识，其余 profile 留 shell fallback（`packages/client/ui-brand-official/README.md`）——"同一前端、按构建/组合换品牌换产品"有现成先例。

### 5. 传输与健壮性/安全

- Wire：unary RPC 走 JSON POST（二进制附件走 multipart envelope）；流走 `/api/remote.mux` WebSocket 上的多路逻辑流；RPC 契约由 Typert 从 Host 装饰器生成严格描述符 + 编解码器 + d.ts（`packages/client/connection/README.md`、`web-client.md:30-34`）。
- 重连：物理恢复（Gateway 重开 WebSocket）与逻辑恢复分离；每条流自带语义——durable session 流按代际开帧基线整窗替换 + 序列号校验 + `page()` 补洞；control/workspace 流"断线保旧值、重连原子换新基线"；普通通知不重放（`web-client.md:77-87`）。
- 安全：每次启动铸随机 launch token → `GET /?token=` 换 authority 绑定的签名 HttpOnly SameSite=Strict cookie（30 天）；token 只在根交换与 `/connect` 接受；Host/Origin 信任栅栏（loopback 校验、DNS rebinding / 跨站拒绝、`sec-fetch-site: cross-site` 拒绝）；`--host 0.0.0.0` 明确不支持；PeerScope 管身份与事件参与权（`connection/README.md`）。
- 安全决策均有 decision record（`.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.md` 等）。

## 三、对 atlasweb 的评估（结论先行）

**方案质量高，值得作为 atlasweb 的架构参考基座；建议"摘取架构 + 冻结版本"而非全盘跟踪上游。**

### 直接吻合点

1. **多产品统一前端 = 换插件组合 + 换 brand slot**。dsh 已实证：shell（layout/boot/connection/renderer）与 feature 包分离，产品差异收在 composition 与 brand 插件。这与统一内核多产品纲要（atlascode → atlasoffice/atlascomic）完全同构——atlasweb 可以做到：一套 shell，三个产品的 feature UI 包各成 composition。
2. **一套前端多宿主**已被 dsh 用浏览器/Electron/SSH/WebWorker 四载体验证，atlasweb 未来做桌面壳或远程访问不需要重设计。
3. **client model 层设计**（React-free、身份稳定、基线+增量、竞态消解）与我们 session log 追加型架构天然对齐；dsh 的 durable session 流语义（代际基线整窗替换 + 序列校验 + 补洞）可直接抄成 atlascode session log 的 web 投影契约。

### 需要自建/适配的缝

1. **Host controller 层是主要工程量**。dsh web 的 wire 契约（`SessionEventLikeEntry`、`follow`/`page`、workspace-controller 增量词汇）是 dsh session 事件词汇的投影；atlascode 有自己的 session 事件/审批/权限面，需要自写 `api/*-controller` 等价物 + Typert 或替代的 RPC 生成层。前端壳复用度高，后端要重做。
2. **Cordis 绑定**：client 壳的 boot/激活/服务注入依赖 Cordis。摘取即引入该框架（含学习/维护面）；若不想引入，需要把 boot graph + loader + slots 三件自研替代，这是模式 B 的主要成本。
3. **规模手术**：61 个 ui-* 包中 atlasweb 初期真正需要的约是 shell 八件（web/modules/connection/store/ui-renderer/ui-slots/ui-layout/ui-primitives）+ 会话/审批/工具树/设置骨架；ui-plugin-market、ui-dockkit 等可整包不取。摘取需逐包过依赖，vite 构建侧还有 `product-isolation`（防实验包泄入产品图）这类可选纪律。

### 采纳模式对比

| 模式 | 内容 | 评估 |
|---|---|---|
| A. 摘取前端框架五件套 | fork `client-web boot + modules + connection + api-gateway + slots/renderer`（MIT 允许），后端 controller 自建对接 AtlasCode 内核 | **推荐**。架构直接兑现，Cordis 范围可控（只进浏览器侧），版本冻结后不背上游演进 |
| B. 只抄架构模式不抄码 | 自写壳，借鉴 client model/重连/slots 设计 | 无 Cordis 债，但重造 boot/loader/重连，周期长；适合 Cordis 被否后的退路 |
| C. 以 dsh 为宿主挂 atlas 插件 | 用其 profile+patch out-of-tree 组合 | 不现实：AtlasCode 内核与 dsh Cordis 面不兼容，且产品身份/自主性受制，违背品牌/发布治理要求 |

### 风险面

1. **上游演进快**（0.1→0.2 短期跨版本），全盘跟随成本高 → 摘取后冻结，仅按需 cherry-pick 安全修复。
2. **MIT 合规**：保留版权与许可声明即可，需入 THIRD_PARTY_NOTICES。
3. **UI 栈本身无重依赖**（React + TanStack Virtual + 自研 store + Vite + KaTeX，无组件库框架），摘取后维护面比预期小——这是加分项。
4. 浏览器信任模型按"本机 loopback 单用户"设计；atlasweb 若要远程/多用户场景，trust 栅栏与认证层需要另行设计，不能照抄。

## 四、追加核实（2026-11-13 第二轮）：品牌独立与"产品模式选择"

用户裁定采纳模式 A（前端功能直接抄）。两条追加核实：

### 4.1 品牌独立 —— dsh 的品牌面是"构建期门 + 运行时 slot"双层，摘取后可完全独立

- **构建期**：`DSH_CLIENT_BUILD_PROFILE`（`official` 才启用官方标识）+ `DSH_CLIENT_TITLE`（页面标题）在构建时嵌入 artifacts（`scripts/client-build-environment.ts:16-21`）。非 official 构建显示 shell fallback（fish 标记 + local-build 标签）。
- **运行时**：品牌就是普通 slot 注册——`ui-brand-official` 仅注册 `sidebar.brand.mark`、`sidebar.brand.name`、`conversation.hero.frame` 三个 slot（`packages/client/ui-brand-official/src/client/index.ts:17-25`）。任何插件可注册同名 slot。
- **atlasweb 落点**：删掉/不取 `ui-brand-official`，自建 `atlas-brand` 包注册同名 slot；`DSH_CLIENT_*` 构建环境变量改成 `ATLAS_CLIENT_TITLE` 等。品牌独立是零架构成本项。
- 附带可用能力：同一 bundle 服务任意挂载路径（document-relative routes，`<base href="./">` 单源决策，`.agents/notes/implemented/architecture/2026-09-14-web-document-relative-app-routes.md`）——未来多产品站点反代同源挂载不用多套构建。

### 4.2 "产品模式选择"核实 —— dsh 原生**没有**现成的产品模式切换器，但有全部零件

全仓检索确认："product" 在仓内只指发布物 graph（构建隔离），**不存在 Code/Office/Comic 式的产品概念**。用户记忆中的"原生能力"实际是三个相邻机制的组合印象：

| 原生机制 | 作用面 | 与 Atlas-X 的关系 |
|---|---|---|
| `DSH_CLIENT_BUILD_PROFILE` | 构建期品牌开关 | 只有品牌，不切功能组合 |
| `pluginManager.setPluginEnabled` → 写 profile `cordis.patch.yml` → **HMR 即时重组，页面不重载**（`ui-plugin-manager/README.md:85`）；bundle 可声明 `listedByDefault: false` 隐藏 | 运行时插件启停 | 最接近的运行时组合能力 |
| profile → bundle 有序组合（web/headless/sdk/acp 模板） | boot 期组合 | 组合单位，但不面向终端用户 |

**Atlas-X 产品模式（Code/Office/Comic）实现路径**——零件齐全，自建约一个开关面：

1. **组合侧**：每个产品 = 一个 bundle（`atlas-code-ui` / `atlas-office-ui` / `atlas-comic-ui`），各自声明其 feature ui-* 包集合 + 各自的 brand 注册（或共享 shell brand + 产品 delta 包）。dsh bundle 机制原生支持"一个 bundle = 一组 patch 行 + 代码"。
2. **切换侧（推荐 boot 期选型 + 运行期批量切换两层）**：
   - boot 期：`ATLAS_PRODUCT=code|office|comic`（或 URL 参数）→ Host 组 WebBootGraph 时按 mode 过滤 bundle 集——这是对 dsh boot graph 组装点的一个小改动；
   - 运行期：mode switcher 批量调 `setPluginEnabled` + 依赖既有 HMR 重组——dsh 已有 live graph 同步与激活审计，切换不需刷新页面。
3. **收口面**：mode 是持久 profile 级事实（写 `cordis.patch.yml` 等价物），跨会话保持；session 数据本身按产品分域（对应统一内核纲要的 configDir 分域前提）。

工程量评估：切换器 UI + boot graph 过滤 + 三个产品 bundle 骨架 ≈ 小波级；远小于 controller 层自建（模式 A 的主工程量不变）。

### 4.3 模式 A 摘取清单（细化版）

**Shell 必取八件**：`client/web`（boot 内核）、`client/modules`、`client/connection`、`client/store`、`ui-renderer`、`ui-slots`、`ui-layout`、`ui-primitives`。
**首批 feature 包（直接抄形改皮）**：`ui-conversation` + `ui-chat`、`ui-session`、`ui-approval`、`ui-tool`、`ui-sidebar(-right/-files)`、`ui-settings` 骨架、`ui-theme`、`ui-commands`/`ui-input-trigger`。
**自建**：Atlas host controllers + RPC 生成层、`atlas-brand`、Atlas-X mode switcher、三个产品 bundle。
**不取**：`ui-brand-official`、`ui-plugin-market`（其插件市场索引面）、`ui-dockkit`（初期）、experimental 系。
**改造注意**：摘取后 Cordis 仅存于浏览器侧（boot/loader/slots 注入）；`PLATFORM_MODULES` 共享模块表按 atlas 依赖清单重定；KaTeX 字体保留机制可直接复用。

## 五、统一平台总体逻辑（第三轮，平台视角）：atlasweb = 全系列产品统一平台

视角转换：atlasweb 不是"给 atlascode 加个 Web 界面"，而是**产品家族的平台层**——所有系列产品的统一 Web 承载面。

### 5.1 平台在产品架构中的位置（五层）

```text
载体层   TUI (Ink/终端)  │  atlasweb (浏览器)  │  未来: Desktop 壳 / 远程
产品层   atlascode  │  atlasoffice  │  atlascomic  │  (ascend 域)     ← Atlas-X mode
平台层   atlasweb shell：会话/审批/设置/文件/交付物/模式切换/品牌槽（产品中立）
服务面   atlas host：产品 env boot → kernel 实例 → HTTP/WS → controllers → 静态 dist
内核层   src/kernel（session log / agent loop / tools / permissions）—— 已 UI 无关
```

**定谳性事实：0.1.103 的 121 文件 tui→kernel 行为零改动归位，已经把内核做成 UI 无关。atlasweb 是内核的第二个 UI 消费者——这恰好是纲要三步路径（边界硬化→拆包治理）的第一次真实验收：TUI 从此不再是唯一消费者。**

### 5.2 四条平台逻辑（统一平台 ≠ 多套前端拼盘）

- **P1 单协议多产品**：wire 契约（session/turn/step/tool/approval/artifact 词汇）必须产品中立；产品差异是类型化扩展（keyed renderer + slot，对应 dsh ConversationNodeDefinition），不是平行协议。协议 = 平台的核心资产。
- **P2 组合即产品**：产品 = bundle 组合 + brand slot + agent preset；Atlas-X 切换 = 组合切换（§4.2 已核实零件齐全）。新产品上平台 = 交付一个 bundle，不开新平台分支。
- **P3 服务面即产品边界**：host controllers 的能力面决定产品能在 web 上用什么；office/comic 上平台 = 各自补 controller + renderer，**内核不动**。
- **P4 内核消费者平权**：TUI 与 atlasweb 平权消费 kernel；任何 kernel 能力先落成 headless 可用面、再进任一 UI——即我们既有 func≠e2e 纪律的 UI 版。

### 5.3 承载路径（对当前代码面的逐条锚定）

| 层 | 现状锚点 | atlasweb 动作 |
|---|---|---|
| 内核层 | `src/kernel/*`（0.1.103 归位）+ 追加型 session log | 不动；durable 流语义直接映射 §2.5 重连契约 |
| 服务面 | 双 env 次序已钉死（ATLAS_CONFIG_DIR > NAME > product 默认 > .atlas，0.1.99）；`kernel/entrypoints/sdk` 已有 Zod 单源 schema | 新建 atlas host：产品 env boot → kernel 实例 → HTTP（token→cookie + loopback fence，抄 dsh 决策记录）→ controllers（session follow/page、approval、workspace/files、permissions、settings） |
| 平台层 | 无 | 摘取 shell 八件 + feature 包抄形改皮（§4.3 清单） |
| 产品层 | `src/atlasoffice/index.ts` 预声明缝明列"office UI 壳（Ink/React 或 **Web 壳**）" | **该缝现在有答案：office UI 壳 = atlasweb 的 office mode bundle**，不在 atlascode/ 里长 TUI 兄弟；atlascode mode 先行，office/comic bundle 随各产品达标挂载；ascend 域工具 = code mode 内的领域 renderer 供给 |

### 5.4 与统一内核纲要的接驳

- **排序建议（报裁）**：web 轨不抢 S3b/S1a 既有序，但把内核边界硬化的验收标准升级一条——每步硬化须同时回答"web 消费者怎么用"。
- 建议波序：**W-Web-1** 服务面骨架（boot + 静态服务 + 只读会话列表/回放）→ **W-Web-2** shell 摘取 + atlas-brand + Atlas-X mode 骨架（仅 code）→ **W-Web-3** 会话实链闭环（follow/prompt/approval 可真用）→ **W-Web-4+** office/comic mode 随产品达标挂载。
- **仓库位（报裁）**：先 monorepo（`apps/atlasweb` + `packages/web-*`），拆包治理到位后随纲要拆出。

### 5.5 平台视角新增的风险面

- **R1 Cordis 引入范围**：dsh 的插件系统横跨 host+browser（boot graph 组装、HMR、plugin-manager 都在 host 侧）。模式 A 内部最大分叉 = host 组装面是引入 Cordis 还是自写最小 graph composer。报裁。
- **R2 协议冻结债**：web 上线后 session 事件词汇即成对外契约，改动成本陡增 → 协议版本化 + generation 握手（抄 dsh）必须随 W-Web-1 落地，不能后补。
- **R3 TUI 平权回归面**：不得为 web 在 kernel 加 TUI-unfriendly 面；web 进 gate 时 TUI 回归格 standing。
- **R4 安全模型分档**：先 loopback 单用户（全套照抄 dsh 决策记录），远程/多用户延后单列，不混入首期判据。
- **R5 投影同源**：web controllers 与 TUI 各自投影 session 必须同一定义单源——防 0.1.96 单源/双源错配类问题在 UI 层复刻（域级纪律的直接应用）。

## 六、实施角度核查：fork / customize / 自建 / vendor 分类（第四轮）

### 6.1 两个改变判据的实据

1. **Cordis 全家桶是仓内 vendored 源码，不是 npm 依赖**（`vendor/README.md`）：cordis、loader、hmr、include、group、schemastery、cosmokit、timer、logger-console 全部以源码形式在仓、MIT、上游版本+commit 锁定、可审计可打补丁。"引入 Cordis"= 按其 vendor 程序拷贝，框架层完全自主——**R1 风险降一档**：连 host 侧组表面（loader/hmr）也可 vendor 拿来，自写最小 graph composer 的主要理由（框架债不可控）被削弱。
2. **shell 包对 dsh 的品牌/环境耦合只有 2 处**：`ui-layout/AppFrame.tsx:261`（`DSH_CLIENT_TITLE`）+ `ui-layout/service.ts:12`（`dsh-brand` 类型导入）。shell 的 fork 成本接近改名级。

### 6.2 分类矩阵（LOC = src 实测）

| 处置 | 包 | LOC | 依据 |
|---|---|---|---|
| **Fork 原样**（改 scope/名即用） | `client/store` | 393 | 零 dsh 依赖，React-free observable 原语 |
| | `client/ui-slots` | 2,051 | 纯 slot 注册表，无品牌耦合 |
| | `client/ui-renderer` | 2,724 | 唯一 React 绑定点，通用 |
| | `client/ui-primitives` | 14,015 | 仅 4 个 util 依赖（可一并摘），组件库主体 |
| | `client/ui-theme` | 1,684 | token 换皮即可（atlas 色板） |
| | `client/web`（boot 内核） | 889 | 通用两阶段 boot，无 dsh 品牌面 |
| **Fork + customize** | `client/modules` | 2,835 | boot graph wire / bundle route 绑 `dsh-host-webserver` + `dsh-package-manifest` → 对接 atlas host composer（主改点） |
| | `client/connection` | 2,751 | 明确不依赖 Typert（README 声明）；删 `dsh-credentials` 换 atlas credentials；`/api` 信任面保留 |
| | `client/ui-layout` | 1,078 | `DSH_CLIENT_TITLE`→`ATLAS_CLIENT_TITLE` + brand slot 保留（2 处耦合） |
| | `api/gateway` | 5,691 | `dsh-typert-protocol` 协议点 → 换 atlas RPC 生成层或一并 vendor typert（随 R1 裁定） |
| | `ui-conversation`+`ui-chat`+`ui-tool`+`ui-session`+`ui-approval` | ≈41,100 | **抄形改皮主工程量**：dsh session 事件词汇的投影逻辑（基线替换/竞态消解/keyed renderer 骨架）改映射 atlas session log；会话目标注册形不变 |
| | `api/session-controller` client 半 | — | host 半绑 33 个内核 peer（自建面）；client 模型半（ClientSessions→SessionManager→Session 的竞态/基线逻辑）抄形 |
| **不 fork，自建** | host controllers（session/workspace/approval/permissions/settings） | — | dsh 版深度绑其内核词汇，抄不动；这是模式 A 主工程量（§5.3 已列） |
| | host 组表面（`boot/app-boot`、`boot/plugin-manager`） | — | 绑 `dsh-official-bundles`/install 链；vendor cordis-plugin-loader 后在其上组 atlas 版 |
| | `atlas-brand`、Atlas-X switcher、三个产品 bundle | — | §4.1/§4.2 已定 |
| **Vendor 拿来** | cordis 全家桶（含 loader/hmr/schemastery） | — | MIT + 上游锁定 + 补丁程序现成（`vendor/README.md`） |

### 6.3 工程量画像（修正版）

- 摘取源码量：shell 原样 ~21.8k + customize 面 ~56k + 自建 controllers/brand/switcher（未计）≈ **首期触达 ~80k LOC，其中约 1/4 原样、1/2 抄形改皮、其余自建**。
- 原以为最大的不确定项（Cordis 债）实为**已解**：vendored + MIT + 补丁程序现成；真正的主工程量集中在两处——**atlas host controllers（自建）**与**会话投影层改皮（conversation/chat 41k 的词汇映射）**。
- 测试资产随包走（各包自带 vitest 套件），fork 时连同测试摘取，验收有现成判据。

## 七、包结构提案 + office/comic 产品方向（第五轮）

### 7.1 atlasweb 包结构提案（目录词汇 = 未来拆包词汇）

关键决策：**用与未来拆包治理一致的目录词汇现在就建**——浏览器侧取 dsh 的 pnpm workspace 形（fork 摘取天然是这个形），host 侧留 `src/` 平面与 kernel 同居；拆包日 = 目录搬移，不重构。

```text
apps/atlasweb/                 # vite entry（对位 apps/web）——只做 build/serve 壳，零业务
packages/web/
  shell/                       # 平台层（产品词汇禁入）
    web-boot/ web-modules/ web-connection/ web-store/
    web-slots/ web-renderer/ web-layout/ web-primitives/ web-theme/
  api/                         # 服务面 client 半
    web-remote/                # RPC 生成层（接 atlas Zod 单源 schema）
    session-controller/ approval-controller/
    workspace-controller/ settings-controller/
  ui/                          # 产品中立 feature 包
    ui-conversation/ ui-chat/ ui-tool/ ui-approval/ ui-session/
    ui-sidebar/ ui-sidebar-right/ ui-sidebar-files/ ui-settings/ ui-commands/
  brand/
    atlas-brand/               # sidebar.brand.* slots 注册
    atlas-mode/                # Atlas-X switcher（boot 过滤 + 运行期批量 enable）
  bundle/                      # 组合层（P2）
    atlas-base/                # 共享首层（对位 dsh-base）
    atlas-code-ui/  atlas-office-ui/  atlas-comic-ui/   # 产品 bundle
src/web-host/                  # 服务面 host 半（kernel 同居面）
  server/                      # token→cookie、loopback fence、静态 dist、WS mux
  controllers/                 # session/approval/workspace/settings 的 host 半
  compose/                     # boot graph 组装（按 ATLAS_PRODUCT 过滤 bundle 集）
vendor/cordis-family/          # cordis 全家桶 vendored（MIT，锁 commit）
```

**结构纪律**（继承 dsh 包契约文化，每包自带 vitest + README）：
1. 依赖方向单向：`src/kernel → src/web-host → wire schema → api client 半 → ui adapter → ui/* → slots → React`。
2. feature 包互不 runtime import；跨包行为 = 服务注入，跨包 UI = slot。
3. **shell/ 不含任何产品词汇**——产品词汇只出现在 `ui/*`、`bundle/*`、`brand/*`（这是 Atlas-X 可行的结构保证）。
4. wire 契约单源 = `src/kernel/entrypoints/sdk/coreSchemas.ts`（已存在的 Zod 单源）扩展出 session/approval/审批词汇，types 生成，禁手写双份。

### 7.2 office/comic 方向思考：不改变平台结构，只验证它

两产品都走"**bundle + 域 controller + 会话目标 + keyed renderer**"四件套，平台层零改动——但方向思考反推出一条平台硬约束（见末条）：

**atlasoffice（document-first 候选）**
- 交付物：dsh 的 changed-files card（`ui-deliverables`）同型推广为 artifacts card（docx/xlsx/pptx 预览卡+版本对比）；`ui-sidebar-documentpreview`（`ctx.documentPreviews` 右栏 tab）正好是预览骨架位。
- 会话目标：office 可能不是 chat-first 而是 **document-first**——主工作面=文档画布、会话退居侧栏。这要求 layout 的主面区域是 slot 不是写死 chat。
- kernel 面：office 工具链（读写/转档）= kernel tools 注册，即纲要既有的"office 域工具链评估"事项，web 只是增加其 renderer 消费者。

**atlascomic（canvas-first 候选）**
- 会话目标 = storyboard target：图像生成批次卡、panel 网格（`ConversationNodeDefinition` 同型新 target，与 ui-chat 平行不互 import——dsh 的 chat/trajectory 双 target 先例直接适用）。
- controller 面：图像生成 job 流（dsh `ctx.jobs` 同型）+ workspace files 泛化为 asset library。
- ui-tool 的 keyed per-Tool view 注册正是图像类工具调用的渲染位。

**反推回平台层的硬约束（进 W-Web-2 判据）**：
- **主工作面必须做成 slot**（`layout.main` 类），chat 只是 code mode 的默认注册者——document-first/canvas-first 成立的前提；这是对 dsh 布局的一处**结构性 customize**（dsh 原生 chat 写死在 conversation 主区）。
- `ui-dockkit`（零 cordis 的 split-tree 布局引擎，1078+ 行）从"不取"改列"**office/comic 达标时复评取入**"——分屏/多面板是 document-first 的合理载体。
- agent preset 按 mode 分域（code preset ≠ office preset），复用 `ui-agent-preset` 的注册形。

**ascend**：领域工具 = code mode 内的 tool renderer + preset 供给，不单开 mode（待 office/comic 先验证多 mode 机制后再议）。

## 八、来源索引

- 架构总览：`docs/architecture.md`
- Web client 分层/重连：`docs/subsystems/web-client.md`
- client 包族地图：`packages/client/README.md`
- boot 内核：`packages/client/web/README.md`
- 传输/信任模型：`packages/client/connection/README.md`
- Host half：`packages/host/README.md`
- 桌面复用：`docs/architecture.md` §Desktop application
- 品牌 slot 先例：`packages/client/ui-brand-official/README.md`
- 构建隔离纪律：`apps/web/product-isolation.ts`
