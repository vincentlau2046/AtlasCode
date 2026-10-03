/**
 * tui/skills 装载器 G2（#259）func 层（真 fs 零模型）：TUI 车道项目 skill
 * 默认发现——.atlas/skills 目录链与 projectSettings 设置源解耦（设置源仍
 * 关，.atlas/settings.json RCE 面排除不变）+ ATLAS_DISABLE_PROJECT_SKILLS
 * kill switch + addSkillDirectories 动态发现同裁定。
 *
 * 被测面 = TUI 车道装载器（src/tui/skills/loadSkillsDir.js，TUI SkillTool
 * by-name 解析 / S4-skill 场景实走面；engine 车道对称面见
 * engine-skill-load-fs.test.ts）。非 tautology：断言的是真 fs 目录链发现
 * 行为，非 fake 自证。
 *
 * 分层纪律：func 层真 fs（mkdtemp 真 tmpdir，ATLAS_CONFIG_DIR 指 tmp；
 * 无网络 / 无模型 / 无 PTY）。宿主无 /etc/atlas（managed 目录 ENOENT 恒
 * 跳过，不断言其内容）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  addSkillDirectories,
  clearDynamicSkills,
  clearSkillCaches,
  getDynamicSkills,
  getSkillDirCommands,
} from '../../src/tui/skills/loadSkillsDir.js'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-tui-skill-'))
const CFG = join(TMP, 'cfg') // ATLAS_CONFIG_DIR
const PROJ = join(TMP, 'proj') // 测试 cwd（非 git 目录树）

const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR

function writeSkill(baseSkillsDir: string, name: string, content: string): void {
  const dir = join(baseSkillsDir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), content)
}

beforeAll(() => {
  mkdirSync(PROJ, { recursive: true })
  // getAtlasConfigHomeDir memo 键 = env 值（envUtils 头注）→ 首调前就位
  process.env.ATLAS_CONFIG_DIR = CFG
})

afterAll(() => {
  clearSkillCaches()
  clearDynamicSkills()
  if (PREV_CONFIG_DIR === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  rmSync(TMP, { recursive: true, force: true })
})

describe('TUI 车道项目 skill 默认发现（G2 #259）', () => {
  test('项目链 .atlas/skills 默认载（与 projectSettings 设置源解耦）', async () => {
    writeSkill(join(PROJ, '.atlas', 'skills'), 'tui-proj-skill', '# Tui Proj Skill')
    clearSkillCaches()

    const cmds = await getSkillDirCommands(PROJ)
    const sk = cmds.find(c => c.name === 'tui-proj-skill')
    expect(sk).toBeDefined()
    expect(sk!.type).toBe('prompt')
    expect(sk!.source).toBe('projectSettings')
  })

  test('ATLAS_DISABLE_PROJECT_SKILLS kill switch（项目链不载）', async () => {
    process.env.ATLAS_DISABLE_PROJECT_SKILLS = '1'
    try {
      clearSkillCaches()
      const cmds = await getSkillDirCommands(PROJ)
      expect(cmds.find(c => c.name === 'tui-proj-skill')).toBeUndefined()
    } finally {
      delete process.env.ATLAS_DISABLE_PROJECT_SKILLS
    }
  })

  test('addSkillDirectories 动态发现默认载（同 kill switch 可关）', async () => {
    writeSkill(join(PROJ, 'pkg', '.atlas', 'skills'), 'tui-dyn-skill', '# Dyn')
    clearDynamicSkills()
    await addSkillDirectories([join(PROJ, 'pkg', '.atlas', 'skills')])
    expect(getDynamicSkills().map(c => c.name)).toContain('tui-dyn-skill')

    clearDynamicSkills()
    process.env.ATLAS_DISABLE_PROJECT_SKILLS = '1'
    try {
      await addSkillDirectories([join(PROJ, 'pkg', '.atlas', 'skills')])
      expect(getDynamicSkills()).toHaveLength(0)
    } finally {
      delete process.env.ATLAS_DISABLE_PROJECT_SKILLS
    }
  })
})
