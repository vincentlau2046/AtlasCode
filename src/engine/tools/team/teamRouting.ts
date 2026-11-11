/**
 * team 域出站路由 / 判别源共享位（0.1.96 §14，f4 批复 3c509ebd）：
 * resolveOutgoingTeamName 自 sendMessageTool 私有面提共享——0.1.93 W-D-A
 * round-3 RED-C（f4 §7.9）裁定「禁各站旁路第二实现」，共享位即该裁定的
 * 落地面。消费面：sendMessageTool（出站消息路由）+ waitForTeammatesTool
 * （lead pending 扫描，0.1.96 §13 面 3：headless 引擎 lane getTeamName()
 * 三源全空 → 'default' 假目录 → pending_requests 恒空死面）。
 *
 * 域级纪律（f4 §13 立条）：新增代码禁裸 getTeamName()/appState.teamContext
 * 作 lane 判据/路由源，一律经本 resolver（双源：三源链 ∪ TeamCreate 组态
 * store）；零命中格 = a1 contract §13 域级回归格。
 */
import { getTeamName } from '../../messaging'
import { peekTeamContext } from './teamServices'

/**
 * 出站路由 team 解析单源：getTeamName（ALS > dynamicTeamContext >
 * appState.teamContext）→ peekTeamContext（TeamCreate 组态 store）回落；
 * 双源皆缺 = undefined → 调用站 fail-closed（禁静默落 teams/default/
 * 黑洞桶——round 3 e2e 直证：lead→member 9-14 体滞留 default read:false
 * 零消费者）。
 */
export function resolveOutgoingTeamName(teamContext?: {
  teamName: string
}): string | undefined {
  return getTeamName(teamContext) ?? peekTeamContext()?.teamName
}
