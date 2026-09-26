/**
 * engine/tools/plan S-E2（§8.58 plan 族子波）：EnterPlanMode /
 * ExitPlanModeV2 两本体 func 面（真盘 plans 目录 + 真 appState duck）。
 *
 * func 层纪律（真盘 I/O 允许，同 S-D2b fs 先例）：
 *  - plan 域（planDomain）真盘面：getPlansDirectory 缺省支
 *    join(ATLAS_CONFIG_DIR, 'plans') + mkdirSync 幂等（ATLAS_CONFIG_DIR
 *    指 tmpdir，首次 getPlansDirectory 前设置 = 闭包 memo 新鲜面）/
 *    getPlanSlug 3 段 slug 缓存 + 冲突重试（确定性注入
 *    setPlanSlugGeneratorForTesting 序列，S-E3 B 路探针 (e) MUST-FIX）/
 *    getPlanFilePath 主会话 {slug}.md vs 子代理 {slug}-agent-{agentId}.md /
 *    getPlan ENOENT → null + 写后回读 + 子代理文件独立。
 *  - EnterPlanModeTool.call 真 appState duck（planToolInput 面）：
 *    mode default → plan + prePlanMode = default（prepareContextForPlanMode
 *    + applyPermissionUpdate setMode 链）/ agentId 守卫 throw /
 *    mode = plan 重入 prePlanMode 不覆写（prepare no-op 支）。
 *  - ExitPlanModeV2Tool.call 真盘 plan 文件面：盘读回传 + prePlanMode
 *    恢复链（plan/acceptEdits → acceptEdits，prePlanMode 清）/ input.plan
 *    覆写真盘 writeFile 落盘 + planWasEdited true / 盘缺 + 无 input.plan
 *    → plan null（getPlan ENOENT → null 回落）/ 恢复链守卫 mode ≠ plan
 *    appState 不变（updater 早退支）/ isAgent 面 filePath 子代理后缀。
 *
 * 会话固定：switchSession 钉 getSessionId（getPlanSlug 缺省参 /
 * getPlanFilePath 内部 slug 面确定性）。
 *
 * 深度 import（门面归集）：../../src/engine/tools（两本体 + plan 域 7 函数
 * + slug 管理 + 测试缝 setPlanSlugGeneratorForTesting）+
 * ../../src/bootstrap（会话固定）+ ../../src/shared（ToolPermissionContext
 * 型）。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  realpathSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  EnterPlanModeTool,
  ExitPlanModeV2Tool,
  getPlansDirectory,
  getPlanSlug,
  setPlanSlug,
  clearPlanSlug,
  clearAllPlanSlugs,
  getPlanFilePath,
  getPlan,
  setPlanSlugGeneratorForTesting,
} from '../../src/engine/tools'
import { getSessionId, switchSession } from '../../src/bootstrap'
import type { ToolPermissionContext } from '../../src/shared'

const ROOT = join(tmpdir(), 'atlas-plan-se2-fs-')
const SESSION = 'plan-se2-func-session'

let root: string
let plansDir: string
let savedConfigDir: string | undefined

function makePermissionContext(
  mode: ToolPermissionContext['mode'],
  prePlanMode?: ToolPermissionContext['prePlanMode'],
): ToolPermissionContext {
  return {
    mode,
    prePlanMode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: false,
  }
}

/** appState duck（planToolInput 面）：setAppState = updater 结果 Object.assign 落位。 */
function makeAppStateDuck(
  mode: ToolPermissionContext['mode'],
  prePlanMode?: ToolPermissionContext['prePlanMode'],
): {
  state: { toolPermissionContext: ToolPermissionContext }
  ctx: {
    setAppState(
      updater: (
        prev: { toolPermissionContext: ToolPermissionContext },
      ) => { toolPermissionContext: ToolPermissionContext },
    ): void
  }
} {
  const state = { toolPermissionContext: makePermissionContext(mode, prePlanMode) }
  const ctx = {
    setAppState(
      updater: (
        prev: { toolPermissionContext: ToolPermissionContext },
      ) => { toolPermissionContext: ToolPermissionContext },
    ) {
      Object.assign(state, updater(state))
    },
  }
  return { state, ctx }
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(ROOT))
  // 须在首次 getPlansDirectory()（闭包 memo）前设 env
  savedConfigDir = process.env.ATLAS_CONFIG_DIR
  process.env.ATLAS_CONFIG_DIR = join(root, 'atlas-home')
  switchSession(SESSION)
  clearAllPlanSlugs()
  plansDir = getPlansDirectory()
})

afterAll(() => {
  if (savedConfigDir === undefined) delete process.env.ATLAS_CONFIG_DIR
  else process.env.ATLAS_CONFIG_DIR = savedConfigDir
  clearAllPlanSlugs()
  rmSync(root, { recursive: true, force: true })
})

// ── plan 域真盘面 ────────────────────────────────────────────────────────
describe('plan 域 getPlansDirectory（缺省支逐字 + mkdir 幂等）', () => {
  test('= join(ATLAS_CONFIG_DIR, plans) 且已创建', () => {
    expect(plansDir).toBe(join(process.env.ATLAS_CONFIG_DIR as string, 'plans'))
    expect(existsSync(plansDir)).toBe(true)
  })
})

describe('plan 域 getPlanSlug slug 生命周期（真盘）', () => {
  test('3 段 slug + 缓存（二次调用同值，零重生成）', () => {
    const slug1 = getPlanSlug()
    expect(slug1.split('-')).toHaveLength(3)
    expect(getPlanSlug()).toBe(slug1)
  })

  test('setPlanSlug 固定 slug（resume 恢复面）', () => {
    setPlanSlug('resume-s', 'fixed-resume-slug')
    expect(getPlanSlug('resume-s')).toBe('fixed-resume-slug')
  })

  test('冲突重试：确定性注入 slug 序列（S-E3 B 路探针 (e)——existsSync 检查唯一保证位）', () => {
    // 词表 9.76M 随机组合下原随机探针 P(red)≈1e-7（突变「去掉 existsSync
    // 检查」不红）→ 经 setPlanSlugGeneratorForTesting 注入确定性序列
    // [a,b,c]，预占 a/b 两文件：重试循环须跳过 a/b 落 c。突变「去掉
    // existsSync 检查」将确定性返回已占用的 a → 两断言红。
    const seq = ['seq-slug-a', 'seq-slug-b', 'seq-slug-c']
    let i = 0
    setPlanSlugGeneratorForTesting(() => seq[i++ % seq.length])
    try {
      writeFileSync(join(plansDir, 'seq-slug-a.md'), 'occupied\n')
      writeFileSync(join(plansDir, 'seq-slug-b.md'), 'occupied\n')
      clearPlanSlug()
      const slug = getPlanSlug()
      expect(slug).toBe('seq-slug-c')
      expect(existsSync(join(plansDir, `${slug}.md`))).toBe(false)
    } finally {
      setPlanSlugGeneratorForTesting(null)
      clearPlanSlug()
    }
  })
})

describe('plan 域 getPlanFilePath / getPlan（真盘）', () => {
  test('主会话 = {slug}.md；子代理 = {slug}-agent-{agentId}.md', () => {
    setPlanSlug(SESSION, 'path-test')
    expect(getPlanFilePath()).toBe(join(plansDir, 'path-test.md'))
    expect(getPlanFilePath('a1')).toBe(join(plansDir, 'path-test-agent-a1.md'))
  })

  test('getPlan：ENOENT → null；写后回读；子代理文件独立', () => {
    setPlanSlug(SESSION, 'read-test')
    expect(getPlan()).toBeNull()
    writeFileSync(getPlanFilePath(), 'plan body\n')
    expect(getPlan()).toBe('plan body\n')
    expect(getPlan('a9')).toBeNull()
    writeFileSync(getPlanFilePath('a9'), 'agent plan\n')
    expect(getPlan('a9')).toBe('agent plan\n')
  })
})

// ── EnterPlanModeTool.call 真 appState duck ─────────────────────────────
describe('EnterPlanModeTool.call（真 appState duck + 权限迁移链）', () => {
  test('mode default → plan + prePlanMode = default（prepare + setMode 链）', async () => {
    const { state, ctx } = makeAppStateDuck('default')
    const r = await EnterPlanModeTool.call({}, ctx)
    expect(r.data.message).toBe(
      'Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.',
    )
    expect(state.toolPermissionContext.mode).toBe('plan')
    expect(state.toolPermissionContext.prePlanMode).toBe('default')
  })

  test('agent context → throw（agentId 守卫）', async () => {
    const { ctx } = makeAppStateDuck('default')
    await expect(
      EnterPlanModeTool.call({}, { ...ctx, agentId: 'a1' }),
    ).rejects.toThrow(
      'EnterPlanMode tool cannot be used in agent contexts',
    )
  })

  test('mode = plan 重入：prePlanMode 不覆写（prepare no-op 支）', async () => {
    const { state, ctx } = makeAppStateDuck('plan')
    await EnterPlanModeTool.call({}, ctx)
    expect(state.toolPermissionContext.mode).toBe('plan')
    expect(state.toolPermissionContext.prePlanMode).toBeUndefined()
  })

  test('无 context（undefined）→ 不抛（ctx 可选链，注册表外注入缺省位）', async () => {
    const r = await EnterPlanModeTool.call({}, undefined)
    expect(r.data.message).toContain('Entered plan mode')
  })
})

// ── ExitPlanModeV2Tool.call 真盘 plan 文件面 ────────────────────────────
describe('ExitPlanModeV2Tool.call（真盘 plan 文件 + prePlanMode 恢复链）', () => {
  test('盘读回传 + 恢复链（mode plan/prePlanMode acceptEdits → acceptEdits，prePlanMode 清）', async () => {
    setPlanSlug(SESSION, 'exit-test')
    writeFileSync(getPlanFilePath(), 'exit plan body\n')
    const { state, ctx } = makeAppStateDuck('plan', 'acceptEdits')
    const r = await ExitPlanModeV2Tool.call({}, ctx)
    expect(r.data.plan).toBe('exit plan body\n')
    expect(r.data.isAgent).toBe(false)
    expect(r.data.filePath).toBe(join(plansDir, 'exit-test.md'))
    expect(r.data.planWasEdited).toBeUndefined()
    expect(state.toolPermissionContext.mode).toBe('acceptEdits')
    expect(state.toolPermissionContext.prePlanMode).toBeUndefined()
  })

  test('input.plan 覆写：真盘 writeFile 落盘 + planWasEdited true', async () => {
    setPlanSlug(SESSION, 'exit-edit')
    const { ctx } = makeAppStateDuck('plan')
    const r = await ExitPlanModeV2Tool.call({ plan: 'edited plan\n' }, ctx)
    expect(r.data.plan).toBe('edited plan\n')
    expect(r.data.planWasEdited).toBe(true)
    expect(readFileSync(getPlanFilePath(), 'utf-8')).toBe('edited plan\n')
  })

  test('盘缺 + 无 input.plan → plan null（getPlan ENOENT → null 回落）', async () => {
    setPlanSlug(SESSION, 'exit-missing')
    const { ctx } = makeAppStateDuck('plan')
    const r = await ExitPlanModeV2Tool.call({}, ctx)
    expect(r.data.plan).toBeNull()
    expect(r.data.filePath).toBe(join(plansDir, 'exit-missing.md'))
  })

  test('恢复链守卫：mode ≠ plan → appState 不变（updater 早退支）', async () => {
    const { state, ctx } = makeAppStateDuck('default')
    await ExitPlanModeV2Tool.call({}, ctx)
    expect(state.toolPermissionContext.mode).toBe('default')
    expect(state.toolPermissionContext.prePlanMode).toBeUndefined()
  })

  test('isAgent 面：filePath = {slug}-agent-{agentId}.md + isAgent true', async () => {
    setPlanSlug(SESSION, 'exit-agent')
    const { ctx } = makeAppStateDuck('plan')
    const r = await ExitPlanModeV2Tool.call({}, { ...ctx, agentId: 'a7' })
    expect(r.data.isAgent).toBe(true)
    expect(r.data.filePath).toBe(join(plansDir, 'exit-agent-agent-a7.md'))
    // 子代理 plan 文件未写 → 盘读回落 null
    expect(r.data.plan).toBeNull()
    expect(getSessionId()).toBe(SESSION)
  })
})
