// Tool name constants for the Ascend (Huawei NPU) tool family.
// GoldenTest replaces SimulatorBridge (simulator-cycles validation has no
// official basis; canonical form is numpy-ref golden test — see op-examples).
export const SPEC_PARSER_TOOL_NAME = 'AscendSpecParser'
export const TILING_PLANNER_TOOL_NAME = 'AscendTilingPlanner'
export const ASCEND_CODEGEN_TOOL_NAME = 'AscendCodeGen'
export const COMPILER_BRIDGE_TOOL_NAME = 'AscendCompilerBridge'
export const GOLDEN_TEST_TOOL_NAME = 'AscendGoldenTest'
export const REAL_HW_BRIDGE_TOOL_NAME = 'AscendRealHWBridge'
export const DIAGNOSER_TOOL_NAME = 'AscendDiagnoser'
// Phase 2a — problem-location / fault-triage business surface
export const FAULT_COLLECTOR_TOOL_NAME = 'AscendFaultCollector'
export const ERROR_CLASSIFIER_TOOL_NAME = 'AscendErrorClassifier'
export const PROFILE_ANALYZER_TOOL_NAME = 'AscendProfileAnalyzer'
// Phase 2b — performance testing / optimization business surface
export const BENCHMARK_RUNNER_TOOL_NAME = 'AscendBenchmarkRunner'
export const PROFILE_REPORT_PARSER_TOOL_NAME = 'AscendProfileReportParser'
// Phase 2c — inference deployment / framework adaptation business surface
export const MODEL_CONVERTER_TOOL_NAME = 'AscendModelConverter'
export const ONNX_OPTIMIZER_TOOL_NAME = 'AscendOnnxOptimizer'
export const DATA_PREP_TOOL_NAME = 'AscendDataPrepTool'
export const INFER_VALIDATOR_TOOL_NAME = 'AscendInferValidator'