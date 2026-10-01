/**
 * ascend 模块唯一公共出口（STR-1 门面规则）。
 *
 * M3（D-3 Ascend 独立实施波）：
 *   - S2：executor 地基（AscendExecutor + mock port + fixtures + types +
 *     toolchain 接口 + defaultAscendConfig）。
 *   - S3：16 工具 + KernelBackend 三后端 + constants/foldUtils/execUtil
 *     + executor 组合根注入点（getAscendExecutor / setAscendExecutor）。
 *   - S4（本切片）：5 运行时 skill 内容（skills/）+ prompt guide（prompt.ts，
 *     ASCEND_TOOL_USAGE_GUIDE 单一事实源）；壳侧 tui re-export 消费。
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

// 5 运行时 skill 内容（S4）+ prompt guide（ASCEND_TOOL_USAGE_GUIDE 单一事实源）
export * from './skills'
export {
  ASCEND_TOOL_USAGE_GUIDE,
  getAscendSystemPromptSection,
} from './prompt'

// S5：ascendPackage 四元挂载单元（charter Port 3；mount.ts DEP-5 实挂载消费）
export { ascendPackage } from './package'
