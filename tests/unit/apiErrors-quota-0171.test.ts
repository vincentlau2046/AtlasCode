/**
 * 0.1.71 A-3 TUI 提示面判别单测（用户主诉①「所有模型额度没有了，但提示有问题」）。
 *
 * resolveAuthErrorMessaging（宿主端口，src/tui/utils/apiErrors.ts 注册）对：
 *  - ModelPoolExhaustedError（A-1 池轮询全败聚合）→ 可行动指引行（配额 vs 鉴权分型）
 *  - 单 403 配额签名（raw 错误安全网，duck-type .status/.message 不依赖 APIError 类
 *    恒等）→ 可行动配额指引
 * 仅提示面（零行为变更：不改 403 throw 契约 / turnRecovery / 重试集，不加自动重试）；
 * 403 非配额签名 = 恒等锚（A-3 新增支不命中，落既有兜底路径，原始文案保留）。
 *
 * 注：TUI 宿主 auth 支的 `error instanceof APIError`（src/tui/types/atlas.ts 自有类）
 * 与 modelprovider 域 APIError / openai SDK 错误类不同类（既有面，非本波范围）——
 * 本 A-3 新增支用 ModelPoolExhaustedError（单一事实源类）+ duck-type 403 配额签名，
 * 不依赖跨域 APIError 类恒等，故对实际抛出的错误类稳健命中。
 *
 * 分层纪律：导入宿主模块（模块加载时注册真实 ErrorMessagingPorts）+ 核心解析器
 * getAssistantMessageFromError（modelprovider 域）断言产出 AssistantMessage。
 * 无网络 / 无盘 / 无 PTY。
 */
import { describe, test, expect } from 'bun:test'

// 导入宿主 = 模块加载时注册真实 ErrorMessagingPorts（含 0.1.71 A-3 新增支）。
import '../../src/tui/utils/apiErrors'
import {
  getAssistantMessageFromError,
  ModelPoolExhaustedError,
  APIError,
} from '../../src/modelprovider'
import type { AssistantMessage } from '../../src/shared'

/** AssistantMessage 文案在 .message.content[0].text（baseCreateAssistantMessage 形状）。 */
function contentText(msg: AssistantMessage): string {
  const c = (msg as any).message?.content ?? (msg as any).content
  if (Array.isArray(c) && c.length > 0 && typeof c[0]?.text === 'string') {
    return c[0].text
  }
  return String(c)
}

describe('0.1.71 A-3 ModelPoolExhaustedError → 可行动配额指引', () => {
  test('全败聚合（含配额分类）→ error=quota_exhausted + 充值/切换指引 + 模型列表', () => {
    const agg = new ModelPoolExhaustedError('premium', [
      { ref: 'p/m1', code: 'quota_exhausted', raw: 'quota' },
      { ref: 'p/m2', code: 'quota_exhausted', raw: 'quota' },
    ])
    const msg = getAssistantMessageFromError(agg, 'model-x') as AssistantMessage
    expect(msg.error).toBe('quota_exhausted')
    expect(msg.isApiErrorMessage).toBe(true)
    expect(contentText(msg)).toContain('Top up your provider quota')
    expect(contentText(msg)).toContain('p/m1')
    expect(contentText(msg)).toContain('p/m2')
  })

  test('全败聚合（非配额 auth_error）→ error=authentication_failed + 凭据指引', () => {
    const agg = new ModelPoolExhaustedError('small', [
      { ref: 'p/m1', code: 'auth_error', raw: 'forbidden' },
    ])
    const msg = getAssistantMessageFromError(agg, 'model-x') as AssistantMessage
    expect(msg.error).toBe('authentication_failed')
    expect(contentText(msg)).toContain('Check provider credentials')
  })
})

describe('0.1.71 A-3 单 403 配额签名（raw 安全网）', () => {
  test('403 + 配额签名 → quota_exhausted + 充值指引', () => {
    const msg = getAssistantMessageFromError(
      new APIError('You have exceeded your quota', 403),
      'model-x',
    ) as AssistantMessage
    expect(msg.error).toBe('quota_exhausted')
    expect(contentText(msg)).toContain('provider quota exhausted (403)')
    expect(contentText(msg)).toContain('Top up your provider quota')
  })

  test('403 非配额签名 → 恒等锚（A-3 新增支不命中，非 quota_exhausted，原始文案保留）', () => {
    const msg = getAssistantMessageFromError(
      new APIError('Forbidden', 403),
      'model-x',
    ) as AssistantMessage
    // A-3 关键断言：非配额签名 403 不被误判为 quota_exhausted（恒等锚）
    expect(msg.error).not.toBe('quota_exhausted')
    // 原始文案保留（落既有兜底路径，未被 A-3 吞掉）
    expect(contentText(msg)).toContain('Forbidden')
  })
})
