/**
 * engine/tools/plan S-E2（§8.58 plan 族子波）：EnterPlanMode /
 * ExitPlanModeV2 两本体 unit 面（零盘）。
 *
 * unit 层纪律（同 S-D2b worktree 对象面先例）：纯对象面 + schema 转写面 +
 * mapResult 纯函数面 + checkPermissions 固化面 + validateInput mode 判别面 +
 * prompt 面（interview 门双变体）+ planWords 纯函数面 + plan 域 slug 管理
 * 缓存命中面（零盘——miss/冲突重试真盘面 = func 层）。
 *
 *  - P-PL1 对象面：两本体 name（toolNames 单一事实源）/ JSON schema 常量
 *    同一性 + 字段转写面（Enter 无参宽骨架 / Exit allowedPrompts 嵌套
 *    enum + 无 additionalProperties 声明 = passthrough 等价，delta ①）/
 *    TOOL_DEFAULTS 逐值（delta ③）/ isReadOnly 判别（Enter true /
 *    Exit false「Now writes to disk」）/ isDestructive false /
 *    toAutoClassifierInput 缺省位 '' / userFacingName '' / isEnabled true
 *    （plan 族无专属门控槽 = 无条件注册面）。
 *  - P-PL2 mapResult：Exit 3 变体（isAgent / 空 plan / 正常 planLabel
 *    双态）+ Enter interview 门双变体（门开省 What Happens 段，逐字）。
 *  - P-PL3 validateInput：Exit mode ≠ 'plan' → ec1 文案逐字 / mode 'plan'
 *    直通 / 无 context 短路 ec1（delta ⑥ teammate 直通支裁面后态）。
 *  - P-PL4 门控面：isPlanModeInterviewPhaseEnabled env-only 门（true/false
 *    显式 + 未设 = false ≡ 旧 GB 缺省，delta ③ GB 支整砍）+ Enter
 *    description() = prompt 同一性 + 双变体切换 + Exit description() =
 *    静态模板 + DESCRIPTION 短常量值锚点（TUI 波不接线）+
 *    checkPermissions（Enter allow 固化 delta ⑤ / Exit ask 'Exit plan
 *    mode?' 非 teammate 固化）。
 *  - P-PL5 planWords 词表面：generateWordSlug 3 段 / generateShortWordSlug
 *    2 段（小写字母词表）+ plan 域 slug 管理缓存命中面（setPlanSlug →
 *    getPlanSlug 零盘命中 + clearAllPlanSlugs 复位面）。
 *
 * 探针锚点（§8.58，突变须恰好 1 red）：
 *   P-PL1 对象面：schema 常量同一性 + TOOL_DEFAULTS 逐值 + isReadOnly 判别
 *   P-PL2 mapResult 逐字（3 变体文案 + planLabel 双态）
 *   P-PL3 validateInput ec1 文案 + mode 'plan' 直通
 *   P-PL4 门控：ATLAS_PLAN_MODE_INTERVIEW_PHASE 未设 = false / '1' true +
 *    Enter prompt 双变体切换
 *   P-PL5 planWords 3/2 段 + slug 缓存命中
 *
 * 深度 import（门面归集）：../../src/engine/tools（两本体 + schema 2 +
 * prompt 面 + 门控 + planWords 2 + slug 管理 4 + toolNames 2 常量）。
 */
import { describe, test, expect } from 'bun:test'
import {
  ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
  EnterPlanModeTool,
  EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
  ExitPlanModeV2Tool,
  ENTER_PLAN_MODE_DESCRIPTION,
  EXIT_PLAN_MODE_V2_DESCRIPTION,
  EXIT_PLAN_MODE_V2_TOOL_PROMPT,
  getEnterPlanModeToolPrompt,
  isPlanModeInterviewPhaseEnabled,
  generateWordSlug,
  generateShortWordSlug,
  setPlanSlug,
  clearAllPlanSlugs,
  getPlanSlug,
  ENTER_PLAN_MODE_TOOL_NAME,
  EXIT_PLAN_MODE_V2_TOOL_NAME,
} from '../../src/engine/tools'

/** ATLAS_PLAN_MODE_INTERVIEW_PHASE 保存/恢复（跨测 env 卫生）。 */
function withInterviewEnv(value: string | undefined, fn: () => void): void {
  const saved = process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE
  if (value === undefined) delete process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE
  else process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE = value
  try {
    fn()
  } finally {
    if (saved === undefined) delete process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE
    else process.env.ATLAS_PLAN_MODE_INTERVIEW_PHASE = saved
  }
}

const DESC_OPTIONS = {
  isNonInteractiveSession: false,
  toolPermissionContext: null,
  tools: [],
}

// ── P-PL1 对象面 ──────────────────────────────────────────────────────────
describe('EnterPlanModeTool 对象面（P-PL1）', () => {
  test('name = toolNames 单一事实源 + schema 常量同一性（无参宽骨架）', () => {
    expect(EnterPlanModeTool.name).toBe(ENTER_PLAN_MODE_TOOL_NAME)
    expect(ENTER_PLAN_MODE_TOOL_NAME).toBe('EnterPlanMode')
    expect(EnterPlanModeTool.inputSchema).toBe(ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA)
    expect(EnterPlanModeTool.inputJSONSchema).toBe(
      ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA,
    )
    // delta ①：z.strictObject({}) 无参面转写
    expect(ENTER_PLAN_MODE_TOOL_INPUT_SCHEMA).toEqual({
      type: 'object',
      properties: {},
    })
  })

  test('TOOL_DEFAULTS 逐值 + isReadOnly true（delta ③）', () => {
    expect(EnterPlanModeTool.maxResultSizeChars).toBe(100_000)
    expect(EnterPlanModeTool.shouldDefer).toBe(true)
    expect(EnterPlanModeTool.searchHint).toBe(
      'switch to plan mode to design an approach before coding',
    )
    expect(EnterPlanModeTool.isEnabled()).toBe(true)
    expect(EnterPlanModeTool.isConcurrencySafe({})).toBe(true)
    expect(EnterPlanModeTool.isReadOnly({})).toBe(true)
    expect(EnterPlanModeTool.isDestructive!({})).toBe(false)
    // delta ③ 登记位：旧 def 无 toAutoClassifierInput 成员 → 缺省位恒 ''
    expect(EnterPlanModeTool.toAutoClassifierInput({})).toBe('')
    expect(EnterPlanModeTool.userFacingName({})).toBe('')
  })
})

describe('ExitPlanModeV2Tool 对象面（P-PL1）', () => {
  test('name = toolNames 单一事实源 + schema 常量同一性（allowedPrompts 嵌套 enum 逐字段）', () => {
    expect(ExitPlanModeV2Tool.name).toBe(EXIT_PLAN_MODE_V2_TOOL_NAME)
    expect(EXIT_PLAN_MODE_V2_TOOL_NAME).toBe('ExitPlanMode')
    expect(ExitPlanModeV2Tool.inputSchema).toBe(EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA)
    expect(ExitPlanModeV2Tool.inputJSONSchema).toBe(
      EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
    )
    const allowedPrompts = (
      EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA.properties as Record<
        string,
        unknown
      >
    ).allowedPrompts as { type: string; items: Record<string, unknown> }
    expect(allowedPrompts.type).toBe('array')
    expect(allowedPrompts.items.properties).toEqual({
      tool: {
        type: 'string',
        enum: ['Bash'],
        description: 'The tool this prompt applies to',
      },
      prompt: {
        type: 'string',
        description:
          'Semantic description of the action, e.g. "run tests", "install dependencies"',
      },
    })
    // delta ①：无 additionalProperties 声明 = 默认放行 ≡ 旧 z.strictObject()
    // .passthrough()（SDK 注入 plan/planFilePath 键经此面放行）
    expect(
      'additionalProperties' in EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA,
    ).toBe(false)
    expect(EXIT_PLAN_MODE_V2_TOOL_INPUT_SCHEMA.required).toBeUndefined()
  })

  test('TOOL_DEFAULTS 逐值 + isReadOnly false（Now writes to disk）+ isDestructive false', () => {
    expect(ExitPlanModeV2Tool.maxResultSizeChars).toBe(100_000)
    expect(ExitPlanModeV2Tool.shouldDefer).toBe(true)
    expect(ExitPlanModeV2Tool.searchHint).toBe(
      'present plan for approval and start coding (plan mode only)',
    )
    expect(ExitPlanModeV2Tool.isEnabled()).toBe(true)
    expect(ExitPlanModeV2Tool.isConcurrencySafe({})).toBe(true)
    expect(ExitPlanModeV2Tool.isReadOnly({})).toBe(false)
    expect(ExitPlanModeV2Tool.isDestructive!({})).toBe(false)
    expect(ExitPlanModeV2Tool.toAutoClassifierInput({})).toBe('')
    expect(ExitPlanModeV2Tool.userFacingName({})).toBe('')
  })
})

// ── checkPermissions 固化面（delta ⑤/⑥）────────────────────────────────
describe('checkPermissions 固化面', () => {
  test('Enter：behavior allow + updatedInput 同引用（委托通用权限系统）', async () => {
    const inp = {}
    const r = (await EnterPlanModeTool.checkPermissions(inp, {})) as {
      behavior: string
      updatedInput: unknown
    }
    expect(r.behavior).toBe('allow')
    expect(r.updatedInput).toBe(inp)
  })

  test('Exit：behavior ask + message 逐字 + updatedInput 同引用（非 teammate 固化，delta ⑥）', async () => {
    const inp = { plan: 'x' }
    const r = (await ExitPlanModeV2Tool.checkPermissions(inp, {})) as {
      behavior: string
      message?: string
      updatedInput: unknown
    }
    expect(r.behavior).toBe('ask')
    expect(r.message).toBe('Exit plan mode?')
    expect(r.updatedInput).toBe(inp)
  })
})

// ── P-PL2 mapResult 逐字面 ───────────────────────────────────────────────
const ENTER_MSG =
  'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.'

describe('mapToolResult 纯函数面（P-PL2）', () => {
  test('Enter：门控关（未设 env）= 6 步列表变体（逐字）', () => {
    withInterviewEnv(undefined, () => {
      expect(
        EnterPlanModeTool.mapToolResultToToolResultBlockParam(
          { message: ENTER_MSG },
          'tu-1',
        ),
      ).toEqual({
        type: 'tool_result',
        content: `${ENTER_MSG}

In plan mode, you should:
1. Thoroughly explore the codebase to understand existing patterns
2. Identify similar features and architectural approaches
3. Consider multiple approaches and their trade-offs
4. Use AskUserQuestion if you need to clarify the approach
5. Design a concrete implementation strategy
6. When ready, use ExitPlanMode to present your plan for approval

Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.`,
        tool_use_id: 'tu-1',
      })
    })
  })

  test('Enter：门控开（env 设真）= interview 变体（省 What Happens 段）', () => {
    withInterviewEnv('1', () => {
      expect(
        EnterPlanModeTool.mapToolResultToToolResultBlockParam(
          { message: ENTER_MSG },
          'tu-2',
        ),
      ).toEqual({
        type: 'tool_result',
        content: `${ENTER_MSG}

DO NOT write or edit any files except the plan file. Detailed workflow instructions will follow.`,
        tool_use_id: 'tu-2',
      })
    })
  })

  test('Exit：isAgent 变体（逐字）', () => {
    expect(
      ExitPlanModeV2Tool.mapToolResultToToolResultBlockParam(
        { plan: 'p', isAgent: true, filePath: '/x' },
        'tu-3',
      ),
    ).toEqual({
      type: 'tool_result',
      content:
        'User has approved the plan. There is nothing else needed from you now. Please respond with "ok"',
      tool_use_id: 'tu-3',
    })
  })

  test('Exit：空 plan 变体（逐字）', () => {
    for (const plan of ['', null]) {
      expect(
        ExitPlanModeV2Tool.mapToolResultToToolResultBlockParam(
          { plan, isAgent: false },
          'tu-4',
        ).content,
      ).toBe('User has approved exiting plan mode. You can now proceed.')
    }
  })

  test('Exit：正常 plan 变体 + planLabel 双态（edited / 未编辑）', () => {
    const filePath = '/home/u/.atlas/plans/gleaming-brewing-phoenix.md'
    const content = (planWasEdited?: boolean) =>
      ExitPlanModeV2Tool.mapToolResultToToolResultBlockParam(
        { plan: 'Step 1', isAgent: false, filePath, planWasEdited },
        'tu-5',
      ).content as string
    expect(content(true)).toBe(
      `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${filePath}
You can refer back to it if needed during implementation.

## Approved Plan (edited by user):
Step 1`,
    )
    expect(content(false)).toContain('## Approved Plan:\nStep 1')
    // undefined = 无显式编辑标记 → 未编辑标签
    expect(content(undefined)).toContain('## Approved Plan:\nStep 1')
  })
})

// ── P-PL3 validateInput mode 判别面 ──────────────────────────────────────
describe('ExitPlanModeV2 validateInput（P-PL3）', () => {
  const ctxWithMode = (mode: string) => ({
    getAppState: () => ({ toolPermissionContext: { mode } }),
  })

  test('mode ≠ plan → ec1 文案逐字', async () => {
    expect(
      await ExitPlanModeV2Tool.validateInput!({}, ctxWithMode('default')),
    ).toEqual({
      result: false,
      message:
        'You are not in plan mode. This tool is only for exiting plan mode after writing a plan. If your plan was already approved, continue with implementation.',
      errorCode: 1,
    })
  })

  test('mode = plan 直通', async () => {
    expect(
      await ExitPlanModeV2Tool.validateInput!({}, ctxWithMode('plan')),
    ).toEqual({ result: true })
  })

  test('无 context → 可选链短路 mode = undefined → ec1', async () => {
    const r = await ExitPlanModeV2Tool.validateInput!({})
    expect(r.result).toBe(false)
  })
})

// ── P-PL4 门控 + prompt 面 ───────────────────────────────────────────────
describe('isPlanModeInterviewPhaseEnabled env-only 门（P-PL4，delta ③）', () => {
  test('未设 = false（≡ 旧 GB 缺省 false）', () => {
    withInterviewEnv(undefined, () => {
      expect(isPlanModeInterviewPhaseEnabled()).toBe(false)
    })
  })

  test("'1'/'true' 设真 = true；'0'/'false' 显式假 = false", () => {
    for (const v of ['1', 'true']) {
      withInterviewEnv(v, () =>
        expect(isPlanModeInterviewPhaseEnabled()).toBe(true),
      )
    }
    for (const v of ['0', 'false']) {
      withInterviewEnv(v, () =>
        expect(isPlanModeInterviewPhaseEnabled()).toBe(false),
      )
    }
  })
})

describe('prompt 面（P-PL4）', () => {
  test('Enter description() = getEnterPlanModeToolPrompt()（唯一 prompt 面同一性）', async () => {
    withInterviewEnv(undefined, async () => {
      expect(await EnterPlanModeTool.description({}, DESC_OPTIONS)).toBe(
        getEnterPlanModeToolPrompt(),
      )
    })
  })

  test('Enter prompt 锚点行（门控关：What Happens 段 + 7 使用条件 + Examples）', () => {
    withInterviewEnv(undefined, () => {
      const p = getEnterPlanModeToolPrompt()
      expect(p).toContain(
        "Use this tool proactively when you're about to start a non-trivial implementation task.",
      )
      expect(p).toContain('## What Happens in Plan Mode')
      expect(p).toContain(
        '6. Exit plan mode with ExitPlanMode when ready to implement',
      )
      expect(p).toContain('## When NOT to Use This Tool')
      expect(p).toContain('5. Use AskUserQuestion if you need to clarify approaches')
    })
  })

  test('interview 门控开：省 What Happens 段（plan_mode attachment 接管）', () => {
    withInterviewEnv('1', () => {
      const p = getEnterPlanModeToolPrompt()
      expect(p).not.toContain('## What Happens in Plan Mode')
      expect(p).toContain('## Examples')
    })
  })

  test('EXIT_PLAN_MODE_V2_TOOL_PROMPT 锚点行 + description() 同一性', async () => {
    expect(EXIT_PLAN_MODE_V2_TOOL_PROMPT).toContain(
      'Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.',
    )
    expect(EXIT_PLAN_MODE_V2_TOOL_PROMPT).toContain(
      'use THIS tool to request approval',
    )
    // delta ②：旧仓硬编码 'AskUserQuestion' → toolNames 值同插值
    expect(EXIT_PLAN_MODE_V2_TOOL_PROMPT).toContain('AskUserQuestion')
    expect(await ExitPlanModeV2Tool.description({}, DESC_OPTIONS)).toBe(
      EXIT_PLAN_MODE_V2_TOOL_PROMPT,
    )
  })

  test('DESCRIPTION 短常量值锚点（TUI 波前向接缝，留导出不接线）', () => {
    expect(ENTER_PLAN_MODE_DESCRIPTION).toBe(
      'Requests permission to enter plan mode for complex tasks requiring exploration and design',
    )
    expect(EXIT_PLAN_MODE_V2_DESCRIPTION).toBe(
      'Prompts the user to exit plan mode and start coding',
    )
  })

  test('renderToolUseMessage 纯 null 体（旧 UI.tsx 逐字，非 JSX 面）', () => {
    expect(
      EnterPlanModeTool.renderToolUseMessage({}, { theme: null, verbose: false }),
    ).toBeNull()
    expect(
      ExitPlanModeV2Tool.renderToolUseMessage({}, { theme: null, verbose: false }),
    ).toBeNull()
  })
})

// ── P-PL5 planWords + slug 管理缓存命中面 ────────────────────────────────
describe('planWords 词表面（P-PL5）', () => {
  test('generateWordSlug = 3 段 adjective-verb-noun（小写字母）', () => {
    const parts = generateWordSlug().split('-')
    expect(parts).toHaveLength(3)
    for (const p of parts) expect(p).toMatch(/^[a-z]+$/)
  })

  test('generateShortWordSlug = 2 段（remote 波消费位预声明随迁）', () => {
    const parts = generateShortWordSlug().split('-')
    expect(parts).toHaveLength(2)
    for (const p of parts) expect(p).toMatch(/^[a-z]+$/)
  })
})

describe('plan 域 slug 管理缓存命中面（零盘）', () => {
  test('setPlanSlug → getPlanSlug 缓存命中（无 plans 目录 I/O）', () => {
    setPlanSlug('unit-s1', 'calm-quiet-falcon')
    try {
      expect(getPlanSlug('unit-s1')).toBe('calm-quiet-falcon')
    } finally {
      clearAllPlanSlugs()
    }
  })

  test('clearAllPlanSlugs 复位（重设生效）', () => {
    setPlanSlug('unit-s2', 'a-b-c')
    clearAllPlanSlugs()
    setPlanSlug('unit-s2', 'x-y-z')
    try {
      expect(getPlanSlug('unit-s2')).toBe('x-y-z')
    } finally {
      clearAllPlanSlugs()
    }
  })
})
