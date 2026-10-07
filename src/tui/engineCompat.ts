/**
 * tui/engineCompat — UI 闭包 engine 兼容面（§8.72 TUI 壳波 Slice B 起）
 *
 * D-2a S8（M5 切端）形态 = engine 单星号 + tui 独有窄导出：
 *   - 全 core 名（compact/microCompact/autoCompact/context 簇 + query spine
 *     + coordinator/tasks 域）单源解到 engine 门面；LLM-bound 富体经
 *     engine DI 端口委托回宿主（tui/contextHostWiring，组合根
 *     createCoreDependencies 接线）——TUI 调用点零改动（engine 门面
 *     签名/形 = 旧 orchestrator 富体逐字）。
 *   - orchestrator 星号导出 + 全 5 个冲突块（compact 7 / microCompact 2 /
 *     autoCompact 9 / S1 engine 单源 7 / S6 HIGH GAP 5）随切端删除；
 *     tui-local orchestrator 目录（本体 S9 迁 contextBodies/）S9 删净。
 *   - 唯一 tui 独有导出 = useCompactWarningSuppression（React hook，引擎
 *     React-free 红线；store 已 engine 单源，hook 留 tui 壳订阅 engine
 *     store——S9 随本体迁 contextBodies/，本行 import 路径随改）。
 */

export * from 'src/engine'

// tui 独有：压缩警告抑制 React hook（引擎 React-free 红线，留 tui 壳）
export { useCompactWarningSuppression } from './contextBodies/compactWarningHook.js'
// D2（0.1.37 ③）：断路器跳闸态 React 订阅 hook（同 React-free 红线，留 tui 壳）
export { useAutoCompactCircuitFailures } from './contextBodies/autoCompactCircuitHook.js'
