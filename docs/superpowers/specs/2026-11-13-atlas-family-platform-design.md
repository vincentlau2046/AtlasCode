# Atlas Family Platform / AtlasWeb 统一产品平台设计

日期：2026-11-13
状态：设计待审批；不包含代码实施授权
参与评审：AtlasWeb-F4、`atlas-mainline-f4` 主线技术评审
用户裁定：并行准备后单点切入；若 0.1.106 PASS 后 AtlasWeb compatibility 与 Office dogfood 均满足准入，默认 AtlasWeb 优先建立 foundation，Office 随后作为 bundle/dogfood 接入。

## 1. 意图

AtlasWeb 不是 AtlasCode 的附属 Web 页面，而是 Atlas 系列产品（AtlasCode、AtlasOffice、AtlasComic 及后续产品）的统一 Web 平台。它需要在不破坏当前 AtlasCode 主线和 `src/kernel` UI 无关边界的前提下，承载不同产品的工作面、品牌、工具、controller 和 renderer。

成功标准：

- AtlasCode 主线在 AtlasWeb 准备期不发生行为、目录或发布链污染；
- 0.1.106 S3b 生产 lane PASS 后具备可验证的 foundation cut；
- AtlasWeb 是独立平台仓库，内部有可发布 packages 和一个可运行 app；
- AtlasOffice / AtlasComic 通过 bundle + domain controller + renderer + brand 接入，而非复制一套前端；
- TUI、AtlasWeb 和未来载体消费同一 kernel/protocol/schema，不产生第二份 session 解释；
- 不同 session/worktree 能按 lane 协作，总时间线可聚合各产品版本和切面。

## 2. 当前事实与边界

- AtlasCode 当前主线正在收口 0.1.106 S3b；主线技术评审确认：59 文件缝化搬移在途，任何主线目录/行为并行改动都可能污染 gate-106 对表锚。
- 0.1.104 回退与 0.1.105 重落已完成生产闭环；0.1.106 是当前 foundation 前置收口点。
- `src/kernel` 已被 UI 无关边界约束；AtlasWeb 只能消费其 UI 无关导出，禁止 import TUI、engine 或其他 UI 车道件。
- `src/atlasoffice/index.ts` 目前只是零行为占位，不代表 Office 已经有可接入的产品实现。
- `src/kernel/entrypoints/sdk/coreSchemas.ts` 是已有的 Zod 单源起点；不得新造与 kernel 平行的协议 schema。
- 主线评审确认：foundation cut 的客观准入包括 S3b 缝接口名集负断言、TUI 逃逸为零，以及 compatibility scanner 通过。
- AtlasOffice-F4 追加摸底后，headless 合同的验收方向升级为多消费者：TUI/print + AtlasWeb Code + 至少一个非 Code 产品消费者；这是 office S6 路标建议，不改变 0.1.106 前只读准备纪律。

## 3. 目标 / 非目标 / 反目标

### 目标

1. 建立平台中立的 Web shell：boot、connection、renderer、slots、layout、theme、公共 UI 原语。
2. 建立 AtlasCode 的首个 Web 产品 bundle，先覆盖只读会话，再覆盖真实会话交互。
3. 建立 Atlas-X mode 机制：产品组合、品牌、preset、主工作面可替换。
4. 为 Office 的 document-first 与 Comic 的 canvas-first 预留真实结构，而不是将 Chat 固化为主工作面。
5. 形成独立平台仓库、多 packages、独立版本和 kernel compatibility matrix。
6. 形成总时间线与支线文档聚合规范。

### 非目标

- 0.1.106 S3b 收口前修改 AtlasCode kernel、TUI、engine、发布链或主线目录；
- 首期实现远程多用户认证；首期只做 loopback 单用户安全模型；
- 首期实现完整 AtlasOffice 或 AtlasComic 产品功能；
- 首期引入插件市场、终端、复杂 dockkit 或所有 DeepSeek Harness 功能；
- 让 AtlasOffice/Comic 成为 AtlasCode 的长期 Git 分支；
- 在 Web 层重新发明一套 session event 解释或协议 schema。

### 反目标

以下结果即使功能可运行也视为失败：

- AtlasWeb 为了方便直接 import `src/tui`、`src/engine` 或 UI 私有实现；
- Code、Office、Comic 各自复制一套 shell、session projection 或 RPC schema；
- 以长期 Git 分支维持产品差异，造成 kernel 漂移；
- 为了 Web 便利反向改变 kernel 的现有语义；
- 在 0.1.106 gate 收口期间写入主线共享 checkout；
- 把产品模式误实现为只换主题/标题，未能替换主工作面和能力组合。

## 4. 方案选项

### 方案 A：AtlasCode 单仓长期承载

在当前仓库持续加入 `apps/atlasweb`、`packages/web/*` 和所有产品包，所有产品共用一个版本与 release。

优点：早期跨目录原子提交简单。缺点：平台与 Code 强耦合，产品 release 被绑定，长期拆库和跨 session 协作成本高。仅适合短期 bootstrap，不采用为最终形态。

### 方案 B：现在立即拆出 AtlasWeb

立即建立独立 AtlasWeb 仓库，并让它复制/依赖当前 kernel protocol。

优点：边界清楚，协作隔离。缺点：S3b 尚未收口、protocol/controller 尚未稳定，立即拆分会造成 schema 双份、版本同步和跨仓迁移债。当前不采用。

### 方案 C：先兼容性准备，foundation 后独立平台仓库（采用）

0.1.106 之前只做只读调研、compatibility scanner、协议设计、roadmap 和 design；不写 AtlasCode 主线。0.1.106 生产 lane PASS 后，在用户终裁的多产品插入顺序下切 foundation，建立独立 AtlasWeb 平台仓库；AtlasWeb 内部发布多个 package 和一个 app，产品通过 bundle 接入。

采用原因：同时满足主线收口纪律、未来拆包治理和独立 session 协作需求，不提前复制尚未稳定的协议。

## 5. 产品性态架构

```text
载体层：TUI / AtlasWeb / Desktop / Remote
产品层：AtlasCode / AtlasOffice / AtlasComic / future Atlas-X
平台层：AtlasWeb shell / mode / brand / shared UI
服务层：Atlas host / controllers / HTTP+WS / static dist
内核层：AtlasCode src/kernel / shared protocol schema
```

### 平台仓库目标形态

```text
AtlasWeb/
  apps/atlasweb/
  packages/
    web-shell/
    web-connection/
    web-renderer/
    web-slots/
    web-ui/
    web-brand/
    web-mode/
    web-host/
    web-code/
    web-office/
    web-comic/
  docs/
```

DeepSeek Harness 的前端结构作为摘取基线：

- 原样或近原样 fork：boot、store、slots、renderer、公共 primitives、theme；
- customize：modules、connection、layout、gateway、conversation/chat/tool/session/approval；
- 自建：Atlas host controllers、Atlas RPC adapter、brand、mode、产品 bundles；
- vendor：Cordis family，锁定上游 commit 并保留 MIT 归属。

### 依赖方向

```text
Atlas kernel
  → web-host / protocol
  → client models / API adapters
  → UI adapters
  → product-neutral UI
  → slots / renderers
  → React
```

feature 包禁止 runtime import 其他 feature 包的实现；跨包行为使用注入 service，跨包 UI 使用 slots。

HTTP/WS、认证和 controllers 不进入 kernel，也不归 AtlasCode 专属产品壳；它们属于统一 Atlas host / AtlasWeb web-host 层。Kernel 只提供 UI/transport-neutral 的 headless/domain contract，Web host 将其映射为 RPC/WS，未来 Office/Comic host adapter 复用同一合同，避免二次提取。

### Headless 合同与 UI 交互分账

为避免 kernel 与产品 registry 对审批、diff、终端等能力各自漂移，首期消费面采用以下硬分账：

| 面 | 归属 | 合同内容 |
|---|---|---|
| Kernel headless contract | `src/kernel` / shared | 审批请求事件 emit、决策 submit、diff/deliverable 数据投影；只描述 UI 无关事实、输入和结果 |
| Host / renderer interaction | Atlas host + 产品 renderer | 审批 UI 流、diff 审阅交互、终端流展示与交互、交互状态、布局和产品视觉 |

因此“审批/permission、diff/deliverable 在首期消费清单中”不表示把 UI 交互搬进 kernel：kernel 提供事实和决策合同，host/renderer 提供交互。Office/Comic 复用前者并各自实现后者；终端流同样属于产品 renderer/host 交互域，不进入 kernel headless 语义。

### 产品接入契约

每个产品必须交付四类东西：

1. **Bundle**：声明该产品的 feature 组合；
2. **Domain controller**：产品自己的权威服务面；
3. **Renderer / Conversation target**：产品对象的可视化解释；
4. **Brand / preset**：品牌 slot 与 agent preset。

AtlasCode 是 chat/agent-first；AtlasOffice 是 document-first；AtlasComic 是 canvas/storyboard-first。`layout.main` 必须是 slot，Chat 只是 Code bundle 的默认注册者。

## 6. 版本与切点

版本分离但通过 compatibility matrix 关联：

```text
AtlasCode kernel       0.1.106
AtlasWeb platform      0.1.0
AtlasCode Web bundle   0.1.0
AtlasOffice bundle     later
AtlasComic bundle      later
Kernel protocol        v0
```

正式 foundation cut 不按日期，而按以下准入：

1. 0.1.106 S3b 生产 lane PASS；
2. 缝接口名集负断言通过；
3. TUI 逃逸扫描为零；
4. AtlasWeb compatibility scanner 证明只消费 `src/kernel` UI 无关导出；
5. protocol/schema v0 在 kernel/shared 既有域内单源可生成；
6. 只读 session list/replay/follow 具备稳定 controller 面；
7. designated-only、零写真实环境和 release governance 检查通过。

0.1.106 PASS 前的工作只能是准备工作；不产生正式 AtlasWeb foundation release。

## 7. 并行开发与文档协同

### Lane 形态

```text
AtlasCode lane   → kernel + Code 产品
AtlasWeb lane    → shell + host + mode + shared UI
AtlasOffice lane → Office controller + renderer + bundle
AtlasComic lane  → Comic controller + renderer + bundle
```

lane 可以使用独立 session/worktree，但产品代码不通过永久 Git 分支长期复制。`main` 只接收经过主线协议和 gate 纪律验证的共享 kernel 变化。

### 阶段

| 阶段 | 时机 | 允许内容 | 不允许内容 |
|---|---|---|---|
| P0 准备 | 现在至 0.1.106 PASS | 只读审计、scanner、协议草案、roadmap、compatibility spike 设计 | 主线行为/目录/发布链改动 |
| P1 foundation | 0.1.106 PASS 后 | 根据单点切入裁定建立 AtlasWeb 仓库与首个 platform cut | 未通过准入即拆库 |
| P2 Code Web | foundation 后 | 只读面、真实会话、审批、Code bundle | Office/Comic 伪实现 |
| P3 产品 dogfood | P2 或纲要指定顺序后 | Office/Comic 真实 controller、renderer、bundle | 复制平台 shell |

### 文档结构

总聚合文档：

```text
docs/products/atlas-family-roadmap.md
```

建议支线文档：

```text
docs/products/atlascode/
docs/products/atlasweb/
docs/products/atlasoffice/
docs/products/atlascomic/
```

总文档只记录版本切面、依赖、阻塞、foundation/release cut 和支线链接；实施细节归对应 lane，主线 docs 不混入 AtlasWeb 设计细节。

每个版本切面至少包含：

- 产品 / 平台版本；
- kernel protocol 版本；
- 支持的 AtlasCode 版本区间；
- 当前 gate/verdict；
- 上游/下游阻塞；
- 可回滚版本；
- 对应报告和证据路径。

## 8. 风险与门禁

| 风险 | 判据 | 处置 |
|---|---|---|
| kernel 逃逸 | Web 依赖 TUI/engine/private UI | scanner 负断言；fail closed |
| schema 分叉 | 同一事件出现第二份定义 | kernel/shared 单源；生成 types |
| gate 污染 | 0.1.106 期间主线被 Web 写入 | P0 全部只读；独立 worktree；拒绝正式 merge |
| 产品复制 | Office/Comic 自带 shell | bundle + domain controller + renderer 评审拦截 |
| 长期分支漂移 | 产品分支保留独立 kernel | lane/package 取代永久产品分支 |
| 多用户安全误用 | 首期将 loopback 方案暴露远程 | 远程认证单列，首期不支持 |
| upstream 变化 | dsh tag 漂移 | foundation 锁 `dsh-v0.2.2-rc.2`，MIT 归属留档 |

## 9. 待用户审批后的 builder call

设计获批后，下一步才进入实施计划。计划需要把以下内容拆为独立任务：

1. P0 compatibility scanner 与只读 spike；
2. kernel/shared protocol v0 盘点；
3. 0.1.106 foundation readiness checklist；
4. AtlasWeb 仓库和 package skeleton 的 cut procedure；
5. Code Web 首期 controller/renderer 迁移；
6. roadmap 与各 lane 文档模板；
7. Atlas-review、gate、生产 lane 和版本兼容性矩阵。

Office/Comic 的正式插入先保持“并行准备、foundation 后单点切入”的裁定，不在 P0 预实现产品功能；若双方均达标，AtlasWeb 优先建立正式 foundation，Office/Comic 随后以 bundle + domain controller + renderer 接入。
