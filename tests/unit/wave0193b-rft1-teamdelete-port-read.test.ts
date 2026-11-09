/**
 * 0.1.93b 段 F RF-T1 判别格（工单 @c22716f6 §10-§11；f4 §11 批复
 * 2026-11-09）。RED-F 终形定谳：TeamDelete branch-2 读面 = lead lane
 * makeCtx TPC 窄视图（cli/print.ts，S-E3 有意设计）无 tasks 字段 →
 * isInProcessTeammateActiveOrUnknown(undefined) fail-closed 恒判活 =
 * 结构性恒拦（e2e 腿 t8-reddf-r6：completed apply 63s 前已生效仍拦）。
 *
 * 修形 = branch-2 读面单点改走 sessionContextPort（drain ladder 同款
 * 先例 print.ts `getAppState: () => sessionPort.get()`）；port 缺席维持
 * fail-closed 不放宽（守卫语义锁面）。
 */
import { describe, expect, test } from 'bun:test'
import { TeamDeleteTool } from '../../src/engine/tools/team/teamDeleteTool'
import {
  resetSessionContextPort,
  setSessionContextPort,
} from '../../src/engine/session/sessionContextPort'
import type { SessionContextPort } from '../../src/engine/ports/sessionContext'
import {
  resetTeamServices,
  setTeamServices,
  type TeamServices,
} from '../../src/engine/tools/team/teamServices'

/** 全内存 TeamServices fake（零真盘；wave0193-team-form-a 同款）。 */
function makeMemoryServices(teamName: string, members: Record<string, { name: string; taskId: string }>) {
  const calls: string[] = []
  let ctx: Record<string, unknown> | undefined = {
    teamName,
    teammates: members,
  }
  const services: TeamServices = {
    readTeamFile: () => null, // Form A：无 team file → branch 1 跳过（e2e 实证面）
    writeTeamFileAsync: async () => {
      calls.push('writeTeamFileAsync')
    },
    getTeamFilePath: (name: string) => `/fake/atlas/teams/${name}/config.json`,
    registerTeamForSessionCleanup: () => {
      calls.push('registerTeamForSessionCleanup')
    },
    unregisterTeamForSessionCleanup: () => {
      calls.push('unregisterTeamForSessionCleanup')
    },
    cleanupTeamDirectories: async () => {
      calls.push('cleanupTeamDirectories')
    },
    assignTeammateColor: () => '#fake',
    clearTeammateColors: () => {
      calls.push('clearTeammateColors')
    },
    sanitizeName: (n: string) => n,
    getTeamContext: () => ctx as never,
    setTeamContext: c => {
      ctx = c as Record<string, unknown>
    },
  }
  return { services, calls }
}

/** lead lane makeCtx TPC 窄视图复刻（无 tasks 字段——S-E3 契约面）。 */
const narrowContext = {
  getAppState: () => ({ toolPermissionContext: { mode: 'default' } }),
}

/** 最小 SessionContextPort fake（TeamDelete 只读 .tasks）。 */
function makePort(tasks: Record<string, unknown>): SessionContextPort {
  return {
    get: () =>
      ({
        toolPermissionContext: { mode: 'default' },
        mcp: { tools: [], clients: [] },
        effortValue: 'normal',
        advisorModel: undefined,
        tasks,
      }) as unknown as ReturnType<SessionContextPort['get']>,
    set: () => {},
  }
}

const SCOUT = { 'agent-1': { name: 'scout', taskId: 'task-1' } }

describe('0.1.93b RF-T1：TeamDelete branch-2 读面改走 sessionContextPort', () => {
  test('F1 判别格（修前红）：completed 成员 + 窄视图 context → 守卫放行', async () => {
    const { services, calls } = makeMemoryServices('research-pair-n', SCOUT)
    setTeamServices(services)
    setSessionContextPort(makePort({ 'task-1': { status: 'completed' } }))
    try {
      const result = await TeamDeleteTool.call({}, narrowContext)
      expect(result.data.success).toBe(true) // 旧码：tasks=undefined → fail-closed 恒拦 → 红
      expect(calls).toContain('cleanupTeamDirectories')
    } finally {
      resetTeamServices()
      resetSessionContextPort()
    }
  })

  test('F2 fail-closed 不放宽：port 缺席（未注入）→ 守卫仍拦', async () => {
    const { services } = makeMemoryServices('research-pair-n', SCOUT)
    setTeamServices(services)
    resetSessionContextPort() // port 缺席 = tasks undefined
    try {
      const result = await TeamDeleteTool.call({}, narrowContext)
      expect(result.data.success).toBe(false)
      expect(result.data.message).toContain('Cannot cleanup team')
    } finally {
      resetTeamServices()
      resetSessionContextPort()
    }
  })

  test('F3 fail-closed 不放宽：port 在场但成员 running → 守卫仍拦', async () => {
    const { services } = makeMemoryServices('research-pair-n', SCOUT)
    setTeamServices(services)
    setSessionContextPort(makePort({ 'task-1': { status: 'running' } }))
    try {
      const result = await TeamDeleteTool.call({}, narrowContext)
      expect(result.data.success).toBe(false)
      expect(result.data.message).toContain('scout')
    } finally {
      resetTeamServices()
      resetSessionContextPort()
    }
  })

  test('F4 fail-closed 不放宽：port 在场但条目 status 未知 → 守卫仍拦', async () => {
    const { services } = makeMemoryServices('research-pair-n', SCOUT)
    setTeamServices(services)
    setSessionContextPort(makePort({ 'task-1': { identity: { agentId: 'agent-1' } } }))
    try {
      const result = await TeamDeleteTool.call({}, narrowContext)
      expect(result.data.success).toBe(false)
      expect(result.data.message).toContain('Cannot cleanup team')
    } finally {
      resetTeamServices()
      resetSessionContextPort()
    }
  })
})
