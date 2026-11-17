# 0.1.123 工单——modelRoles 池臂 normalizeRef 根修（issue #3-1）+ 环境面并入件

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-17）。
> 上游：issue #3（fusion-console 集成侧，f4 triage 全确证 + 公开回帖 comment-6940830128 已受理对端 PR 诉求）；bun 升级链两件预落（292007c5 / 1f4ea599，f4 §7 @b1e54a79 已采认）。

## §0 事实基线（f4 活码实核 2026-11-17）

- `src/modelprovider/roles.ts:178` 池臂 `refs = rolePool` **原样透传不过 `normalizeRef`**（:162-169 在场）——而 sessionModel(:172)/envModel(:174)/fallbackModel(:180) 三臂均过归一。0.1.70 H-2 注释宣称「裸 model id → 持该 id 的 providers 表项加前缀」，池臂漏装 = **H-2 不完整应用**（0.1.122 波报告判读披露⑤同源认定）。
- 效果：`modelRoles.<role>.models` 池内裸 id（如 `"fabric-small"`）→ `resolveModel` 按 provider 名解析 → `unknown_reference` 恒败；全 ref 形（`maas/fabric-small`）才可用。README 示例语境与该行为不符（判读披露③）。

## §1 波定义

0.1.123 候：
1. **主件（issue #3-1）**：池臂过 normalizeRef——`refs = rolePool.map(normalizeRef)` 一行级修形 + TDD 测试。
2. **并入件 A（已预落 master，本工单记账采认）**：292007c5 wave0179 C9-5 源级锚改指 settings.md（0.1.122 A3 派生缺陷修形）+ 1f4ea599 ci.yml bun pin 1.4.4。
3. **并入件 B（锚披露预注册）**：bun 工具链 1.4.2→1.4.4 → 本波 release 起 cli.js / web-session-runtime / web-contract 锚**预期变更**（bun build 打包器升版），SRI v0.1.123.md 记实测新锚，禁事后追认。
4. **并入件 C（docs 收尾）**：README 示例池内裸 id 形改全 ref 形（判读披露③ 0.1.123 统一改的预注册兑现）+ Provider 表注记对表（0.1.122 已落的 #3-1 ⚠️注记改为「0.1.123 起已归一」）。

## §2 判据格

| # | 格 |
|---|---|
| 1 | 归一格：池内裸 id 命中 providers 表某 model id → 归一为 `provider/id`（resolveModel 可解）；池内全 ref 形零变；**未知裸 id 原样透传 → unknown_reference 失败语义不变**（负断言） |
| 2 | 回归零触碰格：sessionModel/envModel/fallbackModel 三既有归一臂行为不变（既有测试零改零 skip）；fallbackModel 去重面（:181-184）零触碰 |
| 3 | TDD 格：RED→GREEN 在案（先证池内裸 id RED，修形后 GREEN） |
| 4 | canon 格：全量恰合（f4 独立跑；基线 6145/0/504 @b1e54a79，bun 1.4.4 面） |
| 5 | 锚披露格：release 后 SRI 四值 + 新锚实测记录；cli.js 锚变更源唯一性 = bun 工具链（预注册在案，非产品码 Δ） |
| 6 | 对端 PR 分账格（若对端 code PR 在途）：diff 边界仅 roles.ts + 测试 + README 注记面，越界拒或拆分；对端断言同格 1-3 复核；归属记账 commit 标注 |

## §3 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → 落码（**对端 PR 优先**：issue #3 回帖已受理其 code PR 诉求，到达即走 S0-R3 先例链 f4 diff 复核 → Atlas-reveiw 复核审计；未到达则 Main TDD 落码）→ f4 段 I 采认 → e2e gate（格 1-4 + 对端腿如适用）→ 段 L 0.1.123 → 生产 lane → SRI 新锚 → 收口（issue #3 回执销项）。

## §4 审计焦点预钉

1. 修形最小性：`.map(normalizeRef)` 是否引入顺序/去重语义差（rolePool 内重复 ref 原样保留 vs 归一后可能合并——f4 预判：map 保序保重，去重面仅 fallbackModel 臂既有逻辑，零新增去重——请审计确认或提异议）。
2. 未知裸 id 透传的失败可观测性：unknown_reference 聚合错误信息是否足以引导用户改全 ref 形（0.1.71 A-1 聚合错误面复用，不新增错误类型）。
3. 并入件 A 的记账形（已预落 master 的件是否需段 I 重采认——f4 预判：f4 §7 已独立复核采认，本工单 §1-2 记账即闭环，不重跑）。
4. README 注记措辞：0.1.123 起行为变化是否需在注记中标注「池内裸 id 现已归一」（对端 issue #3 诉求闭环面）。
