/**
 * TUI 入口（React + Ink）— §8.72 TUI 壳波 Slice D 实装（task #152/#165）
 *
 * 真 main() = tui 域 main 薄 re-export（C-7 原样搬的旧仓 main.tsx：含
 * commander 解析面 + -p 支〔委托新 CLI 域 runHeadless，Slice B 头注〕+
 * 交互 mount 尾〔launchRepl 5 站点 → REPL React mount〕）。壳侧零业务逻辑
 * （L3 壳=接线，业务全在 tui 域）；startDeferredPrefetches = 旧仓 main.tsx
 * L341 同名导出（延迟预取面，TUI 启动后消费）。
 *
 * 消费方：`src/atlascode/launcher.ts`（TUI 默认启动支薄壳，S-C1 裁定）；
 * STR-1 门面：ui 面对外消费经 `ui/index.ts` 收口。
 */
export { main, startDeferredPrefetches } from 'src/tui/main.js'
