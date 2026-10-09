/**
 * remote 域 — UDS inbox 总开关（remote 波 S-E2a，§8.68 R1①）。
 *
 * 旧仓来源（a8af45b）：feature('UDS_INBOX') 编译期门（bun:bundle，gate-OFF =
 * 全部 UDS 支死码；C 桶 ③ 落盘面 = gate-off 逐字，§8.62 S-E2）。新仓
 * feature() 恒 false 不可测（bun:bundle 内建）→ env 门（⑮ isAgentSwarmsEnabled
 * 先例同型）：
 *   - opt-in：ATLAS_EXPERIMENTAL_UDS_INBOX env（isEnvTruthy 面，⑮ 同面）
 *   - 默认 OFF = 旧编译期 gate-OFF 保真（gate-off 面不变量；ON = UDS 5 站点
 *     族面活，gelu swarms 门双向先例同型）
 * 旧仓 UDS 门 = feature 单门（无 growthbook killswitch 站点），无裁支。
 *
 * 消费方 = engine/tools/team SendMessageTool 5 站点族（to description /
 * prompt 2 站点 / checkPermissions bridge ask / validate 4 块 / call 2 支）
 * + prompt 模板（门每次访问重读 = env live，测试面 save/set/restore 三态）。
 *
 * W-opt 可信波 S5（#299）可信清册 C-7 豁免注：UDS messaging（--messaging-socket-path）
 * = 本地 Unix domain socket（非外联），登记豁免。
 */
import { isEnvTruthy } from '../shared'

/** UDS inbox 门（env opt-in，默认 OFF = 旧 gate-OFF 保真）。 */
export function isUdsInboxEnabled(): boolean {
  return isEnvTruthy(process.env.ATLAS_EXPERIMENTAL_UDS_INBOX)
}
