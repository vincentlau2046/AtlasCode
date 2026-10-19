/**
 * 0.1.78 W-A F-2 一方残面清波判别单测（工单 docs/2026-10-20-p0-wave-0178-ticket.md §2①）。
 *
 * 波 = F-2 一方残面清波（f4 落码触发单 2026-10-20，基线 eccefe7）：
 * ① A1 明切 4 件（anthropic_beta 合并块 / anthropic-ratelimit-unified-reset
 *   头读链 / coreSchemas 描述串 / anthropic_cloud 字面）；
 * ② A2 去味 3 件（isFirstPartyGatewayUrl → isDefaultGateway 改名 +
 *   anthropicBaseUrl → baseUrl + engine 2 内联注释去味）；
 * ③ A3-2 通用化 4 件（normalizeNameForMCP 三副本删 CLAUDEAI_SERVER_PREFIX
 *   条件支，折叠+去首尾对全部 server 名生效 + mcp/utils.ts claudeai scope
 *   三支死码全删）；
 * ④ A3-1 官方市场簇不动（downloads.claude.ai + claude-plugins-official
 *   恒等锚保留 = 用户裁定「带」，零扰动）。
 *
 * 判别信号（工单 §2① 规格）：
 *  - 判据面 = **活码**（env 读 / import / 函数名 / 字面量）；de-ANT 登记
 *    注释（含被删符号名溯源）经 stripComments 排除不在判据面 —— 任一活码
 *    复活 = 立即 RED（de-ant 回归守卫，同 0172/0173/0174/0175 头注纪律）。
 *  - A2 新名 ≥4 消费点在场 + A3-2 折叠对全名生效断言（行为差锁：非
 *    vendor 前缀名「本就含连续下划线」时旧不折叠/新折叠 = 功能不丢更中性）。
 *  - A3-1 恒等锚在场（若基线同面 = 红 ↔ 本波零扰动判据）。
 *
 * unit 层纪律：读仓库自身源级锁 + 纯函数行为断言，零重图/零网络/零盘写。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { normalizeNameForMCP as engineNormalize } from '../../src/engine/tools/mcp'
import { normalizeNameForMCP as tuiNormalize } from '../../src/tui/services/mcp/normalization'
import { normalizeNameForMCP as ruleNormalize } from '../../src/permissions/mcpRuleNames'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}
function countOf(haystack: string, needle: string): number {
  let n = 0
  let i = haystack.indexOf(needle)
  while (i !== -1) {
    n++
    i = haystack.indexOf(needle, i + needle.length)
  }
  return n
}
/**
 * 活码面 = 剥注释后源码（判据面 = 活码，de-ANT 登记注释排除）。
 * 块注释整删；行注释 = `//` 且非 URL scheme（前字符非 ':'）起至行尾。
 */
function stripComments(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '')
  out = out.replace(/(^|[^:])\/\/[^\n]*/gm, '$1')
  return out
}
/** 单文件活码面。 */
function liveOf(rel: string): string {
  return stripComments(srcOf(rel))
}
/** src/ 全树活码面（不读 tests/ —— 判据面 = 活码）。 */
function liveTree(): string {
  const root = resolve(import.meta.dir, '../../src')
  const files: string[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) {
        walk(p)
      } else if (/\.(ts|tsx)$/.test(entry)) {
        files.push(stripComments(readFileSync(p, 'utf8')))
      }
    }
  }
  walk(root)
  return files.join('\n')
}

const METADATA = 'src/tui/services/api/metadata.ts'
const WITH_RETRY = 'src/tui/services/api/withRetry.ts'
const CORE_SCHEMAS = 'src/tui/entrypoints/sdk/coreSchemas.ts'
const OUTPUTS_SCANNER = 'src/tui/utils/filePersistence/outputsScanner.ts'
const MCP_UTILS = 'src/tui/services/mcp/utils.ts'
const OFFICIAL_GCS = 'src/tui/utils/plugins/officialMarketplaceGcs.ts'

describe('0.1.78 W-A A1：明切 4 件活码缺席（注释排除）', () => {
  test('metadata.ts：anthropic_beta 合并块删（签名收窄零参）', () => {
    const live = liveOf(METADATA)
    expect(live).not.toContain('anthropic_beta')
    expect(live).toContain('export function getExtraBodyParams(): JsonObject')
  })
  test('withRetry.ts：anthropic-ratelimit-unified-reset 头读链删（回标准退避）', () => {
    const live = liveOf(WITH_RETRY)
    expect(live).not.toContain('anthropic-ratelimit-unified-reset')
    expect(live).not.toContain('getRateLimitResetDelayMs')
  })
  test('coreSchemas.ts：Rate limit 描述串中性化', () => {
    const live = liveOf(CORE_SCHEMAS)
    expect(live).not.toContain('claude.ai subscription')
    expect(live).toContain(".describe('Rate limit information.')")
  })
  test('outputsScanner.ts：anthropic_cloud → cloud（零写入方休眠改名）', () => {
    const live = liveOf(OUTPUTS_SCANNER)
    expect(live).not.toContain('anthropic_cloud')
    expect(live).toContain("const WIRE_ENVIRONMENT_KIND_CLOUD = 'cloud'")
  })
})

describe('0.1.78 W-A A2：isFirstPartyGatewayUrl → isDefaultGateway 改名（去味）', () => {
  test('旧活符号 src/ 全树 0 处（3 处登记注释排除后）', () => {
    expect(countOf(liveTree(), 'isFirstPartyGatewayUrl')).toBe(0)
  })
  test('新名活码 ≥4 消费点在场（定义 + 3 import + 3 调用点 = 7）', () => {
    expect(countOf(liveTree(), 'isDefaultGateway')).toBeGreaterThanOrEqual(4)
  })
})

describe('0.1.78 W-A A3-2：MCP 名归一通用化（折叠+去首尾对全部 server 名生效）', () => {
  test('CLAUDEAI_SERVER_PREFIX 三副本常量化活码 0', () => {
    expect(countOf(liveTree(), 'CLAUDEAI_SERVER_PREFIX')).toBe(0)
  })
  test('vendor 前缀名归一行为恒等（三副本同值）', () => {
    const cases = [
      ['claude.ai foo', 'claude_ai_foo'],
      ['a..b', 'a_b'],
      ['__x__', 'x'],
    ] as const
    for (const [input, want] of cases) {
      expect(engineNormalize(input as string)).toBe(want)
      expect(tuiNormalize(input as string)).toBe(want)
      expect(ruleNormalize(input as string)).toBe(want)
    }
  })
  test('判别行为差：非 vendor 前缀名内连续下划线现在也折叠（旧行为不折叠）', () => {
    for (const fn of [engineNormalize, tuiNormalize, ruleNormalize]) {
      expect(fn('my__server')).toBe('my_server')
    }
  })
  test('mcp/utils.ts：claudeai scope 三支死码全删（活码 0）', () => {
    const live = liveOf(MCP_UTILS)
    expect(live).not.toContain("return 'claude.ai'")
    expect(live).not.toContain("return 'claude.ai config'")
    expect(live).not.toContain("return 'claudeai'")
  })
})

describe('0.1.78 W-A A3-1：官方市场簇恒等锚零扰动（用户裁定「带」）', () => {
  test('downloads.claude.ai 下载 URL + claude-plugins-official 面在场', () => {
    const src = srcOf(OFFICIAL_GCS)
    expect(src).toContain(
      'https://downloads.claude.ai/claude-code-releases/plugins/claude-plugins-official',
    )
    expect(src).toContain("const ARC_PREFIX = 'marketplaces/claude-plugins-official/'")
  })
})
