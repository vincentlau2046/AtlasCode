# 0.1.123 modelRoles 池臂 normalizeRef 根修波 — 波报告（Main lane，2026-11-17）

工单：`docs/2026-11-17-0123-model-role-pool-ticket.md`（@fb8de9cc，§5 审计 @17a2dfb4，§7 PR 复核 @4e881f57，§8 裁定 @b651876e）。
issue：#3-1（fusion-console 集成侧裸 id 解析失败）。

## 1. 落形实录（C 形：as-is merge + master fixup）

| 步 | 内容 | SHA |
|---|---|---|
| 代码修形（对端） | Atlas-reveiw PR #4 `fix/role-pool-normalize-ref`（roles.ts 池 arm 构造点单点归一 + 判别单测 a/b/c1/c2/c3） | 801717df |
| merge | 用户亲手 as-is merge（merge commit 保对端 authorship，分支未删） | aa572f2b |
| Main fixup | 版本归属 ×4 + (c3) 措辞订正 ×2 + (c4) 去重钉测试（A 扩形件）+ 并入件 C，单 commit 承载全范围（工单 §8-2） | 572562d7 |

### 1.1 C 形执行中的权限事件（记录在案）

Main 侧 `gh pr merge 4` 被 session 权限分类器拦截（peer-authored PR 合入 master 须用户批准）。按反 permission-laundering 纪律未绕行、未转请 peer 代执行，路由回用户；用户亲手执行 merge（aa572f2b）后序列恢复。C 形步 1 形态不变（merge commit 保 authorship、分支未删）。

### 1.2 合并次序钉执行记录（§7-5）

Main 在途 hoist 形修形（`const pool = rolePool.map(normalizeRef)` 两臂复用 + 7-test 判别文件）于 §7 信号到达时**弃落**：roles.ts `git checkout --` 还原（零提交痕迹），README 注记改形回退避同 hunk 冲突，余面 stash（`0123-main-inflight`）待 merge 后恢复。最终落形 = PR 源头归一形（rolePool 构造点单点 `.map(normalizeRef)`，禁两臂各自维护）。

Main 在途测试文件 `model-role-pool-normalize-0123.test.ts` 按 §8-2 裁定**不落**（重叠面大：④≈(c3) session 腿、⑤=(c4) 新增件、②≈(c2)）；⑤ 内容由 (c4) 承接。

## 2. TDD 证据链

- **Main 在途直证（弃形前实测，hoist 形）**：RED 3 fail（①池裸 id 透传 / ④session+池混合腿池段透传 / ⑤去重命中数未升：`fabric-small` 未归一 `maas/fabric-small`）→ 修形后 7/7 GREEN；roles 相关 12 文件 123 pass；tsc 0。
- **最终落形判别单测（role-pool-normalize-ref-0123.test.ts，6 tests）**：(a) 池裸 id 加前缀（修前红）/(b) 未知裸 id 透传 + resolveModel undefined 负断言 /(c1) 全 ref 恒等 /(c2) 混合池逐条归一序不变 /(c3) session/env 恒等 + fallback 码面不变 /(c4) 去重命中数可升（修形前 3 条 → 修形后 2 条差分推演）。
- **(c4) 差分推演背书**（§7-3 勘误链方法论）：池 `['glm','Qwen38-27B-TXT']` + fallback `'glm'`——修形前 `['glm','Qwen38-27B-TXT'] + fb 'iff/glm'` = 3 条；修形后 `['iff/glm','iff/Qwen38-27B-TXT'] + fb 命中去重` = 2 条。

## 3. fixup 明细（572562d7，7 files / +42 / −24）

1. **版本归属 0.1.122→0.1.123 ×4**：`roles.ts` 注释 / README 注记 / 测试头注 / describe 标题；测试文件随归属改名 `role-pool-normalize-ref-0123.test.ts`（git mv，R 72%）。
2. **(c3) 措辞订正 ×2**（工单 §7-4）：标题「三 arm 行为不变（恒等锚）」→「sessionModel / env arm 恒等 + fallbackModel arm 码面不变（输出随池归一连带，见 (c4)）」；注释「glm 不在池内 → 追加」→「fb 归一 'iff/glm' 与池（归一形）比对：未命中 → 追加；命中 → 去重（见 (c4)）」。
3. **(c4) 去重钉测试**（A 扩形件，0.1.123 归属 + Main 差分观察 credit 注记）。
4. **并入件 C**：README 示例池全 ref 形 ×3（`"models": ["iff/Qwen38-27B-TXT"]`）；`settings.md` / `network-config.md` / `cli-reference.md` 三处 #3-1 注记改形（正向归一面「0.1.123 起命中 providers 表自动归一」+ 负向防误读面「未命中的裸 id 仍解析失败」）；`engine-config-endpoint-adapter.test.ts` 头注陈旧 ground truth（「池 bare ref 不经 normalizeRef」）订正为 0.1.123 语义。

## 4. 并入件 A 记账（预落 master 双件，f4 §7 @b1e54a79 已采认）

| 件 | 内容 | 归属行 |
|---|---|---|
| 292007c5 | C9-5 源级锚改指 `docs/reference/settings.md` 新权威面（0.1.122 A3 新 doc 反引号形断言对齐） | 「0.1.122 A3 派生缺陷修复，随 0.1.123 收口」 |
| 1f4ea599 | ci bun pin 1.4.2→1.4.4（canon 两版本差分全等 6144/1 升级中性） | 「bun 工具链基线，0.1.123 锚披露预注册载体」 |

并入件 B（锚披露预注册）：bun 1.4.4 工具链变更 → cli.js 锚**预期变更**（源唯一性 = 工具链预注册非产品码 Δ）；SRI `docs/sri/v0.1.123.md` 于段 L 记实测新锚，禁事后追认。

## 5. 格自检（工单 §2）

| 格 | 判据 | 状态 |
|---|---|---|
| 1 | 归一格（池裸 id 归一 / 全 ref 零变 / 未知透传负断言 / 混合腿 / 去重钉预期声明） | ✅ (a)(b)(c1)(c2)(c4) 全腿直证；去重命中数可升 = (c4) 预期声明钉 |
| 2 | 回归零触碰（envModel/fallback arm 码面不变；fallback 去重面 roles.ts 零触碰） | ✅ 落形仅 rolePool 构造点 +1 `.map(normalizeRef)`；roles 相关 12 文件 99 pass |
| 3 | TDD RED→GREEN | ✅ Main 在途直证（3 RED→GREEN）+ 落形 (a) 修前红判别 + (c4) 差分推演 |
| 4 | canon 全量恰合（6145/0/504 @b1e54a79，bun 1.4.4） | 候 gate（f4 独立跑） |
| 5 | 锚披露（SRI 四值 + 新锚实测） | 候段 L（bun 1.4.4 预注册在案） |
| 6 | 对端 PR 分账 | ✅ C 形 absorbed：PR #4 as-is（技术面双审通过）+ fixup 补账；f4 段 I 采认候 |

## 6. 验证留痕

- `bun test tests/unit/role-pool-normalize-ref-0123.test.ts` → 6/6 pass
- roles 相关回归 12 文件 → 99 pass（含 context-window-unified / model-roles / role-fallback / engine-config-endpoint-adapter）
- `npx tsc --noEmit` → exit 0
- 归属残留核查：落形文件域内 `0.1.122` 零残留（grep exit 1）
- push：origin `aa572f2b..572562d7` / gitcode `1f4ea599..572562d7`，双远端 merge-base ALIGNED

## 7. 遗留

- issue #3 回执销项：候 gate PASS + 段 L 发布后（f4 侧公开回帖）。
- PR #5（theme 灰阶 WCAG）：同形预裁定（as-is merge + master fixup），窗口 = 0.1.123 收口后。
- 去重命中数可升对既有用户的可见影响：池裸 id + fallback 同名裸 id 场 refs 由 3 条缩 2 条（归一连带，非 arm 行为）——已在 (c4) 注记钉防后人误读。
