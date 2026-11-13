# 0.1.102 P0 插入波段 D lock-face（Main，2026-11-12）——五项必答终形

> 工单 `docs/2026-11-12-p0-wave-01102-user-triple-ticket.md` @4f6dc0bb §6 末行必答清单。
> 全部锚点经 live-code 核码（本日）；file:line 均为 @master 实测。
> 批复后进段 I（切片序 1→2→3）。

## ① watchdog 状态机分域四豁免 + 工具心跳清单 + defer 检测单源

**计时面（定形）**：loop 级 watchdog 挂 **engine 侧**（`src/engine/query/loop.ts` queryAgentLoop 生命周期内），不挂 TUI 桥（`loopEvents.ts:105 for(;;) await wake` 是死法表现面，不是挂点——桥面无豁免信息视野）。armed 域 = 回合内（query 起→turn 终态，豁免 (a)）；缺省 120s；`ATLAS_LOOP_WATCHDOG_MS` 可调，`0` = 关（fail-closed 缺省开）。

**活动源枚举（单一 reset 点）**：任意 AgentLoopEvent emit（`deps.emit` 汇聚处，loop.ts:600 onToolHeartbeat 门控所在同点）= 唯一 reset 点，禁逐事件多点 reset。活动 = stream_delta / tool_heartbeat / loop_end / goal_* 全事件族（经单点自然覆盖）。

**四豁免（分域定形）**：
- **(a) 轮间 idle**：仅回合内 armed；turn 终态（含 deferred 终态）→ disarm。REPL 空闲 >120s 不触发格的判据实现 = 此 disarm。
- **(b) permission/defer 等待暂停**：**defer 检测单源** = `mergeHookPermission` defer 支（`src/engine/pipeline/toolExecution.ts:214-223`，`GateVerdict.deferred=true`）→ loop 层 `deferredOutcome`（`loop.ts:612-617`，`AgentLoopResult.deferred`）。watchdog 豁免挂两既有面：① permission 门未决（checkPermission promise 在途未 resolve）→ 暂停计时；② deferred 终态 = loop settle 非 hang（无需豁免，自然终态）。切片 C 提示行消费**同一** deferred 面（`AgentLoopResult.deferred` 事件透传），禁第二 defer 判定实现。
- **(c) 在途工具 = 计活**：判据 = **在途工具集非空即活**（不依赖心跳事件到达）。工具心跳清单 = **全量工具**——`runWithToolHeartbeat`（`src/engine/pipeline/toolHeartbeat.ts`）在 executeToolUse 统一包裹，无 per-tool 白名单，30s 间隔（`ATLAS_TOOL_HEARTBEAT_MS` 下限 100ms）——心跳是加速信号非计活必要条件；枚举缺口（心跳事件丢失/未注入 headless）由在途集判据兜底。
- **(d) retry backoff 窗 = 计活**：`turnRecoveryBackoffMs` + `sleepSignalAware` 窗（`src/engine/query/turnRecovery.ts:153-155`）内 reset——有界重试本身是进展，不触发。

**触发形**：fail-visible 结构化 watchdog 超时错误（不是 process.exit）→ 沿 R1 catch 域（`src/tui/screens/REPL.tsx:2755`）→ 错误行上屏 + queryGuard 复位（既有路径零新增消费面）；headless lane 经 crashBackstop 同链 stderr 面。可重入 = 复位清单（见③）。

## ② OS 外观三钉 + 读取触发点枚举

**三源优先序实现形**（顶层序：显式用户设置 > OSC 11 实测 > COLORFGBG > OS 外观 > dark）：
1. **显式设置**：config theme ≠ 'auto' → 直用，检测链整体不跑（`feature('AUTO_THEME')` 且 activeSetting==='auto' 才进入，ThemeProvider 既有门已核）。
2. **OSC 11 实测**：watcher 发 `\x1b]11;?` query → 读响应 → `themeFromOscColor`（`systemTheme.ts:66` parse 面已有）→ `setCachedSystemTheme`。实现点：stdin data listener 与 Ink raw-mode 共存（附加监听不消费）。
3. **COLORFGBG**：同步（`getSystemThemeName()` 既有 `detectFromColorFgBg()`）。
4. **OS 外观**（新增，一次性异步读回填缓存，`getSystemThemeName()` 改查缓存链 `COLORFGBG ?? osAppearanceCache ?? 'dark'`，禁恒 'dark' 兜底）：
   - macOS：`defaults read -g AppleInterfaceStyle`（子进程，超时 500ms 静默杀）——**语义钉：key 缺席 = Light，值 'Dark' = Dark**（缺席非错误）。
   - Windows：注册表 `HKCU\...\Themes\Personalize` `AppsUseLightTheme`（DWORD，1=light 0=dark）。
   - Linux：**无源**（不加 xdg-desktop-portal 依赖）→ 缓存不回填，自然落 dark。
5. **dark** 兜底。

**三钉**：
- **钉1 异步翻转走既有路径**：`setSystemTheme` state（ThemeProvider 既有）→ currentTheme → context value，零 UI 重建（消费形已核）；禁任何 React 树重挂。
- **钉2 失败/超时静默降级**：OSC 超时（定形 2s）/ defaults read 超时/注册表读失败 → 全部静默（不上屏不报错），降级到下一层；**禁卡启动**（watcher 全链 non-blocking：ThemeProvider dynamic import 已非阻塞；OS 读子进程 detached+timeout）。
- **钉3 读一次缓存不轮询**。**触发点枚举（恰二）**：① TUI 启动一次（挂载时 async 链启动）；② OSC 11 失败兜底读（OSC 超时后触发一次 OS 外观读）。除此之外零触发点（禁轮询/禁 theme 切换重读/禁 SIGWINCH 类事件）。

**首帧**：同步源播种（既有 `useState(() => getSystemThemeName())` 架构）——首帧 = COLORFGBG ?? dark；OS 外观异步就绪后经钉1 路径覆盖。macOS 无 COLORFGBG → 首帧 dark → OS 读回填翻 light（≤1s 窗，判据格②以此模拟断言终态 light）。

**stub 删除**：`src/tui/utils/systemThemeWatcher.ts` 真实现替入（`watchSystemTheme(querier, setSystemTheme)` 签名按 ThemeProvider 消费形保持）；判据格③ = stub 形 `(() => ({}))` 断言消失单源格。`AUTO_THEME` 入 `src/shared/feature.ts` ON_BY_DEFAULT（显式 `ATLAS_FEATURE_AUTO_THEME=false` 压过，feature() 既有语义零改）。CHANGELOG 登记句：主题检测缺省开启 = macOS 浅色终端灰字不可见修复本意。

## ③ A 升格三 lane 挂载点 + queryGuard 强制复位清单 + 恰一次 + TypeError 0 分域

**三 lane 挂载点（挂既有两注册点同链扩展，禁第三注册）**：
- **TUI lane**：`src/tui/utils/gracefulShutdown.ts:294-318` 既有 uncaughtException/unhandledRejection 处理器升格（log-only → 可见化+复位）。
- **headless lane**：`src/cli/crashBackstop.ts` 同链扩展（stderr 面已有；加在途 query abort 语义——headless 无 queryGuard，abort 信号链中止）。
- **probe lane（e2e）**：designated 探针消费同一升格信号（判据格注入面），非生产注册点。

**queryGuard 强制复位清单（写死，四项）**：
1. `queryGuard.forceEnd()`（`REPL.tsx:1949` 既有原语）——终态复位可重入；
2. 在途工具 abort——AbortController/信号链中止（在途工具集经 `inProgressToolUseIDs` 观测）；
3. 流状态复位——loopEvents pending 流 + `streamingToolUses` 清空；
4. 后台任务流收编——`LocalMainSessionTask` bgStream for-await（`LocalMainSessionTask.ts:410-445`）加 catch → 错误行上屏（同 R1 形），禁静默（判据格④）。

**错误行恰一次格**：单一上屏点 = 升格处理器内部 **latch + 聚合窗**（参照 DSH installFailLoud latch：首个异常为报告主体；窗内后续异常合并入同一错误行 details，不逐个刷行）。

**TypeError 0 格分域注记**：A 上屏 ≠ 主循环零逃逸计数归零——TypeError 0 格照登（canon 前 standing 面），与错误行可见格分域独立判定，互不抵消。

## ④ 切片 3 三钉

- **钉① UUID 锚单源复用点**：`computeSliceStart`（`src/tui/components/Messages.tsx:197`，`export for testing`）+ `SliceAnchor {uuid, idx}` + anchorRef（ Messages.tsx:187-196 设计注记：UUID 锚 immune to length churn，CC-941/1154/1174 教训域）。**视口压缩器消息区截断必须复用此实现**——延展形：压缩器把 cap 从常数 200 动态化为「剩余行数预算」传入 `computeSliceStart` 的 cap 参（签名已参数化，零改复用），禁第二截断实现。「N 条已入滚动区」提示行行数 = start 之前被截消息数。
- **钉② 小终端 <20 行退化规则（定形）**：视口行数 <20 → 保底集 = 输入框 min 高度（单行）+ 错误/提示行 + 「N 条已入滚动区」提示行 1 行，消息区全额归滚动区；视口 <5 行（极端）→ **完全退化为现状**（不做布局手术——保底集本身超预算，手术会挤出输入框，终端原生滚动接管）。中间域（≥20）走正常预算分配序。
- **钉③ 流式单帧超限竞态定形**：竞态 = 预算器计算时点（渲染前）vs 流式 chunk 同帧追加。定形：**流式块常数帽**——预算分配序 = 输入框/提示行全保 → 流式块限高（常数帽，定 24 行/块，超出部分折叠入「已入滚动区」计数）→ 消息区自尾截断。流式块按帽截断后单帧总高恒 ≤ 预算 + 提示行 → 输入框钉底不破（判据格「流式单帧超限不破钉底格」的实现本体）。
- **R3-B 五场景探针清单**：流式长块 / permission overlay / modal / 小终端 <20 行 / teammate hideSticky——探针先行，RED 缝即修。

## ⑤ 切片 1 三源优先序 + OSC 失败降级 + stub 删除

见②（①⑤ 共体：② 即切片 1 终形全量——优先序实现形 / 触发点枚举 / 降级链 / stub 替入 / ON_BY_DEFAULT / CHANGELOG 句）。

## 待 f4 确认点（3 项）

1. watchdog 挂点定 engine 侧（①的定形）vs TUI 桥——Main 判 engine 侧（豁免信息视野在 engine：permission 未决/在途集/backoff 窗均 engine 内观测，TUI 桥看不到）。
2. OSC 超时 2s / OS 读超时 500ms / 流式块帽 24 行三个常数——f4 认可或改值。
3. 小终端 <5 行完全退化规则（钉②）——接受「极端终端不做手术」或须另形。

## ⑥ 段 I 落码核销（2026-11-13，段 G 附页）

切片序 1→2→3 全部落码，commit 面：

| 切片 | commit | 内容 |
|---|---|---|
| 1 主题 | `21199f14` | watcher 真实现替入 + OS 外观第四源 + AUTO_THEME 缺省开 |
| 2-A 崩溃可见化 | `b77c9657` | crashRecovery 聚合窗恰一次 dispatch + REPL 错误行复位可重入 + headless abort 面 |
| 2-B 看门狗 | `c87b8621` | 回合内 120s 无事件自恢复 abort（四豁免 + outer 镜像 + env 可调） |
| 2-C defer 提示行 | `5eebb92f` | 常驻提示行「等待权限裁定，Esc 中止」+ 超时注记 |
| 3 钉底 | `b8a3c850` | inline 视口压缩器（钉①②③ 全钉 + 测量收缩环） |

**判据面测试**：`p0-theme-layered-detection` / `p0-crash-recovery` / `p0-loop-watchdog` / `p0-defer-suspend-hint` / `p0-viewport-compressor`（17 测）。

**钉①②③ 落码对表（切片 3）**：
- 钉①：`computeSliceStart` cap 参动态化（剩余行数预算，动态 cap 配 step=1），Messages.tsx 单源调用，无第二截断实现；「N 条已入滚动区」提示行 = `scrollbackHiddenCount`（start 之前被截消息数）。
- 钉②：`computeViewportPlan` 三态边界（<5 degraded / <20 fallback / ≥20 compress）+ 具名常数 `MIN_SURGERY_ROWS=5` / `MIN_COMPRESS_ROWS=20`；fallback = cap 0 保底集 + 流式块抑制。
- 钉③：`STREAMING_BLOCK_CAP_ROWS=24` 具名 + `capStreamingText` 截尾保尾 + 溢出行折叠入提示行计数；预算分配序单帧总高恒 ≤ 视口（第二重限高：窄视口下帽让位于输入框全保）。
- 测量收缩环：`InlineViewportCompressor` useLayoutEffect 实测整帧（measureElement）→ 溢出收缩 shrinkRows → resize 归零不回涨。

**canon 净域**：`FORCE_COLOR=3 CI=true bun test --isolate ./tests/` = **5924 pass / 0 fail**（125.6s，2026-11-13；Δ 容许面 = 本波新格族 17 测 + 切片 1/2 新测）。首轮 canon 静默挂死 2h14m（主进程 100% CPU + git 僵尸子进程未 reap）定谳为 runner 环境偶发事件，非测试面缺陷——重跑即绿，附此存照。

**R3-B 五场景 pty 探针**：归 e2e gate lane（标准链），Main 侧 = 纯判据面单测已覆盖（plan 边界 / 帽联动 / 锚不变式）。

## ⑦ t107 G5d 修形——判据 2 重冻落码（f4 D 批复 2026-11-13 @9e293efe 后）

- **判据 2 重冻（可见性底线格）**：任何 plan 形态（compress/fallback）下，视口内恒渲染最近回合内容（行级 tail）+ 提示行在场；「历史进滚动区」措辞 inline 车道废止（未渲染 ≠ 已入滚动区，t107 wire 直证）。
- **主修（行级尾保帽）**：`MESSAGE_TAIL_CAP_ROWS = 24`（与流式帽同值）——compress 支每条消息内容渲染前 tail 保尾 ⇒ 帧高严格有界 ⇒ 收缩步进必消除溢出 ⇒ surrender 仅剩 bottom 槽超视口极端域。**与钉① 单源边界**：钉① = 条数 slice 面（computeSliceStart），本帽 = 单条内容行级面，两层不冲突禁混源。
- **fallback 形重定义**：`capRows 1`（恒渲染最新 1 条 + `fallbackTailCapRows` 视口感知行级帽）+ 流式抑制 + 提示行——禁 cap 0 全盲；钉② <20 行保底集同 mode 同形自然统一（预期行为变化，判据重冻覆盖）。
- **措辞分域**：行级头折 = 「… N 行已折叠」（未渲染不称滚动区）；条数真滚动区 = 「N 条已入滚动区，↑ 翻看」保留。⚠️ t107 G5a 断言的流式行级提示文本随之变更（「行已入滚动区」→「行已折叠」），t108 判读账面同步。
- **生效域**：viewportRenderCap 在场车道；全屏支 / degraded / 缺省 200 路径零行为变更。
- **验证面**：单测 26/26（+4 新格：compress 收敛格〔1200 行单条 → 帽 24 < 预算 → hold 不 surrender〕/ surrender → 最近内容可见格〔重冻判据 2 直证〕/ fallbackTailCapRows 边界 / 窄视口 fallback 同形统一）；canon 5933 pass 0 fail（144.1s，Δ = +4 新格恰合）。

## ⑨ 五段闭环终态（2026-11-13）

- 生产 lane ⑦ PASS（`user-e2e/reports/r-20261113-prodlane-102.md`）：SRI
  四值全 MATCH（tgz sha1 = packument shasum 3a398fad… 恒等；cli.js 三点
  字节恒等 f291e4e5…/18,221,468B = 纯 bump 实证面）；安装品翻号 ✓ +
  PONG-102 GREEN（glm-5）+ O4/RS 双腿 TEAM-DELETE-OK 首试零残留 +
  TypeError 0。
- 0.1.102 P0 三切片波五段闭环终态达成。登记债无新增（2-A × Ink 渲染
  错误边界盲区已在 gate-102 报告登记池）。下波 = 0.1.103 S3a（f4 预
  登记在案）。
