/**
 * AD-47（0.1.49 A-③ · CC 2.1.89 TOP #2）：PermissionDenied hook 发射点 +
 * retry 消费（真实缺口，修前红①② + 零回归③）。
 *
 * 缺口定位（工单 §1.1 PAC 卡 D1）：事件面全注册（coreSchemas HOOK_EVENTS 枚举
 * / getMatchingHooks 匹配 / hooksConfigManager:56 四字段契约文档 /
 * PermissionDeniedHookInputSchema 四字段 + HookSpecificOutput retry 面 /
 * hooks.ts retry 解析 + yield / executePermissionDeniedHooks runner）但
 * 发射路径休眠（permissions.ts 分类器拒绝支 grep executePermissionDeniedHooks
 * 0 命中 = 从不发射），且 buildYoloRejectionMessage 无 retry 面。
 *
 * 判别判据（工单 §2 AD-47）：
 * ① 分类器 shouldBlock → PermissionDenied hook 发射 + 输入契约四字段精确
 *    （tool_name/tool_input/tool_use_id/reason；4 拒绝支全覆盖 = headless
 *    fail-closed / 交互 ASK / unavailable fail-closed / 拒绝上限回退）
 *    —— 修前红（从不发射，fake 0 命中）→ 修后绿。
 * ② hook 返 retry:true → 拒绝消息含 retry 引导（buildYoloRejectionMessageWithRetry
 *    挂 headless fail-closed 支；工单指 buildYoloRejectionMessage 无 retry 面）
 *    —— 修前红（无 retry 面）→ 修后绿。
 * ③ 无 hook（fake 零 yield = hasHookForEvent 门 no-op 同语义）→ 拒绝路径零回归
 *    （decision 形 + message 逐字恒等现行为 buildYoloRejectionMessage）
 *    —— 零回归（首轮即绿）。
 *
 * 接缝：mock.module 双身——yoloClassifier（9 名面，逐字复用
 * tui-classifier-intercept-ask 单测假件，零模型零网关）+ hooks.js
 * executePermissionDeniedHooks（真实全导出面先取再 spread + 单名覆写 =
 * mock-module-export-surface 标准对策）→ 零磁盘零模型零子进程。
 */
import { describe, test, expect, beforeEach, mock } from 'bun:test'

const YOLO_PATH = '../../src/tui/utils/permissions/yoloClassifier.js'
const PERMS_PATH = '../../src/tui/utils/permissions/permissions.js'
const HOOKS_PATH = '../../src/tui/utils/hooks.js'
const SHARED_PATH = '../../src/permissions'

// shared autoMode 双身门面（安全加载序，auto-mode-classifier 单测同链已验）
const shared = await import(SHARED_PATH)

let nextClassify: {
  shouldBlock: boolean
  reason: string
  unavailable?: boolean
  transcriptTooLong?: boolean
  durationMs?: number
}

const notStubbed =
  (name: string) =>
  (): never => {
    throw new Error(`mock: yoloClassifier.${name} not stubbed (unexpected consumption)`)
  }

mock.module(YOLO_PATH, () => ({
  // LLM 面（假件：脚本化分类器结果，零模型零网关）
  classifyYoloAction: async () => nextClassify,
  // 纯面（shared autoMode 双身 re-export）
  buildTranscriptEntries: shared.buildTranscriptEntries,
  buildTranscriptForClassifier: shared.buildTranscriptForClassifier,
  formatActionForClassifier: shared.formatActionForClassifier,
  getDefaultExternalAutoModeRules: shared.getDefaultExternalAutoModeRules,
  buildDefaultExternalSystemPrompt: shared.buildDefaultExternalSystemPrompt,
  YOLO_CLASSIFIER_TOOL_NAME: shared.YOLO_CLASSIFIER_TOOL_NAME ?? 'classify_result',
  // TUI 特有面（throw 桩——被消费即响亮失败）
  getAutoModeClassifierErrorDumpPath: notStubbed('getAutoModeClassifierErrorDumpPath'),
  getAutoModeClassifierTranscript: notStubbed('getAutoModeClassifierTranscript'),
  buildYoloSystemPrompt: async () => {
    throw new Error('mock: yoloClassifier.buildYoloSystemPrompt not stubbed')
  },
}))

// hooks.js 真实全导出面先取（标准对策防漏名），再 mock 覆写单名
const realHooks = await import(HOOKS_PATH)

const deniedCalls: Array<{
  toolName: string
  toolUseID: string
  toolInput: unknown
  reason: string
}> = []
let deniedYields: Array<Record<string, unknown>> = []

mock.module(HOOKS_PATH, () => ({
  ...realHooks,
  executePermissionDeniedHooks: async function* (
    toolName: string,
    toolUseID: string,
    toolInput: unknown,
    reason: string,
  ) {
    deniedCalls.push({ toolName, toolUseID, toolInput, reason })
    for (const y of deniedYields) {
      yield y
    }
  },
}))

const { hasPermissionsToUseTool } = await import(PERMS_PATH)
const {
  buildYoloRejectionMessage,
  buildYoloRejectionMessageWithRetry,
} = await import('../../src/tui/utils/messages.js')

/** 最小 Bash 假件：checkPermissions 恒 passthrough（落步 3 ask），非白名单外安全工具。 */
function fakeBashTool(): any {
  return {
    name: 'Bash',
    inputSchema: { parse: (v: unknown) => v },
    checkPermissions: async () => ({ behavior: 'passthrough' }),
    userFacingName: () => 'bash',
  }
}

/** 最小 ToolUseContext：mode=auto + 可选 headless + 拒计预置（localDenialTracking 就地 mutate 路径）。 */
function makeCtx(opts: { headless?: boolean; preSeedConsecutive?: number } = {}) {
  const pre = opts.preSeedConsecutive ?? 0
  const appState = {
    toolPermissionContext: {
      mode: 'auto',
      shouldAvoidPermissionPrompts: opts.headless ?? false,
      additionalWorkingDirectories: new Map(),
      alwaysAllowRules: {},
      alwaysDenyRules: {},
      alwaysAskRules: {},
      isBypassPermissionsModeAvailable: false,
    },
    denialTracking: { consecutiveDenials: pre, totalDenials: pre },
  }
  const ctx: any = {
    getAppState: () => appState,
    setAppState: () => {},
    abortController: new AbortController(),
    options: { tools: [], isNonInteractiveSession: opts.headless ?? false },
    localDenialTracking: { consecutiveDenials: pre, totalDenials: pre },
  }
  return { ctx, appState }
}

const INPUT = { command: 'rm -rf /' }

describe('AD-47 PermissionDenied hook（工单 §2 ①②修前红 / ③零回归）', () => {
  beforeEach(() => {
    deniedCalls.length = 0
    deniedYields = []
  })

  test('① headless 拦截 → PermissionDenied 发射 + 输入契约四字段精确', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ headless: true })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-1',
    )
    expect(d.behavior).toBe('deny')
    expect(deniedCalls).toHaveLength(1)
    // 四字段契约（hooksConfigManager:56 文档锚）：tool_name/tool_input/tool_use_id/reason
    expect(deniedCalls[0]).toEqual({
      toolName: 'Bash',
      toolUseID: 'tu-ad47-1',
      toolInput: INPUT,
      reason: 'dangerous rm',
    })
  })

  test('① 交互 ASK 拦截 → 亦发射（观测面，decision 形不变）', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx()
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-ask',
    )
    expect(d.behavior).toBe('ask')
    expect(d.decisionReason).toEqual({
      type: 'classifier',
      classifier: 'auto-mode',
      reason: 'dangerous rm',
    })
    expect(deniedCalls).toHaveLength(1)
    expect(deniedCalls[0].reason).toBe('dangerous rm')
  })

  test('① 分类器不可用 fail-closed → 发射 + reason = Classifier unavailable', async () => {
    nextClassify = {
      shouldBlock: true,
      unavailable: true,
      reason: 'unavailable',
    }
    const { ctx } = makeCtx()
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-unavail',
    )
    expect(d.behavior).toBe('deny')
    expect((d.decisionReason as { reason: string }).reason).toBe(
      'Classifier unavailable',
    )
    expect(deniedCalls).toHaveLength(1)
    expect(deniedCalls[0].reason).toBe('Classifier unavailable')
  })

  test('① 拒绝上限回退（3 连拦）→ 发射 + reason = 分类器 reason（上限警示支）', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ preSeedConsecutive: 2 })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-limit',
    )
    expect(d.behavior).toBe('ask')
    expect((d.decisionReason as { reason: string }).reason).toContain(
      '3 consecutive actions were blocked',
    )
    expect(deniedCalls).toHaveLength(1)
    expect(deniedCalls[0].reason).toBe('dangerous rm')
  })

  test('② hook 返 retry:true → 拒绝消息含 retry 引导（修前红）', async () => {
    deniedYields.push({ retry: true })
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ headless: true })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-retry',
    )
    expect(d.behavior).toBe('deny')
    expect(d.message).toBe(buildYoloRejectionMessageWithRetry('dangerous rm'))
    expect(d.message).toContain('may be retried')
    // retry 引导 = 现文案 + 引导句（现 buildYoloRejectionMessage 无 retry 面）
    expect(d.message).not.toBe(buildYoloRejectionMessage('dangerous rm'))
  })

  test('③ 无 hook（零 yield）→ 拒绝路径零回归（现行为逐字恒等）', async () => {
    // deniedYields 空 = fake 零 yield（无 hook 配置时 hasHookForEvent 门 no-op 同语义）
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ headless: true })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-ad47-nohook',
    )
    expect(d.behavior).toBe('deny')
    expect(d.decisionReason).toEqual({
      type: 'classifier',
      classifier: 'auto-mode',
      reason: 'dangerous rm',
    })
    // message 逐字恒等现行为（无 retry 面）= 零回归（修前即绿：本测只钉
    // decision 形 + message 恒等；发射点在场由 ① 四支断言覆盖）
    expect(d.message).toBe(buildYoloRejectionMessage('dangerous rm'))
  })
})
