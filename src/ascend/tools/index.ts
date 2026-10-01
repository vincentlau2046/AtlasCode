/**
 * ascend 工具子门面（M3-S3，D-3 Ascend 独立实施波）。
 *
 * 16 工具（4 业务面：算子开发 7 / 问题定位 3 / 性能测试 2 / 推理部署 4）+
 * KernelBackend 三后端（AscendC MVP + TileLang/Triton reserved）+ constants /
 * foldUtils / execUtil 共享面。
 *
 * 每个工具已适配 AtlasCode engine `Tool` 契约（shared/types.ts L178）：纯 JSON
 * schema inputSchema / description() 唯一 prompt 面 / checkPermissions（fail-
 * closed ask 或 allow-passthrough）/ renderToolUseMessage → null / mapToolResult
 * 折叠摘要。注册 = S5 经 `ASCEND_TOOLS` 数组注入 engine ToolRegistry 的
 * `ascendTools` 槽（toolRegistry.ts ToolRegistryDeps.ascendTools +
 * isAscendToolsEnabled 门）。
 */
import type { Tool } from 'src/shared'

// 16 工具本体
import { SpecParser } from './SpecParser'
import { TilingPlanner } from './TilingPlanner'
import { AscendCodeGen } from './AscendCodeGen'
import { CompilerBridge } from './CompilerBridge'
import { GoldenTest } from './GoldenTest'
import { RealHWBridge } from './RealHWBridge'
import { Diagnoser } from './Diagnoser'
import { FaultCollector } from './FaultCollector'
import { ErrorClassifier } from './ErrorClassifier'
import { ProfileAnalyzer } from './ProfileAnalyzer'
import { BenchmarkRunner } from './BenchmarkRunner'
import { ProfileReportParser } from './ProfileReportParser'
import { ModelConverter } from './ModelConverter'
import { OnnxOptimizer } from './OnnxOptimizer'
import { DataPrepTool } from './DataPrepTool'
import { InferValidator } from './InferValidator'

// KernelBackend 三后端
import { AscendCBackend, BISHENG_FLAGS } from './AscendCBackend'
import { TileLangBackend } from './TileLangBackend'
import { TritonBackend } from './TritonBackend'

/**
 * 16 工具注册数组（engine ToolRegistry `ascendTools` 槽消费）。
 * 顺序 = 4 业务面（算子开发 → 问题定位 → 性能测试 → 推理部署）。
 */
export const ASCEND_TOOLS: readonly Tool[] = [
  // 算子开发（7）
  SpecParser,
  TilingPlanner,
  AscendCodeGen,
  CompilerBridge,
  GoldenTest,
  RealHWBridge,
  Diagnoser,
  // 问题定位（3）
  FaultCollector,
  ErrorClassifier,
  ProfileAnalyzer,
  // 性能测试（2）
  BenchmarkRunner,
  ProfileReportParser,
  // 推理部署（4）
  ModelConverter,
  OnnxOptimizer,
  DataPrepTool,
  InferValidator,
]

// 16 工具本体（单工具消费面）
export {
  SpecParser,
  TilingPlanner,
  AscendCodeGen,
  CompilerBridge,
  GoldenTest,
  RealHWBridge,
  Diagnoser,
  FaultCollector,
  ErrorClassifier,
  ProfileAnalyzer,
  BenchmarkRunner,
  ProfileReportParser,
  ModelConverter,
  OnnxOptimizer,
  DataPrepTool,
  InferValidator,
}

// KernelBackend 三后端 + 接口/类型
export {
  AscendCBackend,
  BISHENG_FLAGS,
  TileLangBackend,
  TritonBackend,
}
export {
  ReservedBackendError,
  type KernelArtifact,
  type KernelBackend,
  type OperatorSpec,
  type ProjectFile,
  type TilingHint,
} from './KernelBackend'

// 工具名常量族 + 折叠工具集 + 共享 exec 包裹
export * from './constants'
export * from './foldUtils'
export * from './execUtil'
