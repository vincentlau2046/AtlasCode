/**
 * #261（#259 G2 验收缺口，issule-analyst 0.1.15 S4 回归 P1）func 层
 * （真 fs + chdir，零模型）：SkillTool 技能目录车道根锚定
 * getProjectRoot()→process.cwd() 全链路判别。
 *
 * 根因（issule-analyst 单元级铁证）：两车道 SkillTool（tui SkillTool
 * validateInput/checkPermissions/call 三消费 + engine SkillToolFace
 * description）写死 getProjectRoot()（从 cwd 上探最近 .git）→ 非 git
 * 工作区 / git 子目录里启动时上探到无关上游 repo root → ws/.atlas/skills
 * 不被扫描（getProjectDirsUpToHome 从 git root 起，ws 在下游）→
 * Skill(summarize-numbers) = Unknown skill（修前 #259 装载器面已解耦，
 * 但根锚定没收口）。修 = 两车道 4 站点 + AgentTool 同族 1 站点
 * 改 process.cwd()（主 init 一致；装载器向上遍历语义不变，git 项目零变化）。
 *
 * 判别信号：非 git 临时 ws 里 ① TUI SkillTool.validateInput 由
 * Unknown skill（errorCode 2）翻 {result:true} ② 装载器双锚点对照
 * （旧锚 getProjectRoot 漏 / 新锚 process.cwd 命中）③ engine 车道
 * SkillToolFace.description 技能列表含 ws skill。
 *
 * 分层纪律：func 层真 fs（mkdtemp + chdir；ATLAS_CONFIG_DIR 指 tmp 防
 * 真用户目录污染发现集；无网络 / 无模型 / 无 PTY）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { getProjectRoot } from '../../src/bootstrap'
import { getSkillDirCommands, clearSkillCaches } from '../../src/tui/skills/loadSkillsDir.js'
import { clearSkillCaches as clearEngineSkillCaches } from '../../src/engine/skill/loadSkillsDir.js'
import { SkillTool as TuiSkillTool } from '../../src/tui/tools/SkillTool/SkillTool.js'
import { getSkillToolCommands } from '../../src/engine/skill/commands.js'

const SKILL_NAME = 'summarize-numbers'

const TMP = mkdtempSync(join(tmpdir(), 'atlas-skilltool-cwd-'))
const CFG = join(TMP, 'cfg') // ATLAS_CONFIG_DIR（空用户技能目录，防污染）
const REPO = TMP // 外层「git 仓」根（.git 标记目录，非真 git）
const PROJ = join(TMP, 'proj') // ws = 仓内子目录（.atlas/skills 在仓根下游）

const ORIG_CWD = process.cwd()
const PREV_CONFIG_DIR = process.env.ATLAS_CONFIG_DIR

function writeSkill(name: string): void {
  // 外层 .git 标记目录（existsSync 判定面，非真 git）：getProjectRoot 从
  // ws 上探命中 REPO 根——复刻 issule-analyst 铁证场景（ws 嵌套在 git 仓
  // 内、自身无 .git → 上探到仓根，ws/.atlas/skills 在下游漏扫）。纯 /tmp
  // 场景下 getProjectRoot 回落 cwd（旧锚=新锚），无判别信号，故必须造仓。
  mkdirSync(join(REPO, '.git'), { recursive: true })
  const dir = join(PROJ, '.atlas', 'skills', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Summarize numbers\n---\nSummarize the numbers.\n`,
  )
}

/** TUI validateInput 最小 context（getAllCommands 只读 mcp.commands）。 */
function fakeContext() {
  return { getAppState: () => ({ mcp: { commands: [] } }) } as never
}

beforeAll(() => {
  mkdirSync(CFG, { recursive: true })
  writeSkill(SKILL_NAME)
  process.env.ATLAS_CONFIG_DIR = CFG
  process.chdir(PROJ)
})

afterAll(() => {
  clearSkillCaches()
  clearEngineSkillCaches()
  process.chdir(ORIG_CWD)
  if (PREV_CONFIG_DIR === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = PREV_CONFIG_DIR
  rmSync(TMP, { recursive: true, force: true })
})

describe('#261 SkillTool 根锚定 getProjectRoot→process.cwd（非 git 工作区）', () => {
  test('① TUI 车道 validateInput：ws skill 由 Unknown skill 翻可发现（全链路 validateInput→getAllCommands→getCommands→getSkillDirCommands）', async () => {
    const v = await TuiSkillTool.validateInput(
      { skill: SKILL_NAME } as never,
      fakeContext(),
    )
    expect(v).toEqual({ result: true })
  })

  test('② 装载器双锚点对照（判别条件：旧锚漏 / 新锚命中，ws 非 git 在下游）', async () => {
    // 旧锚（修前行为）：getProjectRoot 上探 .git → 命中 REPO 根（ws 上游），
    // ws/.atlas/skills 在下游不被扫描
    const oldAnchor = await getSkillDirCommands(getProjectRoot())
    expect(oldAnchor.some(c => (c as { name?: string }).name === SKILL_NAME)).toBe(false)
    // 新锚：process.cwd() 起向上遍历（git root/home 停界）→ 命中
    const newAnchor = await getSkillDirCommands(process.cwd())
    expect(newAnchor.some(c => (c as { name?: string }).name === SKILL_NAME)).toBe(true)
  })

  test('③ engine 车道技能目录链（getSkillToolCommands 全链，face call→getAllCommands 同源装载器）命中 ws skill', async () => {
    // engine SkillToolFace.description 是静态工具描述（技能列表经
    // skill_listing 附件注入，不入 description）→ 判别面取 face call 支
    // 同源装载器链（face getAllCommands → getCommands → 本链共享 memoize
    // 装载器，同 cwd 键）。
    const cmds = await getSkillToolCommands(process.cwd())
    expect(cmds.some((c: { name?: string }) => c.name === SKILL_NAME)).toBe(true)
  })
})
