# 0.1.99 S1a 步 2 工单——configDirName 维度激活（product 分域参数）

> 状态：`draft → 波前审视 → Atlas-reveiw 复核（§8 审计条款）→ f4 双信号`。f4 工单（2026-11-12）。
> 上游：0.1.98 S1a 步 1 五段闭环终态（工单 §11 @f1b5247d）；§8 拆分裁定 = 0.1.99 步 2 product 维度激活 ~4 文件独立波。

## §0 波前审视（活码实核 @ master f1b5247d，f4 2026-11-12）

| 面 | 现状 | 判定 |
|---|---|---|
| configDir 单源 | src/shared/configDir.ts getConfigDirName()——`ATLAS_CONFIG_DIR_NAME` env 覆盖 → 缺省 `.atlas`（0.1.98 步 1 归一形，tui re-export） | 消费点 45 文件（getConfigDirName）+ envUtils ATLAS_CONFIG_DIR 全路径覆盖并行 |
| ProductDefinition | configDirName?: 字段已在（0.1.98 C1 预埋）+「0.1.99 步 2 起 configDirName 维度消费」头注定谳 | **本波接线对象** |
| 产品注册 | activeProduct 静态单产品 atlascode（全缺省 = 行为字节级不变） | office 真注册随 S2 compose 波，本波 = 维度机制激活 + 判据面 |
| env 优先序 | §6 吸收②定谳：ATLAS_CONFIG_DIR（全路径显式）> ATLAS_CONFIG_DIR_NAME/product 默认 > 缺省 ~/.atlas | lock-face 确认接线形后冻结 |

## §1 波定义

- **波名**：S1a 步 2——configDirName 维度激活。**版本**：0.1.99。
- **范围**：getConfigDirName 消费 activeProduct.configDirName（product 默认层插入 env 序）；office 分域值（`.atlas-office`）作为注册形预置；判别格启用（office 目录探针隔离格 = 0.1.98 §8 顺延项 + atlascode 默认恒等格 + env 优先序格）。
- **非目标**：office compose/产品真注册（= S2 波）；tui 归位（= 序 7）；零迁移语义不变（atlascode 现用户零影响）。
- **体量**：~4 文件（configDir.ts + ProductDefinition 注册面 + 判别格套件 + envUtils 注记），符合步 2 口径。

## §2 Global Constraints

1. atlascode 行为字节级不变（默认恒等格 = 硬判据；现网用户零迁移）。
2. env 优先序写死冻结（ATLAS_CONFIG_DIR > ATLAS_CONFIG_DIR_NAME/product 默认 > `.atlas`）——显式 env 用户不被 product 默认劫持。
3. 判据面：office 目录探针隔离格（`~/.atlas-office` 与 `~/.atlas` 零写穿）+ atlascode 默认恒等格 + env 优先序格；canon 净域 + 前滚 standing（0.1.98 面）。
4. row F 预注册；**Atlas-reveiw 复核一次**（§8 拆分审计条款）先于双信号。

## §3 工作段

段 D lock-face（轻量）：维度消费接线形（activeProduct 单源引入 configDir.ts 的依赖方向——纯叶子禁反向 import 面裁决）+ office 分域值预置形 + 判别格三件终形。段 I 落码 → 段 G gate → 段 L release（本地通道或 OIDC 视确认态；gitcode 双平台例行步）。

## §4 Review Focus（Atlas-reveiw 复核焦点）

1. 拆分条款兑现核：步 2 体量/判据面是否与 §8 裁定一致。
2. 纯叶子依赖方向：configDir.ts 引 activeProduct 是否破 shared 纯叶子纪律（候选：注册面倒置——configDir 读惰性单例 getter）。
3. env 优先序与 ATLAS_CONFIG_DIR/ATLAS_CONFIG_DIR_NAME 双 env 并存语义（同名异形覆盖冲突面）。

## §5 流程

本工单 → Atlas-reveiw 复核 → f4 双信号 → Main 段 D → 段 I → 段 G → 段 L → f4 收口。row F 全程。

## §6 Atlas-reveiw 复核闭环（2026-11-12，核可通过）+ f4 修订吸收

拆分条款兑现核可（步 1 单源化实锚 re-export 归一 / 步 2 体量合理 / 三判据已列）。**必改 1 + 建议 2 吸收**：

1. **【必改】env 四层次序钉死**：`ATLAS_CONFIG_DIR（全路径显式）> ATLAS_CONFIG_DIR_NAME（用户显式）> product.configDirName（部署期默认）> '.atlas'`——NAME 与 DIR 同为用户显式 env，显式意图恒压部署期产品默认（§2.2 同构）；工单并层歧义 + ProductDefinition.ts:36-38 字段注释漏 NAME 层 = **同步勘误**（落码清单）。
2. **【吸收·四格】判据三格升四格**：补 **product 层判别格**（注入 configDirName='.atlas-office' 的 ProductDefinition → getConfigDirName 返回 '.atlas-office'）——office 真注册缺位下探针格只判 env 层，步 2 核心维度须有直接判据，四格齐 = 全层覆盖。
3. **【吸收·依赖方向】二选一定谳 = 倒置惰性 getter 形（provider 槽 + compose 注入，setSettingsPathsProvider 同款先例）**——shared/configDir 保零 import 纯度 + 天然兼任 product 层判别格测试注入口；静态 import 形否决理由 = 须另开测试覆写口。

判据面终形（四格）：office 目录探针隔离格 + atlascode 默认恒等格 + env 优先序格（四层钉死）+ **product 层判别格**。f4 采认后双信号。

## §7 f4 双信号（2026-11-12）

- **Main**：段 D lock-face 轻量（必改①次序四层落 configDir + 注释勘误 / 依赖方向 provider 形落定）→ 段 I 落码（~4 文件：configDir.ts + ProductDefinition 注释勘误 + provider 注入点 + 判别格四格套件）→ 段 G（四格 + 前滚 standing 0.1.98 面 + canon 净域）→ 段 L（本地通道或 OIDC 视确认态；gitcode 双平台例行步）。
- **e2e**：判据面四格预登记（office 探针隔离格自此启用——0.1.98 顺延项兑现）+ standing 前滚 + canon 净域；gate 信号照旧。

## §8 f4 裁处：row F 改形批复——configDir 双出口形（2026-11-12，canon 19 fail triage）

**定因采信**：L1（ATLAS_CONFIG_DIR 全路径）并入 getConfigDirName 后对项目根锚消费面语义破坏（join 绝对段重置）——19 fail 单一根因收敛实证（markdownLoader×3/worktree/settings projectSettings 源）；lock-face 必改①「join 自洽」判据只对 homedir 锚成立 = 判据面被测试证据证伪，改预注册正当。

**改形批准：双出口拆分**，附带条件三条（硬）：
1. **出口语义文档化**：getConfigDirName（四层全序，homedir 锚）/ getConfigDirNameForProject（三层 = NAME > product 默认 > '.atlas'，项目根锚）——头注写死维度区分（ATLAS_CONFIG_DIR = 用户配置全路径显式；`.atlas` 点目录 = 项目内约定标记，不同维）；ATLAS_CONFIG_DIR 未设时两出口同值 = 现网字节级不变（恒等格保留）。
2. **消费点全量枚举切换（禁半拆）**：项目根锚消费点全列（markdownLoader×3/worktree:232/sandbox denyWrite cwd 锚×4/skillCommand/settings projectSettings 源——Main 已列；**须 anchored 正则全量枚举核对非仅此 6 处**〔join(...getConfigDirName) 域级扫描 ~52 命中逐点分型 homedir 锚/项目锚〕），枚举清单随收尾归档；漏切点 = 半拆先例（office 分域假绿温床）。
3. **判别格 4→6**：原四格 + ForProject L1 剥离格（Main 提案）+ **两出口 L1 未设同值恒等格**（条件 1 的直接判据）；四层优先序格改双出口各验。

批复后落码 → 判别格 → 四件套 → gate 信号。canon 19 fail 现状为改形前态，随修自销。
