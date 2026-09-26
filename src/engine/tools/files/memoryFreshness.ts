/**
 * engine/tools/files — Read 工具面 memory 新鲜度前缀（§8.55 S-C5，高频族
 * 纵切子波 3）。
 *
 * 旧仓来源（a8af45b）：src/memdir/memoryAge.ts 53L 全量逐字随迁（mtimeMs
 * 4 函数族：memoryAgeDays / memoryAge / memoryFreshnessText /
 * memoryFreshnessNote，纯函数无外部依赖）。
 *
 * delta 登记（复审勿当遗漏重提）：
 *  ① 新仓既有 src/memory/memoryAge.ts = **filePath 基** 同名异语义变体
 *    （memoryAgeDays(filePath) statSync / memoryFreshnessNote(filePath) →
 *    `(updated X)` 形，memdir 域消费方，已随 memdir 域波落定）——与本文件
 *    **mtimeMs 基** 族（memoryFreshnessNote(mtimeMs) →
 *    `<system-reminder>This memory is N days old…</system-reminder>\n` 形，
 *    FileReadTool memoryFileFreshnessPrefix 专属消费）共存无冲突：域内
 *    import 无全局名碰撞，两族语义/签名/输出形均不同，勿混淆。
 *  ② 本族唯一消费方 = readTool.ts memoryFileFreshnessPrefix（WeakMap
 *    侧通道 data→mtimeMs → 前缀），无其他新仓消费者。
 */

/**
 * Days elapsed since mtime.  Floor-rounded — 0 for today, 1 for
 * yesterday, 2+ for older.  Negative inputs (future mtime, clock skew)
 * clamp to 0.
 */
export function memoryAgeDays(mtimeMs: number): number {
  return Math.max(0, Math.floor((Date.now() - mtimeMs) / 86_400_000))
}

/**
 * Human-readable age string.  Models are poor at date arithmetic —
 * a raw ISO timestamp doesn't trigger staleness reasoning the way
 * "47 days ago" does.
 */
export function memoryAge(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

/**
 * Plain-text staleness caveat for memories >1 day old.  Returns ''
 * for fresh (today/yesterday) memories — warning there is noise.
 *
 * Use this when the consumer already provides its own wrapping
 * (e.g. messages.ts relevant_memories → wrapMessagesInSystemReminder).
 *
 * Motivated by user reports of stale code-state memories (file:line
 * citations to code that have since changed) being asserted as fact —
 * the citation makes the stale claim sound more authoritative, not less.
 */
export function memoryFreshnessText(mtimeMs: number): string {
  const d = memoryAgeDays(mtimeMs)
  if (d <= 1) return ''
  return (
    `This memory is ${d} days old. ` +
    `Memories are point-in-time observations, not live state — ` +
    `claims about code behavior or file:line citations may be outdated. ` +
    `Verify against current code before asserting as fact.`
  )
}

/**
 * Per-memory staleness note wrapped in <system-reminder> tags.
 * Returns '' for memories ≤ 1 day old.  Use this for callers that
 * don't add their own system-reminder wrapper (e.g. FileReadTool output).
 */
export function memoryFreshnessNote(mtimeMs: number): string {
  const text = memoryFreshnessText(mtimeMs)
  if (!text) return ''
  return `<system-reminder>${text}</system-reminder>\n`
}
