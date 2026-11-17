# S0-R2 受支持 engine 载体出口波 — 段 I 落码波报告

> 状态：收口（0.1.122 B2 批量补记：所属波已完结并发布）

- 日期：2026-11-15（canon 定谳跨至 11-16）
- 工单：`docs/2026-11-15-s0-r2-engine-carrier-ticket.md` §6-3 / §7
- lock-face：`docs/2026-11-15-s0-r2-lockface-brief.md` @25cb7454（f4 批复 @351c74c4 工单 §7，通过五点 + 2 补充钉）
- 状态：段 I 完成（TDD RED→GREEN + 四件套 + canon 定谳）；待 e2e gate（格 1-7）→ 段 L 0.1.117 候

## 1. 落码表（Δ 预注册对账）

| 文件 | 修形 |
|---|---|
| `src/engine/session/paths.ts` | 修形① VERSION IIFE 惰性化（getVersion 首调求值 + 模块级 memo）；sanitizePath 导入窄化 `'../../shared/path'` |
| `src/engine/session/env.ts` | 修形② 顶层 randomUUID/process.cwd 首访问捕获（`??=` memo）；头注含语义披露（首调冻结 vs 模块装载冻结）；**补修**：`resetSessionEnv` 清捕获变量（见 §4-1） |
| `src/engine/session/sessionMessagesCache.ts` | **新建**：必改钉① 缓存整迁（Map + 四函数 + doesMessageExistInSession；零行为变化，载体图结构性缺席 = 机制直断言） |
| `src/engine/session/load.ts` | 缓存块 + doesMessageExistInSession 删除；`loadSessionFile` 改 export；shared barrel 窄化（env/debug 直连） |
| `src/engine/session/readonly.ts` | 只读子门面扩形：`buildConversationChain` re-export + `TranscriptMessage` 型（自 './types'） |
| `src/engine/session/project.ts` / `record.ts` | 缓存消费点改指 sessionMessagesCache |
| `src/engine/session/index.ts` | re-export 面拆分：缓存四函数 + doesMessageExistInSession 自新模块（消费面零变） |
| `src/atlascode/web/runtimeDefault.ts` | 改名 `createDefaultReadonlySessionRuntime`（旧名清零）；import 窄化只读子门面 `'../../engine/session/readonly'`（相对 specifier——d.ts rewrite 只认相对形） |
| `src/atlascode/web/entry.ts` | 追加导出 2 件（钉②）：factory 值 + `AtlasWebSessionRuntimeOptions` 型 |
| `scripts/atlasweb-kernel-boundary-scan.ts` | `allowedTargetSubroots` 豁免缝（钉死 `['src/engine/session']`；子域外目标照常判） |
| `tests/unit/web-session-runtime-carrier.test.ts` | **新建** 10 测试（源形状 + 行为锚 + factory 行为） |
| `tests/unit/atlasweb-kernel-boundary.test.ts` | +4：正腿 1 + 负腿 3（engine/query 仍禁 / src/tui 仍禁 / 子域外仍禁） |
| `tests/unit/arch-reorg-closure-0177.test.ts` | STR1_DEEP_IMPORT_EXEMPT 具名豁免（两形态）+ G-1 跳过 |
| `tests/func/web-session-runtime-pack.test.ts` | **补修**：R-3 按格 4 重形改写（见 §4-2）+ d.ts 公开符号列表补 2 |

### build 链配套修形（Δ 外披露，零 src 行为变化）

| 文件 | 修形 | 依据 |
|---|---|---|
| `tsconfig.web-session-runtime.json` | `types: ["node"]` → `["node","bun"]` | 闭内 json.ts/path.ts Bun 探测（运行时 `typeof` 守卫齐全，node 落 fallback）需类型声明；纯类型层 |
| `scripts/rewrite-web-session-runtime-dts.ts` | rewrite 目标支持 index barrel（`<spec>/index.d.ts` → `<spec>/index.js`；双形态皆无仍 fail-closed） | 闭内 type-only `'../../shared'` 导入 d.ts emit 解析到 `shared/index.d.ts`——lock-face §3-4 窄化范围本就只钉值导入，此为 build 链缺口 |
| `eslint.config.mjs` | boundaries `entry-point` 规则选项面无 `from` 过滤（实测 ESLEnterprise 校验拒绝）→ 改 files 作用域桶两件（engine 域 shared 四子模块直连 / runtimeDefault → session/readonly），语义等价 per-importer 豁免 | 呈批书 §3-4 具名豁免指令的实现形态适配 |

## 2. 验证证据

| 验证 | 结果 |
|---|---|
| 定向（carrier + boundary + arch-reorg + pack + config-endpoint + loop-deps-compose + loop-transcript-sink，绝对路径） | 51+194 pass / 0 fail |
| `npx tsc --noEmit` | 0 |
| `npx eslint src/` | 0 |
| `git diff --check` | 0 |
| `bun run build:web-session-runtime` | 全链绿（bun build 22 模块 + tsc emit + d.ts rewrite 62 specifier/56 文件） |
| 载体 bundle 结构断言 | `sessionMessagesCache` 缺席 ✓ / 新导出在场 ✓ / 旧名清零 ✓ / process.on/process.exit/globalThis 零 ✓ / env 写面零（仅 ATLAS_DISABLE_PRECOMPACT_SKIP 读 ×2）✓ / import 面 = node builtins only（fs/fs/promises/crypto/path + bare fs/promises）✓ |
| canon 全量（`bun test ./tests/`，第 4 跑） | 6084 tests / 498 files（= 6070+14：本波 14 新测试全绿）/ **fail 集 ⊂ 干净 HEAD 预存池（零增量）** |

## 3. 格 6 锚披露（补充钉①：预注册披露首例）

修形四件均在 CLI 图内 → **cli.js 锚必然变更**（行为零变化，canon 守卫）。本波 CLI build 锚值待段 L build 时实测，记入 `docs/sri/v0.1.117.md`。尺寸锚 7,975B/38,652B 同步更新。

## 4. 披露清单

1. **`resetSessionEnv` 行为补强**（canon 定谳产物）：旧形模块装载冻结常量天然跨 reset 存活（import 时已捕获 = 进程启动值）；新形首调捕获后，先跑文件捕获的脏值会穿越 reset 泄漏——reset 现同时清 `_sessionId`/`_originalCwd`（复位后下一次访问重新捕获）。该导出为测试 teardown 面（"复位=恢复域缺省"语义），CLI 车道零消费。
2. **R-3 pack 判据重形**（漏改 Δ 项，canon 定谳产物）：旧「零 engine 泄漏」不变量被形 A 推翻——按 lock-face §1 重形文本改写：允许面 = engine/session 只读闭包真体随 bundle + 新导出在位；禁面 = tui/private-ui/ui-private/engine 非 session 子域 specifier + process.on + env 写面 + globalThis 槽。timer 断言注明管辖范围：载体先存面 cursorLedger TTL setTimeout 为 S0-R 既有形态，非形 A 增量，不在格面。
3. **doesMessageExistInSession 随迁**：load.ts 内唯一缓存读取边，随钉①整迁 sessionMessagesCache.ts（保持载体图零缓存引用的结构性保证）。
4. **STR-1/eslint 具名豁免三处同步登记**：eslint files 作用域桶（2）+ arch-reorg-closure STR1_DEEP_IMPORT_EXEMPT（唯一合法域深 import = runtimeDefault → session/readonly）+ boundary scan allowedTargetSubroots（钉死 `['src/engine/session']`）。
5. **canon 漂疑定谳（f4 采认 @8ef0d74e 工单 §8 裁定）**：~~master canon 基线漂移~~ **主张撤回**——f4 本机独立跑 ca761a91 = 6084 pass / 0 fail / 498 files（125.18s）全绿；#391 基线→351c74c4 间 master 仅 docs 提交，121 fail 解读不成立为 master 状态事实，定性 = 本 lane 测量环境态污染（lane-local）。**定因 triage 项（登记，下次 canon 报数前执行）**：三 lane 共享同一 working checkout + `~/.atlas` 配置面——嫌疑① canon 内 pack 测试 beforeAll rebuild `dist/web-session-runtime`，与并发 lane 的 gate/build 互踩；嫌疑② 共享配置面污染（known_marketplaces 重复条目断言即此证据）；嫌疑③ 并发负载（f4 125s vs 本 lane 420s 吻合）。裁定遵行：格 7 以 e2e 受控环境独立跑为判定基准；fail 子集纪律（118⊂121）不采认为判定基准。
6. **格 2 探针待 e2e**：导入纯度探针（载体车道零 env 写/进程钩子实测）按判据格在 e2e gate 件执行。
7. **worktree 旧副本噪声**：`worktrees/atlas-family-p0` 内旧测试副本会被 bun test 相对路径过滤误命中（canon 用 `./tests/` 前缀不受影响）；该 worktree 删除候裁定在案（待用户）。

## 5. 后续

- e2e gate：格 1 载体可达 / 格 2 导入纯度探针 / 格 3 只读纯度 / 格 4 pack 判据族（d.ts 泄漏 + 缓存模块缺席 + cli.js 联动）/ 格 5 双实例 / 格 6 锚披露 / 格 7 canon（判据格按 lock-face §4 表）
- 段 L 0.1.117 候（前置 = e2e GATE-PASS + f4 采认双在案）
- 生产 lane → 单信号回 AtlasWeb-F4（新导出名 / 新锚值 / 配对增量 + G2 解阻）
