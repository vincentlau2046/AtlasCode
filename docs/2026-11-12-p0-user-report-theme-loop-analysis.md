# 用户 P0 报告分析：macOS 主题对比度 + 主循环错误长久停止（f4 活码梳理 2026-11-12）

> 用户 2026-11-12 报告两问题：① Mac 上灰色文字几乎不可见（「mac 应该有独立的主题体系」）；② 写错目录/工具调用错误 → 退出主循环长久停止无任何回应（应自恢复）。本档 = f4 活码实锚分析（@6151e6dd + S3a 分支面），判据 = 全局特性列表。

## 问题一：macOS 主题对比度（灰字不可见）

| # | 特性 | 判定 | 活码证据（file:line） |
|---|---|---|---|
| T1 | auto 主题终端实测（OSC 11 查询） | **缺口·根因甲** | `src/tui/utils/systemThemeWatcher.ts` 全文件 = **1 行 stub**：`export const watchSystemTheme : any = (() => ({})) as any`——**watcher 从未实现**；ThemeProvider.tsx:69 动态 import 消费它，即便激活也无任何轮询 |
| T2 | auto 检测门控 | **缺口·根因乙** | `feature('AUTO_THEME')` **不在 ON_BY_DEFAULT**（src/shared/feature.ts:22-25 仅 TRANSCRIPT_CLASSIFIER/COORDINATOR_MODE）→ 默认关；watcher import 注释自述「dead-code-eliminated in external builds」——**发布品恒死路** |
| T3 | auto 种子面 | **缺口·根因丙** | `getSystemThemeName()`（systemTheme.ts:33）= `detectFromColorFgBg() ?? 'dark'`——**无 COLORFGBG 时恒判 dark**。macOS Terminal.app **不设** COLORFGBG（iTerm2 视配置）→ 浅色终端被判 dark |
| T4 | 出厂缺省主题 | 缺口·叠加 | config.ts:503 `theme: 'dark'`——未走 onboarding 选择即 dark |
| T5 | macOS 独立主题体系 | **不存在** | 全仓 macOS 特判仅一处：theme.ts:653 Apple_Terminal → chalk level 2（256 色降级，与对比度无关）；**无 OS 外观检测**（未读 `AppleInterfaceStyle`；文件头注明设计意图 = 终端背景实测而非 OS 外观，但实测面 = stub） |
| T6 | 对比度后果 | 症状吻合 | dark 主题 `inactive: rgb(153,153,153)` / `subtle: rgb(80,80,80)`（theme.ts:563-565）落白底 ≈ 不可见；light 主题存在（theme.ts:118）但**用户到不了**（T1-T4 三重 dark 缺省叠加） |

**根因链（推导）**：浅底终端 →（T3 无 COLORFGBG 恒判 dark / T4 缺省 dark）→ dark 主题 →（T1 watcher stub + T2 门默认关，auto 纠正面死路）→ 永不自纠正 → 灰字白底不可见。用户记忆「mac 独立主题体系」= 上游 Claude Code 有 macOS 外观检测；本仓该面 = 设计意图在、实现缺席。

**处置提议（P0 插入波）**：
1. watcher 真实现（systemTheme.ts:66 已有 OSC 11 响应 parse 面 `parseOscColorResponse`——差执行面：query 发送 + 超时 + 解析回填）+ AUTO_THEME 入 ON_BY_DEFAULT。
2. **T3 fallback 改判别式**：COLORFGBG 缺失时首选举措 = macOS 读 `AppleInterfaceStyle`（OS 外观，进程启动一次）；终端实测（OSC 11）就绪后覆盖。禁恒 'dark' 兜底。
3. 判据格：① 明暗两底 × 六主题 WCAG 3:1 对比度判别格（inactive/subtle/inverseText 逐 token）；② macOS 无 COLORFGBG 模拟 → 判 light 格；③ watcher stub 原文断言废止（真实现后 stub 文件删除 = 单源格）。
4. Apple_Terminal 256 色降级保留（独立面，不动）。

## 问题二：主循环错误后长久停止、无任何回应（无自恢复）

| # | 特性 | 判定 | 活码证据 |
|---|---|---|---|
| L1 | 工具错误回合内自愈 | **在位** | toolExecution.ts:676 catch 支 = 错误 → is_error tool_result 回喂 LLM（写错目录/工具报错本身**不应**杀循环——设计自愈在位） |
| L2 | REPL 车道回合级异常可见化 | 在位（有覆盖缺口） | R1 修（loop-robustness 波）：REPL.tsx:2755 catch 出用户可见错误行 + finally queryGuard.end() 复位；**覆盖域 = onQuery try 内**——后台任务（LocalMainSessionTask.ts:425 独立流面）、teammate lane、queue/tick 面未全数入域 |
| L3 | 逃逸异常 fail-silent | **缺口·根因甲** | gracefulShutdown.ts:294/302 uncaughtException/unhandledRejection 处理器 = **仅 logForDiagnosticsNoPII**——不恢复、不上屏、不复位。逃逸 rejection 杀 promise 链后 = 进程活 + UI 活 + 循环死 + 用户无感（spinner 停/界面僵直无解释）——与「长久停止没有任何回应」精确吻合 |
| L4 | stall（无抛错无进展）零看门狗 | **缺口·根因乙（最贴症状）** | ① loopEvents.ts:105 `for(;;) await new Promise(wake)` 桥面**无终态超时**——queryAgentLoop 不 settle 即永久静默；② AD-45 defer 挂起（toolExecution.ts:214-227）= **设计性无限挂起**「会话挂起待 --resume 重评」——TUI 车道权限对话框若未呈/失焦/渲染失败 = 恒挂且零提示；③ 工具无心跳长操作 + 网关挂起（无 client timeout 面）同入此洞 |
| L5 | 自恢复面 | **缺口·根因丙** | turnRecovery.ts（0.1.17/0.1.23 波）只覆盖 **modelProvider 抛错**面（5xx/429/连接抖动有界重试）；工具/系统/挂起/stall 面无 loop 级 watchdog——无超时检测、无回合重建、无可见降级 |

**根因链（推导）**：错误路径三分——① 抛错且在 R1 catch 域内 = 可见错误行（已修）；② 抛错在域外 = fail-silent 死（L3，仅日志）；③ 不抛错但停摆 = 永久静默挂（L4，defer/桥面/无心跳）。「写错目录/工具调用错误」触发 ②③ 的具体路径须实证（见下），但**结构缺口已定谳**：循环死法有三种，仅一种有用户可见面；自恢复仅覆盖模型错误一类。

**实证请求（定谳具体路径）**：请用户提供 Mac 复现时的 `~/.atlas`（或 `~/.claude`）诊断日志面（uncaught_exception/unhandled_rejection 条目有无、时间戳 vs 停止时刻）——区分 ②（逃逸异常）vs ③（挂起）主导；两修形不同（②= 升格处理器，③= watchdog）。

**处置提议（P0 插入波，与问题一同波或紧邻）**：
1. **loop 级 watchdog**：no-event 超时（可配，缺省如 120s 无任何 stream event/heartbeat）→ fail-visible 错误行 + abortController 中止 + queryGuard 复位（可重入）——治 L4 全支（defer 挂起出提示行「等待权限裁定，Esc 中止」而非静默）。
2. **unhandledRejection/uncaughtException 升格**：对齐 cli 车道 crashBackstop.ts 已有形——TUI 车道补用户可见错误行 + 会话状态保全 + queryGuard 强制复位（循环可重入），禁 log-only。
3. **后台/teammate 流面收编**：LocalMainSessionTask 等独立流纳入同 watchdog/crash 面。
4. 判据格：① 逃逸异常注入 → 错误行可见 + 循环可重入格（RED→GREEN）；② defer 挂起 → 提示行格；③ no-event watchdog 触发 → 可见中止格；④ 前滚 standing 全套 + canon。

## 优先级与排波提议

两问题 = **P0 插入波**（用户定性「非常非常重要」）。排波：**先于 S3a 落码**——S3a 现处 lock-face 阶段（逃逸处置表在途），其落码被处置表自然闸住；插入波（主题对比度 + 循环自恢复，各为独立判据面可同波两切片）先行 gate/发布，S3a 随后不受损。若用户裁定拆两波亦可：主题波（修形小、判据明确）先行，循环自恢复波（watchdog 设计面稍重）随后。
