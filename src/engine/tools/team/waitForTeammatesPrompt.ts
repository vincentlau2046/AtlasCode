/**
 * engine/tools/team — WaitForTeammates prompt 面（0.1.93 W-D-A round 5
 * 收敛原语，案 B；prompt 单文件 = TeamDelete prompt 面先例）。
 */

/** 短描述（searchHint / web 族口径别名单源；模块名约定 = DESCRIPTION/PROMPT，族前缀别名在 barrel）。 */
export const DESCRIPTION =
  'Wait for all working in-process teammates to become idle (bounded)'

/** 唯一 prompt 面（description() 消费；TeamDelete delta ④ 先例）。 */
export const PROMPT = `Wait for all currently working in-process teammates to become idle, then return.

Use this tool instead of repeatedly polling with other tools when you are waiting for teammates to finish their work, to acknowledge a shutdown request, or to exit after you sent them instructions. One call replaces many polling rounds.

The call blocks (event-driven, no busy-waiting) until every working teammate is idle, or until the timeout expires:

- On success it returns { status: 'idle', waited_ms, idle }.
- On timeout it returns { status: 'timeout', waited_ms, still_working } listing the teammates that are still working — it never blocks forever. You may call again with a longer timeout, or proceed without those teammates.

This tool never aborts or kills teammates; it only waits. Graceful termination is driven by shutdown requests via SendMessage, and cleanup remains TeamDelete's responsibility. When no teammates are working, it returns immediately with status 'idle'.

Parameters:
- timeout: Maximum time to wait in milliseconds (default 120000, maximum 600000).
`
