# 0.1.73 生产 lane 判据③④：本波 token @ npm dist（中性化面缺席计数+恒等锚在场）+ 前 17 波零回归
import sys
def rd(p):
    with open(p, encoding='utf-8', errors='replace') as f:
        return f.read()
npm73 = rd(sys.argv[1])   # npm 0.1.73 extracted dist/cli.js
gate73 = rd('/home/vince/projects/AtlasCode/worktrees/worktree-0.1.73-de-ant-closure/dist/cli.js')
npm72 = rd(sys.argv[2])   # npm 0.1.72 extracted dist/cli.js（前 17 波零回归对照面）
print('bytes: gate73=%d npm72=%d npm73=%d' % (len(gate73), len(npm72), len(npm73)))
# 本波 token（中性化面缺席计数 + 恒等锚在场计数 + 登记面对照锚）
this_wave = {
  'C-2a/absent': ['api.anthropic.com','mcp-proxy.anthropic.com'],
  'C-3c/absent': ['claude-code-20250219'],
  'C-3c/anchor': ['atlas-code-20250219'],
  'C-3e-registered': ['claude.ai'],
}
print('--- 本波 token @ npm73（gate73 对照）---')
for grp, toks in this_wave.items():
    for t in toks:
        print('%-28s %-26s gate73=%-4d npm72=%-4d npm73=%-4d' % (grp, t, gate73.count(t), npm72.count(t), npm73.count(t)))
# 前 17 波（0.1.56–0.1.72）token 零回归
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
print('--- 前 17 波（0.1.56–0.1.72）token 零回归 npm72↔npm73 ---')
diffs=[]; total=0
for w,toks in prior.items():
    for t in toks:
        c72,c73 = npm72.count(t), npm73.count(t)
        total+=1
        if c72!=c73:
            diffs.append((w,t,c72,c73))
            print('DIFF %-6s %-42s npm72=%-4d npm73=%-4d' % (w,t,c72,c73))
print('total prior tokens=%d diffs=%d' % (total, len(diffs)))
for d in diffs: print('  DIFF:', d)
# 离场面
print('--- IFF 离场 + 0.1.66 旧句离场 ---')
for t in ['IFF 不可达','foreground (default)','Set run_in_background to true to launch']:
    print('%-42s npm72=%-4d npm73=%-4d' % (t, npm72.count(t), npm73.count(t)))
