import type { Command } from '../../commands.js'

const privacySettings = {
  type: 'local-jsx',
  name: 'privacy-settings',
  description: 'View and update your privacy settings',
  isEnabled: () => {
    return false // isConsumerSubscriber removed with D1 — always false in Atlas
  },
  load: () => import('./privacy-settings.js'),
} satisfies Command

export default privacySettings
