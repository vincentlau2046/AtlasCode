# S0-R2 lock-face 呈批书（Main → f4）

> 依据：工单 `docs/2026-11-15-s0-r2-engine-carrier-ticket.md`（审计闭环 @ff386b1d §6-6 双信号②）。
> 审计四判据形 A 已裁（§6-3）；本文只做**落码前定形**：码面实锚勘正、形 A 终形、
> 必改级/必改钉落地修形、格 1-7 断言细化、Δ 预注册。批复前零产品码。

## §0 码面实锚（侦查结论，file:line 可复核；含工单引用勘正）

1. **paths.ts 实锚确认**：`src/engine/session/paths.ts:161-180` = 顶层 `VERSION`
   IIFE——`realpathSync(process.argv[1])` 起上行走、`existsSync`/`readFileSync`
   逐级探 package.json。工单引「paths.ts:161-180」**逐字吻合**（前轮勘疑
   「src/utils/paths.ts 不存在」系候选路径误列，非工单错引）。该 IIFE 在
   `import` 时即执行 fs 探测 = 载体图内**唯一 import-time fs 面**，必改级②
   惰性化对象。`getVersion()` 消费点：project.ts:695、engine/session/index.ts:69
   re-export、engine/index.ts:850 re-export（载体图内零调用，惰性化对 CLI 零行为差）。
2. **env.ts 实锚 + 工单引用勘正**：`src/engine/session/env.ts` 顶层状态两处——
   `:42 _sessionId = randomUUID()`、`:43 _originalCwd = process.cwd()`（import-time
   **进程面**，非 fs）。工单「env.ts 默认 HOME 合并」按现码勘正：HOME/CONFIG_DIR
   合并在 `:55-63 getProjectsDir()` 闭包内，**已是调用时求值**（per-call 读
   `process.env.ATLAS_CONFIG_DIR ?? homedir()`），非 import-time——不构成格 2
   违例，不修；import-time 面 = :42-43 两行，纳入必改级②惰性化（顶层 IO/env
   进程面归零，格 2 全局零差断言即可直证）。
3. **载体图顶层状态全量盘点**（entry→runtimeDefault→engine 闭包内，逐模块过）：

   | 模块 | 顶层状态 | 判定 |
   |---|---|---|
   | load.ts:683-697 | METADATA_MARKER_BUFS 等常量 | 纯内存，零 IO |
   | load.ts:1274 | `_sessionMessagesCache` Map | **必改钉①对象**（§3-3） |
   | paths.ts:36 | `_projectDirCache` Map | 纯内存惰性 memo，零 import-time IO |
   | paths.ts:161-180 | VERSION IIFE | **必改级②对象**（§3-1） |
   | env.ts:42-43 | randomUUID + process.cwd 捕获 | **必改级②对象**（§3-2） |
   | scanner.ts:33 | `_compactBoundaryMarker` | 头注明示「Lazy: first use」惰性 |
   | json.ts:25 | `bunJSONLParse` IIFE | import-time 读 `Bun` global（探测读）；node 目标下 `typeof Bun==='undefined'` → false 回落，零 IO 零写 |
   | firstPrompt.ts:98 | `builtinCommandNamesSource` holder | 域内注入缝（默认 no-op；载体图内 setXxx 零调用点） |

   **env 写面**：闭包内 `ATLAS_DISABLE_PRECOMPACT_SKIP` 仅读（load.ts:1055/1095
   `isEnvTruthy(process.env.…)`，调用时面）；`process.env.* =` 赋值闭包内 grep
   **零命中**。写面黑名单零命中现状成立（格 3 静态腿）。
4. **runtimeDefault import 面风险（形 A 新增必改）**：现
   `src/atlascode/web/runtimeDefault.ts:12-16` 从 `src/engine` **全门面**导入——
   门面 re-export query/loopDeps/pipeline 全纵切。形 A 下 runtimeDefault 入
   pack 图，若不改则全门面随 bundle = 格 4（TUI/CLI/应用探测零现）结构性不可
   过。必改窄化见 §3-4。
5. **shared barrel 牵入风险**：闭包内 `'../../shared'` **值导入** 3 处——
   env.ts:18（getConfigDirName）、paths.ts:28（sanitizePath）、load.ts:44
   （isEnvTruthy + logForDebugging）；firstPrompt.ts:24 / predicates.ts:15 为
   `import type`（擦除，零图影响）。barrel re-export 全 shared 域含 feature.ts
   （`bun:bundle`）——node 目标载体 build 不可牵入。必改窄化见 §3-4。
6. **出入口现状**：`createAtlasWebSessionRuntime` / `atlasWebSessionEngine`
   （runtimeDefault.ts:32/:50）**仓内零调用点**（grep 实证，CLI 接线属消费侧
   后续波）→ 改名零成本。`buildConversationChain` = load.ts:317 纯函数（链重
   建 + 孤儿并行 tool result 回收，零写面）。
7. **boundary scan 现状**：`scripts/atlasweb-kernel-boundary-scan.ts:33-37`
   FORBIDDEN_SOURCE_ROOTS 含 `src/engine` 整域——形 A 重形需目标侧子域豁免
   （§3-5）。既有测试 3 文件：tests/unit/web-session-runtime-lifecycle /
   -limits / web-session-v0-contract。

## §1 形 A 终形（工单 §6-3 裁定落地）

- **导出名**：`createDefaultReadonlySessionRuntime(options)`——现名
  `createAtlasWebSessionRuntime` 直接**改名**（§0-6 零调用点），不存别名。
  options 型 = `AtlasWebSessionRuntimeOptions`（= `Omit<ReadonlySessionRuntimeOptions,'engine'>`，现型保留）。
- **注入缝保留**（预答不变量，工单 §6-2）：`createReadonlySessionRuntime(options.engine)`
  必注入缝零动；`atlasWebSessionEngine()` cast 焊接保持（边界一次完成）。
- **零新 subpath**：`./web-session-runtime` 同出口扩具名导出；entry.ts 追加
  `export { createDefaultReadonlySessionRuntime, type AtlasWebSessionRuntimeOptions } from './runtimeDefault'`。
  build 管线（bun build entry.ts + tsconfig.web-session-runtime + d.ts 重写脚本）零改。
- **pack 格重形文本**（替旧「零 engine 泄漏」不变量）：
  > `./web-session-runtime` 出口加载图允许 `src/engine/session` 只读闭包
  > （readonly 子门面 + load 族纯函数 + 其域内依赖）；仍禁：src/tui /
  > src/engine 非 session 子域（query/loopDeps/pipeline/ports…）/ src/private-ui /
  > src/ui-private / CLI·TUI 执行入口 / 进程钩子（process.on）/ timer 连接 /
  > env 写面 / 应用级全局槽（globalThis 挂载）。

## §2 公开类型面逐型对表（必改钉②）

**公开面（entry.ts .d.ts 允许出现）**：现有 25 型/值面（readonlyRuntime 13 +
follow 1 + adapter 5 + projection 6 + errors 2）**零增零删**；新增仅 2：
`createDefaultReadonlySessionRuntime`（值）+ `AtlasWebSessionRuntimeOptions`（型）。

**内部禁现面（两出口 .d.ts 全树 grep 零命中，gate 断言件）**：
`TranscriptMessage`、`ReadonlyTranscriptLoad`、engine/session 内部型
（SessionEnv/ProcessedResume/TeamInfo 等）。成立性依据：factory options 型走
`AtlasWebSessionRuntimeOptions`（不含 engine 成员）；`atlasWebSessionEngine`
**不入** entry 导出面（模块内私有使用）；cast 全走 `as unknown`（边界一次
完成），d.ts 零内部型引用。`buildConversationChain` re-export 入 readonly 子
门面（§3-4）但**不入** entry 面。

## §3 修形四件（必改级② + 必改钉①②③ 落地）

1. **paths.ts VERSION 惰性化**（:154-184）：IIFE 求值体移入 `getVersion()`
   首调路径，模块级 memo 语义保留（头注「模块级缓存防 async 上下文 define
   bug」语义不变——缓存仍模块级，仅求值点后移）。import-time fs 探测归零；
   CLI 消费点（project.ts:695 等）调用时求值，值不变。
2. **env.ts 顶层进程面惰性化**（:42-43）：`_sessionId`/`_originalCwd` 改首访
   问捕获（getter 内 `??=` memo）。语义披露：捕获点从「模块装载时」后移至
   「首次调用时」——CLI 车道 import≈startup 等价；载体车道首调发生在 runtime
   使用期，冻结语义仍成立（进程启动 cwd 面不变式由 R-1 隔离测试复跑守卫）。
   `_cleanupHandlers`/defaultEnv 其余成员已惰性，零动。
3. **必改钉① = 缓存模块化迁移（机制面直断言）**：`_sessionMessagesCache` Map
   + 四函数（`getSessionMessages` / `clearSessionMessagesCache` /
   `primeSessionMessages` / `hasSessionMessagesCache`，load.ts:1274-1317）整体
   迁移新模块 `src/engine/session/sessionMessagesCache.ts`，**零行为变化**；
   load.ts 及消费点（record.ts / project.ts / scanner.ts / engine/index.ts /
   engine/session/index.ts re-export 面）import 重指向。载体 bundle 图内该模块
   **结构性缺席**（entry→runtimeDefault→readonly→load 闭包零引用）→ 机制断言
   = ① 载体 bundle 文本唯一符号（`primeSessionMessages` 等）零命中；② 载体
   dist .d.ts 零缓存导出；③ 格 5 双实例行为回归照跑。CLI 语义零差（R7 单一
   事实源 Map 原样搬家，四接缝共享同一实例不变）。
4. **runtimeDefault import 窄化 + shared barrel 窄化**：
   - runtimeDefault `from 'src/engine'` → `from 'src/engine/session/readonly'`
     （S0-R f4 批复 @f1f1099d 只读子门面；`readonly.ts` 追加
     `export { buildConversationChain }` re-export——纯函数入只读子门面合其
     章程「load 族纯函数复用」）。载体图收窄为 readonly.ts + load.ts + 域内
     依赖（env/paths/scanner/predicates/firstPrompt/json/types + 新缓存模块除外）。
   - 闭包内 `'../../shared'` **值导入** 3 处直连子模块：load.ts →
     `../../shared/env` + `../../shared/debug`；env.ts → `../../shared/configDir`；
     paths.ts → `../../shared/path`。feature/`bun:bundle` 及全 barrel 出图。
     零行为变化（同名函数同模块转发）。
5. **boundary scan 重形**（scripts/atlasweb-kernel-boundary-scan.ts）：新增
   输入 `allowedTargetSubroots?: readonly string[]`（目标侧豁免子域）；
   web-session-runtime 扫描形传 `['src/engine/session']`。scan 保持辅助信号
   定位（头注钉已存）；`src/engine` 其余子域 / src/tui / private-ui 目标仍禁。
   单测扩形 2-3 件（豁免内过 / 豁免外 src/engine/query 仍拦 / src/tui 仍拦）。

## §4 判据格 1-7 断言细化

| # | 断言形 |
|---|---|
| 1 | **载体可达**：e2e 独立装树 `npm pack` 安装 → node 真导入 `createDefaultReadonlySessionRuntime` + seeded fixture（真实 jsonl transcript）→ start/listSessions/replaySession/followSession 四面全链绿；对照列 = fake engine 集成腿（消费侧 G1 门内产物复用） |
| 2 | **导入纯度**：受控 HOME + 预载 fs 探针（wrap fs 全出口调用计数）+ globalThis 逐字段快照 → node 动态 import 载体 bundle → 断言 fs 计数零 / global 零差 / env 对象逐字段零差（读面也零）；对照：同 harness 导入后调 `getVersion()` 应见 fs 调用（探针活性自证，防假绿） |
| 3 | **只读纯度**：静态（闭包内 `process.env.*=` / `fs.write*` / `appendFile` / `process.on` / `globalThis.*=` grep 零命中——scan + 独立断言件双覆盖）+ 动态（真实 HOME 挂载跑四面，跑前后 HOME 目录树 hash 零差） |
| 4 | **pack 判据族**：① bundle 文本 scan 零 TUI/CLI 执行入口/进程钩子标记（`registerCleanup` 载体缺省 no-op 收集为域内语义，非进程钩子——断言件注明）；② d.ts 全树 §2 禁现面 grep 零命中；③ 载体 bundle 图 §3-3 缓存模块缺席断言；④ CLI build 独立（两 build 零共享 chunk 纪律保持）；⑤ scan（§3-5 新形）绿 |
| 5 | **双实例隔离**：同 sessionId 异 scope 双 runtime 交错读零串扰（R-1 反例形复跑于载体）+ §3-3 机制断言三件 |
| 6 | **回归零触碰**：两出口功能面零变（既有 3 unit 文件 + 消费侧 pairing 复跑）；**锚值披露**——三修形（paths/env/cache 迁移）文件均在 CLI 图内，cli.js 282b0085… 锚**必然变更**（行为零变，canon + 四件套守卫），预注册新锚值 + docs/upstream-pairing.md 配对增量（7,975B/38,652B 尺寸锚同步更新为新实测值）；变更源唯一性断言 = `git diff --stat` 恰为 §5 文件清单 |
| 7 | canon 恰合：全量跑，Δ = 新增/改形测试件数逐项对表 |

## §5 Δ 预注册

**src（11 文件）**：engine/session/{paths.ts, env.ts, load.ts, readonly.ts}、
新 engine/session/sessionMessagesCache.ts、engine/session/index.ts、
engine/index.ts、engine/session/{record.ts, project.ts, scanner.ts}（缓存
import 重指向）、atlascode/web/{runtimeDefault.ts, entry.ts}、
scripts/atlasweb-kernel-boundary-scan.ts。（12 文件 + 1 新建）

**tests**：unit 新 `tests/unit/web-session-runtime-carrier.test.ts`
（格 2 静态腿 + §2 对表 + 缓存模块缺席源级断言 + 改名面）≈8 件；既有
boundary scan 测试扩形 2-3 件；缓存迁移 re-point（既有 load/sessionStorage
缓存测试零改动绿 = 行为零差直证）。e2e lane：格 1/2/3/4/5 判据件（独立装树
+ 探针 harness）。canon 预期 Δ ≈ +11~12 件（6070 → ≈6082）。

**版本/发布**：0.1.117 候；段 L 前置 = e2e GATE-PASS + f4 采认双在案；
release 后单信号回 Atlasweb-F4（附新导出名/新锚值/配对增量 + G2 解阻）。
0.1.114 件 F 队列不抢。

## §6 请求裁定（五点）

1. 形 A 终形（§1：改名 `createDefaultReadonlySessionRuntime`、零别名、entry 扩导出、pack 格重形文本）；
2. 修形四件（§3：paths/env 惰性化、缓存模块化迁移、runtimeDefault+shared 窄化、scan 重形）；
3. env.ts 语义披露（首调捕获 vs 模块装载捕获）与工单「HOME 合并」勘正（已惰性，不修）认否；
4. 公开类型面对表（§2）认否；
5. 格 6 cli.js 锚披露形（§4-6：锚必变、变更源唯一性断言、新锚预注册）认否。

批复后 Main 落码 → e2e gate（格 1-7 按本表）→ 段 L 0.1.117 候 → 生产 lane → 单信号。
