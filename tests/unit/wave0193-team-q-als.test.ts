/**
 * 0.1.93 round 8 段 Q — RED-E teammateContext 三副本单源化判别格
 * （f4 round 8 修形指令⑤ 预注册：Q1 副本数结构断言 / Q2 双车道 identity
 * 贯通直证 / Q3 sender 恒回落 team-lead 缺席销项；Q4 触发段点火 = func 层
 * F-Q 段，见 tests/func/engine-tools-send-message-se2-fs.test.ts）。
 *
 * 根因（e2e round 7 终判 RED-E）：teammateContext（AsyncLocalStorage 身份
 * 面）曾有三物理副本（src/swarm / src/engine/messaging / src/tui/utils，
 * md5 互异、代码体全等）——swarm/inProcessRunner L217 写 swarm 副本 ALS，
 * 成员工具经 engine/messaging 门面读 engine 副本 ALS → getAgentName/
 * getAgentId 恒 undefined → sender 恒回落 team-lead + 触发段 agentId ''
 * 恒失配（exitTriggered 0 体）→ 成员零终态 → TeamDelete 恒拦 → forced=2。
 * 修形 = 单一 src/shared/teammateContext.ts（三域共同可达），副本直删。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

import {
  createTeammateContext,
  runWithTeammateContext,
} from '../../src/shared/teammateContext'
import {
  getAgentId as engineGetAgentId,
  getAgentName as engineGetAgentName,
} from '../../src/engine/messaging/teammate'
import {
  getAgentId as tuiGetAgentId,
  getAgentName as tuiGetAgentName,
} from '../../src/tui/utils/teammate'

const SRC_ROOT = join(import.meta.dir, '..', '..', 'src')

/** 递归收集 src/ 下所有 teammateContext.ts（跳过 node_modules/dist）。 */
function findTeammateContextFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      findTeammateContextFiles(p, out)
    } else if (entry.name === 'teammateContext.ts') {
      out.push(p)
    }
  }
  return out
}

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

const memberCtx = createTeammateContext({
  agentId: 'researcher@t1',
  agentName: 'researcher',
  teamName: 't1',
  planModeRequired: false,
  parentSessionId: 'sess-1',
  abortController: new AbortController(),
})

describe('wave0193 round 8 段 Q：teammateContext 单源化判别格', () => {
  test('Q1-1 仓内 teammateContext 模块文件数 = 1（shared 单源）', () => {
    const files = findTeammateContextFiles(SRC_ROOT)
    expect(files).toHaveLength(1)
    expect(files[0]).toBe(join(SRC_ROOT, 'shared', 'teammateContext.ts'))
  })

  test('Q1-2 RED-E 分裂点（双 runner）不再 import 域内副本，改走 shared', () => {
    // e2e round 7 定谳的写手分裂点：swarm/inProcessRunner L217 与其 TUI
    // twin（tui/utils/swarm/inProcessRunner L85）——两处都不得再 import
    // 域内 teammateContext（副本已删）；src 侧走 shared 门面（STR-1
    // folder-mode entry-point），tui 侧走 'src/shared' 别名。
    const swarmRunner = readSrc('swarm/inProcessRunner.ts')
    expect(swarmRunner).not.toMatch(/from '\.{1,2}\/teammateContext'/)
    expect(swarmRunner).toContain(
      "import { runWithTeammateContext } from '../shared'",
    )
    const tuiRunner = readSrc('tui/utils/swarm/inProcessRunner.ts')
    expect(tuiRunner).not.toMatch(/from '\.{1,2}\/teammateContext(\.js)?'/)
    expect(tuiRunner).toContain("from 'src/shared'")
  })

  test('Q1-3 ALS 声明单点：new AsyncLocalStorage<TeammateContext> 全仓唯一', () => {
    // bundle ALS 实例数 1 的源级等价断言：声明唯一 → bundle 实例唯一。
    const files = findTeammateContextFiles(SRC_ROOT)
    expect(files).toHaveLength(1)
    const decl = readSrc('shared/teammateContext.ts')
    expect(decl).toContain('new AsyncLocalStorage<TeammateContext>()')
  })

  test('Q2 双车道 identity 贯通：swarm 写 → engine/tui 读同源', () => {
    const seen = runWithTeammateContext(memberCtx, () => ({
      engineName: engineGetAgentName(),
      engineId: engineGetAgentId(),
      tuiName: tuiGetAgentName(),
      tuiId: tuiGetAgentId(),
    }))
    expect(seen.engineName).toBe('researcher')
    expect(seen.engineId).toBe('researcher@t1')
    expect(seen.tuiName).toBe('researcher')
    expect(seen.tuiId).toBe('researcher@t1')
    // ALS 作用域外零污染（两车道回落 dynamicTeamContext = 本文件未设 = undefined）
    expect(engineGetAgentName()).toBeUndefined()
    expect(engineGetAgentId()).toBeUndefined()
    expect(tuiGetAgentName()).toBeUndefined()
    expect(tuiGetAgentId()).toBeUndefined()
  })

  test('Q3 sender 恒回落 team-lead 缺席销项：成员 ctx 内 sender 派生得真名', () => {
    // RED-E 症状链源头：成员工具 sender 派生 getAgentName() || TEAM_LEAD_NAME
    // 在分裂态恒 undefined → 恒 'team-lead'。单源后成员 ctx 内两车道均得真名。
    runWithTeammateContext(memberCtx, () => {
      expect(engineGetAgentName() || 'team-lead').toBe('researcher')
      expect(tuiGetAgentName() || 'team-lead').toBe('researcher')
      // 触发段 agentId 匹配面（round 6 修形点入参）非空非 ''
      expect(engineGetAgentId() || '').toBe('researcher@t1')
    })
  })
})
