/**
 * atlascode（壳） 模块唯一公共出口（STR-1 门面规则）。
 *
 * 将 re-export: cli/launcher/identity/mount/compose/ui/state/marketplace/featureConfig/evals
 *
 * 实现波次: B6-func 起逐步填实（compose 组合根 = 全仓唯一跨 8 域装配点，charter L4.7）。
 * 其余子模块（cli/launcher/ui/state/marketplace/…）仍 A 波占位，随各实现波次填实。
 */
export {
  createCoreDependencies,
  getCoreDependencies,
  resetCoreDependencies,
  type CoreDependencies,
} from './compose'
export { createEndpointConfigSource } from './adapters/endpointConfigSourceAdapter'
