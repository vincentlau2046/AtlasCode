/**
 * engine/skill — 技能使用频次追踪（§8.67 D 波 S-E2a，
 * 旧仓 src/utils/suggestions/skillUsageTracking.ts 落面）。
 *
 * 落面 = recordSkillUsage（60s 防抖）+ getSkillUsageScore（7 天半衰期
 * 指数衰减，下限系数 0.1）。
 *
 * 适配裁定（复审勿当遗漏重提）：
 *   ① 旧仓持久化面 getGlobalConfig/saveGlobalConfig（~/.atlas.json
 *      skillUsage 段 + 文件锁）= 新仓 0 命中（全局 config 面未落）→
 *      本域落**内存态**（模块级 Map：60s 防抖 + 半衰期评分 = 真行为，
 *      零持久化）；持久化面 = 前向接缝（全局 config 波回填时置换
 *      saveGlobalConfig 调用点，评分算法不变）。
 */

const SKILL_USAGE_DEBOUNCE_MS = 60_000

type SkillUsageEntry = {
  usageCount: number
  lastUsedAt: number
}

// 进程内使用记录（旧仓 saveGlobalConfig skillUsage 段的内存等价物）。
const usageBySkill = new Map<string, SkillUsageEntry>()
// 进程级防抖缓存 — 防抖调用跳过写路径（旧仓 lastWriteBySkill 逐字语义）。
const lastWriteBySkill = new Map<string, number>()

/**
 * 记录一次技能使用（排序用）。同时更新使用计数与最近使用时间戳。
 * 排序算法 7 天半衰期 → 亚分钟粒度无意义，60s 内重复调用直接跳过。
 */
export function recordSkillUsage(skillName: string): void {
  const now = Date.now()
  const lastWrite = lastWriteBySkill.get(skillName)
  if (lastWrite !== undefined && now - lastWrite < SKILL_USAGE_DEBOUNCE_MS) {
    return
  }
  lastWriteBySkill.set(skillName, now)
  const existing = usageBySkill.get(skillName)
  usageBySkill.set(skillName, {
    usageCount: (existing?.usageCount ?? 0) + 1,
    lastUsedAt: now,
  })
}

/**
 * 按频次 + 时近性计算技能评分（越高 = 越常用/越近用）。
 * 指数衰减，7 天半衰期（7 天前的使用值折半）；系数下限 0.1
 * （避免老但高频技能完全掉出排序）。
 */
export function getSkillUsageScore(skillName: string): number {
  const usage = usageBySkill.get(skillName)
  if (!usage) return 0

  const daysSinceUse = (Date.now() - usage.lastUsedAt) / (1000 * 60 * 60 * 24)
  const recencyFactor = Math.pow(0.5, daysSinceUse / 7)

  return usage.usageCount * Math.max(recencyFactor, 0.1)
}

/** 清空使用记录（测试 / 会话重置面）。 */
export function clearSkillUsageState(): void {
  usageBySkill.clear()
  lastWriteBySkill.clear()
}
