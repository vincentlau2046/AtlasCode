#!/bin/bash
# 0.1.73 生产 lane 判据②：headless 启动链 --version + PONG-073 活轮
# 沙箱 = 0.1.69 headless-home（H-1 场景：modelRoles 无 per-role apiKey + providers.iff.apiKey 已设）
J=/home/vince/.claude/jobs/09264df0/tmp/prodlane-073
CLI=$J/extracted/package/dist/cli.js
HOME_SB=/home/vince/.claude/jobs/09264df0/tmp/prodlane-069/headless-home

echo "=== [1] --version ==="
HOME=$HOME_SB node "$CLI" --version 2>&1 | head -3

echo "=== [2] PONG-073 活轮（H-1 场景 IFF 往返）==="
HOME=$HOME_SB node "$CLI" -p "Reply with exactly: PONG-073" \
  --model Qwen38-27B-TXT --dangerously-skip-permissions < /dev/null \
  > $J/pong-073.log 2>&1
echo "rc=$?"
echo "--- log 尾部 ---"
tail -12 $J/pong-073.log
echo "--- marker 核 ---"
grep -c 'PONG-073' $J/pong-073.log
grep -a 'atlas\]\[exit\]' $J/pong-073.log | tail -1
echo "--- anthropic 可达核（应 0）---"
grep -ac 'api\.anthropic\.com' $J/pong-073.log
grep -ac 'not enough quota' $J/pong-073.log