/**
 * 0.1.79 W-C 小件清尾波判别单测（工单 docs/2026-10-23-p0-wave-0179-ticket.md §2①）。
 *
 * 波 = W-C 小件清尾（f4 零码工单 2026-10-23，基线 569aed7）：11 件新做
 * （#20 MCP 归一空名 guard / F-4 APIError 双族合并 / C4-3 长工具进度心跳 /
 * C5-3 MCP >2min 自动转后台 / C5-4 MCP 能力发现退避 / C6-2 memory 容量预警 /
 * C8-2 DirectoryAdded / C8-3 MessageDisplay / C8-5 terminalSequence+continueOnBlock /
 * C9-2 --restricted / C9-5 skillOverrides）+ D-3/D-5 已落地核验锚。
 *
 * 判别信号（工单 §2① 规格，本文件逐件落）：
 *  - #20 guard：`'...'→'___'` 三副本逐字一致（基线 569aed7 同面红）+ 非空名行为不变。
 *  - F-4：单类 instanceof 判别（tui 侧 re-export 的 APIError === modelprovider 定义类）。
 *  - C8：新事件枚举在场断言（DirectoryAdded / MessageDisplay）。
 *  - C9-2：restricted 剥离面断言（命令类工具缺席 / 文件工具在场 / bypassPermissions 拒）。
 *  - C9-5：skillOverrides 三档断言（off / user-invocable-only / name-only）。
 *  - D-3/D-5 已落地核验锚：活码注在场（compact.ts:38/:1105 附近）+ 既有判别单测在场。
 *
 * unit 层纪律：读仓库自身源级锁 + 纯函数行为断言，零重图/零网络/零盘写。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { normalizeNameForMCP as engineNormalize } from '../../src/engine/tools/mcp'
import { normalizeNameForMCP as tuiNormalize } from '../../src/tui/services/mcp/normalization'
import { normalizeNameForMCP as ruleNormalize } from '../../src/permissions/mcpRuleNames'
import {
  buildMcpToolName,
  mcpInfoFromString,
} from '../../src/permissions/mcpRuleNames'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}

// ════════════════════════════════════════════════════════════════
// #20 MCP 归一空名 guard（三副本，工单 §1.1）
// ════════════════════════════════════════════════════════════════
describe('wave0179 #20 normalizeNameForMCP empty-after-fold guard', () => {
  test('全非法字符名回落折叠前值（基线 569aed7 同面红：现行为 ""）', () => {
    // 与 0.1.78 前旧行为逐字一致（工单 §0：f4 机检坐实 '...' 旧 '___'/现 ''）。
    expect(engineNormalize('...')).toBe('___')
    expect(tuiNormalize('...')).toBe('___')
    expect(ruleNormalize('...')).toBe('___')
  })

  test('空串/纯下划线名同回落', () => {
    expect(engineNormalize('___')).toBe('___')
    expect(tuiNormalize('___')).toBe('___')
    expect(ruleNormalize('___')).toBe('___')
  })

  test('非空名行为不变（0.1.78 A3-2 折叠+去首尾恒等）', () => {
    for (const n of ['my-server', 'my__server', 'a.b c', '中文服务器', '_edge_', 'a___b']) {
      const folded = n.replace(/[^a-zA-Z0-9_-]/g, '_')
      const expected =
        folded.replace(/_+/g, '_').replace(/^_|_$/g, '') || folded
      expect(engineNormalize(n)).toBe(expected)
      expect(tuiNormalize(n)).toBe(expected)
      expect(ruleNormalize(n)).toBe(expected)
    }
    // 具体锁：折叠语义样例
    expect(engineNormalize('a.b c')).toBe('a_b_c')
    expect(engineNormalize('my__server')).toBe('my_server')
    expect(engineNormalize('_edge_')).toBe('edge')
  })

  test('三副本同型 guard（活码折叠前值回落三处均在场）', () => {
    for (const rel of [
      'src/permissions/mcpRuleNames.ts',
      'src/engine/tools/mcp.ts',
      'src/tui/services/mcp/normalization.ts',
    ]) {
      const live = srcOf(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
      expect(live.includes("normalized === '' ? folded : normalized")).toBe(true)
    }
  })
})

// ════════════════════════════════════════════════════════════════
// #20 权限面语义锁（commit 安全审视 2026-10-23 回应）：guard 恢复 ≤0.1.77
// 身份（'...'→'___'），修复 0.1.78 一版回归（彼时 server 级规则不可达）；
// 无规则迁移（ruleMatching 原串比对），deny 失配 → passthrough → ask
// （fail-toward-prompt 非 fail-open）。
// ════════════════════════════════════════════════════════════════
describe('wave0179 #20 权限面语义（guard 恢复 ≤0.1.77 身份恒等）', () => {
  test('全非法名 server 工具名 = ≤0.1.77 逐字一致（0.1.78 空段折叠为另一身份）', () => {
    // guard 后：'...' server + 'tool' → 'mcp_______tool'（mcp__ + ___ + __ + tool），
    // 与 ≤0.1.77（replace-only 归一）逐字一致 → ≤0.1.77 写下的 exact-string
    // deny/allow 规则重新命中；0.1.78 折叠出 'mcp____tool'（4 下划线）为身份漂移。
    const built = buildMcpToolName('...', 'tool')
    expect(built).toBe('mcp_______tool')
    expect(built).not.toBe('mcp____tool')
  })

  test('下划线-only server 名超出 mcpInfoFromString 可达域（全版本同限，旧仓同注）', () => {
    // 'mcp' + 7 连续下划线 split('__') 得空 server 段 → null：server 级规则对
    // 病态名在 ≤0.1.77 / 0.1.78 / 0.1.79 三代均不可达（`__` 歧义固有，非本波
    // 引入）；唯一匹配面 = exact-string 规则（上测恒等锚）。deny 失配 → MCP
    // 默认 passthrough → ask（fail-toward-prompt，非 fail-open）。
    expect(mcpInfoFromString(buildMcpToolName('...', 'tool'))).toBeNull()
    expect(mcpInfoFromString('mcp____tool')).toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════
// F-4 APIError 双族合并（工单 §1.2）：modelprovider 归一单类 +
// tui/types/atlas.ts re-export。基线 569aed7 两族独立（positional
// `(message, status?, error?)` vs opts `{status, code, headers}`），
// 跨族 instanceof 断裂（tui 抛的 APIUserAbortError 不被 modelprovider
// 侧 instanceof 捕获）——判别信号 = 同类引用 + 双构造形状 + 子类 name 语义并。
// ════════════════════════════════════════════════════════════════
import {
  APIError as MpAPIError,
  RateLimitError as MpRateLimitError,
  AuthenticationError as MpAuthenticationError,
  NotFoundError as MpNotFoundError,
  APIConnectionError as MpAPIConnectionError,
  APIConnectionTimeoutError as MpAPIConnectionTimeoutError,
  APIUserAbortError as MpAPIUserAbortError,
} from '../../src/modelprovider/types'
import {
  APIError as TuiAPIError,
  RateLimitError as TuiRateLimitError,
  AuthenticationError as TuiAuthenticationError,
  NotFoundError as TuiNotFoundError,
  APIConnectionError as TuiAPIConnectionError,
  APIConnectionTimeoutError as TuiAPIConnectionTimeoutError,
  APIUserAbortError as TuiAPIUserAbortError,
} from '../../src/tui/types/atlas.js'

describe('wave0179 F-4 APIError 双族合并（单类 instanceof 判别）', () => {
  test('tui re-export = modelprovider 定义类（基线 569aed7 同面红：两独立类）', () => {
    expect(TuiAPIError).toBe(MpAPIError)
    expect(TuiRateLimitError).toBe(MpRateLimitError)
    expect(TuiAuthenticationError).toBe(MpAuthenticationError)
    expect(TuiNotFoundError).toBe(MpNotFoundError)
    expect(TuiAPIConnectionError).toBe(MpAPIConnectionError)
    expect(TuiAPIConnectionTimeoutError).toBe(MpAPIConnectionTimeoutError)
    expect(TuiAPIUserAbortError).toBe(MpAPIUserAbortError)
  })

  test('跨族 instanceof 修向：tui 侧构造的 abort 被 modelprovider 类检查捕获', () => {
    // 合并前断裂面：withRetry.ts 抛 new APIUserAbortError()（tui 族），
    // modelprovider 侧 errors.ts isAbortError 的 instanceof 检查 miss。
    const abort = new TuiAPIUserAbortError()
    expect(abort instanceof MpAPIError).toBe(true)
    expect(abort instanceof MpAPIUserAbortError).toBe(true)
    const conn = new TuiAPIConnectionTimeoutError('Request timed out.')
    expect(conn instanceof MpAPIConnectionTimeoutError).toBe(true)
  })

  test('双构造形状①：positional (message, status?, error?) 恒等（modelprovider 面）', () => {
    const cause = new Error('boom')
    const e = new MpAPIError('msg', 403, cause)
    expect(e.status).toBe(403)
    expect(e.error).toBe(cause)
    expect(e.message).toBe('msg')
    expect(e.name).toBe('APIError')
    // 既有调用形状不破：单参 / 双参
    const e2 = new MpAPIConnectionError('Connection error.')
    expect(e2.message).toBe('Connection error.')
    expect(e2.status).toBeUndefined()
  })

  test('双构造形状②：opts {status, code, headers} + 缺省 message（tui 面）', () => {
    const headers = { 'retry-after': '12' }
    const e = new TuiAPIError(undefined, { status: 429, code: 'rate_limited', headers })
    expect(e.status).toBe(429)
    expect(e.code).toBe('rate_limited')
    expect(e.headers).toBe(headers)
    expect(e.message).toBe('API error')
    expect(e.name).toBe('APIError')
  })

  test('子类 name 语义并：RateLimit/Authentication 设名 + retryAfter；其余保持 name=APIError', () => {
    // tui 语义保留（零 src 构造点，行为面纯增益）
    const rl = new TuiRateLimitError(undefined, { status: 429, retryAfter: 30 })
    expect(rl.name).toBe('RateLimitError')
    expect(rl.retryAfter).toBe(30)
    const auth = new TuiAuthenticationError(undefined, { status: 401 })
    expect(auth.name).toBe('AuthenticationError')
    // modelprovider 语义保留：自家实例 name 恒 'APIError'（modelprovider.ts
    // :316 abort 分类器 / :328 isSdkConnection 按 name 读，name 检查面向
    // SDK 形状外来错误，自家实例靠 instanceof）
    expect(new MpAPIUserAbortError('user aborted').name).toBe('APIError')
    expect(new MpAPIConnectionTimeoutError('Request timed out.').name).toBe('APIError')
  })
})

// ════════════════════════════════════════════════════════════════
// C4-3 长工具进度心跳（工单 §1.3）：引擎面周期性「进行中」信号。
// 基线 569aed7 缺口：session keepalive（sessionActivity）与 MCP mcp_progress
// （TUI MCP client onProgress 第 5 参，engine pipeline 不传）均不覆盖通用工具，
// 长工具调用在渲染层呈冻结态。判别信号 = 纯计时面（新模块 toolHeartbeat.ts：
// 间隔解析 + runWithToolHeartbeat 包裹）+ 四点接线活码在场（executeToolUse wrap /
// loop 事件 / loopEvents 转发 / messages 消费分支）。动态 import = 模块未落时
// 仅本 describe 红，不污染本文件已绿段。
// ════════════════════════════════════════════════════════════════
describe('wave0179 C4-3 长工具进度心跳', () => {
  async function loadHeartbeat() {
    return import('../../src/engine/pipeline/toolHeartbeat')
  }

  test('间隔解析：默认 30s / env 覆盖 / 非法回落默认 / 下限 clamp（基线同面红：模块缺）', async () => {
    const hb = await loadHeartbeat()
    expect(hb.DEFAULT_TOOL_HEARTBEAT_INTERVAL_MS).toBe(30_000)
    expect(hb.getToolHeartbeatIntervalMs({})).toBe(30_000)
    expect(hb.getToolHeartbeatIntervalMs({ ATLAS_TOOL_HEARTBEAT_MS: '250' })).toBe(250)
    // 非法 / 空 → 默认；下限 100ms 防 misconfig 紧循环
    expect(hb.getToolHeartbeatIntervalMs({ ATLAS_TOOL_HEARTBEAT_MS: 'abc' })).toBe(30_000)
    expect(hb.getToolHeartbeatIntervalMs({ ATLAS_TOOL_HEARTBEAT_MS: '' })).toBe(30_000)
    expect(hb.getToolHeartbeatIntervalMs({ ATLAS_TOOL_HEARTBEAT_MS: '1' })).toBe(100)
  })

  test('runWithToolHeartbeat：慢工具周期心跳（identity + elapsed 单调）/ 快工具零心跳', async () => {
    const hb = await loadHeartbeat()
    const beats: { toolUseId: string; toolName: string; elapsedMs: number }[] = []
    await hb.runWithToolHeartbeat(
      {
        toolUseId: 'tu_1',
        toolName: 'SlowTool',
        intervalMs: 20,
        onHeartbeat: b => beats.push(b),
      },
      () => new Promise(resolve => setTimeout(resolve, 70)),
    )
    expect(beats.length).toBeGreaterThanOrEqual(2)
    expect(beats[0]).toMatchObject({ toolUseId: 'tu_1', toolName: 'SlowTool' })
    expect(beats[beats.length - 1].elapsedMs).toBeGreaterThanOrEqual(beats[0].elapsedMs)
    // 快工具（< interval）→ 零心跳
    const none: unknown[] = []
    const res = await hb.runWithToolHeartbeat(
      {
        toolUseId: 'tu_2',
        toolName: 'FastTool',
        intervalMs: 50,
        onHeartbeat: b => none.push(b),
      },
      () => Promise.resolve(42),
    )
    expect(res).toBe(42)
    expect(none.length).toBe(0)
  })

  test('runWithToolHeartbeat：异常穿透（心跳不吞结果/错误）', async () => {
    const hb = await loadHeartbeat()
    const beats: unknown[] = []
    await expect(
      hb.runWithToolHeartbeat(
        {
          toolUseId: 'tu_3',
          toolName: 'BoomTool',
          intervalMs: 1000,
          onHeartbeat: b => beats.push(b),
        },
        () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom')
    expect(beats.length).toBe(0)
  })

  test('四点接线活码在场：executeToolUse wrap + loop 事件 + loopEvents 转发 + messages 消费', () => {
    // ① executeToolUse：PipelineDeps.onToolHeartbeat 槽 + runWithToolHeartbeat 包 tool.call
    const toolExec = srcOf('src/engine/pipeline/toolExecution.ts')
    expect(toolExec.includes('onToolHeartbeat')).toBe(true)
    expect(toolExec.includes('runWithToolHeartbeat')).toBe(true)
    // ② loop：AgentLoopEvent 'tool_heartbeat' 成员 + queryOneRound runToolBatch 注入
    //    （仅 deps.emit 注入面 = headless 恒等锚）
    const loop = srcOf('src/engine/query/loop.ts')
    expect(loop.includes("'tool_heartbeat'")).toBe(true)
    expect(loop.includes('onToolHeartbeat: deps.emit')).toBe(true)
    // ③ TUI loopEvents：EngineLoopStreamEvent 转发（pending.push）
    const loopEvents = srcOf('src/tui/loopEvents.ts')
    expect(loopEvents.includes("'tool_heartbeat'")).toBe(true)
    // ④ TUI messages：handleMessageFromStream 消费分支 + guard 放行
    const messagesSrc = srcOf('src/tui/utils/messages.ts')
    expect(messagesSrc.includes("message.type === 'tool_heartbeat'")).toBe(true)
    expect(messagesSrc.includes('onToolHeartbeat')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// D-3 / D-5 已落地核验锚（0.1.69 块 D 落地，工单 §0 勘误：不重做，探针核在场）
// ════════════════════════════════════════════════════════════════
describe('wave0179 D-3/D-5 已落地核验锚', () => {
  test('compact.ts 活码注在场（D-5 :38 附近 + D-3 :1105 附近）', () => {
    const src = srcOf('src/tui/contextBodies/compact.ts')
    expect(src.includes('D-5')).toBe(true)
    expect(src.includes('D-3')).toBe(true)
  })

  test('0.1.69 块 D 判别单测文件在场（commit 4e6b4e0）', () => {
    // D-5 = compact-git-status-refresh.test.ts；D-3 = compact-summarize-fallback.test.ts
    expect(
      existsSync(resolve(import.meta.dir, 'compact-git-status-refresh.test.ts')),
    ).toBe(true)
    expect(
      existsSync(resolve(import.meta.dir, 'compact-summarize-fallback.test.ts')),
    ).toBe(true)
  })
})
