// Reconstructed bootstrap/state.ts - stub exports
// Generated from consumer import analysis
import { randomUUID } from 'crypto'
import { getSettings_DEPRECATED } from 'src/tui/utils/settings/settings.js'
// M2 (docs/06): 角色注册表已迁入 core/modelprovider/roles.js
import { getRoleModel, type ModelRole } from 'src/modelprovider'
// W2-2d drift ③（§8.74.3）：cost 类型切 domain 单源（本地 type 遮蔽核销；
// 与 src/bootstrap/state.ts:219/229 逐字段一致已核验）
import type { CostModelUsage, CostState } from 'src/bootstrap'

let _spSectionCache: Map<string, string | null> = new Map()
let _agentColorMap: Map<string, string> = new Map()
// Reconstructed-stub fix: real module-level interactive flag, mirroring the
// _isRemoteMode pattern (see getIsRemoteMode/setIsRemoteMode below). Previously
// getIsInteractive/getIsNonInteractiveSession were no-op stubs, which broke the
// -p/non-TTY non-interactive branch in main.tsx (Ink TUI still mounted → stdout
// pollution; headless permission prompts hung). main.tsx:788 sets it.
let _isNonInteractiveSession = false

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
export const getClientType : any = (() => ({})) as any;
export const getCodeEditToolDecisionCounter : any = (() => ({})) as any;
export const getCommitCounter : any = (() => ({})) as any;
export const getCurrentTurnTokenBudget : any = (() => ({})) as any;
// cwd / originalCwd are real mutable state: setCwdState/setOriginalCwd
// (no-op stubs would leave the hardcoded fallback below in place forever,
// so the TUI would report the launcher's directory instead of the launch dir).
// Initialize from the process cwd at module load — i.e. where the user
// started the TUI — then setup() (setCwd → setCwdState) refines it.
let _cwdState: string = process.cwd()
export const getCwdState: any = () => _cwdState;
export const getDirectConnectServerUrl: any = () => null;
export const getEventLogger: any = () => null;
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
export const getIsInteractive: any = () => !_isNonInteractiveSession;
export const getIsNonInteractiveSession: any = () => _isNonInteractiveSession;
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
export const getMainThreadAgentType : any = (() => ({})) as any;
let _originalCwd: string = process.cwd()
export const getOriginalCwd: any = () => _originalCwd;
export const getPlanSlugCache: any = () => new Map();
export const getPrCounter : any = (() => ({})) as any;
export const getProjectRoot: any = (() => {
  // Walk upward from the process cwd to the nearest directory containing a .git
  // entry (file for worktrees, directory for normal repos). Fall back to cwd.
  const { existsSync } = require('fs')
  const { join, dirname } = require('path')
  let dir = process.cwd()
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return process.cwd()
    dir = parent
  }
}) as any;
export const getPromptId : any = (() => ({})) as any;
export const getQuestionPreviewFormat : any = (() => ({})) as any;
export const getRegisteredHooks: any = () => [];
export const getSdkAgentProgressSummariesEnabled : any = (() => ({})) as any;
export const getSdkBetas: any = () => [];
export const getSessionCounter : any = (() => ({})) as any;
export const getSessionCreatedTeams : any = (() => ({})) as any;
let _sessionId: string = randomUUID()
export const getSessionId: any = () => _sessionId;
export const getSessionTrustAccepted : any = (() => ({})) as any;
export const getSlowOperations: any = () => [];
export const getStrictToolResultPairing : any = (() => ({})) as any;
// ---------------------------------------------------------------------------
// Cost state (session usage accumulators)
//
// Consumers:
// - cost-tracker.ts formatTotalCost() → /cost display & exit summary
// - StatusLine.tsx / QueryEngine result messages / permissions classifier
// Writers:
// - core/orchestrator/tools/toolExecution.ts addToToolDuration()
// - utils/diff.ts addToTotalLinesChanged()
// - cost-tracker.ts addToTotalSessionCost() → addToTotalCostState()
// Restore/reset: setCostStateForRestore() (/resume), resetCostState() (/clear)
// ---------------------------------------------------------------------------
// CostModelUsage / CostState 本地定义已删（W2-2d drift ③：切 src/bootstrap
// 单源 import type，见文件头）
function freshCostState(): CostState {
  return {
    totalAPIDuration: 0,
    totalAPIDurationWithoutRetries: 0,
    totalToolDuration: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
    modelUsage: {},
  }
}

let _costState: CostState = freshCostState()

export const addToTotalCostState : any = (modelUsage: CostModelUsage, model: string) => {
  // Token totals are derived from per-model usage on read, mirroring the
  // original single-source-of-truth design.
  _costState.modelUsage[model] = { ...modelUsage }
};

export const addToTotalLinesChanged : any = (added: number, removed: number) => {
  _costState.totalLinesAdded += added
  _costState.totalLinesRemoved += removed
};

export const getModelUsage: any = () => _costState.modelUsage;

export const getTotalAPIDuration : any = () => _costState.totalAPIDuration;

export const getTotalAPIDurationWithoutRetries : any = () => _costState.totalAPIDurationWithoutRetries;

export const getTotalInputTokens : any = () =>
  Object.values(_costState.modelUsage).reduce((sum, u) => sum + u.inputTokens, 0);

export const getTotalCacheCreationInputTokens : any = () =>
  Object.values(_costState.modelUsage).reduce((sum, u) => sum + u.cacheCreationInputTokens, 0);

export const getTotalDuration : any = () =>
  // Wall duration ≈ API duration + tool duration; the original tracked wall
  // time separately, this approximation keeps /cost sane in stub mode.
  _costState.totalAPIDuration + _costState.totalToolDuration;

export const getTotalLinesAdded : any = () => _costState.totalLinesAdded;

export const getTotalLinesRemoved : any = () => _costState.totalLinesRemoved;

export const getTotalToolDuration : any = () => _costState.totalToolDuration;

export const getTotalWebSearchRequests : any = () =>
  Object.values(_costState.modelUsage).reduce((sum, u) => sum + u.webSearchRequests, 0);

export const getUsageForModel : any = (model: string) => _costState.modelUsage[model];

export const resetStateForTests : any = () => { _costState = freshCostState() };
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
let _sessionPersistenceDisabled = false
export const isSessionPersistenceDisabled: any = () => _sessionPersistenceDisabled;
export const markPostCompaction : any = (() => ({})) as any;
export const markScrollActivity : any = (() => ({})) as any;
export const registerHookCallbacks : any = (() => ({})) as any;
export const resetCostState : any = () => { _costState = freshCostState() };
export const resetSdkInitState : any = (() => ({})) as any;
export const resetTurnClassifierDuration : any = () => { _turnClassifierDurationMs = 0; _turnClassifierCount = 0 };
export const resetTurnHookDuration : any = () => { _turnHookDurationMs = 0; _turnHookCount = 0 };
export const resetTurnToolDuration : any = () => { _turnToolDurationMs = 0; _turnToolCount = 0 };
export const setAdditionalDirectoriesForClaudeMd: any = (_v: any) => {};
export const setAllowedSettingSources : any = (() => ({})) as any;
export const setClientType : any = (() => ({})) as any;
export const setCostStateForRestore : any = (data: {
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  modelUsage?: Record<string, CostModelUsage>
}) => {
  _costState = {
    totalAPIDuration: data.totalAPIDuration ?? 0,
    totalAPIDurationWithoutRetries: data.totalAPIDurationWithoutRetries ?? 0,
    totalToolDuration: data.totalToolDuration ?? 0,
    totalLinesAdded: data.totalLinesAdded ?? 0,
    totalLinesRemoved: data.totalLinesRemoved ?? 0,
    modelUsage: data.modelUsage ? { ...data.modelUsage } : {},
  }
};
export const setCwdState : any = (v: string) => { _cwdState = v; };
export const setDirectConnectServerUrl : any = (() => ({})) as any;
export const setFlagSettingsPath : any = (() => ({})) as any;
export const setHasExitedPlanMode : any = (() => ({})) as any;
export const setInitialMainLoopModel : any = (() => ({})) as any;
export const setInlinePlugins : any = (() => ({})) as any;
export const setIsInteractive: any = (v: boolean) => { _isNonInteractiveSession = !v };
export const setIsRemoteMode : any = (v: boolean) => { _isRemoteMode = v };
export const setLspRecommendationShownThisSession : any = (() => ({})) as any;
export const setMainLoopModelOverride: any = (model: string | undefined) => {
  _mainLoopModelOverride = model
}
export const setMainThreadAgentType : any = (() => ({})) as any;
export const setMeter : any = (() => ({})) as any;
export const setNeedsAutoModeExitAttachment : any = (() => ({})) as any;
export const setNeedsPlanModeExitAttachment : any = (() => ({})) as any;
export const setOriginalCwd : any = (v: string) => { _originalCwd = v; };
export const setPromptId : any = (() => ({})) as any;
export const setQuestionPreviewFormat : any = (() => ({})) as any;
export const setScheduledTasksEnabled : any = (() => ({})) as any;
export const setSdkBetas: any = (_v: any) => {};
export const setSessionBypassPermissionsMode : any = (() => ({})) as any;
export const setSessionPersistenceDisabled: any = (v: boolean) => {
  _sessionPersistenceDisabled = v;
};
export const setSessionSource : any = (() => ({})) as any;
export const setSessionTrustAccepted : any = (() => ({})) as any;
export const setStatsStore : any = (() => ({})) as any;
export const setTeleportedSessionInfo : any = (() => ({})) as any;
export const setUseCoworkPlugins : any = (() => ({})) as any;
export const snapshotOutputTokensForTurn : any = (_budget: number | null) => {
  // TOKEN_BUDGET feature is off by default; turn output token tracking is a
  // no-op snapshot until that feature lands. Keeping the signature so the
  // REPL call sites stay valid.
};
export const switchSession: any = (id: string, _projectDir?: string | null) => {
  if (id) _sessionId = id;
};
export const updateLastInteractionTime : any = (() => ({})) as any;
export const waitForScrollIdle : any = (() => ({})) as any;
export const setInitJsonSchema : any = (() => ({})) as any;
export const getInitJsonSchema : any = (() => ({})) as any;
export const getFlagSettingsInline: any = () => null;
export const setFlagSettingsInline : any = (() => ({})) as any;
export const setLastEmittedDate : any = (() => ({})) as any;
export const regenerateSessionId : any = (() => ({})) as any;
export const clearBetaHeaderLatches : any = (() => ({})) as any;
export const clearSystemPromptSectionState: any = (() => { _spSectionCache.clear(); }) as any;
export const getSystemPromptSectionCache: any = (() => _spSectionCache) as any;
export const setSystemPromptSectionEntry: any = ((name: string, value: string | null) => { _spSectionCache.set(name, value); }) as any;
export const setSystemPromptSectionCacheEntry: any = ((name: string, value: string | null) => { _spSectionCache.set(name, value); }) as any;
export const setCachedClaudeMdContent : any = (() => ({})) as any;
// (cost-state accumulators are implemented above, in the Cost state section)
export const getAfkModeHeaderLatched : any = (() => ({})) as any;
export const getCacheEditingHeaderLatched : any = (() => ({})) as any;
export const getLastApiCompletionTimestamp : any = (() => ({})) as any;
export const getPromptCache1hAllowlist : any = (() => ({})) as any;
export const getPromptCache1hEligible : any = (() => ({})) as any;
export const getThinkingClearLatched : any = (() => ({})) as any;
export const setAfkModeHeaderLatched : any = (() => ({})) as any;
export const setCacheEditingHeaderLatched : any = (() => ({})) as any;
export const setPromptCache1hAllowlist : any = (() => ({})) as any;
export const setPromptCache1hEligible : any = (() => ({})) as any;
export const setThinkingClearLatched : any = (() => ({})) as any;
export const addToTotalDurationState : any = (withRetries: number, withoutRetries: number) => {
  _costState.totalAPIDuration += withRetries
  _costState.totalAPIDurationWithoutRetries += withoutRetries
};
export const consumePostCompaction : any = (() => ({})) as any;
export const markFirstTeleportMessageLogged : any = (() => ({})) as any;
export const setLastApiCompletionTimestamp : any = (() => ({})) as any;
export const addToToolDuration : any = (durationMs: number) => {
  _costState.totalToolDuration += durationMs
};
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
export const getLoggerProvider : any = (() => ({})) as any;
export const getMeterProvider : any = (() => ({})) as any;
export const getTracerProvider : any = (() => ({})) as any;
export const setLoggerProvider : any = (() => ({})) as any;
export const setMeterProvider : any = (() => ({})) as any;
export const setTracerProvider : any = (() => ({})) as any;
export const setSdkAgentProgressSummariesEnabled : any = (() => ({})) as any;
export const getLastMainRequestId : any = (() => ({})) as any;
export const getTokenCounter : any = () => null; // OTel token counter — optional, cost-tracker uses ?.
export const getTotalCacheReadInputTokens : any = () =>
  Object.values(_costState.modelUsage).reduce((sum, u) => sum + u.cacheReadInputTokens, 0);

export const getTotalOutputTokens : any = () =>
  Object.values(_costState.modelUsage).reduce((sum, u) => sum + u.outputTokens, 0);
export const incrementBudgetContinuationCount : any = (() => ({})) as any;
export const getParentSessionId : any = (() => ({})) as any;
export const setLastMainRequestId : any = (() => ({})) as any;
export const getTeleportedSessionInfo : any = (() => ({})) as any;
export const getStatsStore : any = (() => null) as any;
export const setProjectRoot : any = (() => ({})) as any;
export const getFlagSettingsPath: any = () => '/tmp/.claude-flags.json';
export const getSessionBypassPermissionsMode : any = (() => ({})) as any;
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
export const setEventLogger : any = (() => ({})) as any;
export const clearInvokedSkills : any = (() => ({})) as any;
