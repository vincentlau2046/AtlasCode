# S0-R R-3 波报告（engine 解耦 + ./web-session-runtime 出口 + 安全审查修复）

日期：2026-11-15。工单 `docs/2026-11-15-atlasweb-s0-upstream-delivery-ticket.md` §4.5
+ f4 §5.7 @98c51bd6（R-3 继续批准 + 终态对钉死）。序列：R-2（c03f8b60）→
**本波 R-3** → U+R 合流段 G/段 L。

## 落码面

| 文件 | 内容 |
|---|---|
| `src/atlascode/web/projection.ts`（重写） | **零 engine 导入**：`ProjectionSourceMessage` 结构面 + `ProjectionEngineDeps` 注入缝 + `serializedProjectionBytes`（replay/follow 共享字节口径）+ `computeLeafUuids`（镜像同步义务头注）+ `projectConversation(load, meta, engine)` 三参 |
| `src/atlascode/web/follow.ts`（重写） | FollowDeps 加 `buildConversationChain` 注入缝；**f4 §5.7 终态对钉死**（closed 恒唯一 terminal kind：error → error+closed 成对、终态后零数据事件、stripTerminalFromQueue 高优先覆写）；**安全审查 HIGH③ 修复**（订阅槽 worker 实停才释放：run() finally releaseOnce + workerDoneResolve；close() 加盟 workerDone 2s 界）；**§4.3 一致 snapshot**（baseline 前后双采样三元组全等方采纳，3 次有界重试 → ioUnavailable retryable） |
| `src/atlascode/web/readonlyRuntime.ts` | **engine 注入缝**（`ReadonlySessionEngine` 必填 options，去 'src/engine' 直接导入）；replay 加前后双采样一致性守卫（**安全审查 HIGH① TOCTOU 交付侧修复**：loader validated-fd 关闭后重开窗口的一致 snapshot）+ `serializedProjectionBytes ≤ maxProjectionBytes` 交付界（**安全审查 MEDIUM② 交付侧修复**：零半投影） |
| `src/atlascode/web/runtimeDefault.ts`（新） | CLI 真体装配：engine 真体注入 + **cast 焊接边界**（engine TranscriptMessage → 投影源结构面；**不进 pack 图**）；`atlasWebSessionEngine()` 供测试复用 |
| `src/atlascode/web/contract.ts`（新） | contract 类型闭包 shim：相对路径 re-export WebSessionEvent/WebSessionProjection（pack d.ts 相对可解析、零仓库内 specifier 泄漏） |
| `src/atlascode/web/entry.ts`（新） | `./web-session-runtime` pack 出口：纯 re-export 面（runtime factory + 类型 + adapter 注入缝 + 投影类型 + WebSessionError），零副作用（禁入口导入就跑 CLI）、零 engine/TUI/TSX 泄漏 |
| `tsconfig.web-session-runtime.json`（新） | rootDir src / outDir dist/web-session-runtime / declaration+emitDeclarationOnly / types:["node"] |
| `package.json` | exports `./web-session-runtime`（types→import→default）；`build:web-session-runtime`（bun build --target node --external zod + tsc + index.d.ts stub）；prepublishOnly 扩链 |
| `src/engine/session/load.ts` 等 | 零改动（R-2 已落 precompactSkip 'force-full'） |

## 自动安全审查处置表（commit/push 双触发 findings）

| # | 级别 | finding | 处置 |
|---|---|---|---|
| ① | HIGH | resolveTranscriptPath TOCTOU（validated fd 关闭后按路径重开） | **交付侧修**：replay loader 车道加前后双采样三元组一致性守卫（readonlyRuntime.loadProjection）；follow baseline 同守卫（issueBaseline 双采样 + 3 次有界重试）。validated-fd 单次打开链不动（呈批书 §7.4 钉死形） |
| ② | MEDIUM | replay 无 maxProjectionBytes 交付界 + loadFull 无 bounded parser | **交付界已修**：replay/follow 投影序列化字节 ≤ maxProjectionBytes，超界 resourceLimit（零半投影）；transcript 尺寸界先于 loadFull（R-2 已有）。**loader 级 bounded parser 见下呈报** |
| ③ | HIGH | follow 生命周期竞态（close 于 issueBaseline 期间 → poll worker 存活但槽已释放） | **全修**：releaseOnce 移入 run() finally（worker 实停才释）；close() 加盟 workerDone（有界 2s）；interrupted() 每 await 后复检；回归测试「close 于 worker 运行期 join 后槽实放」（maxSubscriptions:1） |

## 呈报（锁面预注册纪律，待 f4 裁定后实施）

**loader 级 bounded parser**（②的另一半）：呈批书 §7.3 钉死 loadTranscriptFull
为唯一修形消费点（precompactSkip 'force-full'），loader 内逐行字节界解析
不在预注册形内。本波**未实现**（实现先行再追认违反预注册纪律）；现状
防线 = transcript 尺寸门（64/256MiB）先于 loadFull + 投影字节交付界。
如 f4 裁定加严（loader 逐行 maxRecordBytes 拒），请改预注册形后落码。

## 测试（预注册 +2 文件 ~10 测试 → 实数 +3 文件 +12 件，披露见下）

- `tests/func/web-session-runtime-fs.test.ts`（新，5 件）：双 scope 同
  sessionId 不串扰反证 / symlink 枚举跳过+读取拒 / 未 start 拒+close 后拒 /
  并发读上限 gated adapter（不排队+释放后再读）/ close 幂等+adapter.close 恰一次
- `tests/func/web-session-runtime-pack.test.ts`（新，5 件）：bundle 存在+
  零 zod/contract 依赖+零副作用入口 / d.ts 类型闭包（contract 相对闭包在位+
  零 `src/` specifier）/ bundle 加载图零 engine 泄漏（loadTranscriptFile/
  recoverOrphanedParallelToolResults 零命中）/ node ESM 真导入+factory 可用 /
  exports 条件序+prepublishOnly 扩链
- 既有改形：follow 测试 untilTerminal 改消费到 closed（f4 终态对断言：
  error 后须 closed 且紧邻、终态后零数据事件）+ abort 件改形 + 新增
  槽实放/投影字节界两件；lifecycle/limits makeRuntime 全接 engine 注入；
  web-contract-pack prepublishOnly 断言扩链同步。

## 验证

- 新/改测试全绿（41 件 lifecycle+limits+follow / 15 件 fs+pack+contract-pack）。
- `npx tsc --noEmit` 0；`eslint src/` 0。
- canon（CI=true FORCE_COLOR=3 bun test --isolate ./tests/）：
  **6032 pass / 0 fail / 496 文件**（R-2 基线 6020/0/494，Δ+12/+2 恰合
  ——新增 10 件（fs 5 + pack 5）+ follow 内新增 2 件（槽实放/投影字节界），
  其余为既有件改形非增量）。

## 偏离与披露（f4 §5.6 纪律）

1. **预注册实数**：+2 文件 ~10 测试 → 实数 **+3 文件 +12 新件**（fs 5 +
   pack 5 + follow 内新增 2 件；contract-pack 既有件断言改形随 R-3 扩链
   （prepublishOnly）连带，非新增）。加严向（预注册按 ~10 合件计，
   follow 两安全回归件独立成件），无松弛。
2. **bundle 零 zod 依赖**（预注册预期 --external zod 保留 import 形）：
   实际 contract shim 为纯 type re-export，bundle 根本不含 zod（校验面
   归 wire 层）。--external zod 标志保留（防御性，未来加运行时校验时
   语义即生效）。披露为偏差修正非口径松弛。
3. **安全审查处置**：上表三 findings，①② 交付侧修复落地，② 的 loader
   级 bounded parser 呈报待裁（预注册纪律）。

## 腿 6 修形（gate RED 单红面 → §5.9 @544caa07 批复后落码）

- **红面**：e2e 合流 gate 腿 6——R 出口 d.ts 树相对 specifier 无扩展名
  （emitDeclarationOnly 沿 bundler resolution 风格发射），node16/nodenext
  严格 ESM 消费者 TS2834 拒编译（5 处）；bundler 消费全净。
- **修形**（f4 §5.9 四条钉死）：`scripts/rewrite-web-session-runtime-dts.ts`
  post-emit 重写 dist 树 .d.ts——仅相对且无扩展名 specifier 加 `.js`；
  bare/已带 .js 零触碰；fail-closed（歧义形/目标 .d.ts 不在 → 报错退出）；
  幂等（重跑零差）；零源码触碰。挂 `build:web-session-runtime` 链尾
  （第四段）；prepublishOnly 面不变。
- **测试**：pack leg 2 加相对 specifier 必带 .js 断言（RED 先行）+
  node16/nodenext 消费编译 smoke（skipLibCheck 刻意 false——TS2834 在
  .d.ts 内，开了失去判别力；GREEN 判据）+ 重写幂等断言（`rewrote 0`）。
- **采认面**：安全审查 follow worker 逃逸 rejection 修复（run() catch-all
  翻译终态对）f4 §5.8-8 @18c07542 追认在案。
