# 权限请求弹框「打印内容过大」调查 — 2026-11-07 f4（零码，候选登记）

- 触发：用户「之前有一个 permission 的权限请求的打印修改，导致打印内容过大，正面无法看到实际的内容；看看实现，是否可对齐 Claude Code 弹出提示逻辑」
- 方法：全组件 diff（vs restored-src 2.1.88）+ git 历史扫描 + 2.1.318 bun 二进制插桩（strings/上下文提取）

## 结论（全局特性列表）

| # | 面 | 状态 | 证据 |
|---|---|---|---|
| 1 | Bash ask 弹框命令体 | **与上游 2.1.88 同款**：`renderToolUseMessage(..., {verbose: true}) // always show the full command` 全量命令不截断 | 两边 BashPermissionRequest.tsx 同句（我方 :449 / 上游 :438）；`src/tui/tools/BashTool/UI.tsx` diff 仅 env 名；截断逻辑（MAX_COMMAND_DISPLAY_LINES/CHARS）仅 verbose=false 分支，弹框恒 verbose=true 绕过 |
| 2 | 其余 ~40 个弹框组件 | ≈上游 2.1.88 逐字 | diff 仅 import 路径/品牌串/A2 abort 路由三族 |
| 3 | 我方加性面 | 全部有界（单行） | verdict 行（permissionVerdict.ts 160L，逐 case 短句）、automode 确认视图、rm 危险前缀警告、K3-D D2 hook 来源归附、D-279-r1 文件面 verdict——无一能致「内容过大」 |
| 4 | 弹框容器/滚动 | 与上游 2.1.88 零 diff | PermissionDialog.tsx / PermissionRequest.tsx diff = import+品牌+abort |
| 5 | 上游现行版弹框逻辑 | **已漂移（卷 4 区间）** | 2.1.318 二进制插桩直证：`permissionCard`/`servedCard` 卡片机制（`tool.permissionCard?.(input, toolUseID, reason)`）2.1.88 无；`bash_command_clamp` 规则族（fail-closed）；classifier transcript 超窗回退人工审批 |

**定谳：未发现「我们的修改」致打印过大**——弹框体对齐基线（2.1.88）本就全量渲染（长命令/heredoc、文件 diff 不设上限，靠 TUI 滚动区承接）；症状 = 2.1.88 时代弹框设计 × 短终端的固有缺陷，非本仓回归。用户记忆的「打印修改」最可能指 P0a/A4 verdict 行或 D-279（均为有界单行，已排除致因），或指上游现行版行为差异。

## 处置候选（待用户裁定排期）

| 案 | 内容 | 量级 | 关联 |
|---|---|---|---|
| A（推荐） | **随卷 4 插桩对齐**：卷 4（2.1.304–319）分析卡扩一专项「permission 弹框逻辑漂移」——permissionCard 机制 + 弹框高度管理 + 截断策略直证后按上游现行形态对齐 | 插桩零码先行；落码归卷 4 波 | 纲要 §10 序 9（分析卡可提前做） |
| B | **独立 scoped TUI 小波**（不等卷 4）：ask 弹框加高度上限 + 截断摘要（如命令 >N 行 → 首尾保留 + `… (N lines hidden)`）+ 展开键（ctrl+o 类）——形态自定，有偏离上游形态风险 | 半波 | 0.1.86 K6 探针方法论可复用（pyte 屏面重放断言高度） |
| C | 不动，登记为已知缺陷 | 零 | — |

案 A/B 不互斥：B 解用户眼前痛，A 保长期对齐。f4 倾向 B 插入候补池（纲要 §10 序 5 Gap B 同段位）+ A 并入卷 4 分析卡清单。

## 插桩资产留存

- 2.1.318 strings 抽取：`/home/vince/.claude/jobs/9d1c80df/tmp/cc318/b318.strings`（592k 行，job 清理时失效，需留档另存）
- 二进制：`tmp/cc318/x/package/claude`（337MB）
- 卷 4 插桩时应将两资产转存 `~/projects/claude-code-sourcemap/` 同款工作区
