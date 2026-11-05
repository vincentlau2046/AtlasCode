# 0.1.72 gate 判据⑤b：前 16 波（0.1.56–0.1.71）token 零回归 @ 被测 worktree dist（确定性 .count()）
def rd(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()
g72 = rd('/home/vince/projects/AtlasCode/worktrees/worktree-0.1.72-de-ant-closure/dist/cli.js')
g71 = rd('/home/vince/projects/AtlasCode/worktrees/worktree-gate-071/dist/cli.js')  # 0.1.71 波体 build
# 前 16 波 token（0.1.56–0.1.70 沿用 0.1.71 prodlane 口径 + 0.1.71 本波 12 token）
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
}
print('bytes: g71(0.1.71 wave build)=%d g72(0.1.72 worktree)=%d' % (len(g71), len(g72)))
diffs=[]; total=0
for w,toks in prior.items():
    for t in toks:
        c71,c72 = g71.count(t), g72.count(t)
        total+=1
        if c71!=c72:
            diffs.append((w,t,c71,c72))
            print('DIFF %-6s %-42s 071=%-4d 072=%-4d' % (w,t,c71,c72))
print('total prior tokens=%d diffs=%d' % (total, len(diffs)))
for d in diffs: print('  DIFF:', d)
# keychain 清零面核（0.1.72 波体应删的 anthropic keychain 读/写支 @ dist）
print('--- 0.1.72 波体 keychain 清零面 @ dist（anthropic 路径应减/0，OOS secureStorage 保留）---')
for t in ['find-generic-password','add-generic-password','delete-generic-password','keychainPrefetch','getLegacyApiKeyPrefetchResult','maybeRemoveApiKeyFromMacOSKeychain']:
    print('%-36s 071=%-4d 072=%-4d' % (t, g71.count(t), g72.count(t)))
