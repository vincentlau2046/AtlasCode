/**
 * TUI 车道 bootstrap 状态桥（M1 分层裁定登记，2026-10-01 #209，复审勿当"四份收敛"遗漏重提）：
 *
 * 状态单源三分层（W2-2d #182 切 47 碰撞名 + #185 删净 2e 死名后的既成事实，本头注固化）：
 *   1. **engine 真状态** = `src/bootstrap/`（state.ts 57 导出）：engine/CLI headless 车道
 *      的唯一状态源。executor 域经 BootstrapStatePort（src/executor/ports/bootstrapState.ts）
 *      + 组合根适配器（atlascode/adapters/bootstrapAdapter.ts）DI 注入——两域互不 import（L3）。
 *   2. **TUI 运行态** = 本文件（112 个 TUI 独有导出）：TUI 车道运行态
 *      （scroll drain / LSP 推荐 / mainLoopModelOverride / turn 累加器族 / OTel 计数器等），
 *      域纯度裁定：TUI 运行态不入 engine 侧 bootstrap 域。含少量真状态
 *      （_isRemoteMode / _mainLoopModelOverride / _spSectionCache / turn 累加器
 *      / FX-04 0.1.50 _invokedSkillsByAgent invoked-skill 三件真状态）
 *      + getInitialMainLoopModel 真实现（De-Claude config 驱动，#202 收口）。
 *   3. **3 个同名分歧**（非重复，类型层不同，L3 边界有意保留——bootstrap/state.ts 头注
 *      "不 import engine SettingSource 型"登记）：
 *      · getAllowedSettingSources：本文件 TUI 面 = 硬编码 ['userSettings']（SettingSource 型）；
 *        bootstrap 域 = CliSettingSource 型真状态（headless 由 cli/entryInit set，get 待
 *        engine settings 面迁移后消费 = 前向接缝，engine/config/settings.ts:24 登记"不随迁"）。
 *      · getFlagSettingsPath：本文件 TUI 面 = 硬编码 '/tmp/.claude-flags.json'（flag-settings
 *        功能未落盘，H6 登记）；bootstrap 域 = 真状态（同上接缝）。
 *      · setAllowedSettingSources：本文件 TUI 面 = no-op（TUI 车道该 flag 消费面未落盘）；
 *        bootstrap 域 = 真实现（headless entryInit 接线中）。
 *    护栏：tests/unit/bootstrap-state-split.test.ts 锁定分层语义（TUI 面硬编码缺省不变 +
 *    两模块状态独立）——防后续"收敛"波误把 TUI 面切到 bootstrap 域 undefined 缺省
 *    （= TUI getEnabledSettingSources 丢 userSettings，#203 族误判先例）。
 *
 * 复审勿当遗漏：本文件是 C-7 原样搬 TUI 闭包的重建桥（consumer import analysis 重建），
 * 109 个 no-op 占位 = H6 前向接缝登记（feature 未实现的占位，非死码）；
 * invoked-skill 三件（addInvokedSkill / getInvokedSkillsForAgent /
 * clearInvokedSkillsForAgent）自 FX-04（0.1.50）起为真状态（跨压缩保全链，
 * 见各件头注）。
 */
import { getSettings_DEPRECATED } from 'src/tui/utils/settings/settings.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleModel, type ModelRole } from 'src/modelprovider'

let _spSectionCache: Map<string, string | null> = new Map()
let _agentColorMap: Map<string, string> = new Map()

// FX-04（0.1.50）：invoked-skill 态真状态（H6 no-op 占位三件 → 真 Map 落定，
// 收口「invoked-skill 态跨压缩未保全」缺口——附件重建链
// createSkillAttachmentIfNeeded 经 getInvokedSkillsForAgent 取空 Map 恒 null，
// 压缩后 skill 内容丢失）。链：登记 = processSlashCommand.tsx:663（slash 车道）
// / conversationRecovery.ts:326（resume 恢复）；消费 = compact.ts
// createSkillAttachmentIfNeeded（invoked_skills 附件 → post-compact System
// Reminder）+ skillImprovement.ts:55；释放 = SkillTool.ts:204（fork 支
// finally）。agentId null = 主会话。TUI 运行态 = 本文件层（M1 三分层裁定）。
export interface InvokedSkillRecord {
  skillName: string
  skillPath: string
  content: string
  invokedAt: number
}
const _invokedSkillsByAgent = new Map<string, Map<string, InvokedSkillRecord>>()
const _invokedSkillAgentKey = (agentId: string | null | undefined): string =>
  agentId ?? '__main__'

export function addInvokedSkill(
  skillName: string,
  skillPath: string,
  content: string,
  agentId: string | null,
): void {
  const key = _invokedSkillAgentKey(agentId)
  let bySkill = _invokedSkillsByAgent.get(key)
  if (!bySkill) {
    bySkill = new Map()
    _invokedSkillsByAgent.set(key, bySkill)
  }
  // 重调 = 刷新（content/invokedAt 更新；createSkillAttachmentIfNeeded 按
  // invokedAt 降序排 → 最近调用优先，预算超限时最不相关的 skill 被降级）
  bySkill.set(skillName, {
    skillName,
    skillPath,
    content,
    invokedAt: Date.now(),
  })
}
export const addSlowOperation : any = (() => ({})) as any;
export interface AttributedCounter {
  add(value: number, attributes?: Record<string, unknown>): void
}
/** FX-04：fork 支完成后释放该 agent 的 invoked-skill 态（SkillTool.ts:204）。 */
export function clearInvokedSkillsForAgent(agentId: string | null): void {
  _invokedSkillsByAgent.delete(_invokedSkillAgentKey(agentId))
}
export const flushInteractionTime : any = (() => ({})) as any;
const _activeTimeCounter: any = {
  add: (_v: any, _tags?: any) => {},
  observe: (_v: any, _tags?: any) => {},
  _total: 0,
}
export const getActiveTimeCounter : any = (() => _activeTimeCounter) as any;
export const getAdditionalDirectoriesForClaudeMd: any = () => [];
export const getAgentColorMap: any = (() => _agentColorMap) as any;
export const getAllowedSettingSources: any = () => ['userSettings'];
export const getBudgetContinuationCount : any = (() => ({})) as any;
export const getCodeEditToolDecisionCounter : any = (() => ({})) as any;
export const getCommitCounter : any = (() => ({})) as any;
export const getCurrentTurnTokenBudget : any = (() => ({})) as any;
export const getDirectConnectServerUrl: any = () => null;
// De-Claude: the initial main-loop model is config-driven — read from the
// config file (settings.json) via settings.defaultRole + settings.modelRoles.
// `defaultRole` selects which of the three roles (premium/small/fast) is the
// default; the actual model ID comes from modelRoles.<role>.model. No hardcoding.
export const getInitialMainLoopModel: any = () => {
  const settings = getSettings_DEPRECATED() || {}
  const defaultRole: ModelRole = ((settings as any).defaultRole as ModelRole) || 'small'
  // 未接线（EndpointConfigSource 空 stub）或角色池未配时 getRoleModel 返回
  // undefined；回落 null（"用默认"语义）绝不为 undefined——否则 main.tsx
  // initialState 冻结 mainLoopModel=undefined → /model 选择器 modelDisplayString
  // (undefined) 渲染 "undefined ()" 伪行 + Select 值键卡死（§8.74.31 model-
  // picker 修，#202）。兼防 modelOptions.ts:205 customModel=undefined →
  // isModelAllowed(undefined) 潜在崩。
  return getRoleModel(defaultRole) ?? null
}
export const getInlinePlugins : any = (() => ({})) as any;
/**
 * FX-04：取该 agent 的 invoked-skill 态（compact.ts createSkillAttachmentIfNeeded
 * 消费 `.size`/`.values()`；未登记 agent 返空 Map——非 undefined、非他 agent 的
 * Map）。
 */
export function getInvokedSkillsForAgent(
  agentId: string | null | undefined,
): Map<string, InvokedSkillRecord> {
  return _invokedSkillsByAgent.get(_invokedSkillAgentKey(agentId)) ?? new Map()
}
// Remote mode is always false in this build (the main.tsx --remote/--teleport
// paths were removed with Remote Control, W-opt 可信波 S1 §8.74.29, #299).
// Must default to boolean false — a truthy stub (e.g. `() => ({})`) makes
// every `if (getIsRemoteMode()) return` guard misfire in local TUI: /session
// (remote QR command) passes its isEnabled gate and renders "(no content)".
let _isRemoteMode = false
export const getIsRemoteMode : any = () => _isRemoteMode;
export const getIsScrollDraining : any = (() => ({})) as any;
export const getLastAPIRequest : any = (() => ({})) as any;
export const getLastInteractionTime : any = (() => ({})) as any;
const _locCounter: any = {
  add: (_v: any, _tags?: any) => {},
  _total: 0,
}
export const getLocCounter : any = (() => _locCounter) as any;
let _mainLoopModelOverride: string | undefined = undefined
export const getMainLoopModelOverride: any = () => _mainLoopModelOverride
export const getPlanSlugCache: any = () => new Map();
export const getPrCounter : any = (() => ({})) as any;
export const getPromptId : any = (() => ({})) as any;
export const getRegisteredHooks: any = () => [];
export const getSdkAgentProgressSummariesEnabled : any = (() => ({})) as any;
export const getSdkBetas: any = () => [];
export const getSessionCounter : any = (() => ({})) as any;
export const getSlowOperations: any = () => [];
export const getStrictToolResultPairing : any = (() => ({})) as any;
export const getTurnClassifierCount : any = () => _turnClassifierCount;
export const getTurnClassifierDurationMs : any = () => _turnClassifierDurationMs;
export const getTurnHookCount : any = () => _turnHookCount;
export const getTurnHookDurationMs : any = () => _turnHookDurationMs;
export const getTurnOutputTokens : any = () => 0; // TOKEN_BUDGET feature off by default
export const getTurnToolCount : any = () => _turnToolCount;
export const getTurnToolDurationMs : any = () => _turnToolDurationMs;
export const getUseCoworkPlugins: any = () => false;
export const handlePlanModeTransition : any = (() => ({})) as any;
export const hasShownLspRecommendationThisSession : any = (() => ({})) as any;
export const isReplBridgeActive : any = (() => ({})) as any;
export const markPostCompaction : any = (() => ({})) as any;
export const markScrollActivity : any = (() => ({})) as any;
export const registerHookCallbacks : any = (() => ({})) as any;
export const resetSdkInitState : any = (() => ({})) as any;
export const resetTurnClassifierDuration : any = () => { _turnClassifierDurationMs = 0; _turnClassifierCount = 0 };
export const resetTurnHookDuration : any = () => { _turnHookDurationMs = 0; _turnHookCount = 0 };
export const resetTurnToolDuration : any = () => { _turnToolDurationMs = 0; _turnToolCount = 0 };
export const setAdditionalDirectoriesForClaudeMd: any = (_v: any) => {};
export const setAllowedSettingSources : any = (() => ({})) as any;
export const setDirectConnectServerUrl : any = (() => ({})) as any;
export const setHasExitedPlanMode : any = (() => ({})) as any;
export const setInitialMainLoopModel : any = (() => ({})) as any;
export const setInlinePlugins : any = (() => ({})) as any;
export const setIsRemoteMode : any = (v: boolean) => { _isRemoteMode = v };
export const setLspRecommendationShownThisSession : any = (() => ({})) as any;
export const setMainLoopModelOverride: any = (model: string | undefined) => {
  _mainLoopModelOverride = model
}
export const setMeter : any = (() => ({})) as any;
export const setNeedsAutoModeExitAttachment : any = (() => ({})) as any;
export const setNeedsPlanModeExitAttachment : any = (() => ({})) as any;
export const setPromptId : any = (() => ({})) as any;
export const setScheduledTasksEnabled : any = (() => ({})) as any;
export const setSdkBetas: any = (_v: any) => {};
export const setStatsStore : any = (() => ({})) as any;
export const setTeleportedSessionInfo : any = (() => ({})) as any;
export const setUseCoworkPlugins : any = (() => ({})) as any;
export const snapshotOutputTokensForTurn : any = (_budget: number | null) => {
  // TOKEN_BUDGET feature is off by default; turn output token tracking is a
  // no-op snapshot until that feature lands. Keeping the signature so the
  // REPL call sites stay valid.
};
export const updateLastInteractionTime : any = (() => ({})) as any;
export const waitForScrollIdle : any = (() => ({})) as any;
export const getFlagSettingsInline: any = () => null;
export const setLastEmittedDate : any = (() => ({})) as any;
export const regenerateSessionId : any = (() => ({})) as any;
export const clearBetaHeaderLatches : any = (() => ({})) as any;
export const clearSystemPromptSectionState: any = (() => { _spSectionCache.clear(); }) as any;
export const getSystemPromptSectionCache: any = (() => _spSectionCache) as any;
export const setSystemPromptSectionCacheEntry: any = ((name: string, value: string | null) => { _spSectionCache.set(name, value); }) as any;
export const setCachedClaudeMdContent : any = (() => ({})) as any;
export const getLastApiCompletionTimestamp : any = (() => ({})) as any;
// P0 分类器崩溃修（#279 波 C 合流）：这两枚 getter 的契约 = `string[] | null`
// （allowlist）/ `boolean | null`（eligible，null = 未定），metadata.ts
// should1hCacheTTL 的 `=== null` 守按 null=未定设计。旧 stub 返 `{}`（既非
// 数组也非 null）漏接该守 → `{}.some` 抛 TypeError 崩 auto-mode 分类器链。
// 改返 `null` = 正确「特性未接线」哨兵（eligible→false / allowlist→[]）。
export const getPromptCache1hAllowlist : any = (() => null) as any;
export const getPromptCache1hEligible : any = (() => null) as any;
export const setPromptCache1hAllowlist : any = (() => ({})) as any;
export const setPromptCache1hEligible : any = (() => ({})) as any;
export const setLastApiCompletionTimestamp : any = (() => ({})) as any;
export const hasExitedPlanModeInSession : any = (() => ({})) as any;
export const getLastEmittedDate : any = (() => ({})) as any;
export const preferThirdPartyAuthentication : any = (() => ({})) as any;
export const getApiKeyFromFd : any = (() => ({})) as any;
export const getOauthTokenFromFd : any = (() => ({})) as any;
export const setApiKeyFromFd : any = (() => ({})) as any;
export const setOauthTokenFromFd : any = (() => ({})) as any;
export const onSessionSwitch : any = (() => ({})) as any;
export const getSessionCronTasks : any = (() => ({})) as any;
export const removeSessionCronTasks : any = (() => ({})) as any;
export const addSessionCronTask : any = (() => ({})) as any;
export const getCachedClaudeMdContent : any = (() => ({})) as any;
export const setLastClassifierRequests : any = (() => ({})) as any;
export const clearRegisteredPluginHooks : any = (() => ({})) as any;
export const getSessionIngressToken : any = (() => ({})) as any;
export const setSessionIngressToken : any = (() => ({})) as any;
export const getSessionProjectDir : any = () => null;
export const getLastMainRequestId : any = (() => ({})) as any;
export const getTokenCounter : any = () => null; // OTel token counter — optional, cost-tracker uses ?.
export const getStatsStore : any = (() => null) as any;
export const getFlagSettingsPath: any = () => '/tmp/.claude-flags.json';
export const needsPlanModeExitAttachment : any = (() => ({})) as any;
export const needsAutoModeExitAttachment : any = (() => ({})) as any;
export const getScheduledTasksEnabled : any = (() => ({})) as any;
// Turn-level duration accumulators (reset per query turn in REPL, read for
// ant-only API metrics). addToTurnHookDuration also bumps the count — the
// count getters are only consumed together with the durations.
let _turnHookDurationMs = 0
let _turnHookCount = 0
let _turnToolDurationMs = 0
let _turnToolCount = 0
let _turnClassifierDurationMs = 0
let _turnClassifierCount = 0

export const addToTurnHookDuration : any = (durationMs: number) => {
  _turnHookDurationMs += durationMs
  _turnHookCount++
};
export const setLastAPIRequest : any = (() => ({})) as any;
export const setLastAPIRequestMessages : any = (() => ({})) as any;
export const handleAutoModeTransition : any = (() => ({})) as any;
export const addToTurnClassifierDuration : any = (durationMs: number) => {
  _turnClassifierDurationMs += durationMs
  _turnClassifierCount++
};
export const getLastClassifierRequests : any = (() => ({})) as any;
export const clearInvokedSkills : any = (() => ({})) as any;
