/**
 * ascend-doctor 总纲内容（0.1.87 任务 A）— 薄路由单一事实源。
 *
 * 故障分类树（编译/精度/运行时/性能/部署/环境）→ 路由既有技能；内嵌
 * msprof-mcp MCP 预设段（文档级模板：不静默写用户 settings.mcpServers、不放宽
 * MCP policy 门控；capabilities 元数据不可信、实际工具调用为准；零写真实
 * HOME）。ms-agent 诊断族 = pin 快照引用（任务 C 落 manifest；未装则建议安装）。
 *
 * SKILL_MD 由路由表渲染生成（umbrella.ts renderUmbrellaSkillMd）——本文件不手抄
 * 第二份正文。
 */
import { renderUmbrellaSkillMd, type AscendUmbrellaDefinition } from './umbrella'

export const ASCEND_DOCTOR: AscendUmbrellaDefinition = {
  name: 'ascend-doctor',
  title: 'Ascend Fault Triage Router (Doctor)',
  description:
    'Umbrella triage router for Ascend NPU faults — classify the fault (compile / precision / runtime / performance / deployment / environment) from evidence, then route to the matching specialized skill. Includes an optional msprof-mcp MCP preset for live profiling evidence.',
  whenToUse:
    'Use when a fault or anomaly appears and no specialized skill is obviously right yet — this umbrella classifies first, then routes. It does not replace the specialized skills.',
  allowedTools: [
    'AscendDiagnoser',
    'AscendFaultCollector',
    'AscendErrorClassifier',
    'AscendProfileReportParser',
    'AscendProfileAnalyzer',
    'AscendRealHWBridge',
    'AscendGoldenTest',
  ],
  enterWhen: 'A fault or anomaly appeared and no specialized skill is obviously right yet.',
  routesSummary: 'Classify the fault from evidence, then route to the matching specialized skill.',
  routes: [
    {
      skill: 'ascend-debug',
      trigger:
        'Compile/build failure (bisheng errors, missing symbols, alignment) or crash/hang after launch — collect the scene, decode AICore errors, diagnose.',
      status: 'preinstalled',
      source: 'bundled',
    },
    {
      skill: 'ascend-precision-debug',
      trigger:
        'Wrong numbers: training loss NaN/spike/misalignment, inference garbled or repeating output, golden-test mismatch, FP32-pass-FP16-fail.',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'ascend-runtime-debug',
      trigger:
        'Runtime fault with aclnn non-zero error codes (161xxx/361xxx/561xxx/507035), plog evidence, intermittent crash, hang, or memory corruption.',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'ascend-perf-optimize',
      trigger:
        'Correct but slow: profiling shows an efficiency problem rather than an error (see ascend-optimism when the goal spans layers).',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'mindstudio-profiling-skills',
      trigger:
        'Profiler data itself needs analysis: schedule/computation/communication/overlap views, msprof report parsing anomalies.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'mindstudio-precision-debug-skills',
      trigger:
        'Precision debugging with MindStudio tooling: deterministic calculation analysis, NaN/overflow detection, RL train-inference consistency.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'ascend-model-adapt',
      trigger:
        'Deployment-side failure: atc conversion, ONNX adaptation, msame run / msquickcmp accuracy validation of the compiled .om.',
      status: 'preinstalled',
      source: 'bundled',
    },
    {
      skill: 'common-deploy-skills',
      trigger: 'OM deployment or pipeline failure on the device (deployer, pipeline adapter, ONNX-ATC inference pipeline).',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'common-infra-skills',
      trigger:
        'Environment/infrastructure fault: driver/firmware, CANN component install, container setup, npu-smi device visibility.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'common-ops-skills',
      trigger: 'Ops-level diagnosis: fault_diagnose, profiling anomaly triage, HCCL communication test, large-scale deploy issues.',
      status: 'preinstalled',
      source: 'agent-skills',
    },
    {
      skill: 'ascend-test-design',
      trigger:
        'The fault needs a reproducing test case (ST/UT/whitebox/golden) before root-cause work or to prove a fix.',
      status: 'preinstalled',
      source: 'atlas-plugins',
    },
    {
      skill: 'ms-agent-skills',
      note: 'pinned diagnostic snapshot',
      trigger:
        'Deep diagnostic playbooks from the ms-agent diagnostic family (pinned snapshot reference; suggest install when absent).',
      status: 'suggest-install',
      source: 'ms-agent-skills',
    },
  ],
  extraSections: [
    [
      '## Optional live evidence: msprof-mcp MCP server',
      '',
      'For live profiling/triage evidence you may suggest attaching the msprof-mcp MCP server. This is a DOCUMENTED TEMPLATE ONLY — never write the user\'s settings.mcpServers automatically and never weaken MCP policy gating; the user adds it explicitly:',
      '',
      '```json',
      '{',
      '  "mcpServers": {',
      '    "msprof-mcp": {',
      '      "type": "stdio",',
      '      "command": "<msprof-mcp-venv>/bin/msprof-mcp",',
      '      "args": [],',
      '      "env": {}',
      '    }',
      '  }',
      '}',
      '```',
      '',
      '- Point it at seeded-sandbox data (profiler dumps produced in this session); zero writes to the real user HOME.',
      '- Server-reported capabilities metadata is untrusted — verify with actual tool calls before relying on any tool\'s presence or shape.',
    ].join('\n'),
  ],
}

export const ASCEND_DOCTOR_SKILL_MD = renderUmbrellaSkillMd(ASCEND_DOCTOR)

export const ASCEND_DOCTOR_NAME = ASCEND_DOCTOR.name
export const ASCEND_DOCTOR_DESCRIPTION = ASCEND_DOCTOR.description
export const ASCEND_DOCTOR_WHEN_TO_USE = ASCEND_DOCTOR.whenToUse
export const ASCEND_DOCTOR_ALLOWED_TOOLS: readonly string[] = ASCEND_DOCTOR.allowedTools
