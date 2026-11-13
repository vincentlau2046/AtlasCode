// P6-2 B-4：1M/订阅升级体系已删。原 checkPremium1mAccess / checkSmall1mAccess /
// getAvailableUpgrade 依赖已删的 [1m] 变体与订阅门控（D1 恒 false），
// 全部移除。contextWindow 现由 provider 元数据承载（resolveModel().contextWindow），
// 不再有”升级到 1M”的独立档位。

/**
 * 升级提示（provider 元数据版最小实现）。
 * 1M 升级档位已删，当前无可用升级 → 恒返回 null；3 处活消费
 * （AssistantTextMessage / TokenWarning / compact）保留，null 时不显示提示。
 * 具体文案/触发待产品细化（06 §十三 B-4）。
 */
export function getUpgradeMessage(_context: 'warning' | 'tip'): string | null {
  return null
}
