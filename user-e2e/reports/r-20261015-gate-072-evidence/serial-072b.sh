#!/bin/bash
J=/home/vince/.claude/jobs/09264df0/tmp/gate-072
R=/home/vince/projects/AtlasCode/worktrees/worktree-0.1.72-de-ant-closure
U=/home/vince/projects/AtlasCode/user-e2e
cd /home/vince/projects/AtlasCode
run() { # name dir cmd...
  local name=$1 dir=$2; shift 2
  mkdir -p "$J/$dir"
  echo "=== START $name $(date '+%H:%M:%S') ==="
  "$@" > "$J/$dir/stdout.log" 2>&1
  local rc=$?
  echo "=== DONE $name rc=$rc $(date '+%H:%M:%S') ==="
  grep -aE 'verdict|GATE-|PASS|FAIL|RELEASABLE|BLOCKED|SC-|hardFail|expect' "$J/$dir/stdout.log" | tail -8
}
run p0a  p0a  env ATLAS_E2E_REPO="$R" bun run "$U/tui-diff/accept.ts" --release-gate --target-version 0.1.72
run cmd  cmd  env ATLAS_E2E_REPO="$R" bun run "$U/tui-diff/slashslim-042.ts" cmd
run help help env ATLAS_E2E_REPO="$R" ATLAS_E2E_HELP_SET=062 bun run "$U/tui-diff/slashslim-042.ts" help
echo "=== RERUN-DONE $(date '+%H:%M:%S') ==="
