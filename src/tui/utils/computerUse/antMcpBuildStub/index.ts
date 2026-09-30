// 前向缝登记（§8.74.31 G-1，#197）：@ant/computer-use-mcp（Ant 内部 computer-use MCP 包，
// uninstallable）的 no-op build-aid stub。本文件经 tsconfig paths 别名（bare + /types +
// /sentinelApps 三 specifier 均指向本 index）内联进 bun build（--target node 单文件 ESM
// 闭包），使 node 加载期对 uninstallable 包零依赖（top-level import 不再悬空）。
// 落位 tui 域（computer-use 特征体所在域，全 4 站点 import 方均 tui，intra-element 边
// 满足 boundaries element-types / no-unknown / entry-point 三规则）。de-ANT：CHICAGO_MCP
// 等 feature 门控默认关，值导出运行期永不被真调用。真实现回流 = computer-use 域实施波
// （若 Atlas 需要）替换本 stub；de-ANT 终态 = 整族删除。

export const DEFAULT_GRANT_FLAGS: any = []
export const API_RESIZE_PARAMS: any = {}
export const targetImageSize: any = (_w?: number, _h?: number) => ({ width: 0, height: 0 })

export function buildComputerUseTools(..._args: any[]): any {
  return []
}
export function createComputerUseMcpServer(..._args: any[]): any {
  return { start: async () => {}, close: async () => {} }
}
export function bindSessionContext(..._args: any[]): any {
  return {}
}
export function getSentinelCategory(..._args: any[]): any {
  return undefined
}

// 类型导出（供 import type 站点消解；擦除期零运行期代码）。
export type ComputerUseSessionContext = Record<string, any>
export type CuCallToolResult = Record<string, any>
export type CuPermissionRequest = Record<string, any>
export type CuPermissionResponse = Record<string, any>
export type ScreenshotDims = { width: number; height: number }
export type CoordinateMode = 'logical' | 'physical'
export type CuSubGates = Record<string, any>
