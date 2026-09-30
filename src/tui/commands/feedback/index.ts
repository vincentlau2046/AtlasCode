import type { Command } from '../../commands.js'
import { isEnvTruthy } from '../../utils/envUtils.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'

const feedback = {
  aliases: ['bug'],
  type: 'local-jsx',
  name: 'feedback',
  description: `Submit feedback about Atlas`,
  argumentHint: '[report]',
  isEnabled: () =>
    !(
      isEnvTruthy(process.env.DISABLE_FEEDBACK_COMMAND) ||
      isEnvTruthy(process.env.DISABLE_BUG_COMMAND) ||
      isEssentialTrafficOnly()
      // 前向缝登记（§8.74.29 1P 簇裁，#200）：isPolicyAllowed('allow_product_feedback') 企业策略门随 policyLimits 簇裁除；产品反馈仅受 env kill-switch + 隐私级门控
    ),
  load: () => import('./feedback.js'),
} satisfies Command

export default feedback
