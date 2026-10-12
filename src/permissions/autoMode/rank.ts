/**
 * autoMode 子域 — C1-1（0.1.59，CC 2.1.136）hard_deny 第 4 类 severity 聚合纯逻辑面。
 *
 * 0.1.55 提示词层 HARD/SOFT BLOCK 语义已落（permissions_external.txt）；本文件 =
 * **解析层**的 severity 最严聚合纯函数，消费点 = 分类器（provider 波前向接缝，
 * 本波注册不接线——纯函数零运行时副作用，零 LLM 依赖）。
 *
 * severity 序（最严 → 最松）：
 *   hard_deny > soft_deny > deny（常规）> allow
 *
 * 聚合语义（Main 裁定）：
 *   - **hard_deny 命中 = FINAL**：用户意图 / allow 均不可清除（**无清除支**）。
 *     命中即定，任何其它类不得翻案。
 *   - **soft_deny 命中 → soft_deny**：allow 在聚合面不清除 soft_deny（用户意图
 *     是否清除 soft 块是分类器后续 LLM 决策，非 rank 层职责；rank 仅报告最严
 *     blocking 类）。
 *   - **deny / allow 层**：allow 清除常规 deny（{deny, allow} → allow）；仅
 *     deny → deny；仅 allow / 无命中 → allow（缺省放行，gate fail-closed 由
 *     上游分类器承担，rank 纯函数缺省 = allow 中性）。
 *
 * 判别单测（tests/unit/auto-mode-hard-deny-0159.test.ts）覆盖三例：
 *   {hardDeny, allow} → hard_deny（不清除）/ {softDeny, allow} → soft_deny /
 *   {deny, allow} → allow。
 */

/** severity 四级（最严 → 最松）。 */
export type AutoModeSeverity = 'hard_deny' | 'soft_deny' | 'deny' | 'allow'

/**
 * 各 rule 类的命中态：布尔（该类是否命中）或命中规则数组（空数组 = 未命中）。
 * 双形兼容 = 分类器消费点既可传「命中计数」也可传「命中规则清单」。
 */
export type AutoModeClassHits = {
  hard_deny?: boolean | readonly string[]
  soft_deny?: boolean | readonly string[]
  deny?: boolean | readonly string[]
  allow?: boolean | readonly string[]
}

/** 该类是否命中（布尔 true 或非空数组）。 */
function fired(v: boolean | readonly string[] | undefined): boolean {
  if (v === true) return true
  if (Array.isArray(v)) return v.length > 0
  return false
}

/**
 * 最严聚合：给定各 rule 类命中态，返回生效 severity。
 * 顺序判定 hard_deny → soft_deny → (allow 清除 deny) → deny → allow，
 * 一旦命中即返回（无回溯清除支，尤其 hard_deny 不可被 allow 清除）。
 */
export function aggregateAutoModeSeverity(
  hits: AutoModeClassHits,
): AutoModeSeverity {
  // hard_deny = FINAL（用户意图 / allow 不可清除，无清除支）
  if (fired(hits.hard_deny)) return 'hard_deny'
  // soft_deny（allow 在聚合面不清除；用户意图清除归分类器 LLM 步）
  if (fired(hits.soft_deny)) return 'soft_deny'
  // deny / allow 层：allow 清除常规 deny
  if (fired(hits.allow)) return 'allow'
  if (fired(hits.deny)) return 'deny'
  // 无命中 = 中性放行（缺省）
  return 'allow'
}
