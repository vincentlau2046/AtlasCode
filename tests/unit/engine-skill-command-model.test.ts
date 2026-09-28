/**
 * engine/skill 域 D 波 S-E2a unit 层（零盘零模型）：技能命令工厂 +
 * frontmatter 全字段解析 + 命令模型面纯函数族（findCommand/getCommand/
 * formatDescriptionWithSource/meetsAvailabilityRequirement/
 * getMcpSkillCommands）。
 */
import { describe, expect, test } from 'bun:test'

import { getSessionId } from '../../src/bootstrap'
import {
  createSkillCommand,
  findCommand,
  formatDescriptionWithSource,
  getCommand,
  getMcpSkillCommands,
  hasCommand,
  meetsAvailabilityRequirement,
  parseSkillFrontmatterFields,
  type Command,
} from '../../src/engine/skill'

function makeCommand(
  overrides: Partial<Command> & { name: string; description: string },
): Command {
  return {
    type: 'prompt',
    progressMessage: 'running',
    contentLength: 0,
    source: 'skills',
    loadedFrom: 'skills',
    getPromptForCommand: async () => [],
    ...overrides,
  } as Command
}

describe('parseSkillFrontmatterFields', () => {
  const fm = (o: Record<string, unknown>) => o as never

  test('description 缺失 → 首行提取（标题剥离 + 100 字截断 + 默认标签）', () => {
    const r = parseSkillFrontmatterFields(
      fm({}),
      '# My Skill\nbody',
      'sk',
    )
    expect(r.description).toBe('My Skill')
    expect(r.hasUserSpecifiedDescription).toBe(false)

    const r2 = parseSkillFrontmatterFields(
      fm({ description: 'explicit' }),
      '# My Skill',
      'sk',
    )
    expect(r2.description).toBe('explicit')
    expect(r2.hasUserSpecifiedDescription).toBe(true)

    // 显式 frontmatter description 不截断（ground truth：仅 markdown
    // 回落路径截断 100 字）
    const long = 'x'.repeat(150)
    const r3 = parseSkillFrontmatterFields(fm({ description: long }), '', 'sk')
    expect(r3.description).toBe(long)
    // markdown 回落路径：首行提取 + 100 字截断
    const r4 = parseSkillFrontmatterFields(fm({}), long, 'sk')
    expect(r4.description).toBe('x'.repeat(97) + '...')
  })

  test('user-invocable 缺省 true / 显式 false；disable-model-invocation 缺省 false', () => {
    const r = parseSkillFrontmatterFields(fm({}), 'body', 'sk')
    expect(r.userInvocable).toBe(true)
    expect(r.disableModelInvocation).toBe(false)

    const r2 = parseSkillFrontmatterFields(
      fm({ 'user-invocable': 'false', 'disable-model-invocation': '1' }),
      'body',
      'sk',
    )
    expect(r2.userInvocable).toBe(false)
    expect(r2.disableModelInvocation).toBe(true)
  })

  test('model inherit → undefined；role 别名小写；自定义串透传', () => {
    expect(
      parseSkillFrontmatterFields(fm({ model: 'inherit' }), 'b', 'sk').model,
    ).toBeUndefined()
    expect(parseSkillFrontmatterFields(fm({ model: 'Fast' }), 'b', 'sk').model)
      .toBe('fast')
    expect(
      parseSkillFrontmatterFields(fm({ model: 'My-Model' }), 'b', 'sk').model,
    ).toBe('My-Model')
  })

  test('context: fork 收窄 executionContext；agent 透传', () => {
    const r = parseSkillFrontmatterFields(
      fm({ context: 'fork', agent: 'explorer' }),
      'b',
      'sk',
    )
    expect(r.executionContext).toBe('fork')
    expect(r.agent).toBe('explorer')
    expect(
      parseSkillFrontmatterFields(fm({ context: 'inline' }), 'b', 'sk')
        .executionContext,
    ).toBeUndefined()
  })

  test('Custom command 回退标签', () => {
    const r = parseSkillFrontmatterFields(fm({}), '# C1', 'cmd', 'Custom command')
    expect(r.description).toBe('C1')
    // 空内容 → 默认标签直出
    const r2 = parseSkillFrontmatterFields(fm({}), '', 'cmd', 'Custom command')
    expect(r2.description).toBe('Custom command')
  })
})

describe('createSkillCommand', () => {
  test('字段装配（argNames 空 → undefined；isHidden = !userInvocable）', () => {
    const cmd = createSkillCommand({
      skillName: 'sk',
      displayName: undefined,
      description: 'd',
      hasUserSpecifiedDescription: true,
      markdownContent: 'body',
      allowedTools: [],
      argumentHint: undefined,
      argumentNames: [],
      whenToUse: undefined,
      version: undefined,
      model: undefined,
      disableModelInvocation: false,
      userInvocable: false,
      source: 'userSettings',
      baseDir: undefined,
      loadedFrom: 'skills',
      hooks: undefined,
      executionContext: undefined,
      agent: undefined,
      paths: undefined,
      effort: undefined,
      shell: undefined,
    })
    expect(cmd.name).toBe('sk')
    expect(cmd.argNames).toBeUndefined()
    expect(cmd.isHidden).toBe(true)
    expect(cmd.contentLength).toBe(4)
    expect(cmd.userFacingName()).toBe('sk')
  })

  test('getPromptForCommand：baseDir 前缀 + 参数替换 + ATLAS_SKILL_DIR/SESSION_ID 注入', async () => {
    const cmd = createSkillCommand({
      skillName: 'sk',
      displayName: 'Sk',
      description: 'd',
      hasUserSpecifiedDescription: true,
      markdownContent:
        'Use $ARGUMENTS at ${ATLAS_SKILL_DIR} session ${ATLAS_SESSION_ID}',
      allowedTools: [],
      argumentHint: undefined,
      argumentNames: ['one'],
      whenToUse: undefined,
      version: undefined,
      model: undefined,
      disableModelInvocation: false,
      userInvocable: true,
      source: 'projectSettings',
      baseDir: '/proj/.atlas/skills/sk',
      loadedFrom: 'skills',
      hooks: undefined,
      executionContext: undefined,
      agent: undefined,
      paths: undefined,
      effort: undefined,
      shell: undefined,
    })
    const blocks = await cmd.getPromptForCommand('a b', {})
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.type).toBe('text')
    const text = blocks[0]!.text
    expect(text.startsWith('Base directory for this skill: /proj/.atlas/skills/sk\n\n'))
      .toBe(true)
    expect(text).toContain('Use a b at /proj/.atlas/skills/sk')
    expect(text).toContain(`session ${getSessionId()}`)
  })

  test('命名参 $one 按位置映射（frontmatter arguments 声明）', async () => {
    const cmd = createSkillCommand({
      skillName: 'sk',
      displayName: undefined,
      description: 'd',
      hasUserSpecifiedDescription: true,
      markdownContent: '$one / $ARGUMENTS',
      allowedTools: [],
      argumentHint: undefined,
      argumentNames: ['one'],
      whenToUse: undefined,
      version: undefined,
      model: undefined,
      disableModelInvocation: false,
      userInvocable: true,
      source: 'userSettings',
      baseDir: undefined,
      loadedFrom: 'commands_DEPRECATED',
      hooks: undefined,
      executionContext: undefined,
      agent: undefined,
      paths: undefined,
      effort: undefined,
      shell: undefined,
    })
    const blocks = await cmd.getPromptForCommand('val rest', {})
    // $one → val（位置 0）；$ARGUMENTS 全参串命中 → 无尾段追加
    expect(blocks[0]!.text).toBe('val / val rest')
  })
})

describe('命令模型面纯函数族', () => {
  test('findCommand：name / userFacingName / 别名三态', () => {
    const cmds = [
      makeCommand({
        name: 'ns:real',
        description: 'd',
        userFacingName: () => 'display',
        aliases: ['al'],
      }),
    ]
    expect(findCommand('ns:real', cmds)?.name).toBe('ns:real')
    expect(findCommand('display', cmds)?.name).toBe('ns:real')
    expect(findCommand('al', cmds)?.name).toBe('ns:real')
    expect(findCommand('nope', cmds)).toBeUndefined()
    expect(hasCommand('al', cmds)).toBe(true)
  })

  test('getCommand 未命中抛 ReferenceError（含可用命令清单）', () => {
    const cmds = [makeCommand({ name: 'a', description: 'd' })]
    expect(() => getCommand('zzz', cmds)).toThrow(ReferenceError)
    expect(() => getCommand('zzz', cmds)).toThrow('Available commands: a')
  })

  test('formatDescriptionWithSource 来源标注族', () => {
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'b', description: 'd', source: 'bundled' }),
      ),
    ).toBe('d (bundled)')
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'm', description: 'd', source: 'mcp' }),
      ),
    ).toBe('d')
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'b2', description: 'd', source: 'builtin' }),
      ),
    ).toBe('d')
    expect(
      formatDescriptionWithSource(
        makeCommand({
          name: 'p',
          description: 'd',
          source: 'plugin',
          pluginInfo: {
            pluginManifest: { name: 'my-plugin' },
            repository: 'r',
          },
        }),
      ),
    ).toBe('(my-plugin) d')
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'p2', description: 'd', source: 'plugin' }),
      ),
    ).toBe('d (plugin)')
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'w', description: 'd', kind: 'workflow' }),
      ),
    ).toBe('d (workflow)')
    // 头注 ⑧：source 字串直出（getSettingSourceName 面裁）
    expect(
      formatDescriptionWithSource(
        makeCommand({ name: 'u', description: 'd', source: 'userSettings' }),
      ),
    ).toBe('d (userSettings)')
  })

  test('meetsAvailabilityRequirement：无 availability 通用；vendor 支 env 门', () => {
    const base = {
      name: 'c',
      description: 'd',
      availability: ['vendor'],
    } as unknown as Command
    const saved = {
      key: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.ATLAS_MODEL,
    }
    try {
      delete process.env.OPENAI_API_KEY
      delete process.env.OPENAI_BASE_URL
      delete process.env.ATLAS_MODEL
      expect(meetsAvailabilityRequirement(base)).toBe(false)
      process.env.ATLAS_MODEL = 'm'
      expect(meetsAvailabilityRequirement(base)).toBe(true)
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }
  })

  test('console 支：OPENAI_BASE_URL 设真 = 非 first-party（IFF 语义）', () => {
    const saved = process.env.OPENAI_BASE_URL
    try {
      delete process.env.OPENAI_BASE_URL
      expect(
        meetsAvailabilityRequirement(
          { name: 'c', description: 'd', availability: ['console'] } as Command,
        ),
      ).toBe(true)
      process.env.OPENAI_BASE_URL = 'https://proxy.example'
      expect(
        meetsAvailabilityRequirement(
          { name: 'c', description: 'd', availability: ['console'] } as Command,
        ),
      ).toBe(false)
    } finally {
      if (saved === undefined) delete process.env.OPENAI_BASE_URL
      else process.env.OPENAI_BASE_URL = saved
    }
  })

  test('getMcpSkillCommands：prompt + loadedFrom mcp + 非禁调过滤', () => {
    const mcp = [
      makeCommand({
        name: 'ok',
        description: 'd',
        loadedFrom: 'mcp',
        source: 'mcp',
      }),
      makeCommand({
        name: 'blocked',
        description: 'd',
        loadedFrom: 'mcp',
        source: 'mcp',
        disableModelInvocation: true,
      }),
      makeCommand({ name: 'local', description: 'd', source: 'skills' }),
    ]
    expect(getMcpSkillCommands(mcp).map(c => c.name)).toEqual(['ok'])
  })
})
