/**
 * 0.1.81 V3-2 K2 MCP 面 — 空 .mcp.json 合法空配置判别测试（工单 #17，
 * func 层真磁盘零模型零 spawn；探针结论：engine 域 loadProjectMcpJson
 * 空文件静默 null（已满足）；真报错面 = TUI parseMcpConfigFromFilePath
 * ——0 字节/纯空白走 safeParseJSON→null、「{}」走 schema fail，均产
 * fatal「not a valid JSON / Does not adhere」误报）。
 *
 * 被测能力：空 .mcp.json（0 字节 / 纯空白 / 空 JSON 对象 {}）= 合法空配置
 * （config {mcpServers:{}} + 零 error），与缺失文件同权处理；非空合法
 * 配置（{"mcpServers":{}}）与坏 JSON 行为不变（回归守卫）。
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseMcpConfigFromFilePath } from '../../src/tui/services/mcp/config'
import { loadProjectMcpJson, buildMcpServerConfigs } from '../../src/mcp'

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-mcp-k2-cfg-0181-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function writeCfg(content: string): string {
  const path = join(dir, `.mcp-${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(path, content)
  return path
}

describe('K2 #17：空 .mcp.json = 合法空配置不报错（TUI parse 面）', () => {
  test('0 字节文件 → {mcpServers:{}} + 零 error', () => {
    const path = writeCfg('')
    const { config, errors } = parseMcpConfigFromFilePath({
      filePath: path,
      expandVars: true,
      scope: 'project',
    })
    // 旧实现：safeParseJSON('') → null → fatal「MCP config is not a valid JSON」→ 红
    expect(config).toEqual({ mcpServers: {} })
    expect(errors).toEqual([])
  })

  test('纯空白文件（\\n / 空格）→ {mcpServers:{}} + 零 error', () => {
    const path = writeCfg('\n   \n\t\n')
    const { config, errors } = parseMcpConfigFromFilePath({
      filePath: path,
      expandVars: true,
      scope: 'project',
    })
    expect(config).toEqual({ mcpServers: {} })
    expect(errors).toEqual([])
  })

  test('空 JSON 对象 {} → {mcpServers:{}} + 零 error', () => {
    const path = writeCfg('{}')
    const { config, errors } = parseMcpConfigFromFilePath({
      filePath: path,
      expandVars: true,
      scope: 'project',
    })
    // 旧实现：schema 缺 mcpServers → fatal「Does not adhere to schema」→ 红
    expect(config).toEqual({ mcpServers: {} })
    expect(errors).toEqual([])
  })

  test('合法空配置 {"mcpServers":{}} 行为不变（回归守卫）', () => {
    const path = writeCfg('{"mcpServers":{}}')
    const { config, errors } = parseMcpConfigFromFilePath({
      filePath: path,
      expandVars: true,
      scope: 'project',
    })
    expect(config).toEqual({ mcpServers: {} })
    expect(errors).toEqual([])
  })

  test('坏 JSON 仍报 fatal（不因空容忍放宽坏配置面）', () => {
    const path = writeCfg('{"mcpServers":')
    const { config, errors } = parseMcpConfigFromFilePath({
      filePath: path,
      expandVars: true,
      scope: 'project',
    })
    expect(config).toBeNull()
    expect(errors.length).toBe(1)
    expect(errors[0]?.message).toContain('not a valid JSON')
  })
})

describe('K2 #17：engine 域发现面空配置固化（探针结论 = 现状已满足）', () => {
  test('loadProjectMcpJson 空文件 → null 不抛（fail-soft）；buildMcpServerConfigs 零 server', async () => {
    const emptyPath = writeCfg('')
    const raw = await loadProjectMcpJson(emptyPath)
    expect(raw).toBeNull()
    const servers = await buildMcpServerConfigs({
      settingsServers: {},
      projectMcpJsonPath: emptyPath,
    })
    expect(servers).toEqual({})
  })

  test('{} project 源 → parse 失败静默跳过（零 server 不沉全果）', async () => {
    const objPath = writeCfg('{}')
    const servers = await buildMcpServerConfigs({
      settingsServers: {
        alive: { type: 'stdio', command: 'node-x' },
      },
      projectMcpJsonPath: objPath,
    })
    // 坏 project 源不沉 settings 源（fail-soft 语义固化）
    expect(Object.keys(servers)).toEqual(['alive'])
  })
})
