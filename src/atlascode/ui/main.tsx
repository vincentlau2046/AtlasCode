/**
 * TUI 入口（React + Ink）— §8.72 TUI 壳波 Slice D 实装（task #152/#165）
 *
 * 真 main() = tui 域 main 薄 re-export（C-7 原样搬的旧仓 main.tsx：含
 * commander 解析面 + -p 支〔委托新 CLI 域 runHeadless，Slice B 头注〕+
 * 交互 mount 尾〔launchRepl 5 站点 → REPL React mount〕）。壳侧零业务逻辑
 * （L3 壳=接线，业务全在 tui 域）；startDeferredPrefetches = 旧仓 main.tsx
 * L341 同名导出（延迟预取面，TUI 启动后消费）。
 *
 * /model 选择器 "undefined" 修（§8.74.31，task #202）：TUI bin 支（atlascode/
 * cli.ts 无参 / atlas code）不经 headless 的 compose 接线（cli.ts:56 getCoreDe
 * pendencies 在 TUI 支 line 54 早返之后才执行）→ 组合根懒单例仅被后续消费者触
 * 发 → main.tsx main() 早期 getInitialMainLoopModel()（main.tsx:1735）读 role
 * 池时 EndpointConfigSource 停空 stub → 若 getInitialMainLoopModel 返回 undefin
 * ed，appState.mainLoopModel 冻结 undefined → 选择器 modelDisplayString(undefined)
 * 渲染 "undefined ()" 伪行。该缺陷已在 tui 域根修（bootstrapState.ts getInitia
 * lMainLoopModel `?? null`，本文件保持薄 re-export 不动——atlascode/ui 边界
 * 禁 value-import tui entry-point，boundaries/entry-point 硬约束）。
 *
 * 消费方：`src/atlascode/launcher.ts`（TUI 默认启动支薄壳，S-C1 裁定）；
 * STR-1 门面：ui 面对外消费经 `ui/index.ts` 收口。
 */
export { main, startDeferredPrefetches } from 'src/tui/main.js'
