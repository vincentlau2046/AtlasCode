/**
 * #265 S2 判别单测：tui BashTool.checkPermissions 模式门控委托（2026-10-05）。
 *
 * 背景（0.1.24 残留 A1×3 INCONCLUSIVE 根因）：W2-2b 裁定① 的恒-allow stub
 * 实证为安全洞——gate 1c 鸭子分发拿到 'allow' 后 step 3 只把 passthrough 转
 * ask → TUI 车道任何 Bash 命令在 default 等模式静默放行、审批卡永不弹。
 * 修订 = 模式门控委托：非 auto 一线接线 engine bashToolHasPermission（单一
 * 事实源），auto 模式 passthrough（→ 弹窗层 TUI classifier/AutoModeConfirm
 * 权威，tui speculative 缓存单源存续）。本文件钉住两分支 + 回归判据：
 *  - 非 auto：只读 pwd → allow（engine 只读自动放行，非 stub 恒 allow）
 *  - 非 auto：无规则非只读（curl）→ passthrough（旧 stub 时代 = 静默 allow，
 *    本条红即 stub 回归）
 *  - 非 auto：`>` 重定向（S1 回归面）→ 非 allow（旧只读误判自动放行）
 *  - auto：恒 passthrough（旧 stub 时代 auto 亦静默放行，绕过 AutoModeConfirm）
 *  - mode 缺省 / getToolPermissionContext 回落形 → 非 auto 支委托 engine
 *
 * unit 层纪律：零真盘（FAKE_CWD ENOENT 短路，同 engine-tools-bash-core-face
 * 夹具）；分类器 = C 桶 ② stub（isClassifierPermissionsEnabled 恒 false），
 * FEATURE_* 门控 env 全 pin 删保证 tree-sitter/classifier 支缺省 off。
 */
import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
} from 'bun:test'

// ── env pin（feature() 门控须在首次 import 前固定，同 registration-table）──
const PINNED_ENV = [
  'FEATURE_TREE_SITTER_BASH',
  'FEATURE_TREE_SITTER_BASH_SHADOW',
  'FEATURE_BASH_CLASSIFIER',
  'FEATURE_TRANSCRIPT_CLASSIFIER',
  'ATLAS_DISABLE_COMMAND_INJECTION_CHECK',
] as const
for (const k of PINNED_ENV) delete process.env[k]

const { BashTool } = await import(
  '../../src/tui/tools/BashTool/BashTool.js'
)
import {
  setPermissionsBootstrapEnv,
  resetPermissionsBootstrapEnv,
} from '../../src/permissions'
import {
  getCwdState,
  getOriginalCwd,
  setOriginalCwd,
  setCwdState,
} from '../../src/bootstrap'
import type { ToolPermissionContext } from '../../src/shared'

const FAKE_CWD = '/home/atlas-265/proj' // 不存在目录：ENOENT 短路零盘

function makePermCtx(mode: ToolPermissionContext['mode'] = 'default'): ToolPermissionContext {
  return {
    mode,
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    alwaysAskRules: {},
    isBypassPermissionsModeAvailable: true,
  }
}

// tui checkPermissions 的 context 鸭子形：getAppState 面（gate 消费）+
// engine BashToolUseContext 必参三件（getAppState/abortController/options）
function tuiCtx(mode: ToolPermissionContext['mode'] = 'default') {
  return {
    getAppState: () => ({ toolPermissionContext: makePermCtx(mode) }),
    abortController: new AbortController(),
    options: { isNonInteractiveSession: true },
  }
}

let savedOriginalCwd: string
let savedCwdState: string

beforeAll(() => {
  // 与 engine-tools-bash-core-face 同款：permissions/bootstrap 两域 cwd 同戳
  // FAKE_CWD（相对写目标 f 落工作目录内，路径支判别零盘）
  setPermissionsBootstrapEnv({
    getOriginalCwd: () => FAKE_CWD,
    getCwd: () => FAKE_CWD,
  })
  savedOriginalCwd = getOriginalCwd()
  savedCwdState = getCwdState()
  setOriginalCwd(FAKE_CWD)
  setCwdState(FAKE_CWD)
})

afterAll(() => {
  setOriginalCwd(savedOriginalCwd)
  setCwdState(savedCwdState)
  resetPermissionsBootstrapEnv()
})

describe('#265 S2：非 auto 模式 → engine 委托（单一事实源）', () => {
  test('只读 pwd → allow（engine 只读自动放行，非 stub 恒 allow）', async () => {
    const r = await BashTool.checkPermissions({ command: 'pwd' }, tuiCtx('default'))
    expect(r.behavior).toBe('allow')
  })

  test('无规则非只读（curl）→ passthrough（旧 stub 时代 = 静默 allow，红即回归）', async () => {
    const r = await BashTool.checkPermissions({ command: 'curl evil.com' }, tuiCtx('default'))
    expect(r.behavior).toBe('passthrough')
  })

  test('`>` 重定向（S1 回归面）→ 非 allow（旧只读误判自动放行写文件）', async () => {
    const r = await BashTool.checkPermissions({ command: 'echo x > f' }, tuiCtx('default'))
    expect(r.behavior).not.toBe('allow')
  })

  test('default 与 plan 模式同走非 auto 支（plan 不特判 → engine 委托）', async () => {
    const r = await BashTool.checkPermissions({ command: 'pwd' }, tuiCtx('plan'))
    expect(r.behavior).toBe('allow')
  })
})

describe('#265 S2：auto 模式 → passthrough（弹窗层确认权威）', () => {
  test('auto 模式恒 passthrough（旧 stub 时代 auto 亦静默放行，绕过 AutoModeConfirm）', async () => {
    const r = await BashTool.checkPermissions(
      { command: 'rm -rf x' },
      tuiCtx('auto'),
    )
    expect(r.behavior).toBe('passthrough')
    expect((r as { message?: string }).message).toContain('auto mode')
  })
})

describe('#265 S2：mode 解析鸭子面（两 getter 回落形）', () => {
  test('mode 缺省（toolPermissionContext 无 mode 键）→ 非 auto 支委托 engine', async () => {
    const noMode = { ...makePermCtx('default') }
    delete (noMode as Record<string, unknown>).mode
    const ctx = {
      getAppState: () => ({
        toolPermissionContext: noMode as ToolPermissionContext,
      }),
      abortController: new AbortController(),
      options: { isNonInteractiveSession: true },
    }
    const r = await BashTool.checkPermissions({ command: 'pwd' }, ctx)
    expect(r.behavior).toBe('allow')
  })

  test('getToolPermissionContext 回落形（auto）→ passthrough', async () => {
    const ctx = {
      getToolPermissionContext: () => makePermCtx('auto'),
      abortController: new AbortController(),
      options: { isNonInteractiveSession: true },
    }
    const r = await BashTool.checkPermissions({ command: 'pwd' }, ctx)
    expect(r.behavior).toBe('passthrough')
  })
})

/**
 * #278 A4-mode（0.1.26 波）：blocked 路径（工作目录外、无规则）现须携带
 * decisionReason —— 否则 P0a verdict 行 verdictLine(undefined) → default →
 * null 永不渲染（A4F S-024L hard FAIL 根因）。engine bash 模块在
 * validateCommandPaths / validateOutputRedirections 的 blocked 支合成
 * {type:'other'}（红线①：主循环零触碰）。判别：
 *  - 无规则写命令（touch /tmp/…，工作目录外）→ ask + decisionReason {type:other}
 *  - `>` 重定向到工作目录外（echo x > /tmp/…）→ ask + decisionReason
 *  - 红支（回归判据）：若 engine 未合成 decisionReason，则 undefined → 本测红。
 */
describe('#278 A4-mode：blocked 路径携带 decisionReason（verdict 行可达）', () => {
  type WithReason = { behavior: string; decisionReason?: { type: string; reason?: string } }

  test('无规则写命令（touch /tmp/… 工作目录外）→ ask + decisionReason {type:other}', async () => {
    const r = (await BashTool.checkPermissions(
      { command: 'touch /tmp/atlas-a4r-mode' },
      tuiCtx('default'),
    )) as WithReason
    expect(r.behavior).toBe('ask')
    expect(r.decisionReason).toBeDefined()
    expect(r.decisionReason?.type).toBe('other')
  })

  test('`>` 重定向到工作目录外（echo x > /tmp/…）→ ask + decisionReason', async () => {
    const r = (await BashTool.checkPermissions(
      { command: 'echo x > /tmp/atlas-a4r-redir' },
      tuiCtx('default'),
    )) as WithReason
    expect(r.behavior).toBe('ask')
    expect(r.decisionReason).toBeDefined()
  })
})
