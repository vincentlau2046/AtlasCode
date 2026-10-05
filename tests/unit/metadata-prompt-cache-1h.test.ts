/**
 * P0 分类器崩溃修（#279 波 C 合流，e2e A4F S-024N/O 不可达根因）：
 * auto-mode yolo 分类器链 `buildClaudeMdMessage`（yoloClassifier.ts:417）→
 * `getCacheControl({querySource:'auto_mode'})` → `should1hCacheTTL`（metadata.ts）
 * 在 prompt-cache-1h 的 bootstrapState dev stub 上崩溃——
 *
 *   - `getPromptCache1hAllowlist`（bootstrapState.ts:156）stub 返 `{}`（非数组、非 null）；
 *   - `should1hCacheTTL` 只守 `allowlist === null`，`{}` 漏接 → `allowlist.some(...)`
 *     抛 `TypeError: allowlist.some is not a function`。
 *
 * 该 stub 是 src/ 唯一定义、bun build 原样打包进 npm 产物 → 每个 build 的
 * auto-mode 分类器在 ATLAS.md/CLAUDE.md 作用域内（getCachedClaudeMdContent 非 null）
 * 必崩 → 分类器功能死（steerable-trust 自动放行/拦截失效，回落人工弹框）。
 * 判别面 = `getCacheControl`（导出面）带 `querySource:'auto_mode'`：修前抛
 * （RED）、修后不抛且返回合法 `{type:'ephemeral'}`（GREEN）。零网络零模型。
 */
import { describe, test, expect } from 'bun:test'

const { getCacheControl } = await import(
  '../../src/tui/services/api/metadata.js'
)

describe('P0 分类器崩溃修：prompt-cache-1h 非数组兜底（metadata.ts should1hCacheTTL）', () => {
  test('getCacheControl({querySource:auto_mode}) 不抛（bootstrapState stub 返 {} 时仍安全）', () => {
    expect(() => getCacheControl({ querySource: 'auto_mode' })).not.toThrow()
  })

  test('getCacheControl({querySource:auto_mode}) 返回合法 cache-control 形（test 环境无 1h allowlist → 无 ttl）', () => {
    const cc = getCacheControl({ querySource: 'auto_mode' })
    expect(cc.type).toBe('ephemeral')
    // 无 GrowthBook 本地配置时 1h allowlist 为空 → 不应带 1h ttl。
    expect(cc.ttl).toBeUndefined()
  })

  test('getCacheControl()（无 querySource）不抛且返回 {type:ephemeral}', () => {
    const cc = getCacheControl()
    expect(cc.type).toBe('ephemeral')
  })
})
