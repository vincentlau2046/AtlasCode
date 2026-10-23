/**
 * 0.1.79 W-C ⑩ C9-2 `--restricted` 判别单测（工单 docs/2026-10-23-p0-wave-0179-ticket.md §1.10）。
 *
 * 规格（CC 2.1.248 对齐 + 卷 3 §5 env 命名）：新 flag `--restricted` / env
 * `ATLAS_RESTRICTED` → 剥离命令运行类内置工具（Bash/PowerShell）+ WebFetch +
 * Agent（子代理 = 命令执行旁路面，Main 裁定剥离）；Ascend 域工具同门控出
 * （exec CANN 工具链 = 命令运行面）；MCP 工具残留守不剥（登记面仍由
 * --mcp-config 控制）；拒 bypassPermissions（--permission-mode bypassPermissions
 * / --dangerously-skip-permissions 双面）；忽略 user/project/local settings
 * （policySettings = 企业管控通道保留）。
 *
 * 判别信号（工单 §2① line 44：基线 569aed7 同面红）：
 *  - restricted 剥离面：命令类缺席 / cwd 文件工具在场 / ascend 门控出 / MCP 残留守。
 *  - bypass 拒：纯决策函数双面拒 + 非 restricted 恒 null。
 *  - settings 忽略：级联剥 userSettings + 按源直读 null + 写回拒；policy 保留。
 *  - 接线锚：parse.ts / main.tsx 双 commander 面 flag 注册 + 双 setup 门。
 *
 * unit 层纪律：纯函数行为断言 + 源级锁；零网络 / 零盘写（updateSettingsForSource
 * 拒支在 mkdir 前返回）/ env 注入 save-restore。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  isRestrictedMode,
  isSettingsSourceIgnoredInRestricted,
  resetRestrictedMode,
  restrictedBypassError,
  setRestrictedMode,
} from '../../src/engine/config/restrictedMode'
import {
  getEnabledSettingSources,
  getSettingsForSource,
  resetSettingsCache,
  updateSettingsForSource,
} from '../../src/engine/config'
import {
  AgentTool,
  getBaseToolEntities,
  getAllBaseTools,
} from '../../src/engine'
import type { Tool } from '../../src/shared'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}

/** fake tool：只填注册表消费字段（同 engine-tool-registry 范型）。 */
function makeTool(name: string): Tool {
  return { name } as unknown as Tool
}

function poolNames(pool: readonly Tool[]): string[] {
  return pool.map((t) => t.name)
}

beforeEach(() => {
  resetRestrictedMode()
  resetSettingsCache()
})

afterEach(() => {
  resetRestrictedMode()
  resetSettingsCache()
})

// ════════════════════════════════════════════════════════════════
// 真值源：flag fold（模块态）?? env ATLAS_RESTRICTED
// ════════════════════════════════════════════════════════════════
describe('C9-2 restricted 真值源（setRestrictedMode ?? ATLAS_RESTRICTED）', () => {
  test('缺省（无 fold 无 env）→ false', () => {
    expect(isRestrictedMode()).toBe(false)
  })

  test('env ATLAS_RESTRICTED=1 单独触发（卷 3 §5 env 命名）', () => {
    const prev = process.env.ATLAS_RESTRICTED
    process.env.ATLAS_RESTRICTED = '1'
    try {
      expect(isRestrictedMode()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.ATLAS_RESTRICTED
      else process.env.ATLAS_RESTRICTED = prev
    }
    expect(isRestrictedMode()).toBe(false)
  })

  test('setRestrictedMode fold 覆盖 env；reset 回落 env', () => {
    setRestrictedMode(true)
    expect(isRestrictedMode()).toBe(true)
    setRestrictedMode(false)
    expect(isRestrictedMode()).toBe(false)
    resetRestrictedMode()
    expect(isRestrictedMode()).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════════
// 剥离面：getAllBaseTools 单一收口（基线 569aed7 同面红）
// ════════════════════════════════════════════════════════════════
describe('C9-2 restricted 工具剥离面（getAllBaseTools 收口）', () => {
  test('非 restricted：全池含 Bash/WebFetch/Agent（回归锚）', () => {
    const names = poolNames(getAllBaseTools({ baseTools: getBaseToolEntities() }))
    expect(names).toContain('Bash')
    // PowerShell = §8.53 S-T3 ⑳ 域外改判（bash-only），本体未落不在池内——
    // 剥离面按 SHELL_TOOL_NAMES 名常量剥（含 PowerShell 名），回归锚只锚在场本体
    expect(names).toContain('WebFetch')
    expect(names).toContain('Agent')
    expect(names).toContain('Read')
  })

  test('restricted：命令类 + WebFetch + Agent 缺席', () => {
    setRestrictedMode(true)
    const names = poolNames(getAllBaseTools({ baseTools: getBaseToolEntities() }))
    expect(names).not.toContain('Bash')
    expect(names).not.toContain('PowerShell')
    expect(names).not.toContain('WebFetch')
    expect(names).not.toContain('Agent')
  })

  test('restricted：cwd 文件工具在场（Read/Write/Edit/Glob/Grep）', () => {
    setRestrictedMode(true)
    const names = poolNames(getAllBaseTools({ baseTools: getBaseToolEntities() }))
    expect(names).toContain('Read')
    expect(names).toContain('Write')
    expect(names).toContain('Edit')
    expect(names).toContain('Glob')
    expect(names).toContain('Grep')
  })

  test('restricted：Ascend 域工具门控出（exec CANN 工具链 = 命令运行面）', () => {
    const ascend = makeTool('AscendCompilerBridge')
    expect(poolNames(getAllBaseTools({ ascendTools: [ascend] }))).toContain(
      'AscendCompilerBridge',
    )
    setRestrictedMode(true)
    expect(poolNames(getAllBaseTools({ ascendTools: [ascend] }))).not.toContain(
      'AscendCompilerBridge',
    )
  })

  test('restricted：MCP 工具残留守（不剥，登记面归 --mcp-config）', () => {
    setRestrictedMode(true)
    const mcp = makeTool('mcp__srv__query')
    expect(poolNames(getAllBaseTools({ mcpTools: [mcp] }))).toContain(
      'mcp__srv__query',
    )
  })

  test('restricted：空 deps → 空池（内建 AgentTool 亦剥离）', () => {
    setRestrictedMode(true)
    expect(getAllBaseTools()).toHaveLength(0)
    expect(AgentTool.name).toBe('Agent')
  })
})

// ════════════════════════════════════════════════════════════════
// bypass 拒：纯决策函数（接线 = 双 setup 门，见源级锁）
// ════════════════════════════════════════════════════════════════
describe('C9-2 restrictedBypassError（bypassPermissions 拒）', () => {
  test('restricted + permissionMode bypassPermissions → 拒', () => {
    setRestrictedMode(true)
    const err = restrictedBypassError({ permissionMode: 'bypassPermissions' })
    expect(err).toBeTruthy()
    expect(err).toContain('bypassPermissions')
  })

  test('restricted + --dangerously-skip-permissions 双面 → 拒', () => {
    setRestrictedMode(true)
    expect(
      restrictedBypassError({ allowDangerouslySkipPermissions: true }),
    ).toBeTruthy()
    expect(restrictedBypassError({ dangerouslySkipPermissions: true })).toBeTruthy()
  })

  test('restricted + 无 bypass 面 → null', () => {
    setRestrictedMode(true)
    expect(restrictedBypassError({ permissionMode: 'default' })).toBeNull()
    expect(restrictedBypassError({})).toBeNull()
  })

  test('非 restricted + bypassPermissions → null（恒等回归锚）', () => {
    expect(
      restrictedBypassError({ permissionMode: 'bypassPermissions' }),
    ).toBeNull()
    expect(
      restrictedBypassError({ allowDangerouslySkipPermissions: true }),
    ).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// settings 忽略面：级联剥 user + 直读 null + 写回拒；policy 保留
// ════════════════════════════════════════════════════════════════
describe('C9-2 restricted settings 忽略面', () => {
  test('isSettingsSourceIgnoredInRestricted：user/project/local 忽略，policy/flag 保留', () => {
    expect(isSettingsSourceIgnoredInRestricted('userSettings')).toBe(false)
    expect(isSettingsSourceIgnoredInRestricted('projectSettings')).toBe(false)
    expect(isSettingsSourceIgnoredInRestricted('localSettings')).toBe(false)
    setRestrictedMode(true)
    expect(isSettingsSourceIgnoredInRestricted('userSettings')).toBe(true)
    expect(isSettingsSourceIgnoredInRestricted('projectSettings')).toBe(true)
    expect(isSettingsSourceIgnoredInRestricted('localSettings')).toBe(true)
    expect(isSettingsSourceIgnoredInRestricted('policySettings')).toBe(false)
    expect(isSettingsSourceIgnoredInRestricted('flagSettings')).toBe(false)
  })

  test('getEnabledSettingSources：restricted 剥 userSettings，policy/flag 恒在场', () => {
    expect(getEnabledSettingSources()).toContain('userSettings')
    setRestrictedMode(true)
    const sources = getEnabledSettingSources()
    expect(sources).not.toContain('userSettings')
    expect(sources).toContain('policySettings')
    expect(sources).toContain('flagSettings')
  })

  test('getSettingsForSource：restricted 下 user/project/local 直读 null', () => {
    setRestrictedMode(true)
    expect(getSettingsForSource('userSettings')).toBeNull()
    expect(getSettingsForSource('projectSettings')).toBeNull()
    expect(getSettingsForSource('localSettings')).toBeNull()
  })

  test('updateSettingsForSource：restricted 下写回拒（error 面，零盘写）', () => {
    setRestrictedMode(true)
    const { error } = updateSettingsForSource('userSettings', {})
    expect(error).toBeTruthy()
  })
})

// ════════════════════════════════════════════════════════════════
// 接线锚（源级锁）：双 commander 面 flag 注册 + 双 setup 门
// ════════════════════════════════════════════════════════════════
describe('C9-2 接线锚（CLI/TUI 双面）', () => {
  test('parse.ts 注册 --restricted flag（headless commander 面）', () => {
    expect(srcOf('src/cli/parse.ts')).toContain('--restricted')
  })

  test('main.tsx 注册 --restricted flag（TUI commander 面）', () => {
    expect(srcOf('src/tui/main.tsx')).toContain('--restricted')
  })

  test('cli/setup.ts 接 bypass 拒门（headless lane）', () => {
    expect(srcOf('src/cli/setup.ts')).toContain('restrictedBypassError')
  })

  test('tui/setup.ts 接 bypass 拒门（TUI lane）', () => {
    expect(srcOf('src/tui/setup.ts')).toContain('restrictedBypassError')
  })
})
