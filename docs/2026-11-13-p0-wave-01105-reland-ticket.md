# 0.1.105 重落波工单——主题分层检测 + per-tool timeoutMs（封存件 revert-of-revert）

> 状态：`draft → Atlas-reveiw 审计 → f4 双信号`。f4 工单（2026-11-13）。
> 上游：0.1.104 回退波（用户裁定 0.1.102 三切片整体废掉）封存两件；用户路线图 OK 在案（0.1.104 终报「下波 0.1.105 = 主题重落 + timeoutMs 重落」）。

## §0 波前审视（活码重核 @ master 367af220，f4 2026-11-13）

1. **两件均为无冲突 revert-of-revert**（实锚核验）：
   - **主题分层检测**：重落 = revert `b47ba079`（0.1.104 期对 `21199f14` 的 revert），5 文件（`src/shared/feature.ts` + `tui/utils/{osAppearance,systemTheme,systemThemeWatcher}.ts` + `tests/unit/p0-theme-layered-detection.test.ts`，+233/−2）。其余八个 revert commit 对五类目标文件零触碰（f4 逐 commit 扫描实证）。
   - **per-tool timeoutMs**：重落 = revert `0c7dab8d`（0.1.104 期对 `da318752` 的 revert），6 文件（`toolExecution.ts` 接线 + `toolTimeout.ts` 111L + webFetch/webSearch 首批声明 + `shared/types.ts` 契约字段 + `tests/unit/tool-timeout-wrapper.test.ts` 223L 十测，+404/−4）。同上零触碰实证。
2. **因果面**：用户实机 P0 两事故（压缩器内容不可见 / crash-recovery 恶化）均属切片 3 与 2-A 域，与主题分层、timeoutMs **无因果**；watchdog 误杀属 2-B 域（不在本波，见非目标）。主题件 gate-102 期全绿；timeoutMs 件 canon 绿封存（0.1.104 期未及 gate 即随回退封存——本波补 gate 面）。
3. **封存判据面随码复活**：timeoutMs 工单 §7 六条审计吸收（arm 时点=权限门后 / defer 暂停与豁免同源单源 / 首批清单依据列 / **timeoutMs 不出 LLM schema** / 到期零孤儿进程 / 无声明 wire 零差）已全部固化在封存码与十测内，重落零重设计。
4. **用户面注记**：CHANGELOG 须重录两能力（0.1.104 CHANGELOG 已声明撤回，本波重落 = 重录非自相矛盾——条目互相引用）。

## §1 波定义

- **波名**：主题分层检测 + per-tool timeoutMs 重落。**版本**：0.1.105。
- **切片 1**：revert `b47ba079`（主题分层检测原形复活：watcher 真实现 + OS 外观第四源 + AUTO_THEME 缺省开，含判据测试）。
- **切片 2**：revert `0c7dab8d`（timeoutMs 原形复活：Tool 契约字段 + toolTimeout wrapper arm/哨兵消歧/race 死线/钉⑥ 转后台 disarm + WebFetch 90s/WebSearch 30s 首批声明 + 十测）。
- **配套**：CHANGELOG 重录两能力条目（与 0.1.104 撤回条目互引）+ package.json bump 0.1.105。
- **非目标**：watchdog 本体重落（2-B 域，随回退消亡；opt-in 诊断形重落 = 登记候选，需求面待观察）；压缩器/crashRecovery 重设计（R3-C 评估另呈）；S3b/ENV 零混入。
- **性质**：机械重落波（零新设计，封存码原形复活 + gate 面补全）。

## §2 Global Constraints

1. 重落面 = 恰 revert-of-revert 两件（diff 断言兜底：本波 src/ 改动 ⊆ 两件原 patch 面）；禁借机改行为。
2. row F 全程；Atlas-reveiw 审计先于双信号；段 L 硬门双在案。
3. npm 一律 --registry npmjs.org；真实环境零污染；探针 designated-only。

## §3 判据格（预注册）

| # | 格 |
|---|---|
| 1 | **重落恰形格**：`git diff 367af220..HEAD -- src/` 恰 = 两件原 patch 复活（文件集 ⊆ {theme 4 + timeoutMs 5}，hunk 与原 patch 同构） |
| 2 | **主题格**：watcher 真实现生效 + OS 外观第四源 + AUTO_THEME 缺省开（原 gate-102 切片 1 判据复活 + `p0-theme-layered-detection.test.ts` 回归） |
| 3 | **timeoutMs 格**：十测全绿（wrapper arm/哨兵消歧/race 死线/disarm）+ **无声明零 wire 差格**（timeoutMs 不入 schema：工具描述 wire 字节零 diff + token manifest diffs=0）+ WebFetch 90s/WebSearch 30s 声明在场 |
| 4 | canon 净域（Δ 恰 = 两测试文件复活面）+ standing 14 腿 + TUI smoke |
| 5 | 前滚 standing（O4 锚等）+ e2e 专项探针按需（timeoutMs 到期 pty 腿可选） |

## §4 Review Focus（Atlas-reveiw 焦点建议）

1. revert-of-revert 的语义完备性：`git revert <revert-commit>` 恢复原 patch 时，若原 patch 上下文在 0.1.102→0.1.104 链中被动过（本波已证零触碰）才无冲突——审计复核该零触碰证明。
2. CHANGELOG 重录措辞：与 0.1.104 撤回条目互引形（「0.1.105 重落 0.1.104 撤回之 X」），防用户面困惑。
3. feature.ts 重落后 FEATURE_AUTO_THEME/AUTO_THEME 门语义与 0.1.101 既存字面共存面（格 2 复核；回退波格 2 假 RED 教训同源）。
4. timeoutMs 首批声明清单（WebFetch 90s/WebSearch 30s）依据列已备案（#260 门族/原工单 lock-face），重落不再扩清单。

## §5 流程

本工单 → Atlas-reveiw 审计 → f4 双信号 → Main 段 I（revert-of-revert + 配套）→ 段 G → 段 L → 生产 lane → f4 收口。row F 全程。

## §6 Atlas-reveiw 审计闭环

（待审）

## §7 登记面

- watchdog opt-in 诊断形重落（候选，需求面待观察）；R3-C 全屏评估稿（0.1.105 稳定后呈用户终裁）。
