/**
 * 2026-10-05 §4b A 波 A1：危险 shell 前缀护栏（spec §4b-A1）。
 *
 * 语义：危险前缀（rm / sudo / cd / 单字符 / 通配符）在审批弹框**不出现
 * always 选项**（「don't ask again」）——过宽或高破坏性的前缀不允许
 * 一条 allow 规则覆盖整个 session。
 *
 * 判定规则（纯谓词，零 I/O）：
 *   1. 规则形 `prefix:*`（suggestionForPrefix 的 ruleContent）先剥 `:*` 后缀
 *      再判前缀本体；
 *   2. 前缀本体含通配符（含裸 `*`）→ 危险（通配 = 过宽范围）；
 *   3. 首词（命令名，小写）∈ {rm, sudo, cd} → 危险；
 *   4. 首词长度 ≤ 1（单字符/空）→ 危险。
 * 首词按词边界判定（`rmq` 安全、`rm` 危险），非 startsWith。
 */

const DANGEROUS_COMMAND_NAMES: ReadonlySet<string> = new Set([
  'rm',
  'sudo',
  'cd',
])

export function isDangerousShellPrefix(prefix: string): boolean {
  const trimmed = prefix.trim()
  if (!trimmed) return false
  // 规则形 `prefix:*` → 剥后缀判本体（裸 `*` 走通配分支）
  const body = trimmed.endsWith(':*') ? trimmed.slice(0, -2) : trimmed
  if (body.includes('*')) return true
  const name = body.split(/\s+/)[0].toLowerCase()
  if (name.length <= 1) return true
  return DANGEROUS_COMMAND_NAMES.has(name)
}
