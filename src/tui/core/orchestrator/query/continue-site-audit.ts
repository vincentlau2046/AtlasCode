// core/orchestrator/query/continue-site-audit.ts — A2.1 审计文档
// 7 个 continue 站点的完整映射表,从 loop.ts 精确提取。
// 此文件是文档而非运行时代码,保留在代码库中供 A2.2 transitions.ts 重写时参照。

/**
 * ## 7 个 continue 站点 → LoopTransition 映射表
 *
 * | # | 行号 | 触发条件 | transition.reason | from → to | State 重置字段 | 对应 LoopTransition |
 * |---|------|---------|------------------|-----------|---------------|-------------------|
 * | C1 | 971 | 模型降级成功 (innerError.fallbackModel) | *(未设置)* → 应补 `model_fallback` | recovery → streaming | autoCompactTracking: undefined; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: undefined; transition: undefined | `{ to:'streaming', from:'recovery', reason:'model_fallback' }` |
 * | C2 | 1136 | collapse drain 重试成功 (drained.committed) | `collapse_drain_retry` | compaction → streaming | hasAttemptedReactiveCompact: 保留; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: undefined | `{ to:'streaming', from:'compaction', reason:'collapse_drain' }` |
 * | C3 | 1186 | reactive compact 成功 (compacted.compacted) | `reactive_compact_retry` | compaction → streaming | autoCompactTracking: undefined; hasAttemptedReactiveCompact: true; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: undefined | `{ to:'streaming', from:'compaction', reason:'reactive_compact' }` |
 * | C4 | 1241 | max_output_tokens 首次升级 (ESCALATED_MAX_TOKENS) | `max_output_tokens_escalate` | recovery → streaming | autoCompactTracking: tracking; hasAttemptedReactiveCompact: 保留; maxOutputTokensOverride: ESCALATED_MAX_TOKENS; pendingToolUseSummary: undefined; stopHookActive: undefined | `{ to:'streaming', from:'recovery', reason:'max_output_tokens' }` |
 * | C5 | 1272 | max_output_tokens 恢复重试 (< MAX_OUTPUT_TOKENS_RECOVERY_LIMIT) | `max_output_tokens_recovery` + attempt | recovery → streaming | hasAttemptedReactiveCompact: 保留; maxOutputTokensRecoveryCount: +1; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: undefined | `{ to:'streaming', from:'recovery', reason:'max_output_tokens' }` |
 * | C6 | 1326 | stop_hook blocking error 重试 | `stop_hook_blocking` | stop_hooks → streaming | hasAttemptedReactiveCompact: 保留; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: true | `{ to:'streaming', from:'stop_hooks' }` |
 * | C7 | 1361 | token_budget continuation (decision.action === 'continue') | `token_budget_continuation` | recovery → streaming | autoCompactTracking: tracking; maxOutputTokensRecoveryCount: 0; hasAttemptedReactiveCompact: false; maxOutputTokensOverride: undefined; pendingToolUseSummary: undefined; stopHookActive: undefined | `{ to:'streaming', from:'recovery', reason:'token_budget' }` |
 *
 * ### 关键发现
 *
 * 1. **C1 transition 字段缺失**：行 971 的 continue 之前 `state.transition` 未设置
 *    (state 构造块中无 transition 字段)。A2.2 重写时需补 `{ reason: 'model_fallback' }`。
 *
 * 2. **C4 vs C5 同属 max_output_tokens 恢复**：C4 是首次升级 (escalate)，
 *    C5 是后续重试 (recovery)。两者 from→to 相同 (recovery→streaming)，
 *    合并为同一 LoopTransition 变体 `{ reason: 'max_output_tokens' }`。
 *
 * 3. **State 重置规则不一致**：
 *    - autoCompactTracking: C1/C3/C7 重置为 undefined/tracking，C2/C4/C5/C6 保留 → 5 种行为
 *    - hasAttemptedReactiveCompact: C3 设 true，C7 设 false，其余保留 → 3 种行为
 *    - maxOutputTokensRecoveryCount: C5 递增+1，C7 重置为 0，其余保留 → 3 种行为
 *    A2.2 的 validateTransition() 中需集中管理这些规则。
 *
 * 4. **行 1479 return 路径确认**：行 1479 附近无 return { reason: ... } 语句，
 *    该行属于工具执行后的 stop_hook 检查块,实际 return 在行 1536 (aborted_tools)
 *    和行 1541 (hook_stopped)。原对比分析中"行 1479 需确认"已解决。
 *
 * 5. **yield 副作用分布**：
 *    - C1: yield createSystemMessage (行 966) — fallback 通知
 *    - C2: 无 yield
 *    - C3: 无 yield (yield tombstone 在行 1170,属于 P3 另一路径)
 *    - C4: 无 yield
 *    - C5: 无 yield
 *    - C6: 无 yield
 *    - C7: 无 yield
 *    仅 C1 在 continue 前有 yield,其余 6 处 continue 无 yield 副作用。
 */
export const CONTINUE_SITE_AUDIT = true
