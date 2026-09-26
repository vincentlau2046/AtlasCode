/**
 * engine/tools/plan — plan 域（S-E2 §8.58 plan 族子波，新仓零落新落域）。
 *
 * 旧仓来源（a8af45b）：utils/plans.ts 397L 中 §8.58 消费面 5 件逐字随迁
 * （getPlanSlug / setPlanSlug / clearPlanSlug / clearAllPlanSlugs /
 * getPlansDirectory / getPlanFilePath / getPlan）+ utils/words.ts 800L 词表
 * 逐字随迁（planWords.ts，generateWordSlug 供 getPlanSlug 冲突重试面）。
 *
 * delta 登记（H6 逐条，复审勿当遗漏重提）：
 *  ① 旧 getPlanSlugCache（bootstrap/state.ts:82 any-stub
 *    `: any = () => new Map()`，每次调用新 Map = 旧仓实际无跨调用持久化；
 *    H6 纪律 stub 不当真行为，旧 plans.ts:34/55/64/72 四处消费全经该
 *    stub）→ 域内本地真 Map（意图面恢复而非 stub 复刻；bootstrap 该
 *    stub 面 S-D2a 已整砍登记；测试操纵面 = setPlanSlug/clearPlanSlug/
 *    clearAllPlanSlugs 真导出面）。
 *  ② 旧 getPlansDirectory lodash-es memoize（plans.ts:79，「regressed in
 *    #20005」注释逐字保留）→ 域内闭包 memo（新仓无 lodash，toolRegistry
 *    去重同例本地实现）；旧消费面 getPlansDirectory.cache.clear?.()
 *    （S-D2b delta ⑨ 三件套裁）新仓无消费 → 无 clear 面（登记）。
 *  ③ 旧 settings.plansDirectory 支（settings.json 相对项目根解析 + 路径
 *    穿越校验，plans.ts:84-101）→ 裁（新仓 SettingsJson 无该字段——config
 *    类型面 types.ts:25「低消费功能 flag」已登记裁面 → 重指；本切片 =
 *    缺省支逐字 join(getAtlasConfigHomeDir(), 'plans') + mkdirSync 幂等，
 *    settings 字段归 config 功能面恢复位）。
 *  ④ 旧 persistFileSnapshotIfRemote（plans.ts:360，getEnvironmentKind
 *    早退 + recordTranscript 文件快照）→ 裁 = remote 波面（S-D2b delta ⑧
 *    同源先例重指；消费位 ExitPlanModeV2 call 同步支同裁，
 *    exitPlanModeV2Tool.ts delta ⑨ 登记）。
 *  ⑤ 旧 getPlanSlug import EXIT_PLAN_MODE_V2_TOOL_NAME（plans.ts:14，
 *    plan 模式工具出口检测面）+ getSlugFromLog/copyPlanForResume/
 *    copyPlanForFork（resume/log 恢复族，plans.ts:149+）+ plan 快照恢复
 *    族 → 裁（CLI/resume 波前向接缝，H6 此处登记）。
 *  ⑥ 旧 AgentId/SessionId 品牌型（src/types/ids）→ 裸 string（新仓无
 *    品牌 ID 型面，duck 契约同族先例）。
 *  ⑦ 测试缝 setPlanSlugGeneratorForTesting（S-E3 B 路探针 (e) MUST-FIX：
 *    词表 9.76M 随机组合下「冲突重试 existsSync 检查」突变无可靠红位
 *    P(red)≈1e-7 → 模块级 slugGenerator 引用（缺省 = generateWordSlug，
 *    生产零行为差）+ 确定性序列注入；先例 = engine/session/project.ts
 *    *ForTesting 族）。冲突重试循环体 `slug = generateWordSlug()` →
 *    `slug = slugGenerator()` 为唯一非逐字位（本条登记）。
 *
 * 消费方：EnterPlanModeTool / ExitPlanModeV2Tool（call 面 getPlanFilePath/
 * getPlan）+ plan/index.ts 子门面（CLI/plans 波 setPlanSlug 恢复面预留）。
 */
import { join } from 'path'
import { getFsImplementation, isENOENT, logError } from '../../../shared'
import { getSessionId } from '../../../bootstrap'
import { getAtlasConfigHomeDir } from '../../config'
import { generateWordSlug } from './planWords'

const MAX_SLUG_RETRIES = 10

// delta ①：旧 bootstrap getPlanSlugCache any-stub（每次调用新 Map）→
// 域内本地真 Map（意图面恢复，详见头注 delta ①）
const planSlugCache = new Map<string, string>()

// delta ⑦：测试缝（生产缺省 = generateWordSlug 零行为差，func 层确定性
// 注入冲突序列，见 setPlanSlugGeneratorForTesting）
let slugGenerator: () => string = generateWordSlug

/**
 * 测试缝：注入 slug 生成器（null = 恢复缺省 generateWordSlug）。
 * 先例 = engine/session/project.ts *ForTesting 族（S-E3 B 路登记）。
 */
export function setPlanSlugGeneratorForTesting(
  fn: (() => string) | null,
): void {
  slugGenerator = fn ?? generateWordSlug
}

/**
 * Get or generate a word slug for the current session's plan.
 * The slug is generated lazily on first access and cached for the session.
 * If a plan file with the generated slug already exists, retries up to 10 times.
 */
export function getPlanSlug(sessionId?: string): string {
  const id = sessionId ?? getSessionId()
  const cache = planSlugCache
  let slug = cache.get(id)
  if (!slug) {
    const plansDir = getPlansDirectory()
    // Try to find a unique slug that doesn't conflict with existing files
    for (let i = 0; i < MAX_SLUG_RETRIES; i++) {
      slug = slugGenerator() // delta ⑦ 测试缝位（缺省 = generateWordSlug）
      const filePath = join(plansDir, `${slug}.md`)
      if (!getFsImplementation().existsSync(filePath)) {
        break
      }
    }
    cache.set(id, slug!)
  }
  return slug!
}

/**
 * Set a specific plan slug for a session (used when resuming a session)
 */
export function setPlanSlug(sessionId: string, slug: string): void {
  planSlugCache.set(sessionId, slug)
}

/**
 * Clear the plan slug for the current session.
 * This should be called on /clear to ensure a fresh plan file is used.
 */
export function clearPlanSlug(sessionId?: string): void {
  const id = sessionId ?? getSessionId()
  planSlugCache.delete(id)
}

/**
 * Clear ALL plan slug entries (all sessions).
 * Use this on /clear to free sub-session slug entries.
 */
export function clearAllPlanSlugs(): void {
  planSlugCache.clear()
}

// Memoized: called from render bodies (FileReadTool/FileEditTool/FileWriteTool UI.tsx)
// and permission checks. Inputs (initial settings + cwd) are fixed at startup, so the
// mkdirSync result is stable for the session. Without memoization, each rendered tool
// message triggers a mkdirSync syscall (regressed in #20005).
// delta ②：lodash-es memoize → 域内闭包 memo（新仓无 lodash，本地实现同例）
let cachedPlansDirectory: string | undefined
export function getPlansDirectory(): string {
  if (cachedPlansDirectory !== undefined) {
    return cachedPlansDirectory
  }
  // Default（delta ③：旧 settings.plansDirectory 支裁，见头注）
  const plansPath = join(getAtlasConfigHomeDir(), 'plans')

  // Ensure directory exists (mkdirSync with recursive: true is a no-op if it exists)
  try {
    getFsImplementation().mkdirSync(plansPath)
  } catch (error) {
    logError(error)
  }

  cachedPlansDirectory = plansPath
  return plansPath
}

/**
 * Get the file path for a session's plan
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 * For main conversation (no agentId), returns {planSlug}.md
 * For subagents (agentId provided), returns {planSlug}-agent-{agentId}.md
 */
export function getPlanFilePath(agentId?: string): string {
  const planSlug = getPlanSlug(getSessionId())

  // Main conversation: simple filename with word slug
  if (!agentId) {
    return join(getPlansDirectory(), `${planSlug}.md`)
  }

  // Subagents: include agent ID
  return join(getPlansDirectory(), `${planSlug}-agent-${agentId}.md`)
}

/**
 * Get the plan content for a session
 * @param agentId Optional agent ID for subagents. If not provided, returns main session plan.
 */
export function getPlan(agentId?: string): string | null {
  const filePath = getPlanFilePath(agentId)
  try {
    return getFsImplementation().readFileSync(filePath, { encoding: 'utf-8' })
  } catch (error) {
    if (isENOENT(error)) return null
    logError(error)
    return null
  }
}
