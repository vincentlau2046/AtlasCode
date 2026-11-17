# 0.1.123 工单——modelRoles 池臂 normalizeRef 根修（issue #3-1）+ 环境面并入件

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-17）。
> 上游：issue #3（fusion-console 集成侧，f4 triage 全确证 + 公开回帖 comment-6940830128 已受理对端 PR 诉求）；bun 升级链两件预落（292007c5 / 1f4ea599，f4 §7 @b1e54a79 已采认）。

## §0 事实基线（f4 活码实核 2026-11-17）

- **池 ref 两装配点漏归一（审计必改级① f4 活码复核吻合）**：① `roles.ts:178` else 臂 `refs = rolePool`；② `roles.ts:172` sessionModel 臂 `[normalizeRef(sessionModel), ...rolePool]`——**sessionModel 自身归一但其后池段 spread 同样透传**，sessionModel 在场时池内裸 id 仍恒败。envModel(:174)/fallbackModel(:180) 两臂归一在场。0.1.70 H-2 注释宣称「池内 ref 全部归一」，两装配点 = **H-2 不完整应用**（f4 工单首版仅定位 :178 = 定位收窄，审计纠偏采认）。
- 效果：`modelRoles.<role>.models` 池内裸 id（如 `"fabric-small"`）→ `resolveModel` 按 provider 名解析 → `unknown_reference` 恒败；全 ref 形（`maas/fabric-small`）才可用。README 示例语境与该行为不符（判读披露③）。

## §1 波定义

0.1.123 候：
1. **主件（issue #3-1）**：两装配点统一修形（审计必改级①定形）——hoist `const pool = rolePool.map(normalizeRef)`，sessionModel 臂 `[normalizeRef(sessionModel), ...pool]`、else 臂 `refs = pool` 两臂复用 + TDD 测试。
2. **并入件 A（已预落 master，本工单记账采认）**：292007c5 wave0179 C9-5 源级锚改指 settings.md（0.1.122 A3 派生缺陷修形）+ 1f4ea599 ci.yml bun pin 1.4.4。
3. **并入件 B（锚披露预注册）**：bun 工具链 1.4.2→1.4.4 → 本波 release 起 cli.js / web-session-runtime / web-contract 锚**预期变更**（bun build 打包器升版），SRI v0.1.123.md 记实测新锚，禁事后追认。
4. **并入件 C（docs 收尾）**：README 示例池内裸 id 形改全 ref 形（判读披露③ 0.1.123 统一改的预注册兑现）+ Provider 表注记对表（0.1.122 已落的 #3-1 ⚠️注记改为「0.1.123 起已归一」）。

## §2 判据格

| # | 格 |
|---|---|
| 1 | 归一格（审计钉扩）：池内裸 id 命中 providers 表某 model id → 归一为 `provider/id`（resolveModel 可解）；池内全 ref 形零变；**未知裸 id 原样透传 → unknown_reference 失败语义不变**（负断言）；**sessionModel+池混合腿必测**（session 裸 id + 池裸 id 同归一可解，禁单臂假绿）；去重命中数可升（池裸 X + fallback 裸 X → 修形前 [X, provider/X] 两条、修形后 [provider/X] 单条）**声明为预期行为**防恰合口径误判 |
| 2 | 回归零触碰格：sessionModel/envModel/fallbackModel 三既有归一臂行为不变（既有测试零改零 skip）；fallbackModel 去重面（:181-184）零触碰 |
| 3 | TDD 格：RED→GREEN 在案（先证池内裸 id RED，修形后 GREEN） |
| 4 | canon 格：全量恰合（f4 独立跑；基线 6145/0/504 @b1e54a79，bun 1.4.4 面） |
| 5 | 锚披露格：release 后 SRI 四值 + 新锚实测记录；cli.js 锚变更源唯一性 = bun 工具链（预注册在案，非产品码 Δ） |
| 6 | 对端 PR 分账格（若对端 code PR 在途）：diff 边界仅 roles.ts + 测试 + README 注记面，越界拒或拆分；对端断言同格 1-3 复核；**两臂覆盖为 diff 复核必查项（只修 else 臂 = 同必改级①打回）**；归属记账 commit 标注 |

## §3 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → 落码（**对端 PR 优先**：issue #3 回帖已受理其 code PR 诉求，到达即走 S0-R3 先例链 f4 diff 复核 → Atlas-reveiw 复核审计；未到达则 Main TDD 落码）→ f4 段 I 采认 → e2e gate（格 1-4 + 对端腿如适用）→ 段 L 0.1.123 → 生产 lane → SRI 新锚 → 收口（issue #3 回执销项）。

## §4 审计焦点预钉

1. 修形最小性：`.map(normalizeRef)` 是否引入顺序/去重语义差（rolePool 内重复 ref 原样保留 vs 归一后可能合并——f4 预判：map 保序保重，去重面仅 fallbackModel 臂既有逻辑，零新增去重——请审计确认或提异议）。
2. 未知裸 id 透传的失败可观测性：unknown_reference 聚合错误信息是否足以引导用户改全 ref 形（0.1.71 A-1 聚合错误面复用，不新增错误类型）。
3. 并入件 A 的记账形（已预落 master 的件是否需段 I 重采认——f4 预判：f4 §7 已独立复核采认，本工单 §1-2 记账即闭环，不重跑）。
4. README 注记措辞：0.1.123 起行为变化是否需在注记中标注「池内裸 id 现已归一」（对端 issue #3 诉求闭环面）。

## §5 Atlas-reveiw 审计闭环（2026-11-17，通过——1 必改级 + 2 判据钉 + 3 焦点意见；f4 采记）

1. **必改级① 采认（f4 活码复核吻合）**：roles.ts:172 sessionModel 臂池段 spread 同漏归一——`refs = rolePool.map(...)` 单臂修形不完整；定形 = hoist `const pool = rolePool.map(normalizeRef)` 两臂复用；格 1 加混合腿；§0 勘正「两装配点」。**f4 首版定位收窄记勘误**（sessionModel 臂表面归一掩盖了池段漏装）。
2. **焦点① 采认**：map 保序保重零新增去重 ✓；去重命中数可升 = H-2 意图内正变化，格 1 加预期声明钉。
3. **焦点② 采认**：unknown_reference 聚合面充分（modelprovider.ts:620/779/901 ref 逐字 + 0.1.71 A-1 复用零新错误类型）；提示文案「或使用 provider/id 全 ref 形」= 登记级可选（禁扩错误类型）。
4. **焦点③ 采认 + 归属注记**：并入件 A 不重跑成立；记账含「0.1.122 A3 派生缺陷修复随 0.1.123 收口」归属行（防 0.1.122 收口面留悬）。
5. **焦点④ 采认**：README 注记两要素 = 正向面「0.1.123 起池内裸 id 自动归一」+ 负向防误读「未命中 providers 表的裸 id 仍 unknown_reference 失败」；0.1.122 ⚠️ 注记同步改。
6. **并入件 B ✓**：锚披露预注册形完整（工具链变更源唯一性 + canon 基线已在 1.4.4 面）。
7. **总判：通过**——本节在案即双信号放行；对端 PR 到达先走 S0-R3 链（格 6 两臂必查）。
