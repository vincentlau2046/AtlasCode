/**
 * messaging 域 — 域内本地化常量 + schema 面（E-7 S-7e d1，§8.50）。
 *
 * 旧仓外部依赖面域内本地化（串/枚举值逐字；import 面 delta 登记）：
 *   - TEAMMATE_MESSAGE_TAG：旧 constants/xml.ts:52 `'teammate-message'`
 *     （旧 xml 常量族余面 = shell 消息域，不随迁）。
 *   - TEAM_LEAD_NAME：旧 swarm/constants.ts:33 `'team-lead'`（该文件其余
 *     TMUX/SWARM 常量族 = shell/swarm 波，不随迁，H6 登记）。
 *   - SEND_MESSAGE_TOOL_NAME：旧 tools/SendMessageTool/constants.ts:1
 *     `'SendMessage'`（工具本体归工具本体波；引擎面仅消费常量串）。引擎级
 *     单一源 = tools 域 toolNames.ts:43（同值 'SendMessage'，E-2 随迁）；
 *     本域常量值恒等于之（旧仓同源逐字），仅域门面自持、不出 engine 引擎
 *     面（避免与 tools 块重名——engine/index.ts messaging 块头注登记）。
 *     未来工具本体波 SendMessageTool wrapper 若需该常量，自 tools 域取
 *     （依赖方向 工具 → messaging 单向，不反引 messaging 域常量）。
 *   - PermissionModeSchema：旧 entrypoints/sdk/coreSchemas.ts:336（5 值
 *     enum 值逐字；.describe 散文裁——引擎面无 JSON schema describe 消费
 *     者，SDK 输出面归 SDK 波；import 面 delta 旧 zod/v4 → 新 zod 主入口）。
 *   - BackendType：旧 swarm/backends/types.ts 全 `: any` stub 退化面 →
 *     string 最小形（mailbox schema z.string().optional() 对齐；H6：
 *     绝不把 `: any` stub 签名当真行为）。
 */
import { z } from 'zod'
import { lazySchema } from '../../shared'

export const TEAMMATE_MESSAGE_TAG = 'teammate-message'
export const TEAM_LEAD_NAME = 'team-lead'
export const SEND_MESSAGE_TOOL_NAME = 'SendMessage'

/** 旧 sdk/coreSchemas.ts:336 5 值 enum 值逐字（域内最小形，见文件头登记）。 */
export const PermissionModeSchema = lazySchema(() =>
  z.enum(['default', 'acceptEdits', 'bypassPermissions', 'plan', 'dontAsk']),
)

/** 旧 swarm/backends/types.ts any-stub 退化面 → string 最小形（见文件头登记）。 */
export type BackendType = string
