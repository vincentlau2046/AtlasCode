/**
 * 2026-10-04 P0a 可解释审批（spec docs/tui-differentiation-spec.md §4-P0a）——
 * verdict 一行纯面（permissionVerdict.ts）+ 用户批准标记（userApprovals.ts）
 * 判别单测（mutation-red 风）：
 *
 *   1. verdict 三态（spec §1 钉死）：rule 命中 → ruleValue + source（非 r-NN）；
 *      classifier → 分类器名 + reason；mode/other → 哪个 mode。
 *   2. 数值置信度不出现（P0a-no-conf absent 型探针的单测侧）：任一输出
 *      不匹配 数值+%/confidence 族正则。
 *   3. reason 缺省 → null（弹框保持原样，不加行）。
 *   4. userApprovals 标记 set/get/delete 生命周期。
 *
 * 弹框/卡片渲染面活判别归 b8 的 PTY 验收（user-e2e/tui-diff/accept.ts P0a）；
 * 本文件钉纯面本体 + 标记面。
 */
import { describe, expect, it } from 'bun:test'
import {
  VERDICT_PREFIX,
  successCardRenderMode,
  verdictLine,
} from '../../src/tui/components/permissions/permissionVerdict.js'
import type {
  PermissionDecisionReason,
  PermissionRule,
} from '../../src/tui/types/permissions.js'
import {
  deleteUserApproval,
  getUserApproval,
  setUserApproval,
} from '../../src/tui/utils/userApprovals.js'

function rule(
  source: PermissionRule['source'],
  ruleBehavior: PermissionRule['ruleBehavior'],
  ruleContent?: string,
): PermissionRule {
  return {
    source,
    ruleBehavior,
    ruleValue: { toolName: 'Bash', ruleContent },
  }
}

// spec P0a-no-conf：任一 verdict 输出不得出现数值置信度（% / confidence / 置信）。
const NUMERIC_CONFIDENCE = /(\d+(\.\d+)?\s*(%|confidence|置信))/i

describe('verdictLine（P0a 审批面 verdict 一行；A4 句式定稿 2026-10-05 §4b）', () => {
  it('rule 态（ask/deny）：Rule "<ruleValue>" from <source> requires confirmation.', () => {
    const line = verdictLine(
      { type: 'rule', rule: rule('projectSettings', 'ask', 'echo probe:*') },
      'default',
    )
    expect(line).toBe(
      `${VERDICT_PREFIX}: Rule "Bash(echo probe:*)" from shared project settings requires confirmation.`,
    )
    expect(
      verdictLine({ type: 'rule', rule: rule('userSettings', 'deny') }, 'default'),
    ).toBe(`${VERDICT_PREFIX}: Rule "Bash" from user settings requires confirmation.`)
  })

  it('rule 态（allow）：Allowed by rule "<ruleValue>" (<source>).', () => {
    expect(
      verdictLine({ type: 'rule', rule: rule('userSettings', 'allow') }, 'default'),
    ).toBe(`${VERDICT_PREFIX}: Allowed by rule "Bash" (user settings).`)
  })

  it('rule 态：无 ruleContent 时仅工具名（Bash 非 Bash(*)）', () => {
    const line = verdictLine(
      { type: 'rule', rule: rule('localSettings', 'ask') },
      'default',
    )
    expect(line).toBe(
      `${VERDICT_PREFIX}: Rule "Bash" from project local settings requires confirmation.`,
    )
  })

  it('classifier 态（危险 flag）：Auto mode: classifier flagged this as dangerous.', () => {
    const line = verdictLine(
      {
        type: 'classifier',
        classifier: 'auto-mode',
        reason: 'writes to .atlas/ config',
      },
      'auto',
    )
    expect(line).toBe(`${VERDICT_PREFIX}: Auto mode: classifier flagged this as dangerous.`)
  })

  it('classifier 态（自动放行）：Auto-approved by classifier: <reason>.', () => {
    const line = verdictLine(
      {
        type: 'classifier',
        classifier: 'auto-mode',
        reason: 'writes to .atlas/ config',
      },
      'auto',
      'Bash',
      true,
    )
    expect(line).toBe(
      `${VERDICT_PREFIX}: Auto-approved by classifier: writes to .atlas/ config.`,
    )
  })

  it('mode 态：default mode requires confirmation for <tool>.', () => {
    expect(
      verdictLine({ type: 'other', reason: 'This command requires approval' }, 'default', 'Bash'),
    ).toBe(`${VERDICT_PREFIX}: default mode requires confirmation for Bash.`)
    // plan 标签已含 mode（Plan Mode）→ 去重不叠 "mode mode"
    expect(
      verdictLine({ type: 'mode', mode: 'plan' }, 'plan', 'Bash'),
    ).toBe(`${VERDICT_PREFIX}: plan mode requires confirmation for Bash.`)
  })

  it('mode 态：toolName 缺省回落 this command（旧 2 参调用点兼容）', () => {
    expect(
      verdictLine({ type: 'other', reason: 'This command requires approval' }, 'default'),
    ).toBe(`${VERDICT_PREFIX}: default mode requires confirmation for this command.`)
  })

  it('mode/other 归一（bypass 态）：Bypass mode — all commands allowed.', () => {
    expect(
      verdictLine({ type: 'other', reason: 'x' }, 'bypassPermissions', 'Bash'),
    ).toBe(`${VERDICT_PREFIX}: Bypass mode — all commands allowed.`)
    expect(
      verdictLine({ type: 'mode', mode: 'default' }, 'bypassPermissions', 'Bash'),
    ).toBe(`${VERDICT_PREFIX}: Bypass mode — all commands allowed.`)
  })

  it('hook 态：钩子名 + 来源 + reason', () => {
    const line = verdictLine(
      {
        type: 'hook',
        hookName: 'PreToolUse',
        hookSource: 'project',
        reason: 'blocked by hook',
      },
      'default',
    )
    expect(line).toContain('hook "PreToolUse" (project) says: blocked by hook')
  })

  it('subcommandResults 态：子命令计数 + mode', () => {
    const line = verdictLine(
      {
        type: 'subcommandResults',
        reasons: new Map<string, never>([
          ['cmd a', undefined as never],
          ['cmd b', undefined as never],
        ]),
      },
      'default',
    )
    expect(line).toContain('2 sub-commands checked')
    expect(line).toContain('Default mode asks you')
  })

  it('safetyCheck / workingDir / sandboxOverride / asyncAgent / permissionPromptTool 各有形', () => {
    expect(
      verdictLine({ type: 'safetyCheck', reason: 'sensitive path', classifierApprovable: true }, 'default'),
    ).toContain('safety check — sensitive path')
    expect(
      verdictLine({ type: 'workingDir', reason: 'outside working dir' }, 'default'),
    ).toContain('outside working dir')
    expect(
      verdictLine({ type: 'sandboxOverride', reason: 'excludedCommand' }, 'default'),
    ).toContain('sandbox override (excludedCommand)')
    expect(
      verdictLine({ type: 'asyncAgent', reason: 'agent pending' }, 'default'),
    ).toContain('agent pending')
    expect(
      verdictLine(
        { type: 'permissionPromptTool', permissionPromptToolName: 'AskUserQuestion', toolResult: null },
        'default',
      ),
    ).toContain('AskUserQuestion handled this request')
  })

  it('reason 缺省 → null（不渲染，弹框保持原样）', () => {
    expect(verdictLine(undefined, 'default')).toBeNull()
  })

  it('P0a-no-conf：任一输出无数值置信度（% / confidence / 置信）', () => {
    const cases: Array<PermissionDecisionReason | undefined> = [
      undefined,
      { type: 'rule', rule: rule('projectSettings', 'ask', 'echo probe:*') },
      { type: 'classifier', classifier: 'auto-mode', reason: 'writes to .atlas/' },
      { type: 'mode', mode: 'plan' },
      { type: 'other', reason: 'This command requires approval' },
      { type: 'hook', hookName: 'PreToolUse', reason: 'blocked' },
    ]
    for (const reason of cases) {
      const line = verdictLine(reason, 'default')
      if (line !== null) {
        expect(NUMERIC_CONFIDENCE.test(line)).toBe(false)
      }
    }
  })
})

describe('successCardRenderMode（P0a allow 面修：无结果渲染器工具的批准标记行）', () => {
  // 根因（b8 第 4 轮 cardAllow FAIL）：UserToolSuccessMessage 对
  // renderedMessage === null（工具无 renderToolResultMessage，如 TUI-lane Bash
  // 桥接适配器）早退 return null，把已 set 的用户批准标记行一并跳过。
  // 修：marker 存在时放行 marker-only 渲染形；否则零行为变更。
  it('renderedMessage 非 null → full（有无标记都走原形）', () => {
    expect(successCardRenderMode({ type: 'element' }, true)).toBe('full')
    expect(successCardRenderMode({ type: 'element' }, false)).toBe('full')
  })

  it('Bash 适配器鉴别例：renderedMessage null + userApproved → marker（批准标记行可见）', () => {
    expect(successCardRenderMode(null, true)).toBe('marker')
  })

  it('renderedMessage null + 无标记 → skip（零行为变更：未批准仍早退）', () => {
    expect(successCardRenderMode(null, false)).toBe('skip')
  })

  it('classifier/yolo 行不受本决策影响（无对应入参 = 不引入新门控）', () => {
    // 签名仅 (renderedMessage, userApproved)：classifier 态工具若无结果渲染器
    // 且无用户标记，仍 skip（原语义）；有标记则 marker（批准优先于分类器行）。
    expect(successCardRenderMode(null, true)).toBe('marker')
  })
})

describe('userApprovals（P0a 用户批准标记）', () => {
  it('set → get true → delete → get false（生命周期）', () => {
    expect(getUserApproval('tu-1')).toBe(false)
    setUserApproval('tu-1')
    expect(getUserApproval('tu-1')).toBe(true)
    deleteUserApproval('tu-1')
    expect(getUserApproval('tu-1')).toBe(false)
  })

  it('按 toolUseID 隔离', () => {
    setUserApproval('tu-a')
    expect(getUserApproval('tu-b')).toBe(false)
    deleteUserApproval('tu-a')
    deleteUserApproval('tu-b')
  })
})
