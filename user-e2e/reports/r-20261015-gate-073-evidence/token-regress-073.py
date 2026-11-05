# 0.1.73 gate 判据⑤：前 17 波（0.1.56–0.1.72）token 零回归 @ 被测 worktree dist（确定性 .count()）
def rd(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()
g73 = rd('/home/vince/projects/AtlasCode/worktrees/worktree-0.1.73-de-ant-closure/dist/cli.js')
g72 = rd('/home/vince/projects/AtlasCode/worktrees/worktree-gate-073-base072/dist/cli.js')  # f854828=v0.1.72 基线重建（17892897B 同 gate 自报）
# 前 17 波 token（0.1.56–0.1.71 沿用 0.1.72 gate 口径 + 0.1.72 本波 8 token）
prior = {
 '0.1.56': ['PreModelSwitch','PostModelSwitch'],
 '0.1.57': ['failed to connect','alwaysLoad','Refusing','plugin tag'],
 '0.1.58': ['modelRetryBackoffMs','partialRetained'],
 '0.1.59': ['parametric','hard_deny','permissionPrompts','fallbackModels'],
 '0.1.60': ['output-style','Session working directory','reload-skills','reloadSkillsNow'],
 '0.1.61': ['version-checked','tag-exists'],
 '0.1.62': ['goal_met','goal_continuation','goal-reminder','saveGoalState','GoalOverlay'],
 '0.1.63': ['goalPausedNotification','isGoalPaused','goal_paused','classifyGoalError','goal_unrecoverable','goalCheckInPrompt','GOAL_CHECKIN_BACKOFF','automated goal check-in','goalHookGateNotification','GoalOverlayInner','ProposeGoal','PROPOSE_GOAL_PROMPT'],
 '0.1.64': ['wantsStatusIndicator','computeStallState','showStatusIndicator','getCurrentEndpointLabel','describeEndpointFailure','不可达：已切人工确认'],
 '0.1.65': ['run_in_background','async_launched','runAsyncAgentLifecycle','enqueueAgentNotification','needs_input','wrapPermissionGateForBackground','Do not predict','task-notification','Be cost-aware about delegating','hasNonTerminalTasks','hasPendingBackgroundTasks'],
 '0.1.66': ['ATLAS_AGENT_DEFAULT_FOREGROUND','shouldRunInBackground','backgroundTracker','trackBackgroundAgent','drainPendingBackgroundAgents','hasPendingBackgroundAgents','resetBackgroundAgentTracker','background by default','run_in_background to false','do not poll or sleep'],
 '0.1.67': ['900000','llmTimeoutUnitHint','model-setting','saveSessionModelSetting','globalModelRejectedNotice','reAppendSessionMetadata','resolveAppliedEffort','withEffortForModel','effortByModel','65536'],
 '0.1.68': ['isAutoCompactThresholdPositive','autoCompactDisabledBySmallWindow','AUTOCOMPACT_KEEP_RECENT','createAutoCompactCompact','compactionSkipped','context window too small for auto-compact','preCompactDiscoveredTools'],
 '0.1.69': ['isAutoCompactEnabledForModel','resolveAutoCompactWindow','normalizeAutoCompactWindowSetting','createSummarizeWithFallback','isFallbackEligibleError','isFallbackEligibleResult','createCurrentGitStatusAttachment','git_status_refresh','re-injected after context compaction'],
 '0.1.70': ['chatWithDelta','onStreamDelta','stream_delta','text_delta','tool_use_delta','wantsTokens','onStreamingText','getGlobalApiKey','getRoleModels','getApiKeyFromConfigOrMacOSKeychain'],
 '0.1.71': ['ModelPoolExhaustedError','quota_exhausted','isQuotaExhaustedMessage','Top up your provider quota','ATLAS_UPDATE_CHECK','update-check.json','resolveLatestVersion','UPDATE_NPM_REGISTRY','UPDATE_PKG_SPEC','https://registry.npmjs.org','ATLAS_AUTO_UPDATE','cancelSignal'],
 '0.1.72': ['keychainPrefetch','getLegacyApiKeyPrefetchResult','maybeRemoveApiKeyFromMacOSKeychain','primaryApiKey','getMacOsKeychainStorageServiceName','find-generic-password','add-generic-password','delete-generic-password'],
}
print('bytes: g72(0.1.72 baseline build)=%d g73(0.1.73 worktree)=%d' % (len(g72), len(g73)))
diffs=[]; total=0
for w,toks in prior.items():
    for t in toks:
        c72,c73 = g72.count(t), g73.count(t)
        total+=1
        if c72!=c73:
            diffs.append((w,t,c72,c73))
            print('DIFF %-6s %-42s 072=%-4d 073=%-4d' % (w,t,c72,c73))
print('total prior tokens=%d diffs=%d' % (total, len(diffs)))
for d in diffs: print('  DIFF:', d)
print('--- 0.1.73 波体中性化面 @ dist（072→073 对照，登记面不判红）---')
for t in ['api.anthropic.com','claude.ai','mcp-proxy.anthropic.com','claude-code-20250219','atlas-code-20250219','anthropic-beta']:
    print('%-28s 072=%-4d 073=%-4d' % (t, g72.count(t), g73.count(t)))
