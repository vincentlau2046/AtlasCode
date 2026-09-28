/**
 * mcp 域 S-E2b（§8.68 R2）unit 层：mcpFetch 3 供应商 + LRU 20 +
 * sanitize-unicode 本地面（fake client 纯面；真 spawn 供应商面在
 * tests/func/mcp-stdio-server-se2b）。
 *
 * 覆盖：
 *   F-P1 sanitize 面：partiallySanitizeUnicode（零宽/双向控制剥除 +
 *       NFKC 组合归一）/ recursivelySanitizeUnicode（键值数组递归）
 *   F-P2 供应商面（fake client）：capability gate（tools/resources/
 *       prompts 缺 → []）/ 非 connected 态 → [] / 描述符映射
 *       （name/description/inputJSONSchema/annotations hints）/
 *       resources server 字段 attach / commands 名面 mcp__<server>__<p>
 *       + argNames + userFacingName `<server>:<p> (MCP)` +
 *       getPromptForCommand 非 connected 抛错面
 *   F-P3 LRU 面：size 20 逐字（第 21 名逐出首名）/ invalidateMcpFetchCache
 *       按名失效重拉 / 并发去重（同 Promise 命中）
 */
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  fetchCommandsForClient,
  fetchResourcesForClient,
  fetchToolsForClient,
  getConnectedMcpServer,
  invalidateMcpFetchCache,
  partiallySanitizeUnicode,
  recursivelySanitizeUnicode,
  resetMcpFetchCaches,
  resetMcpConnectionManager,
  type ConnectedMcpServer,
  type McpJsonRpcClient,
  type McpServerConnection,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

function baseCfg(): ScopedMcpServerConfig {
  return {
    type: 'stdio',
    command: 'node',
    args: [],
    scope: 'user',
  } as ScopedMcpServerConfig
}

/** fake client：按 method 回放固定 result（request 计数可观测）。 */
function fakeClient(
  byMethod: Record<string, unknown>,
  counter?: { calls: number },
): McpJsonRpcClient {
  return {
    async request(method: string) {
      if (counter) counter.calls++
      return byMethod[method] ?? { tools: [] }
    },
    notify() {},
    onNotification() {
      return { dispose() {} }
    },
    onRequest() {
      return { dispose() {} }
    },
    onError() {},
    reportError() {},
    onClose() {},
    close() {},
  }
}

function connected(
  name: string,
  client: McpJsonRpcClient,
  capabilities: ConnectedMcpServer['capabilities'] = {
    tools: true,
    resources: true,
    prompts: true,
  },
): ConnectedMcpServer {
  return {
    name,
    type: 'connected',
    client,
    capabilities,
    config: baseCfg(),
    cleanup: async () => {},
  }
}

function failed(name: string): McpServerConnection {
  return {
    name,
    type: 'failed',
    config: baseCfg(),
    error: 'MCP server connection closed',
  }
}

describe('F-P1 sanitize-unicode 本地面（旧 utils/sanitization.ts 逐字）', () => {
  // 危险字符常量（backslash-u 转义字面量；字面不可见字符入源 = 脆弱面，禁用）
  const ZWSP = '\u200B' // 零宽空格
  const LRM = '\u200E' // 左到右标记
  const RLM = '\u200F' // 右到左标记
  const LRE = '\u202A' // 左到右嵌入
  const LDO = '\u202B' // 左到右覆盖
  const PDF = '\u202C' // 方向格式结束
  const LRI = '\u202D' // 左到右隔离
  const RLI = '\u202E' // 右到左隔离
  const ISO_A = '\u2066' // 隔离符族 0x2066
  const ISO_B = '\u2067' // 隔离符族 0x2067
  const ISO_C = '\u2068' // 隔离符族 0x2068
  const ISO_D = '\u2069' // 隔离符族 0x2069
  const BOM = '\uFEFF' // 字节序标记
  const PUA_LO = '\uE000' // BMP 私有区低端点
  const PUA_HI = '\uF8FF' // BMP 私有区高端点

  const INVISIBLE_INPUT =
    'a' + ZWSP + 'b' + LRM + 'c' + RLM + 'd' + // 零宽空格 + LRM + RLM
    LRE + 'e' + LDO + 'f' + PDF + 'g' + LRI + 'h' + RLI + 'i' + // 方向格式符族
    ISO_A + 'j' + ISO_B + 'k' + ISO_C + 'l' + ISO_D + 'm' + // 方向隔离符族
    BOM + 'n' + // BOM
    PUA_LO + 'o' + PUA_HI + 'p' // BMP 私有区两端点

  test('零宽字符 + 双向控制剥除（全 16 危险字符 → 纯字母 16 个）', () => {
    expect(partiallySanitizeUnicode(INVISIBLE_INPUT)).toBe('abcdefghijklmnop')
  })

  test('NFKC 组合归一（e + U+0301 分解序 → U+00E9 预合成）', () => {
    expect(partiallySanitizeUnicode('e\u0301')).toBe('\u00E9')
  })

  test('递归面：对象键值 + 数组 + 原始值透传', () => {
    const out = recursivelySanitizeUnicode({
      ['k\u200B1']: ['v\u200B2', 3, true, null],
      plain: 'x',
    }) as Record<string, unknown>
    expect(Object.keys(out)).toEqual(['k1', 'plain'])
    expect(out.k1).toEqual(['v2', 3, true, null])
    expect(out.plain).toBe('x')
  })

  test('原始值直返（number/boolean/undefined）', () => {
    expect(recursivelySanitizeUnicode(42)).toBe(42)
    expect(recursivelySanitizeUnicode(false)).toBe(false)
    expect(recursivelySanitizeUnicode(undefined)).toBeUndefined()
  })
})


describe('F-P2 供应商面（fake client）', () => {
  beforeEach(async () => {
    resetMcpFetchCaches()
  })

  test('非 connected 态 → []（4 态 union 早退面）', async () => {
    const f = failed('dead')
    expect(await fetchToolsForClient(f)).toEqual([])
    expect(await fetchResourcesForClient(f)).toEqual([])
    expect(await fetchCommandsForClient(f)).toEqual([])
  })

  test('capability gate：tools 缺 → []（余 2 供应商不受影响）', async () => {
    const c = connected('n1', fakeClient({}), { resources: true })
    expect(await fetchToolsForClient(c)).toEqual([])
  })

  test('工具描述符映射：name/description/inputJSONSchema/annotations hints', async () => {
    const c = connected('n2', fakeClient({
      'tools/list': {
        tools: [
          {
            name: 't1',
            description: 'd1',
            inputSchema: { type: 'object' },
            annotations: { readOnlyHint: true, destructiveHint: false },
          },
          { name: 't2' }, // 全可选面缺省
        ],
      },
    }))
    const tools = await fetchToolsForClient(c)
    expect(tools).toEqual([
      {
        name: 't1',
        description: 'd1',
        inputJSONSchema: { type: 'object' },
        readOnlyHint: true,
        destructiveHint: false,
      },
      { name: 't2' },
    ])
  })

  test('资源供应商：server 字段 attach + gate', async () => {
    const c = connected('n3', fakeClient({
      'resources/list': {
        resources: [{ uri: 'res://a', name: 'A' }],
      },
    }))
    const res = await fetchResourcesForClient(c)
    expect(res).toEqual([{ uri: 'res://a', name: 'A', server: 'n3' }])
    // gate 面
    const bare = connected('n3b', fakeClient({}), {})
    expect(await fetchResourcesForClient(bare)).toEqual([])
  })

  test('命令面：mcp__<server>__<p> 名 + argNames + userFacingName', async () => {
    const c = connected('n4', fakeClient({
      'prompts/list': {
        prompts: [
          {
            name: 'greet',
            description: 'g',
            arguments: [{ name: 'who' }, { name: 'tone' }],
          },
        ],
      },
    }))
    const cmds = await fetchCommandsForClient(c)
    expect(cmds).toHaveLength(1)
    const cmd = cmds[0]
    expect(cmd.name).toBe('mcp__n4__greet')
    expect(cmd.argNames).toEqual(['who', 'tone'])
    expect(cmd.userFacingName()).toBe('n4:greet (MCP)')
  })

  test('服务器名归一面：非法字符 → 下划线', async () => {
    const c = connected('my server.v2', fakeClient({
      'prompts/list': { prompts: [{ name: 'p' }] },
    }))
    const cmds = await fetchCommandsForClient(c)
    expect(cmds[0].name).toBe('mcp__my_server_v2__p')
  })

  test('getPromptForCommand 非 connected → 抛错面（drop 后 failed 态）', async () => {
    const c = connected('n5', fakeClient({
      'prompts/list': { prompts: [{ name: 'greet', arguments: [{ name: 'who' }] }] },
    }))
    const cmds = await fetchCommandsForClient(c)
    // n5 未入 manager 单例（fake 连接）→ get 面 undefined → 抛错
    await expect(cmds[0].getPromptForCommand('world')).rejects.toThrow(
      'MCP server "n5" is not connected',
    )
  })
})

describe('F-P3 LRU 面（size 20 逐字）', () => {
  beforeEach(() => {
    resetMcpFetchCaches()
  })

  test('第 21 名逐出首名（MRU 保活）', async () => {
    const counters: Record<string, { calls: number }> = {}
    for (let i = 1; i <= 21; i++) {
      const name = `srv${String(i).padStart(2, '0')}`
      counters[name] = { calls: 0 }
      const c = connected(
        name,
        fakeClient({ 'tools/list': { tools: [{ name: `t${i}` }] } }, counters[name]),
      )
      await fetchToolsForClient(c)
    }
    // 各 1 次首拉
    expect(Object.values(counters).every(ct => ct.calls === 1)).toBe(true)
    // 最旧 srv01 已逐出 → 重拉 +1
    const c1 = connected(
      'srv01',
      fakeClient({ 'tools/list': { tools: [{ name: 't1' }] } }, counters['srv01']),
    )
    await fetchToolsForClient(c1)
    expect(counters['srv01'].calls).toBe(2)
    // MRU srv21 保活 → 同 Promise 命中不重拉
    const c21 = connected(
      'srv21',
      fakeClient({ 'tools/list': { tools: [{ name: 't21' }] } }, counters['srv21']),
    )
    const before = counters['srv21'].calls
    await fetchToolsForClient(c21)
    expect(counters['srv21'].calls).toBe(before)
  })

  test('invalidateMcpFetchCache 按名失效 → 重拉；余名缓存命中', async () => {
    const a = { calls: 0 }
    const b = { calls: 0 }
    await fetchToolsForClient(
      connected('A', fakeClient({ 'tools/list': { tools: [] } }, a)),
    )
    await fetchToolsForClient(
      connected('B', fakeClient({ 'tools/list': { tools: [] } }, b)),
    )
    invalidateMcpFetchCache('A')
    await fetchToolsForClient(
      connected('A', fakeClient({ 'tools/list': { tools: [] } }, a)),
    )
    await fetchToolsForClient(
      connected('B', fakeClient({ 'tools/list': { tools: [] } }, b)),
    )
    expect(a.calls).toBe(2)
    expect(b.calls).toBe(1)
  })

  test('并发去重：同名 2 并发 = 1 次 request（同 Promise 入表）', async () => {
    const ct = { calls: 0 }
    const c = connected(
      'cc',
      fakeClient({ 'tools/list': { tools: [] } }, ct),
    )
    const [r1, r2] = await Promise.all([
      fetchToolsForClient(c),
      fetchToolsForClient(c),
    ])
    expect(r1).toBe(r2)
    expect(ct.calls).toBe(1)
  })

  test('getConnectedMcpServer 消费面（manager 单例在位/非在位）', async () => {
    await resetMcpConnectionManager()
    // 无登记 → undefined
    expect(getConnectedMcpServer('ghost')).toBeUndefined()
  })
})
