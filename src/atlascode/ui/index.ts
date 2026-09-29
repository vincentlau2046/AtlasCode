/**
 * TUI 门面（STR-1 门面收口：ui 面对外消费只经本文件）
 *
 * §8.72 TUI 壳波 Slice D（task #152/#165）：薄 re-export ui/main
 * （→ tui 域 main() + startDeferredPrefetches）。.tsx 本体原样搬不重编译
 * （C-7，落位 src/tui/，Slice B）。
 */
export { main, startDeferredPrefetches } from './main.js'
