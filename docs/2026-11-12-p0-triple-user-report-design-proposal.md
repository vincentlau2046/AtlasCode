# 三问题 P0 方案设计稿（f4 头脑风暴收敛稿，呈用户审核 2026-11-12）

> 用户 2026-11-12 报告三问题，定性「非常非常重要」：① macOS 灰字不可见（主题）；② 主循环错误后长久停止无回应（应自恢复）；③ 底部输入框不钉底，整屏上滚导致输入框丢失。本稿 = f4 主线程头脑风暴收敛（多方案取舍 + 推荐 + 判据格），**待用户审核后立工单**。活码锚 @ca19ea86。
> 分析底稿：`docs/2026-11-12-p0-user-report-theme-loop-analysis.md`（问题①②根因链）+ 本稿 §3（问题③活码实锚）。

---

## §1 问题一：macOS 主题对比度（灰字几乎不可见）

### 1.1 问题点（根因链，活码实证）

三重缺省叠加使浅色终端恒落 dark 主题：
1. **auto 检测面从未实现**：`systemThemeWatcher.ts` = 1 行 stub（`(() => ({}))`），OSC 11 终端背景实测只有 parse 面无执行面。
2. **门默认关**：`feature('AUTO_THEME')` 不在 ON_BY_DEFAULT，发布品 watcher 死路（即使实现了也不跑）。
3. **fallback 恒 dark**：`getSystemThemeName()` = `COLORFGBG ?? 'dark'`——macOS Terminal.app 不设 COLORFGBG → 浅底恒判 dark → `inactive rgb(153,153,153)`/`subtle rgb(80,80,80)` 落白底不可见。
4. 「mac 独立主题体系」确认缺失：全仓 macOS 特判仅 Apple_Terminal 256 色降级（与对比度无关），**无 OS 外观检测**（未读 `AppleInterfaceStyle`）。

### 1.2 头脑风暴选项

| 选项 | 形 | 取舍 |
|---|---|---|
| A 检测最小修 | 删 stub → watcher 真实现（OSC 11 query+超时+解析回填，parse 面已有）+ AUTO_THEME 入 ON_BY_DEFAULT | 治根；但 OSC 11 依赖终端响应（部分终端不答），首帧前异步窗仍闪 dark |
| B OS 外观 fallback | COLORFGBG 缺失时读 macOS `AppleInterfaceStyle`（defaults read，进程启动一次）+ Windows 读注册表 AppsUseLightTheme | 同步、跨终端稳；但语义 = OS 外观 ≠ 终端实际背景（深色终端+浅色系统误判）——上游 Claude Code 同有此偏差 |
| C 出厂缺省翻转 | config theme 缺省 'dark' → 不变，但 onboarding 前首帧 = B 判别 | 与 B 同体 |
| D 全自动分层（A+B 融合） | 启动时序：COLORFGBG（若有）→ OS 外观（B）作首帧 → OSC 11 实测（A）就绪后覆盖 → live 切换跟随 | 各层互补，OS 外观误差被 OSC 11 实测纠平；复杂度 = 分层状态机（三源优先序须钉死） |

**f4 推荐：D（分层检测）**，附带条件：三源优先序钉死 = 显式用户设置 > OSC 11 实测 > COLORFGBG > OS 外观 > 缺省 dark（文档化 + 判据格逐层）；OSC 11 失败静默降级到下一层（禁卡启动）。

### 1.3 判据格（预注册）

① 三源优先序格（逐层注入模拟）；② macOS 无 COLORFGBG 模拟 → 判 light 格；③ stub 文件删除单源格（真实现后 stub 消失）；④ 明暗两底 × 六主题 WCAG 3:1 对比度判别格（inactive/subtle/inverseText/brand 逐 token 实算）；⑤ live 切换格（模拟 OSC 响应翻转 → 主题跟随）。

---

## §2 问题二：主循环错误后长久停止、无任何回应（无自恢复）

### 2.1 问题点（根因链，活码实证）

循环死法三种，仅一种有用户可见面：
1. **已修面**：工具错误回合内自愈（toolExecution.ts:676 catch → is_error 回喂 LLM）；REPL 车道回合异常可见化（REPL.tsx:2755 R1 修 = 错误行 + queryGuard 复位）。
2. **fail-silent 死**：`uncaughtException/unhandledRejection` 处理器（gracefulShutdown.ts:294/302）**仅写诊断日志**——不恢复、不上屏、不复位。逃逸 rejection 杀循环链 = 进程活 + UI 僵直 + 零解释。后台任务（LocalMainSessionTask.ts:425）/teammate lane 不在 R1 catch 域。
3. **永久静默挂**：① loopEvents.ts:105 桥面 `for(;;) await wake` **无终态超时**——循环不 settle 即永挂；② AD-45 defer 权限挂起 = **设计性无限挂起**（toolExecution.ts:214「会话挂起待 --resume 重评」）——权限对话框未呈/失焦即恒挂零提示；③ 无心跳长操作/网关挂起同洞。
4. **自恢复覆盖面**：turnRecovery 只管模型 API 抛错（5xx/429 有界重试）；stall（不抛错不进展）与系统异常零看门狗。

### 2.2 头脑风暴选项

| 选项 | 形 | 取舍 |
|---|---|---|
| A 只补可见化 | uncaught/rejection 处理器升格：错误行上屏 + queryGuard 强制复位（可重入） | 治「死而无感」；不治「挂而不死」；实现小 |
| B loop 级 watchdog | no-event 超时（缺省 120s 无任何 stream event/heartbeat/工具心跳）→ 可见中止 + 可重入 | 治「挂起」全支（defer/桥面/网关挂起）；需防误杀长工具（工具心跳已在位 toolHeartbeat——heartbeat 视作活动即不触发，缺口小） |
| C defer 挂起可视化 | 挂起时出常驻提示行「等待权限裁定（Esc 中止）」+ 挂起超时提示 | 治 defer 静默面；独立小切片 |
| D 自恢复回合重建 | watchdog 触发后自动重建回合（重放消息再入循环）而非仅中止 | 恢复力最强；风险 = 重放语义复杂（幂等性/重复工具副作用/消息状态），建议二步走：先可见中止（用户手动重试），回合重建挂后续 |

**f4 推荐：A+B+C 三切片同波（D 不做，登记后续）**——A 治死法②、B 治死法③、C 治 defer 静默；三者判据独立、互不阻塞。D（自动回合重建）登记候选后续波（重放语义须独立设计审视，不值与本波捆绑）。

### 2.3 判据格（预注册）

① 逃逸异常注入 → 错误行可见 + 循环可重入格（RED→GREEN）；② no-event watchdog → 可见中止 + 可重入格（心跳活动期不误杀格）；③ defer 挂起 → 提示行格；④ 后台任务流（LocalMainSessionTask）异常同样可见格；⑤ 前滚 standing 全套 + canon。

---

## §3 问题三：底部输入框不钉底（整屏上滚、输入框丢失）

### 3.1 问题点（根因链，活码实证）

1. **默认 inline 模式无钉底机制**：TUI 默认走 Ink inline 渲染——消息流动态渲染 + 输入框在渲染树尾部。帧高 > 终端行数时**终端原生滚动**接管，输入框随帧被推出视口。这是架构性：inline 模式下 Ink 无 pin 概念，靠「消息截断上限」保帧高，但流式长块/工具大输出可在一帧内超限。
2. **钉底能力已在位但藏于 opt-in**：`FullscreenLayout`（alt-screen + VirtualMessageList 虚拟滚动 + sticky prompt 钉底 + 滚轮）**已实现**，但 `isFullscreenEnvEnabled()`（fullscreen.ts:131-160）**缺省 return false**——须 `ATLAS_NO_FLICKER=1` 手动开启；tmux -CC 自动禁用已有。用户默认形态 = 无钉底的 inline 模式 → 症状必然发生。
3. Messages.tsx 非虚拟路径截断帽（200 消息 + UUID 锚）是内存防线不是视口防线——注释自述「content dropped from this slice has already been printed to terminal scrollback」= 设计上接受终端原生滚动，**输入框可被推出视口为已知代价**。

### 3.2 头脑风暴选项

| 选项 | 形 | 取舍 |
|---|---|---|
| A 翻转全屏缺省 | fullscreen alt-screen 设为默认开（能力已在位；ATLAS_NO_FLICKER=0 退回） | 治本且零新码（翻转+兼容审查）；风险 = 全屏改变终端习惯（原生 scrollback 不可用，虚拟滚动接管；tmux/vim 用户肌肉记忆；tmux -CC 自动禁用已有但其他环境长尾）；上游 Claude Code 同为 inline 滚动形，翻转缺省 = 行为定位选择 |
| B inline 视口压缩 | 动态渲染面强制 ≤ 视口高度：消息区按「剩余行数预算」截断 + 「─── N 条已入滚动区，↑ 翻看 ───」提示行 + 渲染前高度预算（防流式一帧超限） | 保留原生 scrollback 习惯（上游同形）；实现 = 高度预算器（Ink yoga 高度可测）+ 预算分配；风险 = 消息截断更激进（大输出消息整块折叠），长输出查看面要配合 transcript 模式 |
| C 输入框独立 pane | 终端 split（tmux pane / iTerm2 split）承载输入 | 强依赖多路复用器，裸终端（Terminal.app）无解——**否决** |
| D A+B 混合 | 全屏默认开 + inline 压缩作为退路（全屏自动禁用环境：tmux -CC/老终端 = B 保底） | 两形各治其域；体量 = A（小）+ B（中） |

**f4 推荐：D（A 翻转缺省 + B 退路）**，分两步交付：第一步 A（翻转 + 兼容矩阵审查：tmux -CC 已禁/SSH/Windows Terminal/screen 最小行数 fallback 检测），第二步 B（压缩器，非全屏环境保底 + 全屏模式零变更）。若用户倾向保守（不动默认形态），退选 **B 单做**——输入框钉底目标同样达成，仅体验形不同（原生滚动保留 vs 虚拟滚动接管）。

### 3.3 判据格（预注册）

① 全屏模式：流式 1000+ 行输出 → 输入框钉底可见格（pty 断言：末行 = prompt 边界）；② inline 退路：等压输出 → 动态面高度 ≤ 视口 + 提示行在场格；③ tmux -CC 自动降级 → B 路径激活格；④ 兼容矩阵（Terminal.app/iTerm2/tmux/screen/Windows Terminal）探针腿；⑤ 前滚 standing + canon。

---

## §4 排波提议与决策点（请用户裁定）

| 决策点 | f4 推荐 | 备选 |
|---|---|---|
| ① 排波 | 三问题合组 **P0 插入波，先于 S3a 落码**（S3a lock-face 处置表冻结不受影响，插入波先行 gate/发布；S3a 随后无损） | 三问题拆三小波（体量更散、gate 三次成本） |
| ② 主题 | 分层检测 D（OSC 11 实测顶层 + OS 外观首帧 + COLORFGBG） | 仅 B（OS 外观最小修，OSC 11 后置） |
| ③ 循环自恢复 | A+B+C 三切片（可见化+watchdog+defer 可视化）；**自动回合重建（D）不做**，登记后续 | 含 D（重放语义需独立审视，风险面大） |
| ④ 输入框钉底 | 混合 D（全屏翻转缺省 + inline 压缩退路，两步交付） | **B 单做**（保守：保留原生滚动习惯，不动默认形态） |
| ⑤ 版本号 | 插入波 = 0.1.102（S3a 顺延 0.1.103） | 插入波插 0.1.102 前（S3a 已占号则插入波 0.1.103） |

**裁定后动作**：f4 按裁定立工单（工单 = 本稿 §1-§3 推荐 + 判据格）→ Atlas-reveiw 审计 → 双信号 → Main 落码 → gate → release。S3a lock-face 六项终裁顺延至排波裁定后一并处理（Main 侧已同步挂起等待，不空转）。
