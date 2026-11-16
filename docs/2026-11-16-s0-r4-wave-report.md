# S0-R4 合并单波（0.1.119 候）— 段 I 落码波报告

- 日期：2026-11-16
- 工单：`docs/2026-11-16-s0-r4-searchsessions-ticket.md` @f0c4d19a（§8 @48ce2002 / §9 @93c7425a）
- lock-face 呈批书：`docs/2026-11-16-s0r4-0120-lockface-brief.md` @f16b838d（f4 §10 统一批复 @7ecf0fa4，L1-L8 全批）
- 状态：段 I 完成（TDD RED→GREEN + 四件套）；待 e2e gate（格 1-6）→ 段 L 0.1.119 候

## 1. 落码表（Δ 对账）

| 文件 | 修形 | 批复锚 |
|---|---|---|
| `src/engine/session/scanner.ts` | `TRANSCRIPT_READ_CHUNK_SIZE` 改 `export` 单源（f4 §10 补钉：禁第二常量） | L4 |
| `src/engine/session/load.ts` | ① 授权支 flags 加 O_NOFOLLOW（Windows `undefined ?? 0` 守卫跳过，平台注记）；② opts 加性 `expectIno?: number`，open 后 fd.stat().ino 比对 → 复用 `TranscriptChangedDuringReadError`（零新错误类型）；③ `fd.readFile()` → 位置化分块读（目标长 fst.size 恒定快照，块长单源 chunk 常量，累计分配 = fst.size ≤ maxBytes；读不满 → 同定型错）；读毕 fst2 复核面不变。**默认臂逐字节恒等**（分账 A） | L3/L4 |
| `src/engine/session/readonly.ts` | `loadTranscriptFull` opts 透传 `expectIno`（加性） | L3 |
| `src/engine/session/search.ts` | 两处窄化补齐（`memories ?? []` / `prompt ?? []`）——pack 严格 tsconfig（noUncheckedIndexedAccess 域）新入图暴露；零行为变化（缺席字段在有效载荷中恒在场） | L5（载体图扩形配套） |
| `src/atlascode/web/readonlyRuntime.ts` | ① 接口第四面 `searchSessions(req, signal?)` + Request/Result 类型；② 实现（见 §2）；③ `loadProjection` 传 `expectIno: stPre.ino`（F1 授权锚：既有双采样 pre-stat 复用，零新采样点）；④ engine 缝 opts 型加 `expectIno` | L1/L2/L3 |
| `src/atlascode/web/entry.ts` | 公开类型面 +2 型（SearchSessionsRequest/Result，code-form 逐型随契约） | L5 |
| `eslint.config.mjs` | scoped 桶扩一件：readonlyRuntime/follow → engine `session/readonly.ts`+`session/search.ts`（follow.ts/readonlyRuntime.ts 的 readonly 允许为**既有缺漏补登记**——grep 实证 HEAD 基线已红 2 处） | L5 |
| `tests/unit/arch-reorg-closure-0177.test.ts` | STR1_DEEP_IMPORT_EXEMPT 扩 `session/search`（两形态） | L5 |
| `tests/func/web-session-runtime-pack.test.ts` | 格 5 正腿：`RENDERED_AS_SENTINEL` 在 bundle（search 域入闭包直证）；非 session 子域负腿既有不动 | L5 |
| `tests/unit/s0-r4-load-hardening.test.ts` | **新建** 7 测试（格 3 ×4 + 格 4 ×3） | §3 |
| `tests/unit/web-search-sessions.test.ts` | **新建** 13 测试（格 1 ×5 + 中止腿 ×2 + 双界 ×2 + 格 2 ×1 + 格 5 ×1 + 契约 ×2） | §3 |

## 2. searchSessions 装配语义（L1 落码形）

- 会话集 = `adapter.listSessionFiles`（与 listSessions 同源同序 mtime desc）；越 `maxScanSessions` → resourceLimit。
- 每会话：`adapter.statTranscript` ino 采样（F1 锚；null = mid-scan 删除诚实跳过）→ engine 缝 `loadTranscriptFull(filePath, { maxBytes, expectIno })`（opts 在场支 = fd 链域）→ terminal leaf 选取（projection.ts 同规则镜像）→ `buildConversationChain` 有效会话投影链 → 逐消息 `renderableSearchText`（search.ts 真体，WeakMap 缓存 + RENDERED_AS_SENTINEL 防虚影）匹配。
- query 匹配 = 双侧 toLowerCase 码点折叠；死分支不搜索（防虚影）。
- snippet = 命中起点起 ≤512 code points（`Array.from` 保 surrogate 完整）。
- 取消语义 A：acquireRead 后 / per-session / per-record 三级检查点 → `WebSessionError('cancelled')`，零 partial payload。
- 分页：opaque offset cursor（`\d+` 校验，非法 → invalidRequest；越界 → 空页容忍 mtime 漂移）；粒度 = 会话边界。
- 双界单源 limits.ts：maxScanSessions × maxParseRecords。

## 3. Main lane 判读披露（候 f4 复核采认）

1. **search 载入的 expectIno 锚**（呈批书未显式点名）：L1 说「载体形，opts 在场支 = fd 链域」+ L3 定义 expectIno 臂，但 search 无既有 pre-stat。落码取 per-session `adapter.statTranscript`（adapter 既有 O(1) 通道，非 TOCTOU 三元组意义的新采样点）→ `expectIno: st.ino`。与 F1 授权锚定同形（F1 findings 的 search 面闭合）。
2. **mid-scan 删除跳过**：`statTranscript` null → 跳过该会话（授权集已不含，非 partial payload 泄露面——'cancelled' 零 partial 纪律管中止，删除是授权集真值变化）。
3. **TranscriptChangedDuringReadError 映射**：search 载入中错配 → ioUnavailable retryable（与 replay 既有映射同族，fail-closed 不静默跳过）；活跃 session append-during-read 同触发（§10-3(a) 注记沿承：变更面本就 resetRequired 同语义）。
4. **分页粒度 = 会话边界**：pageToken 指向次会话（同会话命中整会话交付，页可超 pageSize 于单会话多命中时——L1「会话列表序内偏移」的诚实读法）。
5. **maxParseRecords 核验点 = 加载后**（messages.size 计数）：字节界 maxBytes 已预解析拦截（loader fstat 检查点）；零 load.ts 触碰前提下的诚实核验位。
6. **eslint 桶补登记**：follow.ts/readonlyRuntime.ts 的 `session/readonly.ts` deep-import 在 HEAD 基线已红 2 处（S0-R2 波 scoped 桶漏列两 importer，其波四件套以缓存态漏检）——本波补入同桶。
7. **search.ts 两处窄化**（`?? []`）：pack 严格 tsconfig 新入图暴露 TS18048；缺席字段在有效载荷恒在场，零行为变化。
8. **[自动安全审查 CWE-400/HIGH 复核] maxParseRecords 核验点 = 加载后**（§3-5 同点）：审查建议 pre-parse 逐 record 计数需 load.ts 加 maxRecords loader 参数——**新 lock-face 项**，超出本波 F1/F2 预注册修形面（「零 load.ts 触碰前提」是 L3 修形边界的一部分），按预注册纪律不擅改，候 f4 裁定。有界性分析：load 分配已由 maxBytes 预解析 stat 检查拦截（loader fstat 检查点），解析 CPU 功上界 = maxTranscriptBytes 字节量——不存在无界分配或无界解析；record 计数滞后仅影响「解析完成后的计数拒绝时点」，非资源无界。
9. **[自动安全审查 CWE-770/MEDIUM 复核] 分页粒度 = 会话边界**（§3-4 同点）：审查建议 message 级复合 cursor（session+message 双位）——pageToken 形状变更 = L1 预注册形变更，同上候 f4 裁定不擅改。有界性分析：页超 pageSize 仅发生在「单会话命中数 > 剩余页容量」时，超发上界 = 单会话命中数 ≤ maxParseRecords × snippet ≤512 code points——超发有常数上界（双界已核验后），非资源无界；同会话整会话交付是 L1「会话列表序内偏移」的批复读法。另审查建议 3「resource-limit 错误不得被泛 catch 吞」已核实不适用：runtime 层 try 仅映射 TranscriptTooLargeError/TranscriptChangedDuringReadError 两定型错并 rethrow 其余（readonlyRuntime.ts:629-645），resourceLimit/ioUnavailable 以 WebSessionError 分态直达 wire 契约映射面。

## 4. 验证证据

| 验证 | 结果 |
|---|---|
| 定向：s0-r4-load-hardening + web-search-sessions | 20 pass / 0 fail（RED→GREEN：初跑 13 fail 实证） |
| 回归：carrier + boundary + s0-r3-hardening + pack + arch-reorg | 全绿（boundary 20/20、arch 15/15、pack 6/6 含新正腿） |
| `npx tsc --noEmit` | 0 |
| `npx eslint src/` | 0（含 HEAD 基线既有 2 红补登记后） |
| build:web-session-runtime | 全链绿（bun build 23 模块 + tsc emit + d.ts rewrite 63 specifier/57 文件） |
| canon `bun test ./tests/` | 见 §5（共享 checkout 环境基线池对账口径） |

## 5. canon 定谳

- canon 全量：`bun test ./tests/` → 5990 pass / 118 fail / 6108 tests / 501 files（427s，exit 计口径同先例）。
- 基线对账：fail 集 115 条（去重后）vs 干净 HEAD 全量基线池 118 条（`canon-baseline.log`，2026-11-16 00:03，f4 独立环境全绿先例同源）——**NEW 侧空集（零增量）**，GONE 侧 3 条均为 C85-D JSONL flaky 家族（同文件姊妹测试在本轮 fail 集仍有一条，环境波动非代码面）。
- 本波新增/触碰测试面（s0-r4-load-hardening / web-search-sessions / arch-reorg / web-session-runtime-pack）**零 fail**。
- 定谳：**canon 零增量，段 I 验证全绿**。

## 6. 格 6 锚变更预注册披露（补充钉①）

- `dist/web-session-runtime/index.js`：69,863B（0.1.118）→ **78,031B**（sha256 `58bbe3c3`…）——search 域真体随形 A 载体 + F1/F2 load.ts 修形入闭包（L5 预记「双锚必然变更」兑现前半）。
- `dist/web-contract/index.js`：**7,975B 恒等**（0.1.115 起七版恒等）。
- cli.js 锚（e2e lane 独立实测）：**18,215,220B / sha256 `f4b1e4d0`…`f3bee8`**（段 L 对表值）。

## 7. 后续

- ✅ e2e gate：**GATE-PASS @944fc3e5**（判定单 `user-e2e/reports/r-20261116-gate-s0r4.md`，格 1-6 + 消费三腿 + canon 独占 6108 tests / 501 files / bun_exit=0 / 148.81s 全绿零 fail——干净形态强于 fail 池口径；格 1 P2=2 命中单会话整交付 = §3-⑨ 超发披露形实证）。
- 段 L 0.1.119：**双在案成立**（GATE-PASS @944fc3e5 + f4 §11 采认 @97f52c6f——判读披露 1-7 全采认，⑧⑨ 终裁「有界非无界」，两件入登记池候下波 load.ts lock-face）→ bump + release 全链。
- 0.1.120（L6-L8）同呈批书串行在后。
