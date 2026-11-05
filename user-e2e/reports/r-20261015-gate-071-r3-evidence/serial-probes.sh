#!/bin/bash
R=/home/vince/projects/AtlasCode/worktrees/worktree-gate-071; U=/home/vince/projects/AtlasCode/user-e2e; J=/home/vince/.claude/jobs/09264df0/tmp/gate-071r3; UDIR=$U
run() { # name script env...
  local name=$1 script=$2; shift 2
  echo "=== START $name $(date '+%H:%M:%S') ==="
  local out="$J/$name"
  env "$@" ATLAS_E2E_OUT="$out" bun run "$U/$script" > "$out.stdout" 2>&1
  local rc=$?
  local verdict=$(python3 -c "import json,sys
try:
  d=json.load(open('$out/result.json'))
  print(d['verdict'])
except Exception as e:
  print('NO-RESULT', e)" 2>/dev/null)
  echo "=== DONE $name rc=$rc verdict=${verdict:-NO-RESULT} $(date '+%H:%M:%S') ==="
  tail -3 "$out.stdout" 2>/dev/null
}
run bugfix0167 tui-bugfix-0167.ts ATLAS_E2E_BUGFIX0167_REPO="$R"
run compact0168 tui-compact-recovery-0168.ts ATLAS_E2E_COMPACT0168_REPO="$R"
run blockd0169 tui-blockd-0169.ts ATLAS_E2E_BLOCKD0169_REPO="$R"
run gh0170 tui-gh-0170.ts ATLAS_E2E_GH0170_REPO="$R"
run goal0162 tui-goal-0162.ts ATLAS_E2E_GOAL0162_REPO="$R"
run checkin0163 tui-goal-checkin-0163.ts ATLAS_E2E_GOAL0163_REPO="$R"
run prop0163 tui-propose-goal-0163.ts ATLAS_E2E_PROP0163_REPO="$R"
run spin0164 tui-spinner-0164.ts ATLAS_E2E_SPIN0164_REPO="$R"
run quota403-0171 tui-quota403-0171.ts ATLAS_E2E_QUOTA0171_REPO="$R"
run updatenudge-0171 tui-updatenudge-0171.ts ATLAS_E2E_NUDGE0171_REPO="$R"
echo "=== ALL-PROBES-DONE $(date '+%H:%M:%S') ==="
