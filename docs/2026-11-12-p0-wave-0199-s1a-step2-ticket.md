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
