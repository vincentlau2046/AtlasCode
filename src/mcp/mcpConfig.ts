/**
 * mcp 域 — 最小 2 源发现面（remote 波 S-E2b，§8.68 R2 裁定）。
 *
 * 旧仓来源（a8af45b）：src/services/mcp/config.ts 发现链（settings /
 * .mcp.json / enterprise / managed / plugin / claudeai 多源 + 写回面
 * addMcpServer/removeMcpServer + .mcp.json 权限保持 rename 写）→
 * **§8.68 R2 裁定最小 2 源**：
 *   - settings `mcpServers` record（scope 'user'）——旧仓经
 *     getSettingsForSource 多源合并面；新仓 L3 顶域 ↛ engine，
 *     settings 记录 = 组合根注入面（S-E2d 接线；域内只吃 record 输入）
 *   - 项目 `.mcp.json`（scope 'project'）——域内 fs 读取面
 *     loadProjectMcpJson（旧 getProjectMcpServerStatus 项目状态面裁）
 * 裁面登记（H6 逐条，复审勿当遗漏重提）：
 *   - enterprise / managed（managed-mcp.json + fetchManagedMcpConfigs）/
 *     plugin（getPluginMcpServers + pluginSource 通道门）/ claudeai
 *     （OAuth 车道已删；G-3 ⑩ D3 型面 8→4 同步裁）/ dynamic 5 scope 支 = 裁登记
 *     （ScopedMcpServerConfig.scope 型面保留 7 值 enum 逐字，值域收窄
 *     到 user/project 2 值 = 发现面实际产出）
 *   - 写回面（addMcpServer / removeMcpServer / .mcp.json 权限保持写）
 *     = CLI `mcp add/remove` 面，归 CLI 波（域外登记）
 *   - env 展开（旧 expandEnvVarsInString 在 .mcp.json 值面）= 裁登记
 *     （env 展开消费面随 CLI 波）
 *   - **3 子裁补登记（S-E3 A 路）**：(a) .mcp.json 父目录上溯（旧
 *     发现链 cwd→root 就近优先）= 新仓仅读 `<cwd>/.mcp.json` 单文件
 *     （loadProjectMcpJson 面）；(b) 企业策略 allowedMcpServers /
 *     deniedMcpServers 过滤面 = 裁登记（随 enterprise 面，policy 波）；
 *     (c) disabledMcpServers / enabledMcpServers 开/关面 = 裁登记
 * 8 型配置 zod union = types.ts 逐字（型面保真；本文件消费 parse 面）。
 */
import { readFile } from 'node:fs/promises'
import {
  McpJsonConfigSchema,
  McpServerConfigSchema,
  type McpJsonConfig,
  type McpServerConfig,
  type ScopedMcpServerConfig,
} from './types'

/** 发现输入（组合根注入面：settingsServers = settings 记录；
 * projectMcpJsonPath = 项目 .mcp.json 路径（null/缺省 = 未发现））。 */
export type McpDiscoveryInput = {
  /** settings mcpServers record（scope 'user'；组合根 S-E2d 注入）。 */
  settingsServers?: Record<string, unknown>
  /** 项目 .mcp.json 路径（域内 fs 读取；null/缺省 = 跳过 project 源）。 */
  projectMcpJsonPath?: string | null
}

/** .mcp.json 读取面（fs + 宽松 JSON parse：文件缺失 / JSON 坏 → null，
 * 旧 safeParseJSON 语义；读错不抛 = 发现链不因坏配置崩进程面保真）。 */
export async function loadProjectMcpJson(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

/** 单服务器配置 parse 面（8 型 union；非法 → null 不进发现结果，
 * 坏单台不沉全果面 = 旧仓 addScopeToServers 前校验同语义）。
 * 返回**未 scope** 型（scope 由调用方按来源打 user/project，
 * 型面如实：parse 产物无 scope 字段）。 */
export function parseMcpServerConfig(raw: unknown): McpServerConfig | null {
  const parsed = McpServerConfigSchema().safeParse(raw)
  return parsed.success ? parsed.data : null
}

/** .mcp.json 全文 parse 面（McpJsonConfigSchema = { mcpServers: record }
 * 逐字；坏 JSON / 型不符 → null）。 */
export function parseMcpJsonConfig(raw: unknown): McpJsonConfig | null {
  const parsed = McpJsonConfigSchema().safeParse(raw)
  return parsed.success ? parsed.data : null
}

// ── 发现输入注入窗（S-E2d 组合根 ⑭ 供给面；LSP setLspServerSource 先例
// 同型：域窗口 + 组合根注册 + 测试 fake 注入面；未注册 = null = 组合根
// 缺省发现（settings + .mcp.json），fail-soft 语义不变）─────────────

let discoveryInput: McpDiscoveryInput | null = null

/** 注册发现输入（组合根 ⑭ / 测试 fake 注入；重复注册 = 后者胜出）。 */
export function setMcpDiscoveryInput(input: McpDiscoveryInput | null): void {
  discoveryInput = input
}

/** 取发现输入（未注册 = null；组合根缺省发现面自组装 settings + .mcp.json）。 */
export function getMcpDiscoveryInput(): McpDiscoveryInput | null {
  return discoveryInput
}

/**
 * 最小 2 源发现（§8.68 R2 裁定）：settings record（scope 'user'）+
 * 项目 .mcp.json（scope 'project'）。同名冲突 = project 源优先
 * （旧仓发现链 project/local 先于 user 的就近原则同向；2 源面内
 * project 更具体）。
 */
export async function buildMcpServerConfigs(
  input: McpDiscoveryInput,
): Promise<Record<string, ScopedMcpServerConfig>> {
  const servers: Record<string, ScopedMcpServerConfig> = {}

  // user 源：settings 记录（逐台 parse，坏台跳过）
  for (const [name, raw] of Object.entries(input.settingsServers ?? {})) {
    const parsed = parseMcpServerConfig(raw)
    if (parsed) {
      servers[name] = { ...(parsed as object), scope: 'user' } as ScopedMcpServerConfig
    }
  }

  // project 源：.mcp.json（fs 读取 + 全文 parse；覆盖 user 同名）
  if (input.projectMcpJsonPath) {
    const rawJson = await loadProjectMcpJson(input.projectMcpJsonPath)
    const config = rawJson ? parseMcpJsonConfig(rawJson) : null
    if (config) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        servers[name] = {
          ...(serverConfig as object),
          scope: 'project',
        } as ScopedMcpServerConfig
      }
    }
  }

  return servers
}
