/**
 * 0.1.81 V3-2 K2 MCP 面 — 保留名 server 配置面判别单测（工单 #2）
 *
 * 被测能力：buildMcpServerConfigs accumulator 对保留名 key（'__proto__'）
 * 走 [[DefineOwnProperty]]（null-prototype）而非 [[Set]]——旧普通对象上
 * `servers['__proto__'] = cfg` 打到原型 setter（改原型而非定义自有键），
 * 该 server 从发现结果消失 + 潜在原型污染；'__proto__' 应与普通 server
 * 名同权处理（自有键、可被 project 源覆盖、entries 可见）。
 * 零磁盘（纯 settings 源路径，无 .mcp.json）。
 */
import { describe, test, expect } from 'bun:test'
import { buildMcpServerConfigs } from '../../src/mcp'

/** union 成员访问助面（ScopedMcpServerConfig 8 臂 union 无公共 command 字段）。 */
function cmd(c: unknown): string | undefined {
  return (c as { command?: string }).command
}

describe('K2 #2：保留名 server（__proto__）不撞字典原型链', () => {
  test("settings 含 '__proto__' server 名 → 普通自有键（非原型污染）", async () => {
    // JSON.parse 产自有 __proto__ 键（真实 settings 解析路径同语义）；
    // 对象字面量 {'__proto__': ...} 会设原型不产自有键，不可用作 fixture。
    const settingsServers = JSON.parse(
      '{"__proto__": {"type": "stdio", "command": "node-x"}}',
    )
    const out = await buildMcpServerConfigs({ settingsServers })
    // 自有键可见（旧实现 []：[[Set]] 打原型 setter，自有键不产生）
    expect(Object.keys(out)).toEqual(['__proto__'])
    expect(cmd(out['__proto__'])).toBe('node-x')
    expect(out['__proto__']?.scope).toBe('user')
    // 原型面干净（未被 __proto__ 污染成 cfg 对象）
    expect(Object.getPrototypeOf(out)).toBeNull()
  })
})
