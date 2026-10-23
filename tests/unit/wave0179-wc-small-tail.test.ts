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
// C5-3 MCP >2min 自动转后台（工单 §1.4）：MCP 工具调用超时转后台继续，
// 合成 tool_result 早返（非 error）+ 完成后经通知面送达。
// 语义（工单 §1 分组 = MCP 面，非渲染面）：race 计时器胜 → 回合适早返
// 「已转后台」tool_result（is_error=false，loop 继续），真 promise 续跑，
// 完成时 onMcpToolBackgrounded 携 outcome 触发 → TUI enqueuePendingNotification
// （task-notification 面自动补投 = agent loop 继续）。恒等锚：槽未注入
// （headless）/ 非 MCP 工具 = 直接调用零行为。Ctrl+B handleBackgroundQuery
// 不可复用（其 abort('background') 会杀掉本应续跑的 MCP 调用）。
// 判别信号 = 纯计时面（新模块 mcpAutoBackground.ts）+ executeToolUse race
// 接线 + loop 透传 + REPL enqueue 活码在场。
// ════════════════════════════════════════════════════════════════
describe('wave0179 C5-3 MCP >2min 自动转后台', () => {
  async function loadAutoBackground() {
    return import('../../src/engine/pipeline/mcpAutoBackground')
  }

  test('阈值解析：默认 120s / env 覆盖 / 非法回落默认 / 下限 clamp（基线同面红：模块缺）', async () => {
    const ab = await loadAutoBackground()
    expect(ab.DEFAULT_MCP_AUTO_BACKGROUND_MS).toBe(120_000)
    expect(ab.getMcpAutoBackgroundMs({})).toBe(120_000)
    expect(ab.getMcpAutoBackgroundMs({ ATLAS_MCP_AUTO_BACKGROUND_MS: '5000' })).toBe(5000)
    // 非法 / 空 → 默认；下限 1000ms 防 misconfig 秒级误转
    expect(ab.getMcpAutoBackgroundMs({ ATLAS_MCP_AUTO_BACKGROUND_MS: 'abc' })).toBe(120_000)
    expect(ab.getMcpAutoBackgroundMs({ ATLAS_MCP_AUTO_BACKGROUND_MS: '' })).toBe(120_000)
    expect(ab.getMcpAutoBackgroundMs({ ATLAS_MCP_AUTO_BACKGROUND_MS: '1' })).toBe(1000)
  })

  test('callWithMcpAutoBackground：慢调用转后台（计时器胜 → backgrounded 早返 + 完成回调）', async () => {
    const ab = await loadAutoBackground()
    const events: { toolUseId: string; toolName: string; outcome: unknown }[] = []
    const t0 = Date.now()
    const raced = await ab.callWithMcpAutoBackground(
      {
        toolUseId: 'tu_1',
        toolName: 'mcp__srv__slow',
        backgroundAfterMs: 30,
        onBackgrounded: i => events.push(i),
      },
      () => new Promise(resolve => setTimeout(() => resolve({ data: 'real' }), 100)),
    )
    expect(raced.backgrounded).toBe(true)
    // 早返 = 不等真 promise（< 真完成 100ms）
    expect(Date.now() - t0).toBeLessThan(80)
    // 真完成后 outcome 送达（ok 支携 data 原样）
    await new Promise(r => setTimeout(r, 130))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ toolUseId: 'tu_1', toolName: 'mcp__srv__slow' })
    expect(events[0].outcome).toEqual({ ok: true, data: { data: 'real' } })
  })

  test('callWithMcpAutoBackground：快调用不转后台（结果穿透 + 零回调）', async () => {
    const ab = await loadAutoBackground()
    const events: unknown[] = []
    const raced = await ab.callWithMcpAutoBackground(
      {
        toolUseId: 'tu_2',
        toolName: 'mcp__srv__fast',
        backgroundAfterMs: 80,
        onBackgrounded: i => events.push(i),
      },
      () => Promise.resolve({ data: 42 }),
    )
    expect(raced.backgrounded).toBe(false)
    expect((raced as { result: unknown }).result).toEqual({ data: 42 })
    await new Promise(r => setTimeout(r, 100))
    expect(events).toHaveLength(0)
  })

  test('callWithMcpAutoBackground：快拒绝穿透 / 慢拒绝经回调 ok:false（不吞不漏）', async () => {
    const ab = await loadAutoBackground()
    // 快拒绝（计时器前）→ 异常原样穿透（executeToolUse 既有 catch 面消费）
    await expect(
      ab.callWithMcpAutoBackground(
        {
          toolUseId: 'tu_3',
          toolName: 'mcp__srv__boom',
          backgroundAfterMs: 80,
          onBackgrounded: () => {},
        },
        () => Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom')
    // 慢拒绝（已转后台）→ 不再穿透（race 已返），经回调 ok:false 送达
    const events: { outcome?: { ok?: boolean; error?: string } }[] = []
    const raced = await ab.callWithMcpAutoBackground(
      {
        toolUseId: 'tu_4',
        toolName: 'mcp__srv__slowboom',
        backgroundAfterMs: 20,
        onBackgrounded: i => events.push(i),
      },
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('late boom')), 60)),
    )
    expect(raced.backgrounded).toBe(true)
    await new Promise(r => setTimeout(r, 90))
    expect(events).toHaveLength(1)
    expect(events[0].outcome?.ok).toBe(false)
    expect(String(events[0].outcome?.error)).toContain('late boom')
  })

  test('executeToolUse：MCP 慢工具 + 注入槽 → 合成后台 tool_result 早返（非 error）；真结果经回调', async () => {
    const { executeToolUse } = await import('../../src/engine/pipeline/toolExecution')
    const events: { toolUseId: string; toolName: string; outcome: unknown }[] = []
    const tool = {
      name: 'mcp__srv__slow',
      isMcp: true,
      maxResultSizeChars: 0,
      call: () => new Promise(resolve => setTimeout(() => resolve({ data: 'REAL' }), 120)),
      mapToolResultToToolResultBlockParam: (d: unknown, id: string) => ({
        type: 'tool_result',
        tool_use_id: id,
        content: String(d),
        is_error: false,
      }),
    } as unknown as Parameters<typeof executeToolUse>[2]['tools'][number]
    const tu = { type: 'tool_use', id: 'tu_bg', name: 'mcp__srv__slow', input: {} }
    const t0 = Date.now()
    const outcome = await executeToolUse(
      tu as never,
      {} as never,
      {
        tools: [tool],
        onMcpToolBackgrounded: i => events.push(i),
        mcpAutoBackgroundMs: 40,
      } as never,
    )
    // 早返不等真完成（120ms），合成块非 error 且含 background 语义
    expect(Date.now() - t0).toBeLessThan(100)
    expect(outcome.isError).toBe(false)
    expect(outcome.block?.is_error).toBe(false)
    expect(String(outcome.block?.content)).toContain('background')
    expect(String(outcome.block?.tool_use_id)).toBe('tu_bg')
    // 真结果完成后经回调送达
    await new Promise(r => setTimeout(r, 140))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ toolUseId: 'tu_bg', toolName: 'mcp__srv__slow' })
    expect(events[0].outcome).toEqual({ ok: true, data: { data: 'REAL' } })
  })

  test('executeToolUse 恒等锚：非 MCP 工具同槽不转后台 / 槽未注入等待真结果', async () => {
    const { executeToolUse } = await import('../../src/engine/pipeline/toolExecution')
    const mkTool = (isMcp: boolean) =>
      ({
        name: isMcp ? 'mcp__srv__x' : 'LocalX',
        isMcp,
        maxResultSizeChars: 0,
        call: () => new Promise(resolve => setTimeout(() => resolve({ data: 'REAL' }), 90)),
        mapToolResultToToolResultBlockParam: (d: unknown, id: string) => ({
          type: 'tool_result',
          tool_use_id: id,
          content: String(d),
          is_error: false,
        }),
      }) as unknown as Parameters<typeof executeToolUse>[2]['tools'][number]
    const mkTu = (name: string) => ({
      type: 'tool_use',
      id: `tu_${name}`,
      name,
      input: {},
    })
    // ① 非 MCP 工具 + 槽注入 → 不转后台（等真结果）
    const t1 = Date.now()
    const o1 = await executeToolUse(
      mkTu('LocalX') as never,
      {} as never,
      {
        tools: [mkTool(false)],
        onMcpToolBackgrounded: () => {},
        mcpAutoBackgroundMs: 20,
      } as never,
    )
    expect(Date.now() - t1).toBeGreaterThanOrEqual(80)
    expect(o1.isError).toBe(false)
    expect(String(o1.block?.content)).toBe('REAL')
    // ② MCP 工具 + 槽未注入（headless 窄 spine）→ 直接调用零行为
    const t2 = Date.now()
    const o2 = await executeToolUse(
      mkTu('mcp__srv__x') as never,
      {} as never,
      { tools: [mkTool(true)], mcpAutoBackgroundMs: 20 } as never,
    )
    expect(Date.now() - t2).toBeGreaterThanOrEqual(80)
    expect(o2.isError).toBe(false)
    expect(String(o2.block?.content)).toBe('REAL')
  })

  test('接线活码在场：executeToolUse race + loop 透传 + REPL enqueue 通知面', () => {
    // ① executeToolUse：isMcp 门 + callWithMcpAutoBackground race + 阈值解析
    const toolExec = srcOf('src/engine/pipeline/toolExecution.ts')
    expect(toolExec.includes('callWithMcpAutoBackground')).toBe(true)
    expect(toolExec.includes('getMcpAutoBackgroundMs')).toBe(true)
    expect(toolExec.includes('tool.isMcp')).toBe(true)
    // ② loop：AgentLoopDeps 槽透传 pipeline（同 onToolHeartbeat 先例）
    const loop = srcOf('src/engine/query/loop.ts')
    expect(loop.includes('onMcpToolBackgrounded')).toBe(true)
    // ③ REPL：槽注入 + task-notification 入队（补投面 = 后台结果送达 agent loop）
    const repl = srcOf('src/tui/screens/REPL.tsx')
    expect(repl.includes('onMcpToolBackgrounded')).toBe(true)
    expect(repl.includes('【后台 MCP 工具')).toBe(true)
    expect(repl.includes('enqueuePendingNotification')).toBe(true)
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

// ════════════════════════════════════════════════════════════════
// C5-4 MCP 能力发现失败退避（item ⑤；unit 层零 spawn → 纯函数矩阵 +
// 源锚点判别，真 spawn 生命周期面在 tests/func/mcp-stdio-server-se2b）
// ════════════════════════════════════════════════════════════════
import {
  getMcpConnectBackoffMs,
  mcpConnectBackoffDelayMs,
} from '../../src/mcp'

describe('wave0179 C5-4 MCP 能力发现失败退避', () => {
  test('退避表纯函数：指数 + 封顶 + 禁用/零次面', () => {
    expect(mcpConnectBackoffDelayMs(0, 1000)).toBe(0)
    expect(mcpConnectBackoffDelayMs(1, 1000)).toBe(1000)
    expect(mcpConnectBackoffDelayMs(2, 1000)).toBe(2000)
    expect(mcpConnectBackoffDelayMs(4, 1000)).toBe(8000)
    // 封顶 MAX_MCP_CONNECT_BACKOFF_MS = 30s
    expect(mcpConnectBackoffDelayMs(10, 1000)).toBe(30_000)
    expect(mcpConnectBackoffDelayMs(100, 1000)).toBe(30_000)
    // base 0 = 退避禁用（恒 0）；负 count 恒 0
    expect(mcpConnectBackoffDelayMs(3, 0)).toBe(0)
    expect(mcpConnectBackoffDelayMs(-1, 1000)).toBe(0)
  })

  test('env 解析：缺省 1s / 合法覆盖 / 非法回落 / 0 与负值 clamp 到 0（禁用）', () => {
    expect(getMcpConnectBackoffMs({})).toBe(1000)
    expect(getMcpConnectBackoffMs({ ATLAS_MCP_CONNECT_BACKOFF_MS: '' })).toBe(1000)
    expect(getMcpConnectBackoffMs({ ATLAS_MCP_CONNECT_BACKOFF_MS: '250' })).toBe(250)
    expect(getMcpConnectBackoffMs({ ATLAS_MCP_CONNECT_BACKOFF_MS: 'abc' })).toBe(1000)
    expect(getMcpConnectBackoffMs({ ATLAS_MCP_CONNECT_BACKOFF_MS: '0' })).toBe(0)
    expect(getMcpConnectBackoffMs({ ATLAS_MCP_CONNECT_BACKOFF_MS: '-5' })).toBe(0)
  })

  test('源锚点：失败记账 + 窗口短路 + 成功清账接线', () => {
    const src = srcOf('src/mcp/mcpConnectionManager.ts')
    // ① 失败记账表在场
    expect(src.includes('connectFailures')).toBe(true)
    // ② connect 入口窗口短路（消费退避表 + deferred 文案）
    expect(src.includes('mcpConnectBackoffDelayMs(record.count)')).toBe(true)
    expect(src.includes('connect deferred (backoff)')).toBe(true)
    // ③ connectStdio catch 记账（连败计数递增）
    expect(src.includes('count: (prev?.count ?? 0) + 1')).toBe(true)
    // ④ 成功清账（connected 落态 → 失败历史抹除）
    expect(src.includes('connectFailures.delete(name)')).toBe(true)
    // ⑤ env 面
    expect(src.includes('ATLAS_MCP_CONNECT_BACKOFF_MS')).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════════
// C6-2 memory 容量预警（工单 §1.6：接近读限预警 + 立即压实提示）
// ════════════════════════════════════════════════════════════════
describe('wave0179 C6-2 MEMORY.md 接近读限预警 + 立即压实', () => {
  // 单测直 import tui/memdir 内部模块先例：memory-c3-prompt-consistency.test.ts
  // （memdir.ts import 链探针已验：单测环境零副作用加载）。
  // eslint-disable-next-line
  const { truncateEntrypointContent, MAX_ENTRYPOINT_LINES, MAX_ENTRYPOINT_BYTES } =
    require('../../src/tui/memdir/memdir.js') as typeof import('../../src/tui/memdir/memdir.js')

  test('近限（未截断但 ≥ 0.8·上限）→ nearLimit: true + NOTE 压实提醒', () => {
    // 170 行（0.8·200=160 阈值之上，200 上限之下）× 短行 → 现行为无任何提醒（基线同面红）
    const nearLines = Array.from({ length: 170 }, (_, i) => `- entry ${i}`).join('\n')
    const res = truncateEntrypointContent(nearLines)
    expect(res.wasLineTruncated).toBe(false)
    expect(res.wasByteTruncated).toBe(false)
    expect(res.nearLimit).toBe(true)
    expect(res.content).toContain('> NOTE: MEMORY.md is close to the read limit')
    expect(res.content).toContain('Compact it now')
  })

  test('字节面近限（行数远低但字节 ≥ 0.8·25_000）→ 同 NOTE 预警', () => {
    // 100 行 × ~210B/行 ≈ 21KB：行 100 < 160，字节 ≥ 20_000 → 近限走字节臂
    const longLines = Array.from({ length: 100 }, (_, i) => `- entry ${i} ${'x'.repeat(205)}`).join('\n')
    const res = truncateEntrypointContent(longLines)
    expect(res.wasByteTruncated).toBe(false)
    expect(res.nearLimit).toBe(true)
    expect(res.content).toContain('Compact it now')
  })

  test('常规量级 → nearLimit: false + 内容零附加（零回归面）', () => {
    const small = ['- entry a', '- entry b'].join('\n')
    const res = truncateEntrypointContent(small)
    expect(res.nearLimit).toBe(false)
    expect(res.content).toBe(small)
    expect(res.content).not.toContain('> NOTE:')
    expect(res.content).not.toContain('> WARNING:')
  })

  test('超限截断面 → WARNING 补「立即压实」指令（原 keep-short 提示保留）', () => {
    const over = Array.from({ length: MAX_ENTRYPOINT_LINES + 10 }, (_, i) => `- entry ${i}`).join('\n')
    const res = truncateEntrypointContent(over)
    expect(res.wasLineTruncated).toBe(true)
    expect(res.nearLimit).toBe(true)
    expect(res.content).toContain('> WARNING: MEMORY.md is')
    expect(res.content).toContain('Only part of it was loaded')
    // 既有 keep-short 指令保留
    expect(res.content).toContain('Keep index entries to one line under ~200 chars')
    // 新补压实指令
    expect(res.content).toContain('Compact it now')
  })

  test('源锚点：阈值常量 + nearLimit 计算 + 双消费面单一事实源', () => {
    const src = srcOf('src/tui/memdir/memdir.ts')
    // ① 0.8 阈值常量
    expect(src.includes('NEAR_LIMIT_FRACTION')).toBe(true)
    // ② 近限判定门（未截断才走 NOTE 支）
    expect(src.includes('nearLimit')).toBe(true)
    // ③ 压实指令文案（NOTE / WARNING 两支共用措辞）
    expect(src.includes('Compact it now')).toBe(true)
  })

  test('阈值数值面：0.8·上限 = 160 行 / 20_000 字节', () => {
    expect(Math.floor(MAX_ENTRYPOINT_LINES * 0.8)).toBe(160)
    expect(Math.floor(MAX_ENTRYPOINT_BYTES * 0.8)).toBe(20000)
  })
})
