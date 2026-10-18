/**
 * 0.1.73 大 de-ant 收口波（工单 docs/2026-10-15-p0-wave-0173-ticket.md §1）判别单测：
 * dist 内 api.anthropic.com / claude.ai 活 URL 字面 + claude 模型子串判定面 + 品牌串
 * 值族中性化（C-2a / C-2c / C-3a / C-3b / C-3c 五件）。
 *
 * 被测能力（工单 §1）：
 *  - C-2a constants/oauth.ts 三活 1P anthropic/claude URL 基址字面中性化（方案 A：值
 *    = undefined，消费点 apiPreconnect / preflightChecks 兜底改「env 缺 = 跳过 /
 *    failed 配置提示」，anthropic URL 字面缺席）。
 *  - C-2c getOauthProfile.ts 删（1P OAuth profile 端点车道国产面不可达，核验后裁；
 *    auth.ts import + 调用面双清，validateForceLoginOrg fail-open 放行支恒等锚）。
 *  - C-3a tui/utils/betas.ts 三模型能力门 claude 代际子串判定族删支（ISP/CM 恒 true、
 *    SO 恒 false，国产面逐门恒等锚）。
 *  - C-3b pdfUtils.ts 两处 1P 老 Haiku 子串删支（isPDFSupported 恒 true 恒等锚）。
 *  - C-3c constants/betas.ts 品牌串值族中性化（1P 品牌 beta 头值 → atlas-code 品牌）。
 *
 * 判别信号（修前红→绿）：修前（基线 f854828=v0.1.72）anthropic URL 字面 + claude
 * 子串判定族 + 1P 品牌串在场 → 本文件全部「缺席」断言 RED；修后全绿。重新引入任一
 * anthropic/claude 字面 = 立即 RED（de-ant 回归守卫）。
 *
 * 登记不入境（token 面不判红，工单 §2/§4，防误伤）：C-2b sessionIngress 1P 远端
 * session 车道 / C-2c 可达 OAuth 残 = 0.1.74+ 域换前向缝 ⑭ #200 随 gateway。
 * C-3e MCP 远端车道已于 0.1.74 销项（1P hosted-connector 车道 + CIMD 常量整裁，
 * MCP 远端 = 通用配置驱动 sse/http/ws，见 mcp-remote-closure-0174.test.ts）。
 * 本文件**仅锚定入境 5 件**，OOS 登记面不在判据面（不红）。
 *
 * 分层纪律：unit 层——**源级字符串锁**（读源文本 = 只读仓库自身，确定性）；
 * auth/settings/modelprovider 重图不入 unit 进程（0.1.72 头注纪律），本文件零 import
 * 重图、零网络 / 零盘 / 零 PTY / 零 spawn。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'bun:test'

function srcOf(rel: string): string {
  return readFileSync(resolve(import.meta.dir, '../../', rel), 'utf8')
}
function fileExists(rel: string): boolean {
  return existsSync(resolve(import.meta.dir, '../../', rel))
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

const OAUTH = 'src/tui/constants/oauth.ts'
const API_PRECONNECT = 'src/tui/utils/apiPreconnect.ts'
const PREFLIGHT = 'src/tui/utils/preflightChecks.tsx'
const AUTH = 'src/tui/utils/auth.ts'
const OAUTH_PROFILE = 'src/tui/services/oauth/getOauthProfile.ts'
const BETAS = 'src/tui/utils/betas.ts'
const PDF_TUI = 'src/tui/utils/pdfUtils.ts'
const PDF_ENGINE = 'src/engine/tools/files/pdfUtils.ts'
const CONST_BETAS = 'src/tui/constants/betas.ts'
const MP_CONSTANTS = 'src/modelprovider/constants.ts'

// C-2a 三活 1P anthropic/claude URL 基址字面（本波中性化面；OOS MCP 面除外）。
const ANTHROPIC_URL_LITERALS = ['api.anthropic.com', 'mcp-proxy.anthropic.com']

describe('0.1.73 C-2a：oauth.ts anthropic/claude URL 字面中性化（方案 A undefined）', () => {
  test('oauth.ts：三活 URL 基址字面 + 1P 品牌字面全缺席（修前红）', () => {
    const src = srcOf(OAUTH)
    for (const lit of ANTHROPIC_URL_LITERALS) {
      expect(src).not.toContain(lit)
    }
    expect(src).not.toContain('https://claude.ai')
    expect(src).not.toContain('claude.ai')
    expect(countOf(src, 'claude-code-20250219')).toBe(0)
  })
  test('oauth.ts：1P REST 基址字段中性化 undefined（env 显式化恒等锚）', () => {
    const src = srcOf(OAUTH)
    expect(src).toContain('BASE_API_URL: undefined')
    expect(src).toContain('CLAUDE_AI_ORIGIN: undefined')
    // 0.1.74 C-3e 销项：MCP 代理车道（MCP_PROXY_URL/PATH）+ CIMD 常量
    // （MCP_CLIENT_METADATA_URL）已随 1P hosted-connector 车道整裁而删除
    // （0.1.72 token 车道清零 + 0.1.73 基址中性化 = 双死），故不再断言在场。
    expect(src).not.toContain('MCP_PROXY_URL')
    expect(src).not.toContain('MCP_PROXY_PATH')
    expect(src).not.toContain('MCP_CLIENT_METADATA_URL')
  })
  test('apiPreconnect：env 缺 = 跳过 preconnect（if !baseUrl return 在场）', () => {
    expect(srcOf(API_PRECONNECT)).toContain('if (!baseUrl) return')
  })
  test('preflightChecks：env 全缺 = failed 配置提示支在场', () => {
    const src = srcOf(PREFLIGHT)
    expect(src).toContain('if (!baseUrl)')
    expect(src).toContain('No API base URL configured')
  })
})

describe('0.1.73 C-2c：getOauthProfile 删除（国产面不可达核验后裁）', () => {
  test('getOauthProfile.ts 死文件已删', () => {
    expect(fileExists(OAUTH_PROFILE)).toBe(false)
  })
  test('auth.ts：getOauthProfileFromOauthToken import + 调用面双清（修前红）', () => {
    expect(srcOf(AUTH)).not.toContain('getOauthProfileFromOauthToken')
  })
  test('auth.ts：validateForceLoginOrg fail-open 放行支 + 国产面早返守卫在场（非 OAuth token 面零扰动恒等锚）', () => {
    const src = srcOf(AUTH)
    expect(src).toContain('if (!isAnthropicAuthEnabled()) {')
    expect(src).toContain('return { valid: true }')
  })
})

describe('0.1.73 C-3a：betas.ts 三模型能力门 claude 代际子串判定族删支', () => {
  const CLAUDE_SUBSTRINGS = [
    'claude-3-',
    'claude-sonnet-4-6',
    'claude-sonnet-4-5',
    'claude-opus-4-1',
    'claude-opus-4-5',
    'claude-opus-4-6',
    'claude-haiku-4-5',
  ]
  test('betas.ts：claude 模型子串判定族缺席（修前红）', () => {
    const src = srcOf(BETAS)
    for (const lit of CLAUDE_SUBSTRINGS) {
      expect(src).not.toContain(lit)
    }
  })
  test('betas.ts：三能力门恒等锚（ISP/CM 恒 true、SO 恒 false 常量在场）', () => {
    const src = srcOf(BETAS)
    expect(src).toContain(
      'export function modelSupportsISP(_model: string): boolean {\n  return true\n}',
    )
    expect(src).toContain(
      'export function modelSupportsContextManagement(_model: string): boolean {\n  return true\n}',
    )
    expect(src).toContain(
      'export function modelSupportsStructuredOutputs(_model: string): boolean {\n  return false\n}',
    )
  })
})

describe('0.1.73 C-3b：pdfUtils.ts 两处 1P 老 Haiku 子串删支（isPDFSupported 恒 true）', () => {
  test('两 pdfUtils：claude-3-haiku 子串缺席（修前红）', () => {
    expect(srcOf(PDF_TUI)).not.toContain('claude-3-haiku')
    expect(srcOf(PDF_ENGINE)).not.toContain('claude-3-haiku')
  })
  test('两 pdfUtils：isPDFSupported 恒 true（恒等锚）', () => {
    expect(srcOf(PDF_TUI)).toContain(
      'export function isPDFSupported(): boolean {\n  return true\n}',
    )
    expect(srcOf(PDF_ENGINE)).toContain(
      'export function isPDFSupported(): boolean {\n  return true\n}',
    )
  })
})

describe('0.1.73 C-3c：constants/betas.ts 品牌串值族中性化（atlas 品牌）', () => {
  test('两副本：1P 品牌串缺席 + atlas-code 品牌串在场（修前红）', () => {
    for (const rel of [CONST_BETAS, MP_CONSTANTS]) {
      const src = srcOf(rel)
      expect(src).not.toContain('claude-code-20250219')
      expect(src).toContain("ATLAS_20250219_BETA_HEADER = 'atlas-code-20250219'")
    }
  })
})
