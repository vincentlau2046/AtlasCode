/**
 * 0.1.69 D-3（Claude 对齐波）：摘要 LLM 调用 fallback 模型编排（纯函数面，
 * 判别单测 tests/unit/compact-summarize-fallback.test.ts，零 I/O）。
 *
 * 根因（f4 工单 §0 D-3 @0cf6d31）：摘要调用（CompactPorts.summarize 单口 =
 * 宿主 streamCompactSummary）= 单模型单调用，被拒/失败无 fallback → 主模型
 * 摘要失败（拒/超时/429）= auto-compact 该轮失败（计熔断计数），小窗模型
 * 叠加 F-3a 断路器 = 恢复面失能。
 *
 * 设计（Main 裁定，记录在码）：
 *  ① fallback 模型 = small 角色（宿主经 getRoleModel('small') 解析；未配置
 *     或 = 当前摘要模型 = 无 fallback，零回归）
 *  ② 重试次数 = 1（双失败 → throw 面传播 / 返回面原样返错消息，调用方熔断
 *     计数语义 = 修前不变——wrapper 只在双失败后才把失败交给调用方）
 *  ③ 触发判定 = 仅 API 级失败：
 *     - 抛出错误面：用户中止（APIUserAbortError / aborted 标记）与 PTL
 *       （prompt-too-long = 调用方截头重试支，更小窗更糟）不触发；其余抛出
 *       （429/5xx/超时/连接/不完整响应）触发
 *     - 返回消息面：API 错误前缀摘要（isApiErrorMessage 标记 /
 *       'API Error' 前缀）触发；PTL / 中止文本 / 正常摘要不触发
 *     - 不触发面（主摘要成功）= 零额外调用（恒等锚）
 *
 * 接线 = contextHostWiring CompactPorts.summarize 端口注入处（auto-compact
 * 富路径 / reactive 413 支 / 手动 /compact 三处经 port 单口统一受益）；
 * headless 车道无宿主 port 注册 = 裁剪路径不变（本波不入境面）。
 */
import {
  PROMPT_TOO_LONG_ERROR_MESSAGE,
  startsWithApiErrorPrefix,
} from 'src/modelprovider'

/**
 * 触发判定（抛出错误面）：API 级失败（拒/超时/429/5xx/不完整）= 可 fallback；
 * 用户中止 + PTL = 不触发。name/message 判别（不依赖跨模块类拷贝同一性——
 * tui/modelprovider 各有一式 APIUserAbortError，instanceof 跨拷贝不可靠）。
 */
export function isFallbackEligibleError(err: unknown): boolean {
  let msg = ''
  if (err instanceof Error) {
    if (err.name === 'APIUserAbortError') return false
    msg = err.message
  } else if (typeof err === 'string') {
    msg = err
  } else {
    return false
  }
  // PTL = 调用方截头重试支（PTL retry loop）消费面，小模型窗更小不解决
  if (msg.includes(PROMPT_TOO_LONG_ERROR_MESSAGE)) return false
  // 用户中止（ESC / signal abort）= 用户意图，回落 = 违背意图
  if (msg.includes('Request was aborted.')) return false
  return true
}

/**
 * 触发判定（返回消息面）：API 错误前缀摘要（isApiErrorMessage 标记或
 * 'API Error' 前缀）= 可 fallback；PTL / 中止文本 / 正常摘要 = 不触发
 * （前缀天然排除——PTL 文本 = 'Prompt is too long'… 不带 API 错误前缀）。
 */
export function isFallbackEligibleResult(
  msg: { isApiErrorMessage?: boolean },
  text: string | null | undefined,
): boolean {
  if (!text) return false
  if (text.includes(PROMPT_TOO_LONG_ERROR_MESSAGE)) return false
  if (text.includes('Request was aborted.')) return false
  return msg.isApiErrorMessage === true || startsWithApiErrorPrefix(text)
}

/**
 * fallback 包装工厂（纯编排）：primary 拒/失败 → resolveFallbackModel →
 * 带 modelOverride 重试 1 次。
 *  - 抛出面双失败 = 传播 fallback 调用的错误（调用方计 1 次熔断 = 修前语义）
 *  - 返回面双失败 = 原样返回主调用错消息（调用方 API 错误前缀守卫照旧
 *    消费 → 计数语义 = 修前）
 *  - 不触发面（主摘要成功且无错误标记 / 无 fallback 模型 / 错误不可触发）
 *    = 恰好 1 次 primary 调用（零额外调用恒等锚）
 */
export function createSummarizeWithFallback<
  P extends { modelOverride?: string },
  R,
>(
  primary: (p: P) => Promise<R>,
  opts: {
    resolveFallbackModel: (p: P) => string | undefined
    isEligibleResult?: (r: R) => boolean
  },
): (p: P) => Promise<R> {
  return async (p) => {
    let result: R
    try {
      result = await primary(p)
    } catch (err) {
      const fb = opts.resolveFallbackModel(p)
      if (!fb || !isFallbackEligibleError(err)) {
        throw err
      }
      return primary({ ...p, modelOverride: fb })
    }
    if (opts.isEligibleResult?.(result)) {
      const fb = opts.resolveFallbackModel(p)
      if (fb) {
        const retried = await primary({ ...p, modelOverride: fb })
        if (!opts.isEligibleResult!(retried)) {
          return retried
        }
      }
    }
    return result
  }
}
