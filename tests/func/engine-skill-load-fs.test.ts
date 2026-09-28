/**
 * engine/skill 域 D 波 S-E2a func 层（真 fs 零模型）：技能装载链
 * （/skills/ 目录形态 + legacy /commands/ 双形态 + realpath 去重）+
 * 条件技能（paths frontmatter → gitignoreMatch 本地 matcher 激活）+
 * 动态发现 + 内置技能引用文件提取（ATLAS_TMPDIR 注入 + nonce 根 +
 * 路径穿越守卫）+ 命令池面（getCommands/getSkillToolCommands）。
 *
 * 分层纪律：func 层真 fs（mkdtemp 真 tmpdir，ATLAS_CONFIG_DIR /
 * ATLAS_TMPDIR 指 tmp；无网络 / 无模型 / 无 PTY）。
 *
 * 当前态门语义断言（残留守登记，非空洞）：
 *   - ALLOWED_SETTING_SOURCES 固定 ['userSettings']（组合根纵切扩展）
 *     → 项目链 /skills/ 不载（getSkillDirCommands 只回 user 源）；
 *     addSkillDirectories 门控早退 no-op；legacy /commands/ 装载分支
 *     恒过（skillsLocked 恒 false），但其 markdownLoader 项目层仍经
 *     isSettingSourceEnabled('projectSettings') 门 → 当前态仅
 *     managed/user 层命令可载。
 *   - 宿主无 /etc/atlas（managed 目录 ENOENT 恒跳过，不断言其内容）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  addSkillDirectories,
  activateConditionalSkillsForPaths,
  clearBundledSkills,
  clearCommandsCache,
  clearDynamicSkills,
  clearSkillCaches,
  discoverSkillDirsForPaths,
  getBundledSkillExtractDir,
  getBundledSkills,
  getBundledSkillsRoot,
  getConditionalSkillCount,
  getCommands,
  getDynamicSkills,
  getSkillDirCommands,
  getSkillToolCommands,
  registerBundledSkill,
  type Command,
} from '../../src/engine/skill'
import { getAtlasTempDir, _resetAtlasTempDirForTest } from '../../src/permissions'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-skill-func-'))
const CFG = join(TMP, 'cfg') // ATLAS_CONFIG_DIR
const PROJ = join(TMP, 'proj') // 测试 cwd（非 git 目录树）
const PROV_TMP = join(TMP, 'prov-tmp') // ATLAS_TMPDIR

function writeSkill(
  baseSkillsDir: string,
  name: string,
  frontmatter: Record<string, string>,
  content: string,
): void {
  const dir = join(baseSkillsDir, name)
  mkdirSync(dir, { recursive: true })
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  writeFileSync(join(dir, 'SKILL.md'), fm ? `---\n${fm}\n---\n${content}` : content)
}

const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR
const PREV_TMPDIR = process.env.ATLAS_TMPDIR

beforeAll(() => {
  mkdirSync(PROJ, { recursive: true })
  // getAtlasTempDir 首调 memoize → env 必须在任何 getBundledSkillsRoot
  // 调用前就位；单进程连跑：前序文件可能已钉 memo（到其 ATLAS_TMPDIR），
  // 先清 memo 使本文件首调从 PROV_TMP 重派生
  _resetAtlasTempDirForTest()
  process.env.ATLAS_CONFIG_DIR = CFG
  process.env.ATLAS_TMPDIR = PROV_TMP
})

afterAll(() => {
  clearSkillCaches()
  clearDynamicSkills()
  clearBundledSkills()
  // memo 清（本文件 PROV_TMP 已钉 memo，删 env + TMP 前清，防泄漏后序文件）
  _resetAtlasTempDirForTest()
  if (PREV_CONFIG_DIR === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  if (PREV_TMPDIR === undefined) delete process.env.ATLAS_TMPDIR
  else process.env.ATLAS_TMPDIR = PREV_TMPDIR
  rmSync(TMP, { recursive: true, force: true })
})

function freshSkillState(): void {
  clearSkillCaches()
  clearDynamicSkills()
}

describe('技能装载链（/skills/ 目录形态）', () => {
  test('user 源装载（ATLAS_CONFIG_DIR 注入；描述显式 / 首行回落双态）', async () => {
    writeSkill(join(CFG, 'skills'), 'user-skill', { description: 'user skill desc' }, '# User Skill\nbody')
    writeSkill(join(CFG, 'skills'), 'plain-skill', {}, '# Plain Skill\nbody')
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    const sk = cmds.find(c => c.name === 'user-skill')
    expect(sk).toBeDefined()
    expect(sk!.source).toBe('userSettings')
    expect(sk!.loadedFrom).toBe('skills')
    expect(sk!.description).toBe('user skill desc')
    expect(sk!.skillRoot).toBe(join(CFG, 'skills', 'user-skill'))

    const plain = cmds.find(c => c.name === 'plain-skill')
    expect(plain!.description).toBe('Plain Skill') // 首行标题剥离回落
    expect(plain!.hasUserSpecifiedDescription).toBe(false)
  })

  test('项目链 /skills/ 当前态不载（残留守：allowed 源固定 userSettings）', async () => {
    writeSkill(join(PROJ, '.atlas', 'skills'), 'proj-skill', {}, '# Proj Skill')
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    expect(cmds.find(c => c.name === 'proj-skill')).toBeUndefined()
  })

  test('realpath 去重：符号链接同文件首现者胜（两链同载仅一）', async () => {
    writeSkill(join(CFG, 'skills'), 'real-skill', {}, '# Real')
    symlinkSync(join(CFG, 'skills', 'real-skill'), join(CFG, 'skills', 'link-skill'))
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    const names = cmds
      .filter(c => c.name === 'link-skill' || c.name === 'real-skill')
      .map(c => c.name)
    expect(names).toHaveLength(1)
    rmSync(join(CFG, 'skills', 'link-skill'), { force: true })
  })
})

describe('legacy /commands/ 装载（恒载，双形态）', () => {
  test('单 .md 文件形态（user 源；描述回落标签 Custom command）', async () => {
    mkdirSync(join(CFG, 'commands'), { recursive: true })
    writeFileSync(
      join(CFG, 'commands', 'user-cmd.md'),
      '# User Cmd\nlegacy body',
    )
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    const c = cmds.find(x => x.name === 'user-cmd')
    expect(c).toBeDefined()
    expect(c!.loadedFrom).toBe('commands_DEPRECATED')
    expect(c!.source).toBe('userSettings')
    expect(c!.description).toBe('User Cmd')
  })

  test('目录形态 SKILL.md（项目层当前态源门禁用 → 不载，残留守）', async () => {
    // 头注残留守：loadMarkdownFilesForSubdir 项目层经
    // isSettingSourceEnabled('projectSettings') 门（allowed 源固定
    // ['userSettings']，组合根纵切启用后此断言翻转为正断言）
    writeSkill(join(PROJ, '.atlas', 'commands'), 'leg-skill', {}, '# Leg Skill')
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    expect(cmds.find(x => x.name === 'leg-skill')).toBeUndefined()
  })
})

describe('条件技能（paths frontmatter → gitignoreMatch 本地 matcher）', () => {
  test('paths 技能暂存 + 相对路径命中激活（目录前缀规则）', async () => {
    writeSkill(join(CFG, 'skills'), 'cond-skill', { paths: 'src/cnn' }, '# Cond')
    freshSkillState()

    const cmds = await getSkillDirCommands(PROJ)
    expect(cmds.find(c => c.name === 'cond-skill')).toBeUndefined() // 暂存非直出
    expect(getConditionalSkillCount()).toBe(1)

    // 未命中
    expect(activateConditionalSkillsForPaths(['other/x.py'], PROJ)).toEqual([])
    expect(getDynamicSkills()).toHaveLength(0)

    // 命中（src/cnn 目录前缀）
    expect(activateConditionalSkillsForPaths(['src/cnn/model.py'], PROJ)).toEqual([
      'cond-skill',
    ])
    expect(getConditionalSkillCount()).toBe(0)
    expect(getDynamicSkills().map(c => c.name)).toEqual(['cond-skill'])
  })

  test('绝对路径经 relative(cwd) 归一后匹配', async () => {
    writeSkill(join(CFG, 'skills'), 'cond-abs', { paths: 'pkg' }, '# Abs')
    freshSkillState()
    await getSkillDirCommands(PROJ)

    expect(
      activateConditionalSkillsForPaths([join(PROJ, 'pkg', 'a.txt')], PROJ),
    ).toEqual(['cond-abs'])
  })

  test('越出基目录（../）路径守卫不激活', async () => {
    writeSkill(join(CFG, 'skills'), 'cond-esc', { paths: 'src' }, '# Esc')
    freshSkillState()
    await getSkillDirCommands(PROJ)

    expect(activateConditionalSkillsForPaths(['../escape.ts'], PROJ)).toEqual([])
    expect(getDynamicSkills().map(c => c.name)).not.toContain('cond-esc')
  })
})

describe('动态技能发现（cwd 之下嵌套 .atlas/skills）', () => {
  test('discoverSkillDirsForPaths 最深优先 + 非 git 仓 fail-open', async () => {
    writeSkill(join(PROJ, 'pkg', 'sub', '.atlas', 'skills'), 'deep-skill', {}, '# Deep')
    writeSkill(join(PROJ, 'pkg', '.atlas', 'skills'), 'pkg-skill', {}, '# Pkg')

    const dirs = await discoverSkillDirsForPaths(
      [join(PROJ, 'pkg', 'sub', 'file.ts')],
      PROJ,
    )
    expect(dirs).toEqual([
      join(PROJ, 'pkg', 'sub', '.atlas', 'skills'),
      join(PROJ, 'pkg', '.atlas', 'skills'),
    ])
  })

  test('addSkillDirectories 当前态门控（projectSettings 禁用 → no-op）', async () => {
    clearDynamicSkills()
    await addSkillDirectories([join(PROJ, 'pkg', '.atlas', 'skills')])
    // 残留守：组合根纵切启用 projectSettings 后此断言翻转
    expect(getDynamicSkills()).toHaveLength(0)
  })
})

describe('内置技能引用文件提取（ATLAS_TMPDIR 注入）', () => {
  test('惰性提取到 nonce 根 + base-directory 前缀 + 0o600', async () => {
    registerBundledSkill({
      name: 'refskill',
      description: 'd',
      files: { 'ref/guide.md': 'guide-content', 'a/b.txt': 'x' },
      getPromptForCommand: async () => [{ type: 'text', text: 'inner' }],
    })

    const root = getBundledSkillsRoot()
    // ATLAS_TMPDIR 注入流经 getAtlasTempDir（memoize 首调用）；
    // 根 = {atlasTmpDir}/bundled-skills/{nonce}
    expect(root.startsWith(join(getAtlasTempDir(), 'bundled-skills'))).toBe(
      true,
    )
    // 每进程 nonce（16B hex = 32 位）防 squatting
    expect(root).toMatch(/bundled-skills\/[0-9a-f]{32}$/)

    const cmd = getBundledSkills().find(c => c.name === 'refskill')!
    const blocks = await cmd.getPromptForCommand('', {})
    const text = (blocks[0] as { type: 'text'; text: string }).text
    expect(text).toBe(
      `Base directory for this skill: ${getBundledSkillExtractDir('refskill')}\n\ninner`,
    )
    expect(
      readFileSync(join(root, 'refskill', 'ref', 'guide.md'), 'utf8'),
    ).toBe('guide-content')
    // 显式 0o600（umask 022 下 group/other 位本无，恒 600）
    expect(statSync(join(root, 'refskill', 'a', 'b.txt')).mode & 0o777).toBe(0o600)
  })

  test('路径穿越守卫：键含 .. → 提取失败降级（无前缀、无外泄文件）', async () => {
    registerBundledSkill({
      name: 'evil-skill',
      description: 'd',
      files: { '../evil.txt': 'pwned', '/abs/evil.txt': 'pwned' },
      getPromptForCommand: async () => [{ type: 'text', text: 'x' }],
    })
    const cmd = getBundledSkills().find(c => c.name === 'evil-skill')!
    const blocks = await cmd.getPromptForCommand('', {})
    const text = (blocks[0] as { type: 'text'; text: string }).text
    expect(text).toBe('x') // 提取失败 → null → 无 base-dir 前缀
    // 穿越目标 = extract 目录（{root}/evil-skill）之上 = {root}/evil.txt
    const bundleRoot = getBundledSkillsRoot().replace(/\/[0-9a-f]{32}$/, '')
    expect(existsSync(join(bundleRoot, 'evil.txt'))).toBe(false)
  })
})

describe('命令池面（getCommands / getSkillToolCommands）', () => {
  test('user 技能入池（可用性默认可用 + 模型可调用视图）', async () => {
    writeSkill(join(CFG, 'skills'), 'pool-skill', { description: 'pool' }, '# Pool')
    clearCommandsCache() // 命令池 memo + 技能链缓存一并清
    clearDynamicSkills()

    const cmds: Command[] = await getCommands(PROJ)
    expect(cmds.map(c => c.name)).toContain('pool-skill')

    const toolCmds = await getSkillToolCommands(PROJ)
    expect(toolCmds.map(c => c.name)).toContain('pool-skill')
  })
})
