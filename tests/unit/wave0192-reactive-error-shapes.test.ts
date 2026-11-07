/**
 * wave0192 W-opt-3：C-3 overflow 触发登记收口——isReactiveCompactRecoverableError
 * 判形对现网 provider 错误形态覆盖小核（工单 RF5；非行为变更，对既有实现
 * 的覆盖测试——0.1.37 D1 主体已在，engine-reactive-compact-circuit.test.ts
 * 覆盖判形基础 + loop 消费点一次性门）。
 *
 * 本文件补现网错误形态族直证：
 *   - IFF 网关 413/PTL 变体（throw 形 APIError status=413，message 载
 *     'Prompt is too long'——engine loop 消费面为 throw 形态）
 *   - B 类 400 超窗族（status 400 + PTL message——withRetry maxTokensOverride
 *     自修不覆盖的输入超窗面）
 *   - 不可恢复族排除（429 rate-limit / 500 server / timeout / tool_use 形
 *     ——误恢复会重压非超窗错误）
 * 单源 = classifyAPIError（modelprovider 域错误分类权威面，modelErrors.ts）。
 */
import { describe, expect, test } from 'bun:test'
import { APIError } from '../../src/modelprovider'
import { isReactiveCompactRecoverableError } from '../../src/engine/query/reactiveCompactError'

describe('wave0192 C-3 判形覆盖小核（现网 provider 错误形态族）', () => {
  test('IFF 网关 413 throw 形（APIError status=413 + PTL message）→ 可恢复', () => {
    expect(
      isReactiveCompactRecoverableError(
        new APIError(
          'Prompt is too long: 250000 tokens > 200000 maximum',
          413,
        ),
      ),
    ).toBe(true)
  })

  test('B 类 400 超窗族（APIError status=400 + PTL message）→ 可恢复（withRetry 自修不覆盖面）', () => {
    expect(
      isReactiveCompactRecoverableError(
        new APIError(
          'prompt is too long: 210000 tokens > 200000 maximum',
          400,
        ),
      ),
    ).toBe(true)
  })

  test('裸 Error PTL 文案（大小写不敏感单源）→ 可恢复', () => {
    expect(
      isReactiveCompactRecoverableError(new Error('PROMPT IS TOO LONG')),
    ).toBe(true)
  })

  test('image_too_large 400 形 → 可恢复（media-size 族同判据面）', () => {
    expect(
      isReactiveCompactRecoverableError(
        new APIError('image exceeds maximum size', 400),
      ),
    ).toBe(true)
  })

  test('不可恢复族排除：429 / 500 / timeout / tool_use mismatch → false（误恢复防线）', () => {
    expect(
      isReactiveCompactRecoverableError(new APIError('rate limited', 429)),
    ).toBe(false)
    expect(
      isReactiveCompactRecoverableError(new APIError('internal error', 500)),
    ).toBe(false)
    expect(
      isReactiveCompactRecoverableError(new Error('Request timed out')),
    ).toBe(false)
    expect(
      isReactiveCompactRecoverableError(
        new APIError(
          '`tool_use` ids were found without `tool_result` blocks immediately after',
          400,
        ),
      ),
    ).toBe(false)
  })
})
