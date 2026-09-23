/**
 * engine/tools/agent — AgentTool 常量（§8.25 E-2 T-5b）
 *
 * AGENT_TOOL_NAME = 旧仓 tools/AgentTool/constants.ts:1 逐字；MAX_WORKER_SPAWN_DEPTH =
 * 旧仓 constants/tools.ts:96 逐字（coordinator worker 派生深度上限，spawn 深度门消费）。
 *
 * 裁剪 + 残留守头注释（防「以为已全」）：
 *   - LEGACY_AGENT_TOOL_NAME='Task'（旧名兼容：权限规则 / 钩子 / 恢复会话）→ 残留守
 *     （新仓无旧会话/权限规则回放，de-Claude 硬切不留 legacy 探测，见 plugin-manifest-legacy-probe 同义）。
 *   - VERIFICATION_AGENT_TYPE / ONE_SHOT_BUILTIN_AGENT_TYPES（Explore/Plan 一次性内建
 *     agent 跳过 usage trailer 的优化）→ T-5c 内建 agent 注册表落时一并补。
 */
export const AGENT_TOOL_NAME = 'Agent'

/**
 * coordinator worker 的最大派生深度（旧仓 constants/tools.ts:96 逐字）。
 * spawn 深度门：allowFanOut = isCoordinatorMode() && childSpawnDepth < MAX_WORKER_SPAWN_DEPTH。
 * 主线程（coordinator）spawnDepth=0 → 首个 worker 深度 1；深度 2 的 worker 不再 fan-out。
 */
export const MAX_WORKER_SPAWN_DEPTH = 2
