#!/bin/bash
J=/home/vince/.claude/jobs/09264df0/tmp/gate-072
R=/home/vince/projects/AtlasCode/worktrees/worktree-0.1.72-de-ant-closure
U=/home/vince/projects/AtlasCode/user-e2e
cd /home/vince/projects/AtlasCode
run() { # name outdir script args...
  local name=$1 outdir=$2 script=$3; shift 3
  echo "=== START $name $(date '+%H:%M:%S') ==="
  local dir="$J/$outdir"; mkdir -p "$dir"
  env ATLAS_E2E_REPO="$R" ATLAS_E2E_AUTO59_REPO="$R" ATLAS_E2E_AUTO59_OUT="$dir" "$@" bun run "$U/$script" > "$dir/stdout.log" 2>&1
  local rc=$?
  echo "=== DONE $name rc=$rc $(date '+%H:%M:%S') ==="
  grep -aE 'verdict|GATE-|PASS|FAIL|RELEASABLE|BLOCKED|SC-|hardFail' "$dir/stdout.log" | tail -8
}
run p0a  p0a  tui-diff/accept.ts --release-gate --target-version 0.1.72
run a4f  a4f  auto-mode-059.ts
run cmd  cmd  tui-diff/slashslim-042.ts cmd
run help help tui-diff/slashslim-042.ts help ATLAS_E2E_HELP_SET=062
echo "=== ALL-072-PROBES-DONE $(date '+%H:%M:%S') ==="
