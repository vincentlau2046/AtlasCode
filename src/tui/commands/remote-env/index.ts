import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'remote-env',
  description: 'Configure the default remote environment for teleport sessions',
  // de-ANT: subscriber gate removed (isAtlasAISubscriber always false → disabled).
  isEnabled: () => false,
  get isHidden() {
    return true
  },
  load: () => import('./remote-env.js'),
} satisfies Command
