/**
 * atlascode（壳） 模块唯一公共出口（STR-1 门面规则）。
 *
 * 将 re-export: cli/launcher/identity/mount/compose/ui/state/marketplace/featureConfig/evals
 *
 * 实现波次: B6-func 起逐步填实（compose 组合根 = 全仓唯一跨 8 域装配点，charter L4.7）。
 * 其余子模块（cli/launcher/ui/marketplace/…）仍 A 波占位，随各实现波次填实。
 * state 域 D 波 S-E2d 提交 2（B13）填实（atlascode/state，见下）。
 */
export {
  createAgentLoopDeps,
  createCoreDependencies,
  getCoreDependencies,
  // S-E2d（§8.68 remote 波）⑭：MCP 连接生命周期组合根接线（显式动作；
  // CLI 波启动消费接缝，builder 路径不自动触发）
  initMcpConnections,
  resetCoreDependencies,
  runCoreCleanup,
  type AgentLoopDepsBundle,
  type AgentLoopDepsConfig,
  type CoreDependencies,
} from './compose'
// S-E2d（§8.68 remote 波）⑭：MCP 组合根桥 4 面（L3 顶域 ↛ engine，
// 映射面归组合根；tests 经根门面引，非深路径）
export {
  bridgeMcpToolClient,
  buildMcpEngineConnections,
  collectMcpPromptCommands,
  mapMcpPromptCommands,
  syncMcpClientRegistry,
} from './adapters/mcpBridge'
export { createEndpointConfigSource } from './adapters/endpointConfigSourceAdapter'
// D 波 S-E2d 提交 2（B13）：state 域真实现（EngineState<SessionSnapshot> 串行
// apply 队列置换 React 批处理；A7 闭包壳 sessionContextPortAdapter 经
// strangler 整换后零引用删除）。
export { createAppState, type AppState } from './state'
export { createSessionMemoryPort } from './adapters/sessionMemoryPortAdapter'
// S-T4 ⑧（§8.53）：sandbox 适配器（SandboxManager → ExecutorSandboxPort，含
// shouldUseSandbox 委托）经根门面转出（STR-1；tests 经此引，非深路径）。
export { adaptSandboxToExecutorPort } from './adapters/sandboxAdapter'
