/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）unit 层（零盘零模型）：spawnUtils
 * 纯 builder 面（旧仓 utils/swarm/spawnUtils.ts 133L 逐字，S-E2b 落位）。
 *
 * 测面 = quote（shell-quote 直用包装）/ getTeammateCommand（env 覆写
 * 优先支 + 缺省支非空断言）/ buildInheritedCliFlags（plan 优先语义
 * 矩阵 5 态 + teammate-mode 快照支）/ buildInheritedEnvVars（两常量
 * 恒含 + 转发矩阵：设值/空值/含空格引号面）。
 *
 * 模块态清理：teammateModeSnapshot CLI override（setCliTeammateModeOverride
 * 用例后 clearCliTeammateModeOverride('auto') 复位）+ env 用例内存取还原。
 */
import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildInheritedCliFlags,
  buildInheritedEnvVars,
  captureTeammateModeSnapshot,
  clearCliTeammateModeOverride,
  getTeammateCommand,
  quote,
  setCliTeammateModeOverride,
} from '../../src/swarm'

const FORWARD_ENV = [
  'ATLAS_TEAMMATE_COMMAND',
  'ATLAS_CONFIG_DIR',
  'OPENAI_BASE_URL',
  'ATLAS_REMOTE',
  'ATLAS_REMOTE_MEMORY_DIR',
  'HTTPS_PROXY',
  'http_proxy',
  'NO_PROXY',
] as const

afterEach(() => {
  for (const k of FORWARD_ENV) delete process.env[k]
  clearCliTeammateModeOverride('auto')
})

describe('quote（shell-quote 包装面）', () => {
  test('单 token 零引号', () => {
    expect(quote(['a'])).toBe('a')
  })

  test('含空格 token 单引号包裹 + 多 token 空格连接', () => {
    expect(quote(['a b', 'c'])).toBe("'a b' c")
  })

  test('空数组 → 空串', () => {
    expect(quote([])).toBe('')
  })

  test('非 string arg 经 String() 映射（ReadonlyArray<unknown> 面）', () => {
    expect(quote([1, true])).toBe('1 true')
  })
})

describe('getTeammateCommand', () => {
  test('ATLAS_TEAMMATE_COMMAND 设真 → env 值优先', () => {
    process.env.ATLAS_TEAMMATE_COMMAND = '/custom/bin/atlas'
    expect(getTeammateCommand()).toBe('/custom/bin/atlas')
  })

  test('env 未设 → 缺省支非空串（bundled execPath / argv[1] 面）', () => {
    delete process.env.ATLAS_TEAMMATE_COMMAND
    const cmd = getTeammateCommand()
    expect(typeof cmd).toBe('string')
    expect(cmd.length).toBeGreaterThan(0)
  })
})

describe('buildInheritedCliFlags（plan 优先语义矩阵）', () => {
  test('无 options → 仅 teammate-mode 旗标（快照缺省 auto 兜底支）', () => {
    expect(buildInheritedCliFlags()).toBe('--teammate-mode auto')
  })

  test('bypassPermissions → --dangerously-skip-permissions 继承', () => {
    expect(
      buildInheritedCliFlags({ permissionMode: 'bypassPermissions' }),
    ).toBe('--dangerously-skip-permissions --teammate-mode auto')
  })

  test('acceptEdits → --permission-mode acceptEdits 继承', () => {
    expect(buildInheritedCliFlags({ permissionMode: 'acceptEdits' })).toBe(
      '--permission-mode acceptEdits --teammate-mode auto',
    )
  })

  test('planModeRequired + bypass → bypass 不继承（plan 安全优先支）', () => {
    expect(
      buildInheritedCliFlags({
        planModeRequired: true,
        permissionMode: 'bypassPermissions',
      }),
    ).toBe('--teammate-mode auto')
  })

  test('planModeRequired + acceptEdits → 两继承支全抑制', () => {
    expect(
      buildInheritedCliFlags({
        planModeRequired: true,
        permissionMode: 'acceptEdits',
      }),
    ).toBe('--teammate-mode auto')
  })

  test('permissionMode default → 零权限旗标', () => {
    expect(buildInheritedCliFlags({ permissionMode: 'default' })).toBe(
      '--teammate-mode auto',
    )
  })

  test('CLI override tmux 快照支 → --teammate-mode tmux', () => {
    setCliTeammateModeOverride('tmux')
    captureTeammateModeSnapshot()
    expect(buildInheritedCliFlags()).toBe('--teammate-mode tmux')
  })
})

describe('buildInheritedEnvVars（两常量恒含 + 转发矩阵）', () => {
  test('缺省：ATLAS_CODE=1 + ATLAS_EXPERIMENTAL_AGENT_TEAMS=1 恒含', () => {
    const out = buildInheritedEnvVars()
    expect(out.startsWith('ATLAS_CODE=1 ATLAS_EXPERIMENTAL_AGENT_TEAMS=1')).toBe(
      true,
    )
  })

  test('设值变量转发（OPENAI_BASE_URL / ATLAS_CONFIG_DIR）', () => {
    process.env.OPENAI_BASE_URL = 'http://iff.local/v1'
    process.env.ATLAS_CONFIG_DIR = '/cfg'
    const out = buildInheritedEnvVars()
    // shell-quote 面：shell 元字符 ':' 经转义（\:) 落串（quote 行为验真）
    expect(out).toContain('OPENAI_BASE_URL=http\\://iff.local/v1')
    expect(out).toContain('ATLAS_CONFIG_DIR=/cfg')
  })

  test('含空格值经 quote 单引号包裹', () => {
    process.env.ATLAS_CONFIG_DIR = '/tmp/my cfg'
    expect(buildInheritedEnvVars()).toContain("ATLAS_CONFIG_DIR='/tmp/my cfg'")
  })

  test('空串值不转发（!== undefined && !== "" 双守卫）', () => {
    process.env.ATLAS_REMOTE = ''
    const out = buildInheritedEnvVars()
    expect(out).not.toContain('ATLAS_REMOTE')
  })

  test('未设变量零出现（NO_PROXY 对照支）', () => {
    const out = buildInheritedEnvVars()
    expect(out).not.toContain('NO_PROXY')
  })
})
