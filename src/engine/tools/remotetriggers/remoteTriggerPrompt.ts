/**
 * engine/tools/remotetriggers — RemoteTrigger prompt 面（§8.68 remote 波
 * S-E2c R3⑩；旧仓 src/tools/RemoteTriggerTool/prompt.ts 15L 逐字随迁）。
 *
 * REMOTE_TRIGGER_TOOL_NAME seed 落 toolNames 块（⑭ 裁定；LSP_TOOL_NAME
 * seed 先例同型，单一事实源）；本文件承载 DESCRIPTION/PROMPT 2 面。
 * 文案含 claude.ai CCR API 旧词面 = 逐字保真（[ATLAS-HOLD] 端点换值随
 * ⑫ 端口供给方 IFF 网关波 / CLI 波，文案届时随面更新，本波不改词）。
 */
export const REMOTE_TRIGGER_DESCRIPTION =
  'Manage scheduled remote Atlas agents (triggers) via the claude.ai CCR API. Auth is handled in-process — the token never reaches the shell.'

export const REMOTE_TRIGGER_PROMPT = `Call the claude.ai remote-trigger API. Use this instead of curl — the OAuth token is added automatically in-process and never exposed.

Actions:
- list: GET /v1/code/triggers
- get: GET /v1/code/triggers/{trigger_id}
- create: POST /v1/code/triggers (requires body)
- update: POST /v1/code/triggers/{trigger_id} (requires body, partial update)
- run: POST /v1/code/triggers/{trigger_id}/run

The response is the raw JSON from the API.`
