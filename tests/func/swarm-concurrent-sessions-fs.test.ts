/**
 * swarm 域 S-E2d（§8.66.1.5 测试面）func 层（真盘：mkdtemp
 * ATLAS_CONFIG_DIR stamp + sessions/ PID registry 文件断言，零模型）。
 *
 * 测面 = PID registry 全流（registerSession 写面 + updateSessionName /
 * updateSessionBridgeId / updateSessionActivity 补丁面 +
 * countConcurrentSessions 计数/陈旧清扫/文件名守卫三态）+ R4 门裁
 * 恒生效 delta 断言（ATLAS_SESSION_KIND 恒读 env 无 feature 门 /
 * messagingSocketPath 字段恒含 / updateSessionActivity 无早退支）。
 *
 * 身份面：registerSession 的 getAgentId() != null 早退支（teammate
 * 不注册）经 setDynamicTeamContext 驱动；默认无身份（clearDynamicTeamContext）。
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import { spawn, spawnSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  countConcurrentSessions,
  isBgSession,
  registerSession,
  updateSessionActivity,
  updateSessionBridgeId,
  updateSessionName,
} from '../../src/swarm'
import {
  clearDynamicTeamContext,
  setDynamicTeamContext,
} from '../../src/engine/messaging'

let dir = ''

function pidFile(): string {
  return join(process.env.ATLAS_CONFIG_DIR!, 'sessions', `${process.pid}.json`)
}

function readPidFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(pidFile(), 'utf8'))
}

async function settle(ms = 50): Promise<void> {
  await new Promise(r => setTimeout(r, ms))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-conc-sess-'))
  process.env.ATLAS_CONFIG_DIR = dir
})

afterEach(() => {
  for (const k of [
    'ATLAS_SESSION_KIND',
    'ATLAS_MESSAGING_SOCKET',
    'ATLAS_SESSION_NAME',
    'ATLAS_SESSION_LOG',
    'ATLAS_AGENT',
    'ATLAS_ENTRYPOINT',
    'ATLAS_CONFIG_DIR',
  ]) {
    delete process.env[k]
  }
  clearDynamicTeamContext()
  rmSync(dir, { recursive: true, force: true })
})

// ── F-S1 registerSession 写面 ─────────────────────────────────────────

describe('F-S1 registerSession PID 文件写面', () => {
  test('无身份 → true + <pid>.json 字段面（kind 缺省 interactive）', async () => {
    expect(await registerSession()).toBe(true)
    const f = readPidFile()
    expect(f.pid).toBe(process.pid)
    expect(typeof f.sessionId).toBe('string')
    expect(typeof f.cwd).toBe('string')
    expect(typeof f.startedAt).toBe('number')
    expect(f.kind).toBe('interactive')
    // 未设 env 字段 = JSON 序列化自然省略
    expect(f).not.toHaveProperty('entrypoint')
    expect(f).not.toHaveProperty('messagingSocketPath')
    expect(f).not.toHaveProperty('name')
  })

  test('teammate 身份（dynamic agentId）→ false + 零文件', async () => {
    setDynamicTeamContext({
      agentId: 'w1',
      agentName: 'w1',
      teamName: 't1',
      planModeRequired: false,
    })
    expect(await registerSession()).toBe(false)
    expect(existsSync(pidFile())).toBe(false)
  })
})

// ── F-S2 R4 门裁恒生效 delta（env 恒读 / 字段恒含）────────────────────

describe('F-S2 R4 delta（无 feature 门控，恒生效）', () => {
  test('ATLAS_SESSION_KIND=bg → kind bg + isBgSession 恒读 env', async () => {
    process.env.ATLAS_SESSION_KIND = 'bg'
    expect(isBgSession()).toBe(true)
    expect(await registerSession()).toBe(true)
    expect(readPidFile().kind).toBe('bg')
  })

  test('ATLAS_SESSION_KIND=daemon-worker → kind daemon-worker（3 值 enum 面）', async () => {
    process.env.ATLAS_SESSION_KIND = 'daemon-worker'
    expect(isBgSession()).toBe(false)
    expect(await registerSession()).toBe(true)
    expect(readPidFile().kind).toBe('daemon-worker')
  })

  test('非法 ATLAS_SESSION_KIND → 回落 interactive', async () => {
    process.env.ATLAS_SESSION_KIND = 'bogus'
    expect(await registerSession()).toBe(true)
    expect(readPidFile().kind).toBe('interactive')
  })

  test('R4 UDS 字段恒含：ATLAS_MESSAGING_SOCKET 设真 → 字段落盘', async () => {
    process.env.ATLAS_MESSAGING_SOCKET = '/tmp/uds.sock'
    process.env.ATLAS_SESSION_NAME = 'my-session'
    process.env.ATLAS_SESSION_LOG = '/tmp/s.log'
    process.env.ATLAS_AGENT = 'agent-x'
    process.env.ATLAS_ENTRYPOINT = 'cli'
    expect(await registerSession()).toBe(true)
    const f = readPidFile()
    expect(f.messagingSocketPath).toBe('/tmp/uds.sock')
    expect(f.name).toBe('my-session')
    expect(f.logPath).toBe('/tmp/s.log')
    expect(f.agent).toBe('agent-x')
    expect(f.entrypoint).toBe('cli')
  })
})

// ── F-S3 补丁面（updateSessionName / BridgeId / Activity）─────────────

describe('F-S3 PID 文件补丁面', () => {
  test('updateSessionName 落盘 + undefined 零写', async () => {
    await registerSession()
    await updateSessionName('renamed')
    expect(readPidFile().name).toBe('renamed')
    // 未注册会话（先删文件）→ 静默 no-op 不抛
    unlinkSync(pidFile())
    await updateSessionName('x')
    expect(existsSync(pidFile())).toBe(false)
  })

  test('updateSessionBridgeId 落盘（null 清面亦写）', async () => {
    await registerSession()
    await updateSessionBridgeId('bridge-1')
    expect(readPidFile().bridgeSessionId).toBe('bridge-1')
    await updateSessionBridgeId(null)
    expect(readPidFile().bridgeSessionId).toBe(null)
  })

  test('updateSessionActivity status/waitingFor + updatedAt（R4 无早退支）', async () => {
    await registerSession()
    await updateSessionActivity({ status: 'busy', waitingFor: 'Bash' })
    const f = readPidFile()
    expect(f.status).toBe('busy')
    expect(f.waitingFor).toBe('Bash')
    expect(typeof f.updatedAt).toBe('number')
  })
})

// ── F-S4 countConcurrentSessions 计数/清扫/守卫三态 ───────────────────

describe('F-S4 countConcurrentSessions', () => {
  test('自身 pid 计数（registry 已含本进程）', async () => {
    await registerSession()
    expect(await countConcurrentSessions()).toBeGreaterThanOrEqual(1)
  })

  test('死 pid 文件清扫（unlink 且不计数）', async () => {
    await registerSession()
    const dead = spawnSync('true').pid!
    writeFileSync(
      join(process.env.ATLAS_CONFIG_DIR!, 'sessions', `${dead}.json`),
      '{}',
    )
    expect(await countConcurrentSessions()).toBe(1) // 仅自身
    // 清扫 = fire-and-forget（void unlink catch 面）→ 结算后验 unlink 落盘面
    await settle(50)
    expect(
      existsSync(join(process.env.ATLAS_CONFIG_DIR!, 'sessions', `${dead}.json`)),
    ).toBe(false)
  })

  test('活 pid 文件计数（子进程 sleep 存活支）', async () => {
    await registerSession()
    const child = spawn('sleep', ['5'])
    await settle(200)
    const livePid = child.pid!
    writeFileSync(
      join(process.env.ATLAS_CONFIG_DIR!, 'sessions', `${livePid}.json`),
      '{}',
    )
    try {
      expect(await countConcurrentSessions()).toBe(2)
    } finally {
      child.kill()
      unlinkSync(join(process.env.ATLAS_CONFIG_DIR!, 'sessions', `${livePid}.json`))
    }
  })

  test('文件名守卫：非 <pid>.json 文件零清扫（防误删用户数据）', async () => {
    await registerSession()
    const stray = join(
      process.env.ATLAS_CONFIG_DIR!,
      'sessions',
      '2026-03-14_notes.md',
    )
    writeFileSync(stray, 'notes')
    expect(await countConcurrentSessions()).toBe(1)
    expect(existsSync(stray)).toBe(true)
  })

  test('空目录 → 0（含自身文件缺席支）', async () => {
    // 未 registerSession → 无自身文件；目录不存在 → readdir ENOENT 保守 0
    expect(await countConcurrentSessions()).toBe(0)
  })
})
