#!/bin/bash
J=/home/vince/.claude/jobs/09264df0/tmp/gate-072
R=/home/vince/projects/AtlasCode/worktrees/worktree-0.1.72-de-ant-closure
U=/home/vince/projects/AtlasCode/user-e2e
cd /home/vince/projects/AtlasCode
run() { # name script envpair...
  local name=$1 script=$2; shift 2
  local out="$J/fam/$name"; mkdir -p "$out"
  echo "=== START $name $(date '+%H:%M:%S') ==="
  env "$@" ATLAS_E2E_OUT="$out" bun run "$U/$script" > "$out.stdout" 2>&1
  local rc=$?
  local verdict=$(python3 -c "import json
try:
  d=json.load(open('$out/result.json')); print(d['verdict'])
except Exception: print('NO-RESULT')" 2>/dev/null)
  echo "=== DONE $name rc=$rc verdict=${verdict:-NO-RESULT} $(date '+%H:%M:%S') ==="
  tail -2 "$out.stdout" 2>/dev/null
}
# 前 16 波探针族（PTY 串行）
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
# 新活探针 de-ant 残链缺席
run deant0172 tui-deant-closure-0172.ts ATLAS_E2E_DEANT0172_REPO="$R"
echo "=== FAM-DONE $(date '+%H:%M:%S') ==="
