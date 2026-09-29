// Reconstructed bootstrap/state.ts - stub exports
// Generated from consumer import analysis
import { getSettings_DEPRECATED } from 'src/tui/utils/settings/settings.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleModel, type ModelRole } from 'src/modelprovider'

let _spSectionCache: Map<string, string | null> = new Map()
let _agentColorMap: Map<string, string> = new Map()

export const addInvokedSkill : any = (() => ({})) as any;
export const addSlowOperation : any = (() => ({})) as any;
export interface AttributedCounter {
  add(value: number, attributes?: Record<string, unknown>): void
}
export const clearInvokedSkillsForAgent : any = (() => ({})) as any;
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
  return getRoleModel(defaultRole)
}
export const getInlinePlugins : any = (() => ({})) as any;
// Consumer (compact.ts createSkillAttachmentIfNeeded) calls `.size` and `.values()`,
// so the stub MUST return a Map (not a plain object). Empty Map + the no-op
// addInvokedSkill stub means skill attachments are skipped in stubbed mode.
export const getInvokedSkillsForAgent : any = (() => new Map()) as any;
// Remote mode is only set by main.tsx --remote/--teleport paths. Must default
// to boolean false — a truthy stub (e.g. `() => ({})`) makes every
// `if (getIsRemoteMode()) return` guard misfire in local TUI: /session (remote
// QR command) passes its isEnabled gate and renders "(no content)".
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
export const getPromptCache1hAllowlist : any = (() => ({})) as any;
export const getPromptCache1hEligible : any = (() => ({})) as any;
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
