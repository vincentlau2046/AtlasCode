/**
 * 波 C（0.1.27 · P0 封口 #3，spec docs/2026-10-05-live-gateway-classifier-e2e-wave.md §4）：
 * auto-mode 分类器拦截支 deny→ask 判定体变更判别单测（TUI 层 hasPermissionsToUseTool）。
 *
 * 白盒依据（spec §2/§4）：
 * - C.1 交互面（可弹框）：分类器拦截（shouldBlock:true）由平铺 `behavior:'deny'`
 *   （静默拒绝，A4 危险句不可达）改为 `behavior:'ask'` +
 *   `decisionReason:{type:'classifier',classifier:'auto-mode',reason}` →
 *   ASK 弹框现形，verdictLine 渲染 A4 危险句
 *   `Auto mode: classifier flagged this as dangerous.`（一等可达，steerable-trust）。
 * - C.2 headless / shouldAvoidPermissionPrompts（不可弹框）：仍 fail-closed 静默 deny
 *   （铁闸门语义不变）；拒绝上限（:836）语义重核 = 上限回退面也现形人工 ASK（交互）
 *   / headless 仍 AbortError 熔断（fail-closed 不变）。
 *
 * 接缝：mock.module 覆写 yoloClassifier（仅 LLM 函数 classifyYoloAction 假件）；
 * feature() 普通模块（src/shared/feature.ts）TRANSCRIPT_CLASSIFIER ON_BY_DEFAULT
 * 无需翻转。零磁盘零模型；bun test --isolate 每文件独立进程，mock 不跨文件泄漏。
 *
 * ★导出面坑的 TDZ 偏离（对照 mock-module-export-surface 标准对策「先真实 import
 * 全导出面再 spread」）：yoloClassifier 的 import 链以它为入口会经
 * chain→permissions.ts→顶层 require('./classifierDecision.js') 触发
 * classifierDecision.ts:64 顶层 Set 取 YOLO_CLASSIFIER_TOOL_NAME 的 TDZ 环
 * （yolo 初始化中，导出未就绪；同族 [[atlascode-baseToolEntities-tdz-cycle]]）。
 * ∴ 无法先取真实全导出面。改 = 完整运行时导出面 mock（9 名；type-only 2 名
 * AutoModeRules/TranscriptEntry 编译期擦除不入运行时面）：
 *   - 纯面 6 名 re-export shared autoMode 双身（src/permissions 门面，同语义族，
 *     auto-mode-classifier 单测已验）；
 *   - LLM 面 classifyYoloAction = 假件（nextClassify 脚本化）；
 *   - TUI 特有面 3 名（errorDumpPath/transcript/buildYoloSystemPrompt）= 显式
 *     throw 桩（若被本测试图消费即响亮失败，防静默 undefined）。
 */
import { describe, test, expect, mock } from 'bun:test'

const YOLO_PATH = '../../src/tui/utils/permissions/yoloClassifier.js'
const PERMS_PATH = '../../src/tui/utils/permissions/permissions.js'
const SHARED_PATH = '../../src/permissions'

// shared autoMode 双身门面（安全加载序，auto-mode-classifier 单测同链已验）——
// 纯面 re-export 源，先于 mock.module 取好。
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

const { hasPermissionsToUseTool } = await import(PERMS_PATH)
const { verdictLine, VERDICT_PREFIX } = await import(
  '../../src/tui/components/permissions/permissionVerdict.js'
)
const { buildYoloRejectionMessage } = await import(
  '../../src/tui/utils/messages.js'
)

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

describe('波 C 分类器拦截支（spec §4 C.1/C.2）', () => {
  test('C-1 交互面拦截 → ASK + classifier decisionReason + A4 危险句可达（verdictLine）', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx()
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-c1',
    )
    expect(d.behavior).toBe('ask')
    expect(d.decisionReason).toEqual({
      type: 'classifier',
      classifier: 'auto-mode',
      reason: 'dangerous rm',
    })
    expect(verdictLine(d.decisionReason as never, 'auto')).toBe(
      `${VERDICT_PREFIX}: Auto mode: classifier flagged this as dangerous.`,
    )
  })

  test('C-2 headless 拦截 → 仍 fail-closed 静默 deny（C.2 铁闸门不变）+ 拒绝文案', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ headless: true })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-c2',
    )
    expect(d.behavior).toBe('deny')
    expect(d.decisionReason).toEqual({
      type: 'classifier',
      classifier: 'auto-mode',
      reason: 'dangerous rm',
    })
    expect(d.message).toBe(buildYoloRejectionMessage('dangerous rm'))
  })

  test('C-3 放行路径不变：shouldBlock=false → allow + classifier decisionReason + 拒计清零', async () => {
    nextClassify = { shouldBlock: false, reason: 'safe op' }
    const { ctx } = makeCtx({ preSeedConsecutive: 2 })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-c3',
    )
    expect(d.behavior).toBe('allow')
    expect(d.decisionReason).toEqual({
      type: 'classifier',
      classifier: 'auto-mode',
      reason: 'safe op',
    })
    expect(ctx.localDenialTracking.consecutiveDenials).toBe(0)
  })

  test('C-4 拒绝上限（3 连拦）交互面 → 仍现形人工 ASK（上限面=人工面）+ 上限警示句', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ preSeedConsecutive: 2 })
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-c4',
    )
    expect(d.behavior).toBe('ask')
    expect((d.decisionReason as { type: string }).type).toBe('classifier')
    expect((d.decisionReason as { reason: string }).reason).toContain(
      '3 consecutive actions were blocked',
    )
    // 上限回退 ASK 的 classifier 型 decisionReason 同渲 A4 危险句（封口判据面）
    expect(verdictLine(d.decisionReason as never, 'auto')).toContain(
      'classifier flagged this as dangerous',
    )
  })

  test('C-5 拒绝上限 + headless → AbortError 熔断（fail-closed 不变）', async () => {
    nextClassify = { shouldBlock: true, reason: 'dangerous rm' }
    const { ctx } = makeCtx({ headless: true, preSeedConsecutive: 2 })
    await expect(
      hasPermissionsToUseTool(
        fakeBashTool(),
        INPUT,
        ctx,
        undefined as never,
        'tu-c5',
      ),
    ).rejects.toThrow('too many classifier denials in headless mode')
  })

  test('C-6 分类器不可用 → 仍 fail-closed deny（atlas_iron_gate_closed 默认 true）', async () => {
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
      'tu-c6',
    )
    expect(d.behavior).toBe('deny')
    expect((d.decisionReason as { reason: string }).reason).toBe(
      'Classifier unavailable',
    )
  })

  test('C-7 transcript 超长 → 交互面回落 ASK（other 型）/ headless → AbortError', async () => {
    nextClassify = {
      shouldBlock: true,
      transcriptTooLong: true,
      reason: '',
    }
    const { ctx } = makeCtx()
    const d = await hasPermissionsToUseTool(
      fakeBashTool(),
      INPUT,
      ctx,
      undefined as never,
      'tu-c7',
    )
    expect(d.behavior).toBe('ask')
    expect((d.decisionReason as { type: string }).type).toBe('other')

    const { ctx: hctx } = makeCtx({ headless: true })
    await expect(
      hasPermissionsToUseTool(
        fakeBashTool(),
        INPUT,
        hctx,
        undefined as never,
        'tu-c7h',
      ),
    ).rejects.toThrow('transcript exceeded context window in headless mode')
  })
})
