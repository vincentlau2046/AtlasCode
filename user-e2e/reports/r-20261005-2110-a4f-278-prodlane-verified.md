# A4F 生产 lane 回归 —— 绿（npm 0.1.26 产物验真）

- **判定**：PASS（hardFail=0，hardInconclusive=0）
- **被测体**：npm 0.1.26 产物 = master @ `89efabc`（release 0.1.26）+ `33ab771`（docs-only），`bun build src/atlascode/cli.ts → dist/cli.js`
- **banner 实测评**：`AtlasHarness v0.1.26`（7 场景启动屏全显 v0.1.26，与 npm latest 对齐）
- **artifact**：`user-e2e/tui-diff/artifacts/A4F-1791205033472-dd26`
- **执引**：`bun run user-e2e/tui-diff/accept.ts A4F --repo /home/vince/projects/AtlasCode`

---

## 逐场景 verdict（7 场景）

| 场景 | 硬句 | 判定 | 证据 |
|---|---|---|---|
| S-024I | **a4rallow** | **✅ PASS** | `A4-rule-allow-allowface=✅` |
| S-024J | **a4bypass** | **✅ PASS** | `Verdict: Bypass mode — all commands allowed.`（完整句现形） |
| S-024L | **A4-mode** | **✅ PASS** | `Verdict: default mode requires confirmation for Bash.` |
| S-024M | **a1danger** | **✅ PASS** | 0 次 always/don't-ask-again |
| S-024N | a4cls | INCONCLUSIVE（预期） | 触发未达 |
| S-024O | a4clsa | INCONCLUSIVE（预期） | 触发未达 |
| 控制 ×7 | — | 全 ✅ | seed-default×2 / label-bypass / label-automode×3 / seed-dialog |

## 结论

- **4 硬句全绿**，与 worktree-278 gate（A4F-1791202099591-qoyo）同口径同绿 → 发布产物无回归。
- **S-A 回归核未回归**：A4-mode / a1danger 仍绿。
- classifier 2 句 INCONCLUSIVE（预期，live-model 依赖）。
- banner 实测 `v0.1.26` MATCH → 生产 lane 验真闭环。

## worktree 清理放行

worktree-278-a4-verdict 已完成使命（gate 绿 + 生产 lane 验真绿），可按 Main 流程清理。