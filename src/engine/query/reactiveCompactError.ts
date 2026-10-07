/**
 * engine/query — D1（0.1.37 ③，P2 恢复层 C3 缺口）：413/PTL 类 provider 错误
 * 形判别（throw 形态，纯函数，I/O-free → unit 层可测）。
 *
 * 与谓词层（context/reactiveCompact.ts isWithheldPromptTooLong /
 * isWithheldMediaSizeError）的关系：两谓词 = CC 参照源 stream-level withholding
 * 形态（入参 = assistant isApiErrorMessage 消息）。本仓 engine loop 的 provider
 * 错误为 **throw 形态**（modelprovider chat 抛 APIError/Error）→ 判据单源 =
 * modelprovider 域 classifyAPIError（错误分类权威面，DEP-4 allow 已落
 * loop.ts PROVIDER_EMPTY_CONTENT_PLACEHOLDER 先例）：
 *   - 'prompt_too_long'  = 400「Prompt is too long」（输入本身超窗，B 类 400，
 *     withRetry maxTokensOverride 自修不覆盖 = P2 报告 C5 缺口定义）
 *   - 'image_too_large'  = 400 图片超限（media-size 错误，CC 谓词层
 *     isWithheldMediaSizeError 同口径「Image was too large」族）
 * 两值 = D1 反应式压缩消费点的可恢复错误面（f4 D1 spec 判据
 * 「isWithheldPromptTooLong || isWithheldMediaSizeError」的 throw 形等价）。
 */
import { classifyAPIError } from '../../modelprovider'

/** 413/PTL 类（可反应式压缩恢复）provider 错误判定。非 PTL/media 族 = false。 */
export function isReactiveCompactRecoverableError(error: unknown): boolean {
  const cls = classifyAPIError(error)
  return cls === 'prompt_too_long' || cls === 'image_too_large'
}
