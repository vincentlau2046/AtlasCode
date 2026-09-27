/**
 * engine/tools/mcp — 输出行截断判定（旧仓 utils/terminal.ts
 * isOutputLineTruncated L119-131 逐字随迁，§8.63 S-E2；新仓 0-hit → 子域
 * 本地，MAX_LINES_TO_SHOW = 3 旧 L7 逐字）。
 *
 * 消费方：ListMcp/ReadMcp isResultTruncated（jsonStringify(output) 入参）。
 */
const MAX_LINES_TO_SHOW = 3

export function isOutputLineTruncated(content: string): boolean {
  let pos = 0
  // Need more than MAX_LINES_TO_SHOW newlines (content fills > 3 lines).
  // The +1 accounts for wrapText showing an extra line when remainingLines==1.
  for (let i = 0; i <= MAX_LINES_TO_SHOW; i++) {
    pos = content.indexOf('\n', pos)
    if (pos === -1) return false
    pos++
  }
  // A trailing newline is a terminator, not a new line — match
  // renderTruncatedContent's trimEnd() behavior.
  return pos < content.length
}
