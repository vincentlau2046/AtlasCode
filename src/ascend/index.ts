/**
 * ascend 模块唯一公共出口（STR-1 门面规则）。
 *
 * M3（D-3 Ascend 独立实施波）：
 *   - S2：executor 地基（AscendExecutor + mock port + fixtures + types +
 *     toolchain 接口 + defaultAscendConfig）。
 *   - S3（本切片）：16 工具 + KernelBackend 三后端 + constants/foldUtils/execUtil
 *     + executor 组合根注入点（getAscendExecutor / setAscendExecutor）。
 *   - S5（后续切片）：ascendPackage: DomainPackage 四元组挂载面（tools + skills +
 *     prompt + executor 聚合），供 mount.ts DEP-5 实挂载消费。
 */
export { AscendExecutor } from './executor/AscendExecutor'
export {
  DefaultAscendMockPort,
  type AscendMockPort,
} from './executor/AscendMockPort'
export {
  ASCEND_MOCK_FIXTURES,
  argSigFromArgs,
  resolveFixture,
  type MockFixture,
} from './executor/ascendMockFixtures'
export { type NpuToolchain, applyToolchainPlaceholders } from './executor/toolchain'
export { type AscendConfig, defaultAscendConfig } from './executor/types'
// executor 组合根注入点（16 工具经 getAscendExecutor 取实例；S5 mount 装配后
// setAscendExecutor 替换）
export {
  getAscendExecutor,
  setAscendExecutor,
  resetAscendExecutorForTests,
} from './executor/instance'

// 16 工具 + KernelBackend 三后端 + constants/foldUtils/execUtil（S3）
export * from './tools'
