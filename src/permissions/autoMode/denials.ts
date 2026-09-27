/**
 * autoMode 子域 — auto-mode 分类器近拒跟踪（§8.65，旧仓 autoModeDenials.ts 26L 语义）。
 *
 * 旧仓来源：AutoModeDenial / recordAutoModeDenial / getAutoModeDenials。
 * 填充点 = useCanUseTool.ts，读取点 = RecentDenialsTab.tsx（/permissions TUI 面，
 * 消费随 TUI / provider 波）。本波冻结面 + 测试。
 *
 * 裁剪 delta（复审勿当遗漏重提）：
 * ① 旧 `if (!feature('TRANSCRIPT_CLASSIFIER')) return` 门 → 新仓 bun:bundle feature()
 *    恒 false，若保留门则 recordAutoModeDenial 恒 no-op（无价值 + 不可测）。故新仓
 *    恒记录（门复活随 provider 波 ③ 接线时按需加回）。MAX_DENIALS 20 头插语义逐字。
 * ② 新增 resetAutoModeDenialsForTesting（旧仓无）：模块级 DENIALS 需测试隔离
 *    重置，与 state.ts 同型。STR-1 门面唯一命名（区别于 state 侧
 *    resetAutoModeStateForTesting）。
 */

export type AutoModeDenial = {
  toolName: string
  /** Human-readable description of the denied command (e.g. bash command string) */
  display: string
  reason: string
  timestamp: number
}

let DENIALS: readonly AutoModeDenial[] = []
const MAX_DENIALS = 20

export function recordAutoModeDenial(denial: AutoModeDenial): void {
  DENIALS = [denial, ...DENIALS.slice(0, MAX_DENIALS - 1)]
}

export function getAutoModeDenials(): readonly AutoModeDenial[] {
  return DENIALS
}

export function resetAutoModeDenialsForTesting(): void {
  DENIALS = []
}
