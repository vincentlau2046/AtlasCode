/**
 * mcp 域 S-E2b（§8.68 R2）unit 层：mcpConfig 最小 2 源发现面 + 8 型
 * config zod union parse 面。
 *
 * 覆盖：
 *   C-P1 2 源发现：user 源（settings record，逐台 parse，坏台跳过）/
 *       project 源（.mcp.json fs 读）/ 同名冲突 project 优先（就近原则）/
 *       坏 JSON → user 源兜底 / 文件缺失 → user 源兜底
 *   C-P2 8 型 union parse：stdio / sse / sse-ide / ws-ide / http / ws /
 *       sdk / claudeai-proxy 各臂接受 + 非法（缺 command / 空 command /
 *       未知 type）拒绝
 *   C-P3 loadProjectMcpJson 宽松面：缺失 / 坏 JSON / 非对象根 → null
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildMcpServerConfigs,
  loadProjectMcpJson,
  parseMcpJsonConfig,
  parseMcpServerConfig,
  type ScopedMcpServerConfig,
} from '../../src/mcp'

/** union 成员访问助面（ScopedMcpServerConfig 8 臂 union 无公共 command 字段）。 */
function cmd(c: ScopedMcpServerConfig): string | undefined {
  return (c as { command?: string }).command
}

describe('C-P1 最小 2 源发现面', () => {
  test('user 源：settings record 逐台 parse + scope user 打标', async () => {
    const out = await buildMcpServerConfigs({
      settingsServers: {
        alpha: { type: 'stdio', command: 'node', args: ['a.js'] },
        // args 缺省台（zod default([]) 面）
        gamma: { type: 'stdio', command: 'node-gamma' },
        // 坏台（无 command）→ 跳过不沉全果
        bad: { type: 'stdio' },
      },
    })
    expect(Object.keys(out)).toEqual(['alpha', 'gamma'])
    expect(out.alpha.scope).toBe('user')
    expect(cmd(out.alpha)).toBe('node')
    expect((out.alpha as { args?: string[] }).args).toEqual(['a.js'])
    // stdio args 缺省面（zod default([])）
    expect((out.gamma as { args?: string[] }).args).toEqual([])
  })

  test('project 源：.mcp.json 同名覆盖 user 源（就近原则）+ scope project', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-cfg-'))
    try {
      writeFileSync(
        join(dir, '.mcp.json'),
        JSON.stringify({
          mcpServers: {
            alpha: { type: 'stdio', command: 'node-project', args: [] },
            beta: { type: 'stdio', command: 'node-beta' },
          },
        }),
      )
      const out = await buildMcpServerConfigs({
        settingsServers: {
          alpha: { type: 'stdio', command: 'node-user' },
        },
        projectMcpJsonPath: join(dir, '.mcp.json'),
      })
      // 同名 alpha = project 覆盖（command 面可辨）
      expect(cmd(out.alpha)).toBe('node-project')
      expect(out.alpha.scope).toBe('project')
      // 仅 project 有的 beta 照进
      expect(cmd(out.beta)).toBe('node-beta')
      expect(out.beta.scope).toBe('project')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('project 坏 JSON → user 源兜底（不抛不沉全果）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-cfg-bad-'))
    try {
      writeFileSync(join(dir, '.mcp.json'), '{not-json')
      const out = await buildMcpServerConfigs({
        settingsServers: { alpha: { type: 'stdio', command: 'node' } },
        projectMcpJsonPath: join(dir, '.mcp.json'),
      })
      expect(cmd(out.alpha)).toBe('node')
      expect(out.alpha.scope).toBe('user')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('project 文件缺失 → user 源兜底', async () => {
    const out = await buildMcpServerConfigs({
      settingsServers: { alpha: { type: 'stdio', command: 'node' } },
      projectMcpJsonPath: '/nonexistent/atlas-mcp-cfg/.mcp.json',
    })
    expect(cmd(out.alpha)).toBe('node')
    expect(out.alpha.scope).toBe('user')
  })
})

describe('C-P2 8 型 union parse 面', () => {
  const arms: Array<[string, unknown]> = [
    ['stdio', { type: 'stdio', command: 'node' }],
    ['sse', { type: 'sse', url: 'http://localhost:1' }],
    ['sse-ide', { type: 'sse-ide', url: 'http://localhost:2', ideName: 'vscode' }],
    ['ws-ide', { type: 'ws-ide', url: 'ws://localhost:3', ideName: 'jbr' }],
    ['http', { type: 'http', url: 'http://localhost:4' }],
    ['ws', { type: 'ws', url: 'ws://localhost:5' }],
    ['sdk', { type: 'sdk', name: 'in-proc' }],
    ['claudeai-proxy', { type: 'claudeai-proxy', url: 'https://x', id: 'i1' }],
  ]

  test.each(arms)('%s 臂接受', (_label, cfg) => {
    const parsed = parseMcpServerConfig(cfg)
    expect(parsed).not.toBeNull()
    expect((parsed as { type: string }).type).toBe(cfg.type as string)
  })

  test('stdio 空 command 拒绝（min 1 面）', () => {
    expect(parseMcpServerConfig({ type: 'stdio', command: '' })).toBeNull()
  })

  test('stdio 缺 command 拒绝', () => {
    expect(parseMcpServerConfig({ type: 'stdio' })).toBeNull()
  })

  test('未知 type 拒绝', () => {
    expect(
      parseMcpServerConfig({ type: 'carrier-pigeon', command: 'x' }),
    ).toBeNull()
  })

  test('sse-ide 缺 ideName 拒绝', () => {
    expect(
      parseMcpServerConfig({ type: 'sse-ide', url: 'http://x' }),
    ).toBeNull()
  })
})

describe('C-P3 宽松面', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-cfg-lax-'))
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('loadProjectMcpJson：文件缺失 → null', async () => {
    expect(await loadProjectMcpJson(join(dir, 'missing.json'))).toBeNull()
  })

  test('loadProjectMcpJson：坏 JSON → null', async () => {
    writeFileSync(join(dir, 'bad.json'), '{oops')
    expect(await loadProjectMcpJson(join(dir, 'bad.json'))).toBeNull()
  })

  test('loadProjectMcpJson：非对象根（数组）→ null', async () => {
    writeFileSync(join(dir, 'arr.json'), '[1,2]')
    expect(await loadProjectMcpJson(join(dir, 'arr.json'))).toBeNull()
  })

  test('parseMcpJsonConfig：合法 {mcpServers} 解析 + 坏型拒绝', () => {
    const ok = parseMcpJsonConfig({
      mcpServers: { a: { type: 'stdio', command: 'node' } },
    })
    expect(ok).not.toBeNull()
    expect(Object.keys(ok!.mcpServers)).toEqual(['a'])
    expect(parseMcpJsonConfig({ mcpServers: { a: { nope: 1 } } })).toBeNull()
  })
})
