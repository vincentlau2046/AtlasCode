/**
 * tui 注册面名表判别单测（W2-2a-2，§8.74.8/§8.74.11）：
 * ① 缺省态（feature 全 off / dev 关 / 测试面开）getAllBaseTools() 名表 = 显式锁定表
 *    （删注册行/改名/错门控即红；表 = 2026-09-30 缺省态实测锁定，门控基线见头注）；
 * ② 5 名集 + MAX_WORKER_SPAWN_DEPTH 经 tui constants re-export 后与 engine 单一事实源
 *    引用同一对象（单源核验，防 tui 侧重新本地化漂移）。
 *
 * 门控基线（缺省态实测口径，突变须同步改表 + 设计记录）：
 *  - feature 缺省全 off（ASCEND_TOOLS/AGENT_TRIGGERS/HISTORY_SNIP
 *    均非 ON_BY_DEFAULT）→ ascend 16 / cron 3 / Snip 不入门池
 *    （AGENT_TRIGGERS_REMOTE 门 + RemoteTrigger 面 G-3 §8.74.28 F 类整裁）
 *  - ATLAS_DEV 未设 → REPL / Tungsten 不入；IS_ATLAS_DEV 为模块加载期常量 → env 必须在
 *    动态 import 之前 pin
 *  - isTodoV2Enabled = true（交互态缺省）→ 任务族 4 入
 *  - isWorktreeModeEnabled 恒 true → Enter/ExitWorktree 入
 *  - ENABLE_LSP_TOOL 未设 → LSP 不入；swarm 门关 → Team 2 不入；PowerShell 平台支
 *    非 Windows → 不入
 *  - NODE_ENV === 'test'（bun test 恒真）→ TestingPermission 入
 *  - ENABLE_TOOL_SEARCH 未设 + firstParty 网关缺省（provider 恒 firstParty，
 *    无 URL = first-party 语义缺省 true）→ ToolSearch optimistic ON 入（门控实现
 *    utils/toolSearch.ts isToolSearchEnabledOptimistic 尾支，2026-09-30 实测锁定）
 *  - hasEmbeddedSearchTools 关（EMBEDDED_SEARCH_TOOLS 未设）→ Glob/Grep 入
 */
import { describe, test, expect } from 'bun:test'

// ── env pin（模块加载期门控必须在首次 import 前固定）────────────────
const PINNED_ENV = [
  'ATLAS_DEV',
  'EMBEDDED_SEARCH_TOOLS',
  'ATLAS_ENTRYPOINT',
  'ATLAS_ENABLE_TASKS',
  'ENABLE_LSP_TOOL',
  'ATLAS_EXPERIMENTAL_AGENT_TEAMS',
  'ATLAS_DISABLE_WORKTREE_MODE',
  'ATLAS_DISABLE_CRON',
  'ENABLE_TOOL_SEARCH',
  'ATLAS_DISABLE_EXPERIMENTAL_BETAS',
  'OPENAI_BASE_URL',
  'FEATURE_ASCEND_TOOLS',
  'FEATURE_AGENT_TRIGGERS',
  'FEATURE_AGENT_TRIGGERS_REMOTE',
  'FEATURE_HISTORY_SNIP',
  'FEATURE_COORDINATOR_MODE',
] as const
for (const k of PINNED_ENV) delete process.env[k]

const tui = await import('../../src/tui/index.js')
const engine = await import('../../src/engine/index.js')

// ── ① 缺省态注册名表（显式锁定，= 组 A engine-backed 36 中缺省门开子集 + 组 B 测试面）──
const EXPECTED_BASE_TOOLS = [
  // 组 A 缺省常开
  'Agent',
  'TaskOutput',
  'Bash',
  'Glob',
  'Grep',
  'ExitPlanMode',
  'Read',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'TodoWrite',
  'WebSearch',
  'TaskStop',
  'AskUserQuestion',
  'Skill',
  'EnterPlanMode',
  'Config',
  'TaskCreate',
  'TaskGet',
  'TaskUpdate',
  'TaskList',
  'EnterWorktree',
  'ExitWorktree',
  'SendMessage',
  // 组 A feature 门缺省 off（ascend 16 / cron 3 / LSP / Snip / REPL /
  // Tungsten / Team 2）= 不入缺省表（RemoteTrigger G-3 整裁，面已删）
  // 组 B 缺省入池者
  'TestingPermission', // NODE_ENV=test
  'ListMcpResourcesTool',
  'ReadMcpResourceTool',
  'ToolSearch', // optimistic ON（firstParty 缺省，见头注门控基线）
]

describe('tui 注册面名表（W2-2a-2）', () => {
  test('缺省态 getAllBaseTools 名表 = 锁定表', () => {
    const names = tui.getAllBaseTools().map((t: { name: string }) => t.name)
    expect([...names].sort()).toEqual([...EXPECTED_BASE_TOOLS].sort())
  })

  test('注册集合无重名（去重不变式）', () => {
    const names = tui.getAllBaseTools().map((t: { name: string }) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('名集单源核验（constants/tools.ts 切 engine toolNames）', () => {
  const SETS = [
    'ALL_AGENT_DISALLOWED_TOOLS',
    'CUSTOM_AGENT_DISALLOWED_TOOLS',
    'ASYNC_AGENT_ALLOWED_TOOLS',
    'IN_PROCESS_TEAMMATE_ALLOWED_TOOLS',
    'COORDINATOR_MODE_ALLOWED_TOOLS',
  ] as const

  test('5 名集与 engine 单一事实源引用同一对象（re-export 单源）', () => {
    for (const s of SETS) {
      const tuiSet = (tui as Record<string, unknown>)[s]
      const engineSet = (engine as Record<string, unknown>)[s]
      expect(tuiSet).toBe(engineSet)
    }
  })

  test('名集内容 = engine toolNames 静态口径（值核验，防引用改后本地化）', () => {
    const toArr = (s: Set<unknown>) => [...s].sort()
    expect(toArr(tui.ALL_AGENT_DISALLOWED_TOOLS as Set<string>)).toEqual([
      'Agent',
      'AskUserQuestion',
      'EnterPlanMode',
      'ExitPlanMode',
      'TaskOutput',
      'TaskStop',
    ])
    expect(toArr(tui.COORDINATOR_MODE_ALLOWED_TOOLS as Set<string>)).toEqual([
      'Agent',
      'SendMessage',
      'StructuredOutput',
      'TaskStop',
    ])
    expect(toArr(tui.IN_PROCESS_TEAMMATE_ALLOWED_TOOLS as Set<string>)).toEqual([
      'SendMessage',
      'TaskCreate',
      'TaskGet',
      'TaskList',
      'TaskUpdate',
    ])
    expect(tui.MAX_WORKER_SPAWN_DEPTH).toBe(2)
  })
})
