# A4F 生产 lane 收口验真 —— 绿（npm 0.1.28 产物，P0 正式封口）

- **判定**：**PASS（全 6 句 A4 硬绿 + banner 实测 v0.1.28 + 0 未处置 INCONCLUSIVE）→ P0 封口 Option B 正式达成**
- **被测体**：npm 0.1.28 产物 = release commit `e1f79d3`（tag v0.1.28；D-279-r1 渲染修 `1f01f6f` + release bump，native semver）；专用 worktree `worktrees/prodlane-028` @ e1f79d3（detached，主 checkout 隔离）
- **npm 验真**：`npm view @atlasharness/atlascode` latest=`0.1.28`，`dist.shasum`=`ae04768ac73f18679d1f0362056ea64a1e703a78`（独立复验 MATCH）
- **banner 实测**：7 场景启动屏全显 **`v0.1.28`**（与 npm latest 对齐）
- **exec**：`bun run user-e2e/tui-diff/accept.ts A4F --repo <worktree prodlane-028>`（6 句探针全 hard + `preClean` hermetic）
- **artifact**：`user-e2e/tui-diff/artifacts/A4F-1791228364680-6lr1`

---

## 6 句 A4（全硬绿，发布产物口径）

| # | 句 | 场景 | 判定 | 证据（截留） |
|---|---|---|---|---|
| 1 | rule-allow | S-024I | ✅ | A4-rule-allow-allowface ✅ + A1-no-dialog ✅ |
| 2 | bypass | S-024J | ✅ | A4-bypass-allowface ✅（`⏭ bypass enabled`） |
| 3 | **classifier 危险** | S-024N | ✅ | 弹框渲 **`Verdict: Auto mode: classifier flagged this as dangerous.`** + wire `classifier=inject shouldBlock=true` |
| 4 | **classifier 自动放行** | S-024O | ✅ | 成功卡 `Auto-approved by classifier: Action stays within expected scope…` + wire `classifier=inject shouldBlock=false` |
| 5 | mode | S-024L | ✅ | `Verdict: default mode requires confirmation for Bash.` |
| 6 | A1 危险前缀无 always | S-024M | ✅ | absent=0 |
| 控制 S-024K | — | ✅ | hardFail=0（A5-label-automode ✅；ctrl 软探针信息性） |

**结论**：发布产物（npm 0.1.28 / e1f79d3）6 句全绿、与 worktree dc0b37f gate 同口径同绿 → **发布产物无回归**；banner 实测 v0.1.28 MATCH → 生产 lane 验真闭环。

---

## P0 正式封口

- **P0 封口 Option B（守全 6 句 A4 e2e 绿）达成**：0.1.28（D-279-r1 渲染修 + 0.1.27 崩修/波C 合并基线）发布 + 生产 lane 验真全绿。
- **版本链收口**：0.1.26（4/6 可达）→ 0.1.27（崩修+波C，#4 绿、#3 渲染缺口）→ **0.1.28（D-279-r1 渲染修，6/6 全绿，P0 封口）**。治理规则③「特殊 case 顺延下一版」首实例 = 0.1.27→0.1.28（native semver）。
- **品牌序列前置 gate 解锁**：① 0.1.28 完成（已发）② TUI 封口（本 verdict 绿）→ **0.1.29（BR-8）验收可被 Main 触发**（按 `docs/2026-10-06-brand-e2e-collab-protocol.md`）。

## worktree 清理

- `worktrees/prodlane-028`（detached @ e1f79d3，验真完毕，verdict 归档后可清；无未提交改动）。
- `worktrees/worktree-279-d279r1`（dc0b37f，D-279-r1 修源 worktree，已合入 0.1.28；Main/f4 定清理时机）。
