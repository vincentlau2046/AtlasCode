/**
 * AD-11 + PT-29（0.1.51 C-5，CC 2.1.111）/less-permission-prompts skill——
 * allowlist 契约判别单测（工单 §1.4/§2，**修前红：skill 面不存在**）。
 *
 * 契约面（工单 §2 行）：
 *   ① skill 面在场（扫描/提案/写入/注册 4 导出，修前红）
 *   ② 频次排序：提案按频次降序（高频 read-only 优先，同频按工具名确定性序）
 *   ③ 只含 read-only 类：Bash 仅 isReadOnlyCommand 前缀族（`Bash(<prefix>:*)`
 *      规则）、内建只读工具裸名、MCP 工具裸名；非只读 Bash（rm/npm
 *      install/git push——即便频次更高）一律排除
 *   ④ settings 写入校验：写 `permissions.allow` 面（0.1.36 硬化原语
 *      addPermissionRulesToSettings，只写 allowlist 不碰 0.1.42 privacy 面）
 *      ——去重 + 已有条目保留（ATLAS_CONFIG_DIR 隔离真 settings fs）
 *   ⑤ 无候选支：transcript 无 read-only 调用 → 提示块 + 零写入
 *   ⑧ 注册面：registerLessPermissionPromptsSkill 落 registry（userInvocable
 *      = /help 可见；标签面计入 /help 权威集 〔#308 基线 50→52 订正见回执〕）
 *   ⑥ 零回归：engine 只读前缀族现状钉桩（修前绿，防单一事实源漂移）
 *
 * 分层纪律：纯逻辑 + 隔离 settings fs（无网络/无 PTY/无 LLM）→ unit 层。
 * absent-export 模式：skill 模块修前不存在 → 动态 import catch → {}，
 * 契约断言经可选调用（fn?.()）红于正确判别点，⑥ 零回归项不被连带。
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// settings fs 隔离须在 skill/settings 模块首次加载前置位（repo 先例 =
// AD-14 func 测同口径；--isolate 每文件独立进程，顶层置位不外泄）。
const cfgDir = await mkdtemp(join(tmpdir(), 'atlas-lpp-'))
process.env.ATLAS_CONFIG_DIR = cfgDir

const SKILL_PATH = '../../src/tui/skills/bundled/lessPermissionPrompts.js'

const skill = (await import(SKILL_PATH).catch(() => ({}))) as Partial<{
  extractToolCallFrequencies: (m: unknown[]) => unknown[]
  buildAllowlistProposal: (
    m: unknown[],
    limit?: number,
  ) => Array<{ toolName: string; ruleContent?: string; frequency: number }>
  writeAllowlistToSettings: (
    c: Array<{ toolName: string; ruleContent?: string }>,
  ) => boolean
  runLessPermissionPrompts: (
    args: string,
    context: { messages?: unknown[] },
  ) => Promise<Array<{ type: string; text: string }>>
  registerLessPermissionPromptsSkill: () => void
}>

const {
  getBundledSkills,
  clearBundledSkills,
} = await import('../../src/tui/skills/bundledSkills.js')
const {
  getSettingsForSource,
  updateSettingsForSource,
} = await import('../../src/tui/utils/settings/settings.js')
const {
  isReadOnlyCommand,
} = await import('../../src/engine/tools/bash/bashReadOnly.js')

afterAll(async () => {
  delete process.env.ATLAS_CONFIG_DIR
  await rm(cfgDir, { recursive: true, force: true })
})

function toolUseMsg(name: string, input: unknown): Record<string, unknown> {
  return {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: 't1', name, input }],
    },
  }
}

function repeat<T>(v: T, n: number): T[] {
  return Array.from({ length: n }, () => v)
}

/** ②③ 共用 transcript：read-only 与写类调用混排，写类频次刻意更高。 */
const TRANSCRIPT: unknown[] = [
  ...repeat(toolUseMsg('Read', { file_path: 'a.ts' }), 5),
  ...repeat(toolUseMsg('Bash', { command: 'git status' }), 3),
  ...repeat(toolUseMsg('mcp__docs__search', { q: 'x' }), 2),
  toolUseMsg('Bash', { command: 'ls -la' }),
  ...repeat(toolUseMsg('Bash', { command: 'rm -rf /tmp/scratch' }), 10),
  ...repeat(toolUseMsg('Bash', { command: 'npm install' }), 5),
  ...repeat(toolUseMsg('Bash', { command: 'git push' }), 3),
]

describe('AD-11 /less-permission-prompts skill allowlist 契约', () => {
  test('① skill 面在场：4 核心导出 + 注册函数（修前红：模块不存在）', () => {
    expect(typeof skill.buildAllowlistProposal).toBe('function')
    expect(typeof skill.writeAllowlistToSettings).toBe('function')
    expect(typeof skill.runLessPermissionPrompts).toBe('function')
    expect(typeof skill.registerLessPermissionPromptsSkill).toBe('function')
  })

  test('② 频次排序：提案按频次降序（同频工具名确定性序）', () => {
    const proposal = skill.buildAllowlistProposal?.(TRANSCRIPT, 10) ?? []
    expect(
      proposal.map(c => c.toolName),
    ).toEqual(['Read', 'Bash', 'mcp__docs__search', 'Bash'])
    expect(proposal.map(c => c.frequency)).toEqual([5, 3, 2, 1])
  })

  test('③ 只含 read-only 类：Bash 前缀规则 + 内建/MCP 裸名，写类排除', () => {
    const proposal = skill.buildAllowlistProposal?.(TRANSCRIPT, 10) ?? []
    const ruleStrings = proposal
      .map(c => (c.ruleContent ? `${c.toolName}(${c.ruleContent})` : c.toolName))
      .join('|')
    // read-only 前缀规则（legacy :* 前缀语法）+ 内建只读 + MCP 裸名
    expect(ruleStrings).toContain('Bash(git status:*)')
    expect(ruleStrings).toContain('Bash(ls:*)')
    expect(ruleStrings).toContain('Read')
    expect(ruleStrings).toContain('mcp__docs__search')
    // 非只读类一律缺席（即便 rm 频次 ×10 最高）
    for (const banned of ['rm', 'npm install', 'git push']) {
      expect(ruleStrings).not.toContain(banned)
    }
  })

  test('④ settings 写入校验：permissions.allow 去重 + 已有条目保留', () => {
    // 预置一条既有 allow 规则
    const seed = updateSettingsForSource('userSettings', {
      permissions: { allow: ['Grep'] },
    })
    expect(seed.error).toBeUndefined()

    const ok = skill.writeAllowlistToSettings?.([
      { toolName: 'Read' },
      { toolName: 'Bash', ruleContent: 'git status:*' },
    ])
    expect(ok).toBe(true)

    const settings = getSettingsForSource('userSettings')
    const allow = settings?.permissions?.allow ?? []
    expect(allow).toContain('Grep') // 已有条目保留
    expect(allow).toContain('Read')
    expect(allow).toContain('Bash(git status:*)')

    // 幂等：二次写入不产生重复
    skill.writeAllowlistToSettings?.([
      { toolName: 'Read' },
      { toolName: 'Bash', ruleContent: 'git status:*' },
    ])
    const allow2 = getSettingsForSource('userSettings')?.permissions?.allow ?? []
    expect(allow2.filter(r => r === 'Read').length).toBe(1)
    expect(allow2.filter(r => r === 'Bash(git status:*)').length).toBe(1)
  })

  test('⑤ 无候选支：零 read-only 调用 → 提示块 + 零写入', async () => {
    const blocks =
      (await skill.runLessPermissionPrompts?.(
        '',
        { messages: [toolUseMsg('Bash', { command: 'rm -rf /tmp/x' })] },
      )) ?? []
    expect(blocks.length).toBeGreaterThanOrEqual(1)
    const text = blocks.map(b => b.text).join('\n')
    expect(text).toContain('No read-only')
    // 零写入：未产生任何 allow 规则
    const allow = getSettingsForSource('userSettings')?.permissions?.allow ?? []
    expect(allow.some(r => r.includes('rm'))).toBe(false)
  })

  test('⑧ 注册面：registry 含 skill 命令（userInvocable → /help 可见）', () => {
    const before = getBundledSkills().length
    try {
      skill.registerLessPermissionPromptsSkill?.()
      const found = getBundledSkills().find(
        c => c.name === 'less-permission-prompts',
      )
      expect(found).toBeDefined()
      expect(found?.userInvocable).toBe(true)
      expect(found?.isHidden).toBe(false)
    } finally {
      clearBundledSkills()
      // 恢复 registry 到本文件进程内初始态（修前 = 空；修后 init 未跑亦为空）
      expect(getBundledSkills().length).toBe(before)
    }
  })

  test('⑥ 零回归：engine 只读前缀族现状钉桩（单一事实源，修前绿）', () => {
    expect(isReadOnlyCommand('git status')).toBe(true)
    expect(isReadOnlyCommand('ls -la')).toBe(true)
    expect(isReadOnlyCommand('rm -rf /')).toBe(false)
    expect(isReadOnlyCommand('ls && rm -rf /')).toBe(false) // 操作符守卫
    expect(isReadOnlyCommand('npm install')).toBe(false)
  })
})
