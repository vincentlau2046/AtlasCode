/**
 * permissions 域 permissionRuleParser 纯字符串函数组 契约测试（E-4 S-4a，§8.32）。
 *
 * 被测能力（旧仓 permissionRuleParser.ts 183L 双落位裁定，逐字支）：
 *   - escape/unescape 顺序契约（先反斜杠后括号 / 逆序）
 *   - parse 三态（裸工具名 / 括号内容 / 转义括号）+ 边缘态（无匹配右括号 /
 *     右括号后尾内容 / 空工具名 '(foo)' / 'Bash()' 与 'Bash(*)' → tool-wide）
 *   - toString 往返（escape/unescape 对称）
 *   - LEGACY alias 注入窗口（未注入 = identity 安全降级 / 注入生效 /
 *     getLegacyToolNames 插入序）
 * L3：只 import permissions 域根门面；alias 表由本测显式注入（不消费 engine 侧
 * 注册——engine 侧注册生效 + 同步钉见 engine-tools-legacy-aliases.test.ts）。
 * beforeEach reset 隔离模块态（单进程多文件连跑不串态）。
 */
import { describe, test, expect, beforeEach } from 'bun:test'
import {
  escapeRuleContent,
  unescapeRuleContent,
  permissionRuleValueFromString,
  permissionRuleValueToString,
  normalizeLegacyToolName,
  getLegacyToolNames,
  setLegacyToolNameAliases,
  resetLegacyToolNameAliases,
} from '../../src/permissions'

beforeEach(() => {
  resetLegacyToolNameAliases()
})

// ── escape / unescape ──────────────────────────────────────────────────

describe('permissionRuleParser escape/unescape（§8.32 顺序契约）', () => {
  test('括号转义（旧仓 doc 例）', () => {
    expect(escapeRuleContent('psycopg2.connect()')).toBe(
      'psycopg2.connect\\(\\)',
    )
  })

  test('反斜杠先转义（旧仓 doc 例）', () => {
    // 输入 = 字面 `echo "test\nvalue"`（\ 为字面反斜杠 n）
    expect(escapeRuleContent('echo "test\\nvalue"')).toBe(
      'echo "test\\\\nvalue"',
    )
  })

  test('unescape 为 escape 逆操作（往返对称）', () => {
    const inputs = [
      'psycopg2.connect()',
      'echo "test\\nvalue"',
      'a(b)\\c(d)',
      'no-special-chars',
    ]
    for (const input of inputs) {
      expect(unescapeRuleContent(escapeRuleContent(input))).toBe(input)
    }
  })
})

// ── parse 三态 + 边缘态 ────────────────────────────────────────────────

describe('permissionRuleParser permissionRuleValueFromString（§8.32 三态）', () => {
  test('裸工具名（无括号）', () => {
    expect(permissionRuleValueFromString('Bash')).toEqual({ toolName: 'Bash' })
  })

  test('括号内容（普通内容）', () => {
    expect(permissionRuleValueFromString('Bash(npm install)')).toEqual({
      toolName: 'Bash',
      ruleContent: 'npm install',
    })
  })

  test('转义括号内容（旧仓 doc 例）', () => {
    expect(
      permissionRuleValueFromString('Bash(python -c "print\\(1\\)")'),
    ).toEqual({ toolName: 'Bash', ruleContent: 'python -c "print(1)"' })
  })

  test('内容内嵌转义括号 + 字面反斜杠组合', () => {
    expect(permissionRuleValueFromString('Bash(echo \\(hi\\))')).toEqual({
      toolName: 'Bash',
      ruleContent: 'echo (hi)',
    })
  })

  test('边缘：无匹配右括号 → 整体当工具名', () => {
    expect(permissionRuleValueFromString('Bash(unbalanced')).toEqual({
      toolName: 'Bash(unbalanced',
    })
  })

  test('边缘：右括号后有尾内容 → 整体当工具名', () => {
    expect(permissionRuleValueFromString('Bash(foo) bar')).toEqual({
      toolName: 'Bash(foo) bar',
    })
  })

  test("边缘：空工具名 '(foo)' → 整体当工具名", () => {
    expect(permissionRuleValueFromString('(foo)')).toEqual({ toolName: '(foo)' })
  })

  test("边缘：空内容 'Bash()' → tool-wide 规则（无 ruleContent）", () => {
    expect(permissionRuleValueFromString('Bash()')).toEqual({ toolName: 'Bash' })
  })

  test("边缘：裸通配 'Bash(*)' → tool-wide 规则（无 ruleContent）", () => {
    expect(permissionRuleValueFromString('Bash(*)')).toEqual({ toolName: 'Bash' })
  })
})

// ── toString 往返 ──────────────────────────────────────────────────────

describe('permissionRuleParser permissionRuleValueToString（§8.32 往返）', () => {
  test('仅工具名 → 裸串', () => {
    expect(permissionRuleValueToString({ toolName: 'Bash' })).toBe('Bash')
  })

  test('带内容 → 括号包裹（内容括号转义）', () => {
    expect(
      permissionRuleValueToString({ toolName: 'Bash', ruleContent: 'npm install' }),
    ).toBe('Bash(npm install)')
    expect(
      permissionRuleValueToString({
        toolName: 'Bash',
        ruleContent: 'python -c "print(1)"',
      }),
    ).toBe('Bash(python -c "print\\(1\\)")')
  })

  test('toString → fromString 全往返（含转义内容）', () => {
    const v = { toolName: 'Bash', ruleContent: 'python -c "print(1)"' }
    expect(permissionRuleValueFromString(permissionRuleValueToString(v))).toEqual(v)
  })
})

// ── LEGACY alias 注入窗口 ──────────────────────────────────────────────

describe('permissionRuleParser LEGACY alias 注入窗口（§8.32）', () => {
  test('未注入 = identity 安全降级（reset 后 legacy 名不归一）', () => {
    expect(normalizeLegacyToolName('Task')).toBe('Task')
    expect(permissionRuleValueFromString('Task')).toEqual({ toolName: 'Task' })
    expect(getLegacyToolNames('Agent')).toEqual([])
  })

  test('注入后 parse 时归一（裸名 + 带内容两形态）', () => {
    setLegacyToolNameAliases({ Task: 'Agent', KillShell: 'TaskStop' })
    expect(permissionRuleValueFromString('Task')).toEqual({ toolName: 'Agent' })
    expect(permissionRuleValueFromString('Task(npm i)')).toEqual({
      toolName: 'Agent',
      ruleContent: 'npm i',
    })
    expect(normalizeLegacyToolName('KillShell')).toBe('TaskStop')
  })

  test('getLegacyToolNames 插入序（旧仓逐字 Object.entries）', () => {
    setLegacyToolNameAliases({
      AgentOutputTool: 'TaskOutput',
      BashOutputTool: 'TaskOutput',
    })
    expect(getLegacyToolNames('TaskOutput')).toEqual([
      'AgentOutputTool',
      'BashOutputTool',
    ])
  })
})
