/**
 * #272 HTTP User-Agent 品牌串（docs/2026-10-04-http-useragent-fix.md 回归判别）。
 *
 * 被测：src/shared/identity（品牌串单一事实源）经 shared 门面导出的常量 +
 * getVersion + buildUserAgent。判别点：
 *  - 常量值（PRODUCT_NAME/PACKAGE_NAME/REPOSITORY_URL 单一事实源）
 *  - buildUserAgent() 形状 = `AtlasCode/<version> (+<repo>)`（含真实版本段，非
 *    SDK 默认 OpenAI/JS 品牌串）
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
  getVersion,
  buildUserAgent,
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

  test('buildUserAgent() 形状 = AtlasCode/<version> (+repo)', () => {
    const ua = buildUserAgent()
    expect(ua).toBe(`${PRODUCT_NAME}/${getVersion()} (+${REPOSITORY_URL})`)
    expect(ua.startsWith('AtlasCode/')).toBe(true)
    expect(ua).toContain('(+https://github.com/vincentlau2046/AtlasCode)')
    // 版本段 = 真实版本（非 0.0.0 回落）
    const versionSeg = ua.slice('AtlasCode/'.length).split(' ')[0]
    expect(versionSeg).not.toBe('0.0.0')
    expect(versionSeg).toMatch(/^\d+\.\d+\.\d+/)
  })

  test('出站 UA 已切品牌串（不再含 SDK 默认 OpenAI/JS 品牌串）', () => {
    expect(buildUserAgent()).not.toContain('OpenAI/JS')
  })
})
