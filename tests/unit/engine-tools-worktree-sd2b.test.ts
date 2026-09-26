/**
 * engine/tools/worktree S-D2b（§8.57 worktree 工具本体子波）：Enter/
 * ExitWorktree 两本体 unit 面（零盘）。
 *
 * unit 层纪律（同 S-D3/S-D4 对象面先例）：纯对象面 + prompt 面 +
 * mapResult 纯函数面 + isEnabled 门 + checkPermissions allow 固化面 +
 * validateInput 守卫支（无 git 子进程支），无 fixture 无写。真盘 call 支
 * （真 git worktree 创建 / keep / remove / discard 守卫 / ec3 失败封闭）=
 * tests/func/engine-tools-worktree-sd2b-fs.test.ts。
 *
 *  - 两本体对象面（新仓 shared Tool 契约 = 纯对象，非 buildTool；S-B5
 *    先例）：name（toolNames 单一事实源）/ JSON schema 常量同一性
 *    （delta ① 逐字段转写面）/ maxResultSizeChars 100_000 / shouldDefer
 *    true / TOOL_DEFAULTS 成员逐值（delta ③④）/ userFacingName /
 *    toAutoClassifierInput 逐字面 / isDestructive 判别支（Exit
 *    keep false / remove true）/ checkPermissions allow 固化（delta ⑤）。
 *  - isEnabled 门 = isWorktreeModeEnabled（delta ⑥：GA 缺省开 +
 *    ATLAS_DISABLE_WORKTREE_MODE kill-switch 设真即关）——注册表 ⑭
 *    worktree mode 槽自门控面。
 *  - prompt 面 = 旧 prompt() 体逐字（ENTER/EXIT_WORKTREE_PROMPT 锚点行
 *    断言；sha256 字节核 = 实施侧 shell 侧核验，本文件锚点防回归）。
 *  - mapToolResult 纯函数面：两工具 content.message 透传 + tool_use_id。
 *  - validateInput 守卫支（零子进程判别面）：Enter slug 缺省直通 /
 *    合法名直通 / 非法名（'..' 段）拒；Exit 无会话 ec1 no-op 文案 /
 *    有会话 keep 直通（无 git I/O）/ 有会话 remove+discard_changes
 *    直通（跳 countWorktreeChanges，零子进程）。
 *
 * 探针锚点（§8.57，突变须恰好 1 red）：
 *   P-WT1 对象面：schema 常量同一性 + TOOL_DEFAULTS 逐值 +
 *    isDestructive 判别
 *   P-WT2 mapResult 逐字（message 透传 + tool_use_id）
 *   P-WT3 validateInput 守卫支（Enter 非法 slug 拒 / Exit ec1 无会话 /
 *    remove+discard 跳探针直通）
 *   P-WT4 isWorktreeModeEnabled 门（缺省开 / ATLAS_DISABLE_WORKTREE_MODE
 *    设真关 + 两工具 isEnabled 跟随）
 *   P-WT5 prompt 面锚点（模板首行 + `.atlas/worktrees/` 反引号面 +
 *    description() = PROMPT 常量同一性）
 *
 * 深度 import（门面归集，双门面回归面）：../../src/engine/tools（两本体
 * + JSON schema 2 + prompt 面 + 门控）+ ../../src/engine（会话状态机
 * restoreWorktreeSession 复位，S-D2a 面）+ toolNames（engine 门面）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
  ENTER_WORKTREE_PROMPT,
  ENTER_WORKTREE_DESCRIPTION,
  EXIT_WORKTREE_TOOL_INPUT_SCHEMA,
  EXIT_WORKTREE_PROMPT,
  EXIT_WORKTREE_DESCRIPTION,
  EnterWorktreeTool,
  ExitWorktreeTool,
  isWorktreeModeEnabled,
  type EnterWorktreeOutput,
  type ExitWorktreeOutput,
  ENTER_WORKTREE_TOOL_NAME,
  EXIT_WORKTREE_TOOL_NAME,
} from '../../src/engine/tools'
import { restoreWorktreeSession, type WorktreeSession } from '../../src/engine'

// 模块态复位（会话状态机跨测共享进程内模块变量，S-D2a 先例）
beforeEach(() => {
  restoreWorktreeSession(null)
})

const fakeSession: WorktreeSession = {
  originalCwd: '/origin',
  worktreePath: '/wt/sd2b',
  worktreeName: 'sd2b',
  worktreeBranch: 'worktree-sd2b',
  sessionId: 's1',
}

// ── P-WT1 对象面 ──────────────────────────────────────────────────────────
describe('EnterWorktreeTool 对象面（P-WT1）', () => {
  test('name = toolNames 单一事实源 + schema 常量同一性', () => {
    expect(EnterWorktreeTool.name).toBe(ENTER_WORKTREE_TOOL_NAME)
    expect(ENTER_WORKTREE_TOOL_NAME).toBe('EnterWorktree')
    expect(EnterWorktreeTool.inputSchema).toBe(ENTER_WORKTREE_TOOL_INPUT_SCHEMA)
    expect(EnterWorktreeTool.inputJSONSchema).toBe(
      ENTER_WORKTREE_TOOL_INPUT_SCHEMA,
    )
    // delta ①：z.strictObject 宽骨架转写面（无 required，name 可选）
    expect(ENTER_WORKTREE_TOOL_INPUT_SCHEMA.type).toBe('object')
    expect(
      (ENTER_WORKTREE_TOOL_INPUT_SCHEMA.properties as Record<string, unknown>)
        .name,
    ).toEqual({
      type: 'string',
      description:
        'Optional name for the worktree. Each "/"-separated segment may contain only letters, digits, dots, underscores, and dashes; max 64 chars total. A random name is generated if not provided.',
    })
  })

  test('TOOL_DEFAULTS 逐值 + shouldDefer + searchHint + userFacingName', () => {
    expect(EnterWorktreeTool.maxResultSizeChars).toBe(100_000)
    expect(EnterWorktreeTool.shouldDefer).toBe(true)
    expect(EnterWorktreeTool.searchHint).toBe(
      'create an isolated git worktree and switch into it',
    )
    expect(EnterWorktreeTool.isConcurrencySafe({})).toBe(false)
    expect(EnterWorktreeTool.isReadOnly({})).toBe(false)
    expect(EnterWorktreeTool.isDestructive({})).toBe(false)
    expect(EnterWorktreeTool.userFacingName({})).toBe('Creating worktree')
  })

  test('toAutoClassifierInput 逐字面（name ?? 空串）', () => {
    expect(EnterWorktreeTool.toAutoClassifierInput({})).toBe('')
    expect(
      EnterWorktreeTool.toAutoClassifierInput({ name: 'feat/x' }),
    ).toBe('feat/x')
  })
})

describe('ExitWorktreeTool 对象面（P-WT1）', () => {
  test('name = toolNames 单一事实源 + schema 常量同一性（enum 逐字段）', () => {
    expect(ExitWorktreeTool.name).toBe(EXIT_WORKTREE_TOOL_NAME)
    expect(EXIT_WORKTREE_TOOL_NAME).toBe('ExitWorktree')
    expect(ExitWorktreeTool.inputSchema).toBe(EXIT_WORKTREE_TOOL_INPUT_SCHEMA)
    expect(
      (EXIT_WORKTREE_TOOL_INPUT_SCHEMA.properties as Record<string, unknown>)
        .action,
    ).toEqual({
      type: 'string',
      enum: ['keep', 'remove'],
      description:
        '"keep" leaves the worktree and branch on disk; "remove" deletes both.',
    })
    expect(EXIT_WORKTREE_TOOL_INPUT_SCHEMA.required).toEqual(['action'])
  })

  test('TOOL_DEFAULTS 逐值 + isDestructive 判别支（remove 才毁性）', () => {
    expect(ExitWorktreeTool.maxResultSizeChars).toBe(100_000)
    expect(ExitWorktreeTool.shouldDefer).toBe(true)
    expect(ExitWorktreeTool.searchHint).toBe(
      'exit a worktree session and return to the original directory',
    )
    expect(ExitWorktreeTool.isConcurrencySafe({})).toBe(false)
    expect(ExitWorktreeTool.isReadOnly({})).toBe(false)
    expect(ExitWorktreeTool.isDestructive({ action: 'keep' })).toBe(false)
    expect(ExitWorktreeTool.isDestructive({ action: 'remove' })).toBe(true)
    expect(ExitWorktreeTool.userFacingName({})).toBe('Exiting worktree')
  })

  test('toAutoClassifierInput = input.action 逐字面', () => {
    expect(ExitWorktreeTool.toAutoClassifierInput({ action: 'keep' })).toBe(
      'keep',
    )
    expect(ExitWorktreeTool.toAutoClassifierInput({ action: 'remove' })).toBe(
      'remove',
    )
  })
})

// ── checkPermissions allow 固化（delta ⑤）───────────────────────────────
describe('checkPermissions allow 固化（delta ⑤）', () => {
  test('Enter：behavior allow + updatedInput 同引用', async () => {
    const inp = { name: 'x' }
    const r = (await EnterWorktreeTool.checkPermissions(inp, {})) as {
      behavior: string
      updatedInput: unknown
    }
    expect(r.behavior).toBe('allow')
    expect(r.updatedInput).toBe(inp)
  })

  test('Exit：behavior allow + updatedInput 同引用', async () => {
    const inp = { action: 'keep' as const }
    const r = (await ExitWorktreeTool.checkPermissions(inp, {})) as {
      behavior: string
      updatedInput: unknown
    }
    expect(r.behavior).toBe('allow')
    expect(r.updatedInput).toBe(inp)
  })
})

// ── P-WT2 mapResult 逐字面 ───────────────────────────────────────────────
describe('mapToolResult 纯函数面（P-WT2）', () => {
  test('Enter：message 透传 + tool_use_id', () => {
    const out: EnterWorktreeOutput = {
      worktreePath: '/wt',
      message: 'Created worktree at /wt. The session is now working in the worktree. Use ExitWorktree to leave mid-session, or exit the session to be prompted.',
    }
    expect(
      EnterWorktreeTool.mapToolResultToToolResultBlockParam(out, 'tu-1'),
    ).toEqual({
      type: 'tool_result',
      content: out.message,
      tool_use_id: 'tu-1',
    })
  })

  test('Exit：message 透传 + tool_use_id', () => {
    const out: ExitWorktreeOutput = {
      action: 'keep',
      originalCwd: '/origin',
      worktreePath: '/wt',
      message: 'Exited worktree. Your work is preserved at /wt. Session is now back in /origin.',
    }
    expect(
      ExitWorktreeTool.mapToolResultToToolResultBlockParam(out, 'tu-2'),
    ).toEqual({
      type: 'tool_result',
      content: out.message,
      tool_use_id: 'tu-2',
    })
  })
})

// ── P-WT3 validateInput 守卫支（零子进程判别面）──────────────────────────
describe('validateInput 守卫支（P-WT3）', () => {
  test('Enter：name 缺省直通（zod optional 位）', async () => {
    expect(await EnterWorktreeTool.validateInput!({})).toEqual({
      result: true,
    })
  })

  test('Enter：合法 slug 直通（user/feature 嵌套段）', async () => {
    expect(
      await EnterWorktreeTool.validateInput!({ name: 'user/feature' }),
    ).toEqual({ result: true })
  })

  test('Enter：非法 slug（.. 段）拒（errorCode 1 + 文案锚点）', async () => {
    const r = await EnterWorktreeTool.validateInput!({ name: '..' })
    expect(r.result).toBe(false)
    if (r.result === false) {
      expect(r.errorCode).toBe(1)
      expect(r.message).toContain('Invalid worktree name')
    }
  })

  test('Exit：无会话 → ec1 no-op 文案（范围守卫单一入口）', async () => {
    const r = await ExitWorktreeTool.validateInput!({ action: 'keep' })
    expect(r.result).toBe(false)
    if (r.result === false) {
      expect(r.errorCode).toBe(1)
      expect(r.message).toContain(
        'No-op: there is no active EnterWorktree session to exit',
      )
    }
  })

  test('Exit：有会话 keep 直通（无 git I/O 支）', async () => {
    restoreWorktreeSession(fakeSession)
    expect(await ExitWorktreeTool.validateInput!({ action: 'keep' })).toEqual({
      result: true,
    })
  })

  test('Exit：有会话 remove+discard_changes 直通（跳 countWorktreeChanges，零子进程）', async () => {
    restoreWorktreeSession(fakeSession)
    expect(
      await ExitWorktreeTool.validateInput!({
        action: 'remove',
        discard_changes: true,
      }),
    ).toEqual({ result: true })
  })
})

// ── P-WT4 门控面（delta ⑥，注册表 ⑭ 槽自门控）────────────────────────────
describe('isWorktreeModeEnabled 门（P-WT4）', () => {
  test('GA 缺省开（两工具 isEnabled 跟随）', () => {
    expect(isWorktreeModeEnabled()).toBe(true)
    expect(EnterWorktreeTool.isEnabled()).toBe(true)
    expect(ExitWorktreeTool.isEnabled()).toBe(true)
  })

  test('ATLAS_DISABLE_WORKTREE_MODE 设真即关（静默，不提示）', () => {
    const saved = process.env.ATLAS_DISABLE_WORKTREE_MODE
    process.env.ATLAS_DISABLE_WORKTREE_MODE = '1'
    try {
      expect(isWorktreeModeEnabled()).toBe(false)
      expect(EnterWorktreeTool.isEnabled()).toBe(false)
      expect(ExitWorktreeTool.isEnabled()).toBe(false)
    } finally {
      if (saved === undefined) delete process.env.ATLAS_DISABLE_WORKTREE_MODE
      else process.env.ATLAS_DISABLE_WORKTREE_MODE = saved
    }
  })
})

// ── P-WT5 prompt 面（delta ②③）──────────────────────────────────────────
describe('prompt 面（P-WT5）', () => {
  test('ENTER_WORKTREE_PROMPT 锚点行（模板首行 + 反引号面 + 参数段）', () => {
    expect(ENTER_WORKTREE_PROMPT).toContain(
      'Use this tool ONLY when the user explicitly asks to work in a worktree',
    )
    expect(ENTER_WORKTREE_PROMPT).toContain('## When NOT to Use')
    // `\`` 转义序列随迁：运行值 = 单反引号面
    expect(ENTER_WORKTREE_PROMPT).toContain('`.atlas/worktrees/`')
    expect(ENTER_WORKTREE_PROMPT).toContain(
      'A name for the worktree. If not provided, a random name is generated.',
    )
  })

  test('EXIT_WORKTREE_PROMPT 锚点行（范围守卫 no-op 面 + 参数段）', () => {
    expect(EXIT_WORKTREE_PROMPT).toContain(
      'Exit a worktree session created by EnterWorktree and return the session to the original working directory.',
    )
    expect(EXIT_WORKTREE_PROMPT).toContain('**no-op**')
    expect(EXIT_WORKTREE_PROMPT).toContain('`git worktree add`')
  })

  test('description() = PROMPT 常量（唯一 prompt 面同一性）', async () => {
    const descOptions = {
      isNonInteractiveSession: false,
      toolPermissionContext: null,
      tools: [],
    }
    expect(await EnterWorktreeTool.description({}, descOptions)).toBe(
      ENTER_WORKTREE_PROMPT,
    )
    expect(await ExitWorktreeTool.description({}, descOptions)).toBe(
      EXIT_WORKTREE_PROMPT,
    )
  })

  test('DESCRIPTION 短常量留导出不接线（TUI 波前向接缝值锚点）', () => {
    expect(ENTER_WORKTREE_DESCRIPTION).toBe(
      'Creates an isolated worktree (via git or configured hooks) and switches the session into it',
    )
    expect(EXIT_WORKTREE_DESCRIPTION).toBe(
      'Exits a worktree session created by EnterWorktree and restores the original working directory',
    )
  })

  test('renderToolUseMessage 纯字符串面保留（旧 UI.tsx 逐字）', () => {
    expect(EnterWorktreeTool.renderToolUseMessage({}, { theme: null, verbose: false })).toBe(
      'Creating worktree…',
    )
    expect(ExitWorktreeTool.renderToolUseMessage({}, { theme: null, verbose: false })).toBe(
      'Exiting worktree…',
    )
  })
})
