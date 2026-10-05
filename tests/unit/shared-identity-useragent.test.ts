/**
 * #272 HTTP User-Agent 品牌串（docs/2026-10-04-http-useragent-fix.md 回归判别）+
 * BR-8 UA 标准化（spec §10.3：品牌+版本+repo 三段定式，**无字面 `+`**）。
 *
 * 被测：src/shared/identity（品牌串单一事实源）经 shared 门面导出的常量 +
 * getVersion + buildUserAgent + buildWebFetchUserAgent。判别点：
 *  - 常量值（PRODUCT_NAME/PACKAGE_NAME/REPOSITORY_URL 单一事实源）
 *  - buildUserAgent() 形状 = `AtlasCode/<version> (<repo>)`（BR-8：去 `+`，
 *    含真实版本段，非 SDK 默认 OpenAI/JS 品牌串）
 *  - buildWebFetchUserAgent() 形状 = `Atlas-User (AtlasCode/<version>; <repo>)`
 *    （BR-8 delta ⑥：tui ④ 与 engine ⑤ 共用 builder，版本段补齐）
 *  - UA 串无字面 `+`（BR-8 gate：grep `+https` / `+${REPO}` = 0 的行为镜像）
 *  - getVersion() dev 态读到真实版本（非 '0.0.0' 回落）——算法与
 *    engine/session/paths.ts getVersion 同款，npm 安装态由生产 lane 验真
 *    （本单测只覆盖 dev 态，版本段版本无关：断言 semver 形 + 非 0.0.0，
 *    不硬编码具体版本号以免随发布漂移）。
 *
 * 分层纪律：纯常量 + 版本读（无网络/无 PTY/无真实 LLM 请求）。
 */
import { describe, test, expect } from 'bun:test'
import {
  PRODUCT_NAME,
  PACKAGE_NAME,
  REPOSITORY_URL,
  PRODUCT_FAMILY,
  PRODUCT_BRAND,
  FEEDBACK_CHANNEL,
  ACCENT_HUE,
  getVersion,
  buildUserAgent,
  buildWebFetchUserAgent,
} from '../../src/shared'

describe('#272 shared/identity 品牌串 + buildUserAgent', () => {
  test('常量值（品牌串单一事实源）', () => {
    expect(PRODUCT_NAME).toBe('AtlasCode')
    expect(PACKAGE_NAME).toBe('@atlasharness/atlascode')
    expect(REPOSITORY_URL).toBe('https://github.com/vincentlau2046/AtlasCode')
  })

  test('getVersion() dev 态读到真实版本（非 0.0.0 回落）', () => {
    const v = getVersion()
    expect(v).not.toBe('0.0.0')
    expect(v).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('buildUserAgent() 形状 = AtlasCode/<version> (repo) · BR-8 无字面 +', () => {
    const ua = buildUserAgent()
    expect(ua).toBe(`${PRODUCT_NAME}/${getVersion()} (${REPOSITORY_URL})`)
    expect(ua.startsWith('AtlasCode/')).toBe(true)
    expect(ua).toContain('(https://github.com/vincentlau2046/AtlasCode)')
    // BR-8 gate：UA 串无字面 `+`
    expect(ua).not.toContain('+')
    // 版本段 = 真实版本（非 0.0.0 回落）
    const versionSeg = ua.slice('AtlasCode/'.length).split(' ')[0]
    expect(versionSeg).not.toBe('0.0.0')
    expect(versionSeg).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('buildWebFetchUserAgent() 形状 = Atlas-User (AtlasCode/<v>; repo) · BR-8 delta ⑥', () => {
    const ua = buildWebFetchUserAgent()
    expect(ua).toBe(`Atlas-User (${PRODUCT_NAME}/${getVersion()}; ${REPOSITORY_URL})`)
    expect(ua.startsWith('Atlas-User (AtlasCode/')).toBe(true)
    // BR-8 gate：UA 串无字面 `+`
    expect(ua).not.toContain('+')
    // 版本段补齐（delta ⑥ 收口：旧 engine ⑤ 静态串无版本段，现与 ④ 对齐）
    const inner = ua.slice('Atlas-User ('.length, -1)
    expect(inner).toContain(`${PRODUCT_NAME}/${getVersion()}`)
  })

  test('出站 UA 已切品牌串（不再含 SDK 默认 OpenAI/JS 品牌串）', () => {
    expect(buildUserAgent()).not.toContain('OpenAI/JS')
  })
})

describe('BR-1 identity 扩常量（spec §6.2，0.1.31）', () => {
  test('4 扩常量值 + 经 shared 门面导出（单一事实源）', () => {
    expect(PRODUCT_FAMILY).toBe('Atlas')
    expect(PRODUCT_BRAND).toBe('AtlasCode')
    expect(FEEDBACK_CHANNEL).toBe(
      'https://github.com/vincentlau2046/AtlasCode/issues',
    )
    expect(ACCENT_HUE).toBe('compute')
    // 与既有 PRODUCT_NAME 同值但语义独立（atlasoffice 配方可不同）
    expect(PRODUCT_BRAND).toBe(PRODUCT_NAME)
  })
})
