/**
 * engine/tools/remotetriggers — RemoteTrigger [ATLAS-HOLD] 注入端口
 * （§8.68 remote 波 S-E2c R3⑫；LSP setLspServerSource / mcp 源注入窗
 * 同型：单供给面 + lazy-init 缺省 + 测试面 clear；PRT-2 顶层零自注册）。
 *
 * 旧仓 call 面全貌（头注登记，H6：call = 登记接缝非空心壳，模型可见
 * 错误面真）：
 *   - axios.request（3-dep 违规面，axios 非五枚依赖）+ timeout 20_000 +
 *     signal: context.abortController.signal（signal 面随真供给方承载）
 *     + validateStatus: () => true（非 2xx 也返 data 面）
 *   - getOAuthTokens()?.accessToken 缺 → 'Not authenticated with a
 *     claude.ai account. Run /login and try again.' /
 *     getGlobalConfig().oauthAccount?.organizationUuid 缺 → 'Unable to
 *     resolve organization UUID.'（OAuth 车道 2026-09-18 endpoint-cleanup
 *     已删，[ATLAS-HOLD]）
 *   - 头面 WIRE_API_VERSION / WIRE_TRIGGERS_BETA（anthropic-beta）+
 *     x-organization-uuid + Bearer
 *   - URL 族 `${getOauthConfig().BASE_API_URL}/v1/code/triggers[/id[/run]]`
 *     = [ATLAS-HOLD] 残留守 URL 族（待 IFF 网关换值）
 *   - 5 动作 switch 校验面（get/update 需 trigger_id / create/update 需
 *     body / run 需 trigger_id + data = {}）= 已随迁工具本体（非本端口）
 * 真供给方 = IFF 网关波 / CLI 波（axios 面或新端点 HTTP 面由供给方承载；
 * 本窗口保持薄，json 字符串化在供给方侧完成）。
 */
import { logForDebugging } from '../../../shared'

/** 单次调用响应面（旧 call 返回 {status, json: jsonStringify(res.data)}
 * 逐字；json = 供给方侧已字符串化 body）。 */
export type RemoteTriggerResponse = {
  status: number
  json: string
}

/** 端口 5 方法（旧 5 动作 1:1）。 */
export type RemoteTriggersPort = {
  listTriggers(): Promise<RemoteTriggerResponse>
  getTrigger(triggerId: string): Promise<RemoteTriggerResponse>
  createTrigger(
    body: Record<string, unknown>,
  ): Promise<RemoteTriggerResponse>
  updateTrigger(
    triggerId: string,
    body: Record<string, unknown>,
  ): Promise<RemoteTriggerResponse>
  runTrigger(triggerId: string): Promise<RemoteTriggerResponse>
}

/** [ATLAS-HOLD] 登记 throw 文案（H6：未注册供给方 = 登记接缝，非假绿）。 */
export const REMOTE_TRIGGERS_HOLD_MESSAGE =
  '[ATLAS-HOLD] remote trigger 端点待 IFF 网关换值；旧仓 claude.ai OAuth 车道已删（axios 非 3-dep 集）'

function makeHoldPort(): RemoteTriggersPort {
  const hold: () => Promise<RemoteTriggerResponse> = () =>
    Promise.reject(new Error(REMOTE_TRIGGERS_HOLD_MESSAGE))
  return {
    listTriggers: hold,
    getTrigger: hold,
    createTrigger: hold,
    updateTrigger: hold,
    runTrigger: hold,
  }
}

let remoteTriggersPort: RemoteTriggersPort | undefined

/** 注册供给面（IFF 网关波 / CLI 波 / 测试内存面；重复注册 = 后者胜出，
 * 单供给面语义同 LSP setLspServerSource）。 */
export function setRemoteTriggersPort(port: RemoteTriggersPort): void {
  remoteTriggersPort = port
  logForDebugging('[REMOTE TRIGGERS] port registered')
}

/** 测试面：清除供给面（回到登记 throw 态）。 */
export function clearRemoteTriggersPort(): void {
  remoteTriggersPort = undefined
}

/** 取端口（未注册 = 登记 throw 供给方；lazy-init ??= 合规）。 */
export function getRemoteTriggersPort(): RemoteTriggersPort {
  return (remoteTriggersPort ??= makeHoldPort())
}
