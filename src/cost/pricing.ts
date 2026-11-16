/**
 * 0.1.120 件 2：USD 计费面首建（D1 解除）——独立单文件域 `src/cost/`。
 *
 * lock-face 锚（工单 docs/2026-11-16-headless-usage-result-ticket.md §7-3
 * + 呈批书 L7，f4 §10 @7ecf0fa4 批复）：
 *   - 钉 i：禁入 modelprovider/capabilities 域（modelCost 其余面——能力
 *     元数据/路由——禁顺手复活；budget_usd legacy attachment 维持 legacy）。
 *   - 钉 ii：模型名归一强复用 0.1.80 K1-B① `stripProviderPrefix` 单源
 *     （modelprovider/capabilities），禁第二归一实现。
 *   - 钉 iii：优先序 内置表 < settings cost.pricingOverrides；半字段
 *     override（缺 outputPerMTok 等）→ 该模型 total_cost_usd 缺席
 *     （半价禁算，不回落内置表——override 意图是整条替换，fail-closed）。
 *   - 钉 iv：unknown 模型（归一后不匹配内置表且无有效 override）→
 *     undefined，禁伪造 0（显式 0 = 合法 0，与缺席异质）。
 *   - L7 终裁：两价表（input/output）——cache_read/cache_creation token
 *     **零计入 USD**（诚实低估面注记；两价表下不伪造 cache 单价，低估
 *     可注记、伪造不可接受）。schema 预留扩展位 = PricingEntry 未来可加
 *     cache 单价字段（本版定义面不含，消费端忽略未知字段）。
 *   - 零 services/api 依赖（D1 实质理由「运行期去 services/api」不破）；
 *     零 provider 运行期状态（唯 import 纯函数归一 helper）。
 *   - freshness 注记：内置表为静态已知模型有限集，随版本发（无运行期
 *     拉取）；覆盖面外模型走 settings override 通道。
 */

import { stripProviderPrefix } from '../modelprovider'

/** 单模型双价表（USD per Million tokens）。 */
export interface PricingEntry {
  /** 输入 tokens 单价（USD / MTok）。 */
  inputPerMTok: number
  /** 输出 tokens 单价（USD / MTok）。 */
  outputPerMTok: number
}

/**
 * 内置静态已知模型价表（裸名键；K1-B① 归一后匹配）。freshness 注记见
 * 文件头：有限覆盖集，随版本发，无运行期拉取；外置模型走 settings
 * cost.pricingOverrides override 通道。cache token 零计入（两价表，L7）。
 */
export const BUILTIN_PRICING: Record<string, PricingEntry> = {
  'claude-sonnet-4-5': { inputPerMTok: 3, outputPerMTok: 15 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
  'claude-opus-4-1': { inputPerMTok: 15, outputPerMTok: 75 },
}

/** settings cost.pricingOverrides 值形（Record<modelPattern, PricingEntry>）。 */
export type PricingOverrides = Record<string, Partial<PricingEntry>>

function isCompleteEntry(v: unknown): v is PricingEntry {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.inputPerMTok === 'number' &&
    Number.isFinite(o.inputPerMTok) &&
    typeof o.outputPerMTok === 'number' &&
    Number.isFinite(o.outputPerMTok)
  )
}

/**
 * 模型 → 双价表解析。优先序 内置表 < override（同模型 override 整条胜出）；
 * override 在场但半字段 → undefined（半价禁算，不回落内置表）；两查表均
 * 经 K1-B① 归一（精确 miss → 剥 provider 前缀 basename）。unknown →
 * undefined（禁伪造 0）。
 */
export function resolvePricing(
  model: string,
  overrides?: PricingOverrides,
): PricingEntry | undefined {
  if (!model) return undefined
  const base = stripProviderPrefix(model)
  if (overrides) {
    // override 意图整条替换：命中（raw 或 basename）即定——完整则用，
    // 半字段则 fail-closed undefined（不回落内置表）。
    const rawHit = Object.prototype.hasOwnProperty.call(overrides, model)
    const baseHit = !rawHit && Object.prototype.hasOwnProperty.call(overrides, base)
    if (rawHit || baseHit) {
      const entry = rawHit ? overrides[model] : overrides[base]
      return isCompleteEntry(entry) ? entry : undefined
    }
  }
  const builtin =
    BUILTIN_PRICING[model] ??
    (Object.prototype.hasOwnProperty.call(BUILTIN_PRICING, base)
      ? BUILTIN_PRICING[base]
      : undefined)
  return builtin
}

/**
 * 单条 usage × 双价表 → USD（input + output；cache token 零计入——L7
 * 终裁低估面，两价表不伪造 cache 单价）。
 */
export function computeCostUsd(
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  },
  pricing: PricingEntry,
): number {
  return (
    (pricing.inputPerMTok * usage.input_tokens +
      pricing.outputPerMTok * usage.output_tokens) /
    1_000_000
  )
}
