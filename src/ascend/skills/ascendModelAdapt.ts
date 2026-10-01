/**
 * ascend-model-adapt skill 内容（M3-S4，D-3 Ascend 独立实施波）— 单一事实源。
 *
 * 从旧仓 src/skills/bundled/ascendModelAdapt.ts 的 SKILL_MD + register 字段逐字
 * 移植。纯数据（无 tui / executor 依赖）：SKILL_MD 保留 {{toolchain.commands.*}}
 * 占位符，由壳侧 src/tui/skills/bundled/ascendModelAdapt.ts 渲染后注册。
 *
 * NOTE: 本面是推理部署（model → om → validate），非算子 tiling。框架适配
 * （TorchNPU/torchair）= Shape B —— 模型经基础编码能力 + 本 skill 知识使用的
 * Python 库，非 shell Tool。
 */
export const ASCEND_MODEL_ADAPT_SKILL_MD = [
  "---",
  "name: ascend-model-adapt",
  "description: Deploy a model to Ascend NPU for inference — prepare data, optimize the ONNX graph, convert to .om via atc, and validate (run + accuracy compare). Covers ONNX/pb/caffe/air → om conversion and deployment validation.",
  "when_to_use: Use when the user wants to deploy, port, or run a model on Ascend NPU for inference (convert to .om, validate it runs and is accurate). You decide the step order and react to evidence; this skill does not prescribe a fixed sequence.",
  "allowed-tools: AscendDataPrepTool, AscendOnnxOptimizer, AscendModelConverter, AscendInferValidator, AscendBenchmarkRunner, AscendRealHWBridge",
  "---",
  "# Ascend Model Deployment",
  "",
  "Deploy a model to Ascend NPU for inference with a measured validation. You choose which tool to call next based on the previous tool's evidence — there is no fixed step order here.",
  "",
  "## Goal",
  "",
  "Produce a validated .om model that runs accurately on the target NPU:",
  "- **Converted om**: the model is converted to .om via AscendModelConverter (atc) targeting the correct soc_version.",
  "- **Runs on NPU**: the om executes on .bin input and produces output (AscendInferValidator mode 'run' = msame).",
  "- **Accuracy preserved**: the om output matches the original model within tolerance (AscendInferValidator mode 'compare' = msquickcmp).",
  "- **Performance known** (if asked): throughput/latency measured via AscendBenchmarkRunner (ais-bench).",
  "",
  "## Gates",
  "",
  "- **Probe the target SoC FIRST** via AscendRealHWBridge `info` — you cannot convert without the correct soc_version (Ascend910A / 910B / 310 / 310P3).",
  "- If the model has ops unsupported on NPU, **optimize the ONNX before converting** (AscendOnnxOptimizer = auto_optimizer) — atc will fail on unsupported ops, so optimize first when conversion errors mention unsupported ops.",
  "- **Always validate after conversion** — a .om that compiles is not proven until it runs (msame) AND accuracy is checked (msquickcmp). Conversion can silently change precision.",
  "- If accuracy fails (msquickcmp mismatch), the gate is: re-optimize the ONNX (different knowledges) or re-convert with a different framework/precision, then re-validate. Do not ship a model that fails accuracy.",
  "- Input data must be in .bin format — use AscendDataPrepTool (img2bin) to prep images before running inference.",
  "",
  "## Tool catalog",
  "",
  "Pick from these as the evidence demands — the order is yours to decide:",
  "- AscendRealHWBridge — probe the target device (`info` = npu-smi) to get the soc_version before conversion.",
  "- AscendDataPrepTool — prep inference input (images → .bin) via img2bin ({{toolchain.commands.data_prep}}): resize, mean/std, color/format conversion. Produces .bin for msame/ais_bench.",
  "- AscendOnnxOptimizer — optimize the ONNX graph for the NPU support set via auto_optimizer ({{toolchain.commands.optimize}}): op fusion/split/rewrite. Run BEFORE atc when the model has unsupported ops.",
  "- AscendModelConverter — convert the model → .om via atc ({{toolchain.commands.convert}}): framework 0=Caffe/1=AIR/3=TF/5=ONNX, --soc_version, --input_shape. The →om chokepoint. atc does NOT do pytorch→onnx (use torch.onnx.export via base coding first).",
  "- AscendInferValidator — validate the .om: mode 'run' via msame ({{toolchain.commands.infer}}, executes the om on .bin → output); mode 'compare' via msquickcmp ({{toolchain.commands.accuracy}}, original vs om accuracy).",
  "- AscendBenchmarkRunner — measure throughput/latency of the .om via ais-bench (IEEE 2937) when performance matters.",
  "",
  "## Rules",
  "",
  "- **Tools return evidence, not decisions.** AscendModelConverter gives the om + log; AscendInferValidator gives run/accuracy evidence; YOU decide whether to re-optimize or re-convert.",
  "- **atc is the →om chokepoint** — all conversion paths (ONNX/pb/caffe/air) funnel through it. atc does NOT do pytorch→onnx or onnx→pb; convert pytorch→onnx via `torch.onnx.export()` (base coding) first, then atc --framework=5.",
  "- **Two validation modes, two CLIs**: 'run' (msame, does it execute?) vs 'compare' (msquickcmp, is it accurate?). Use both for a full deployment validation.",
  "- **Framework adaptation (Shape B, no Tool)**: for in-framework PyTorch NPU execution (bypassing the atc→om offline path), use `torch_npu` (`import torch_npu; torch.npu.set_device(0)`) and `torchair` (`torchair.get_npu_backend(compiler_config=config)` for graph mode) via base coding — these are Python libraries, not shell CLIs. Read the ascend-official/pytorch + torchair repos for usage.",
  "- `saved_model2om` and `pt2pb` are thin wrappers (atc --framework=3 covers saved_model; atc --framework=5 takes ONNX directly, making pt2pb's onnx→pb step obsolete) — prefer atc directly.",
  "- When a tool returns `mocked: true`, treat its output as a liveness signal, not as a real conversion/validation — say so and do not claim a deployable .om.",
  "- Report at the end: the soc_version, the conversion path used, the .om artifact, the validation results (run + accuracy), and (if measured) the throughput.",
].join("\n")

export const ASCEND_MODEL_ADAPT_NAME = "ascend-model-adapt"
export const ASCEND_MODEL_ADAPT_DESCRIPTION =
  "Deploy a model to Ascend NPU — prepare data, optimize ONNX, convert to .om via atc, validate (run + accuracy compare)."
export const ASCEND_MODEL_ADAPT_WHEN_TO_USE =
  "Use when the user wants to deploy/port a model to Ascend NPU for inference. The agent decides step order and reacts to evidence; no fixed sequence."
export const ASCEND_MODEL_ADAPT_ALLOWED_TOOLS: readonly string[] = [
  "AscendDataPrepTool",
  "AscendOnnxOptimizer",
  "AscendModelConverter",
  "AscendInferValidator",
  "AscendBenchmarkRunner",
  "AscendRealHWBridge",
]
