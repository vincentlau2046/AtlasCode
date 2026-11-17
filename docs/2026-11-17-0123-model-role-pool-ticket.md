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

## §6 f4 PR #4 复核采认（2026-11-17，S0-R3 先例链；PR head 801717df，base master @17a2dfb4，3 files +133/−6）

1. **总判采认：技术面符合工单判据，两臂覆盖结构性成立**——修形落点 = rolePool 构造源头（`.filter(...).map(normalizeRef)`），非 else 臂单点：:172 sessionModel 臂 `...rolePool` spread 与 :178 else 臂**同源**吃归一后池 → 审计必改级①两装配点由结构一次性覆盖（优于 hoist 形，f4 采认此形等价且更净）；normalizeRef 定义上移至池构造前，纯位置搬家零语义。
2. **格面逐条对表**：格 1 归一格 ✓（(a) 命中加前缀 / (b) 未知透传 + resolveModel undefined 负断言 / 全 ref 恒等 / 混合池序不变 / **(c3) 即审计钉的 session+池混合腿**）；格 2 三臂恒等锚 ✓（(c3) sessionModel/env/fallbackModel 三臂行为不变逐臂断言 + 既有测试零触碰）；格 3 TDD 判别信号在测试头注（修前红形态描述在案，gate 实跑补 RED 直证）；格 6 diff 边界 ✓（恰 roles.ts + 新测试件 + README 注记面，零越界）。
3. **必改级（记账面，merge 前修）**：**版本归属错标**——README 注记「0.1.122 修形」/ 测试头注与 describe「0.1.122」/ roles.ts 注释「（0.1.122）」/ 测试文件名 `-0122` 均应为 **0.1.123**（0.1.122 为 docs-only 版，本修形随 0.1.123 发布；工单焦点④「0.1.123 起已归一」措辞同面）。修形义务在对端（PR 作者），纯记账面不改判据。
4. **焦点④ 两要素核对 ✓**：README 新注记含正向面（自动归一）+ 负向防误读面（未知裸 id 原样透传解析失败）+ 全 ref 推荐保留——两要素齐。
5. **焦点② 提示文案**：本 PR 未动错误聚合文案——登记级可选维持登记，不阻。
6. **流程推进**：本节在案 → 对端修版本归属记账（PR fixup）→ Atlas-reveiw PR 复核审计 → Main gate（格 1-4 + TDD RED 直证）→ 段 L 0.1.123。

## §7 Atlas-reveiw PR 复核 verdict 采记（2026-11-17；head 801717df 对 merge-base 79879c56 独立实读）

1. **总判：技术面通过，可排 gate（格 1-4 + TDD RED 直证 + canon）**；记账面必改随 fixup，勿须二轮技术复核（fixup diff 面零产品码）。
2. **修形定形 ✓**：源头归一形与必改级① hoist 定形等价且更优（单点归一禁两臂各自维护）。
3. **补证采认**：(c3) fallback 断言实为判据钉「去重命中数可升」的落地腿（池裸 glm + fallback 裸 glm → 修形前 3 条/修形后 2 条）——两条钉一并由测试直证。
4. **fixup 范围扩 2 条（顺带订正，同 fixup commit）**：① (c3) fallback 注释「glm 不在池内 → 追加」与断言矛盾（正因归一后去重命中才不追加）；② (c3) 标题「三 arm 行为不变」对 fallback 腿字面不成立（可观测输出 3→2 条，变的是池归一连带非 arm 码面）——措辞订正防后人误读。
5. **合并次序钉（新增，Main 必读）**：Main 工作树在途未提交 hoist 形修形与 PR 源头形同域冲突——normalizeRef 恒等幂等但**禁双落**：merge 时二选一（**PR 优先进**，Main 弃在途形或以 PR 为基 rebase），记账按实际落形；gate 判据两形同格。
6. **流程**：fixup 到达 → 记账面并入 → Main gate → 段 L 0.1.123。

## §8 f4 §7-3 勘误 + 去重钉覆盖裁定（2026-11-17；Main 技术观察触发，f4 差分推演复核成立）

1. **§7-3 勘误（连带 Atlas-reveiw 补证一）**：(c3) fallback 腿 = 池 `['Qwen38-27B-TXT']` 裸 + fallback `'glm'`（∉池）——修形前后均 2 条（首元素形变非条数变），「去重命中数可升」钉（池裸 X + fallback 裸 X → [X, provider/X]→[provider/X]，2→1）**未由 (c3) 落地**。Atlas-reveiw 补证一与 f4 §7-3 采认均误，勘误在案（双复核失准定因 = 判读时未做修形前后条数差分推演，凭断言形直觉认定——方法论注记：判据钉落地主张须差分推演背书）。
2. **裁定（Main 二选一呈裁）：A 扩形采认**——PR fixup 增**一个最小去重钉测试**（池含裸 id + fallback 同名裸 id → 修形后归一单条去重命中，约 4 行，同测试文件内），(c3) 既有腿保留（∉池追加路径覆盖有效）；**Main 补钉测试文件不落**（与 PR 件重叠面大：④≈(c3) session 腿/⑤=新增件/②≈(c2)，双文件重叠维护成本 > 增量价值；⑤ 内容 = A 扩形新增件）。fixup 总范围 = §7-4 版本归属四处 + 2 条措辞订正 + 本条 1 测试。
3. **Main 在途保留面（并入件 C 扩形）全部采认**：README 示例 JSON 全 ref 形 ×3 / settings.md+network-config.md+cli-reference.md 三处 #3-1 注记改形 / engine-config-endpoint-adapter.test.ts 头注 ground truth 订正——均 PR 文件面之外，PR 合入后落。
4. **记账勘误同步**：§7-3 条以本节为准；gate 判据格 1 去重钉 = A 扩形新增件承载。

## §9 段 I 采认（f4 活码实核 2026-11-17，PASS）

1. **C 形序列验真**：aa572f2b（用户亲手 `gh pr merge 4 --merge`，MERGED 2026-11-17T13:59:08Z，merge commit 保对端 authorship）→ 572562d7（Main fixup，7 files +42/−24）→ 943c9e7c（波报告）；双远端 push 对齐。
2. **fixup 对表（§7-4 + §8-2 逐项）PASS**：① 版本归属 0.1.122→0.1.123 ×4 + 文件改名 `-0123`（grep 归属面残留 = 零，f4 独立实证）；② (c3) 措辞 ×2 订正吻合（标题改「fallback 腿输出随池归一连带，arm 码面不变」+ 注释改「归一形比对未命中追加/命中去重」）；③ (c4) 去重钉测试落 PR 测试文件内（A 扩形定形：池裸 `glm`+`Qwen38-27B-TXT` + fallback 裸 `glm` → 修形前 3 条/修形后 2 条差分背书在注记，断言 2 条恰合）；④ 并入件 C 四件全落（README 示例 ×3 全 ref 形 + settings/network-config/cli-reference 三注记含正向归一面 + 负向透传防误读面双要素 + adapter 头注 0.1.123 订正且既有断言面零改——'ghost' 透传语义注记对表吻合）。
3. **diff 边界（格 6 扩及 fixup）PASS**：7 files 全在工单预授权面（roles.ts 注释单行 / 测试件改名+扩 / README / 三 docs / adapter 头注+注释）——零产品行为码超出。
4. **f4 独立实跑**：判别单测 + adapter 回归 `bun test --isolate`（bun 1.4.4）= 33 pass / 0 fail。归一臂核心链（PR diff 复核 §6-1）此前已直证：两装配点同源吃归一后池。
5. **PR #4 吸收收据**：对端修形 + Main fixup 全部并入 master；issue #3-1 代码面闭环（issue 回执销项候段 L 后）。
6. **放行**：段 I 在案 → e2e gate（格 1-4 + TDD RED 直证 + canon 基线 6145/0/504 @bun 1.4.4）→ 段 L 0.1.123（SRI 记实测新锚，预注册在案）→ 生产 lane。

## §10 gate 采认（f4 侧，2026-11-17；e2e 报告 r-20261117-gate-0123.md，gate @95b4f746 = GATE-PASS）

1. **格 1-4 + 格 6 全 GREEN 采认**（e2e 独立实跑）：格 1 判别件 33/0 与 f4 §9-4 独立实跑逐字一致；格 2 roles 相关回归 261/0（28 文件两批）；格 3 TDD RED→GREEN e2e 独立复演（摘除 `.map(normalizeRef)` → 2/4 RED → 还原 → 6/0 GREEN）；格 4 canon 独占 6151/0/505，Δ vs 基线 6145/0/504 = 恰 +6/+1（判别件 master 侧首落）零超集恰合；格 6 四直证（merge commit 双亲保 authorship / PR diff 恰 3 files 预授权面 / fixup 恰 §8-3 面 / 两臂同源单点归一）。
2. **段 L 放行**：GATE-PASS + f4 采认双在案 → Main 走段 L 0.1.123（bump + CHANGELOG + SRI 记 bun 1.4.4 实测新锚，锚变更源唯一性预注册在案）→ 生产 lane → issue #3 回执销项。
