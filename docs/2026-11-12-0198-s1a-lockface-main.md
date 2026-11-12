# 0.1.98 S1a 硬化波 · Main 段 D lock-face（八点呈批）

> 呈批对象：f4。落码前置 = 本文档批复（row F）。
> 实证基线：master @72ed3c2f，2026-11-12，Main lane grep 实锚。

## §0 必改 A 重核——feature() 运行时化实证 + 工具子集真落点

**采信审计结论，实证如下**：

1. **现存活 feature() 调用点仅 4 处**（全 src 域 grep，剔注释命中 28 行登记面）：
   - `src/modelprovider/constants.ts:79,83` — `SUMMARIZE_CONNECTOR_TEXT_BETA_HEADER` / `AFK_MODE_BETA_HEADER`（wire beta 头）
   - `src/engine/coordinator/tasks/localShellTask.ts:199,241` — `feature('MONITOR_TOOL')` ×2
   - 原 §0 所列 6 文件（snipRuntime/compact/reactiveCompact/processPromptSlashCommand/coordinator registry/microCompact）实核 = 全部已 env kill-switch/isEnabled 运行时化，feature() 命中均为头注登记注释——**审计「前提过时」定谳成立**。
2. **工具子集真落点**：`src/atlascode/compose.ts`（组合根，35 件装配 + `setSettingsPathsProvider:224`）+ toolRegistry isEnabled。`resolveAgentTools`（engine/tools/agent/agentToolUtils.ts）实证为**纯函数**（消费 availableTools + agentDefinition.tools/disallowedTools）——是 agent 域过滤面，**非产品子集面，本波不动**。

### 不参数化清单（禁入 ProductDefinition，防顺手漂移）

| 残留 | 理由 |
|---|---|
| modelprovider/constants.ts 两 beta 头 | wire 协议常量（WIRE 冻结族），非产品工具面 |
| coordinator localShellTask `MONITOR_TOOL` | coordinator 行为门（env 已可关），非产品子集 |
| tui 域行为门 env 化点（FEATURE_* kill-switch 族） | TUI 行为门 ≠ 工具子集；入清单 = 越界 |
| 项目级 `.atlas/skills` 约定目录字面（loadSkillsDir.ts:402,563） | **项目根约定**非 `~/.atlas` 配置目录，product 无关，禁参数化 |
| 工具 prompt 文案中 `~/.atlas` 用户引导字面（schedulePrompt/teamCreatePrompt 等） | 用户可见文案引用实际目录，随 configDirName 渲染或保留字面（段 I 定），不入「不参数化」也不入判据红 |

## §1 必改 B 重核——~/.atlas 实量 + 拆分预案

**实量**（Master grep，行口径）：`.atlas` 字面 285 行 / 173 文件；其中注释行 239、**非注释行 152**（含 prompt 用户文案、路径字面、doc 引用）。**活构造点**（真路径拼装）经函数化已高度收敛：`getConfigDirName()` 50 文件消费、`getSettingsPaths` 7 文件消费、字面活构造残留仅 3 处（`src/cli/debugSink.ts:161` env 兜底 join、`src/atlascode/sandboxDeps.ts:59` getConfigDirName 注入值、loadSkillsDir 项目级 2 处〔上表排除〕）。

**双 configDir 双源实证**：`src/shared/configDir.ts`（4 文件 import）与 `src/tui/utils/configDir.ts`（8+ 文件 import）同形并存——getConfigDirName 双份 + tui 版多出 PLUGIN_MANIFEST_DIR / LEGACY_PLUGIN_MANIFEST_DIR / MEMORY_FILE_NAME / findMemoryFile / findManifestInDir 等 tui 域导出。

### 拆分预案（两步各自判据；体量超 10-15 口径 → **建议拆两波**）

- **步 1（并入 0.1.98，行为中性单源化）**：
  1. `tui/utils/configDir.ts` 的 `getConfigDirName` 归一为 re-export `shared/configDir`（tui 特有导出 PLUGIN_MANIFEST_DIR 族/(findMemoryFile|findManifestInDir) 随迁 shared 或留 tui 文件但 getConfigDirName 单源——段 I 以最小 diff 定）；
  2. `debugSink.ts:161` 改 `ATLAS_CONFIG_DIR ?? join(homedir(), getConfigDirName())`；
  3. `sandboxDeps.ts:59` 注入值改读 shared 单源。
  - **判据**：canon Δ0 + cli.js 四件套全绿 + `getConfigDirName` 定义点全域恰 1（grep 判别格）+ atlascode 全路径输出字节级不变（单测锁 `getSettingsPaths()` 快照）。
  - 体量：~12 文件（tui 8 import 文件改 import 路径 + 3 改造点 + 单测）。
- **步 2（0.1.99 独立波，product 维度）**：`shared/configDir` 加 product 参数——解析序写死 **`ATLAS_CONFIG_DIR` 显式 > product 默认（ProductDefinition.configDirName）> 缺省 `'.atlas'`**；atlascode 默认值 `'.atlas'`（字节级不变判据 ⑥）。office 分域判别格（office 目录探针隔离）随步 2 判据面。
  - 体量：~4 文件（shared/configDir + ProductDefinition + compose 接线 + 单测）。
  - **审计条款兑现**：步 2 lock-face 预案随本批复，若 f4 判「回 Atlas-reveiw 复核」则步 2 发波前复核。

## §2 段 D 八点定谳呈批

① **ProductDefinition 形状**（与 IDN-1 归一）：
```ts
type ProductDefinition = {
  id: string                     // 'atlascode'（既有注册清单键）
  configDirName?: string         // 缺省 '.atlas'；步 2 消费
  toolSubset?: readonly string[] // 缺省 undefined = 全量 35 件（atlascode 零变更）
  // 品牌串走既有构建配方（IDN-1），不入本接口
}
```
「不参数化清单」= §0 表（随批复冻结，禁段 I 顺手扩）。

② **注释策略定谳（二选一）**：**判据正则剥注释**。实证：285 行命中可机判注释/非注释（239/152 干净二分，本 doc §1 即用该正则）；engine 域 7 文件注释多为 de-ant 历史登记（0.1.72-0.1.76），改措辞损回溯信息且回归成本高。判据域范围写死 `src/` 级。

③ **配置分域 = 目录形**（`~/.atlas-office` 形）非键命名空间。理由：加性兼容要求零迁移（键命名空间须在共享 settings.json 混 product 键，office 卸载残留 + 池轮询歧义）；目录形天然隔离。env 优先序写死：`ATLAS_CONFIG_DIR` 显式 > product 默认 > 缺省 `~/.atlas`（步 2 实现，序入判据格）。

④ **工具清单接线形**：`ProductDefinition.toolSubset` → compose.ts 装配点过滤（toolRegistry 注册前），缺省 undefined 恒等。**时序三判据**：(a) 解析一次性——compose 启动期冻结清单，resolveAgentTools 纯函数消费，禁 per-call 重解析；(b) defer/ToolSearch 组合层位写死——过滤在 registry 装配层，defer 面消费 registry 产物（判别格：subset 外工具经 ToolSearch 不可见）；(c) isEnabled 同路——过滤与 isEnabled 判别同一路径（compose 装配），禁旁路 env 直查（A1 四面账第四层教训）。

⑤ **双 configDir 归一先行**：= §1 步 1（本波内，先行于步 2）。

⑥ **settings 池轮询触点全列**：`getSettingsPaths` 7 文件（compose.ts / engine/config/index.ts / engine/index.ts / engine/config/settings.ts / tui/utils/permissions/filesystem.ts / permissions/filesystem.ts / permissions/settingsPaths.ts）+ `setSettingsPathsProvider`（compose:224）+ `src/engine/config/configRoot.ts`（configRoot 解析序触点）。判据：atlascode 路径字节级不变（步 1 快照单测 + 步 2 默认值恒等格）。

⑦ **移位清单逐文件点名**（段 I 预注册，tui/ 域文件仅步 1 import 路径改 = §1 列明，非归位）：
| # | 文件 | 动作 |
|---|---|---|
| 1 | src/engine/coordinator/coordinatorMode.ts | 焊点①：:323 提示词示例 repo URL 提取产品注入参数 |
| 2 | src/atlascode/compose.ts | ProductDefinition.toolSubset 装配过滤 + 产品参数注入 |
| 3 | src/shared/ProductDefinition.ts（新） | 接口 + 不参数化清单注释锚 |
| 4 | src/shared/configDir.ts | 步 1 单源接收（getConfigDirName） |
| 5 | src/tui/utils/configDir.ts | 步 1 归一 re-export |
| 6-13 | tui 8 个 configDir import 文件 | import 路径（或经 tui 门面不变）——段 I 最小 diff 定 |
| 14 | src/cli/debugSink.ts | :161 兜底 join 改单源 |
| 15 | src/atlascode/sandboxDeps.ts | :59 注入值改单源 |
| 16 | src/tui/constants/prompts.ts（壳域） | 焊点① 注入消费（若壳域承接） |
| 17 | docs/literal-inventory.json（新） | 六类字面清单（结构化 JSON，判据读表执行，吸收③） |
| 18 | tests/unit/*（2-3 文件） | 单源判别格 + 快照格 + 清单 grep 格 |

⑧ **headless 归位 = boundaries 声明确认**：src/cli 已是 #151 落位公共域——段 I 仅做 kernel 可引位的 entry-point 边界声明（boundaries 面），**零物理搬移**（吸收⑤防偷运）。

## §3 段 L 采认（双首用解耦）

- gitcode push = 独立验证腿（失败不阻塞 npm 发布）——本波 0.1.98 双平台步照 checklist（SSH remote 已通，0.1.97 填仓先例）。
- OIDC：trusted publisher 用户配置中（本 session 已指导填表），**未确认则 0.1.98 走本地通道、主通道首用再顺延**——两首用不捆同一 release。

## §4 体量口径结论

步 1（12 文件）+ 波本体其余面（焊点① + ProductDefinition + 字面清单制 + headless 声明 ≈ 8 文件）= **~20 文件，超 10-15 口径**。拆分裁定建议：**0.1.98 = 波本体 + 步 1 单源化；0.1.99 = 步 2 product 维度 + office 分域格**（两波各自五段闭环；步 2 波前回 Atlas-reveiw 复核一次）。请 f4 裁。
